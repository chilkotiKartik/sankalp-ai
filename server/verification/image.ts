import jpeg from "jpeg-js";
import { PNG } from "pngjs";

/**
 * P3.2/P3.3 image fingerprints — pure JS, nothing leaves the server.
 *  - pHash: 32×32 grey → 2-D DCT → top-left 8×8 (minus DC) vs median → 64-bit hash (16 hex chars).
 *  - periphery hash: average hash of the outer ring of a 16×16 grid. The background (kerb, walls, poles) stays the
 *    same when the defect in the middle is repaired, so a low distance suggests "same scene".
 * Images that are too small or flat to fingerprint return null: the signal is then UNKNOWN, never a pass or a fail.
 */
export interface Grey { w: number; h: number; px: Float64Array }

const MAX_PIXELS = 40_000_000; // decoding guard (≈ 6300×6300)

export function decodeGrey(buf: Buffer): Grey | null {
  try {
    let w: number, h: number, data: Uint8Array;
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      const img = jpeg.decode(buf, { useTArray: true, maxResolutionInMP: MAX_PIXELS / 1e6, maxMemoryUsageInMB: 512 });
      ({ width: w, height: h } = img); data = img.data;
    } else if (buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
      const img = PNG.sync.read(buf);
      ({ width: w, height: h } = img); data = img.data;
    } else return null; // WebP: no pure-JS decoder bundled → unknown
    if (w * h > MAX_PIXELS) return null;
    const px = new Float64Array(w * h);
    for (let i = 0; i < w * h; i++) px[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return { w, h, px };
  } catch {
    return null;
  }
}

/** Box-filter resize to n×n. */
export function resize(g: Grey, n: number): Float64Array {
  const out = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const y0 = Math.floor((y * g.h) / n), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * g.h) / n));
    for (let x = 0; x < n; x++) {
      const x0 = Math.floor((x * g.w) / n), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * g.w) / n));
      let s = 0, k = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g.px[yy * g.w + xx]; k++; }
      out[y * n + x] = s / k;
    }
  }
  return out;
}

const variance = (a: ArrayLike<number>) => {
  let m = 0; for (let i = 0; i < a.length; i++) m += a[i]; m /= a.length;
  let v = 0; for (let i = 0; i < a.length; i++) v += (a[i] - m) ** 2;
  return v / a.length;
};

const bitsToHex = (bits: boolean[]) => {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += ((+bits[i] << 3) | (+bits[i + 1] << 2) | (+bits[i + 2] << 1) | +bits[i + 3]).toString(16);
  return hex;
};

const MIN_SIDE = 32;
const MIN_VARIANCE = 4; // grey levels² — below this the picture is essentially flat

export function pHash(buf: Buffer): string | null {
  const g = decodeGrey(buf);
  if (!g || g.w < MIN_SIDE || g.h < MIN_SIDE) return null;
  const N = 32;
  const s = resize(g, N);
  if (variance(s) < MIN_VARIANCE) return null;
  // separable DCT-II, only the 8×8 low-frequency block is needed
  const cos = (k: number, n: number) => Math.cos(((2 * n + 1) * k * Math.PI) / (2 * N));
  const rows = new Float64Array(8 * N);
  for (let y = 0; y < N; y++) for (let u = 0; u < 8; u++) { let a = 0; for (let x = 0; x < N; x++) a += s[y * N + x] * cos(u, x); rows[u * N + y] = a; }
  const coeffs: number[] = [];
  for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let a = 0; for (let y = 0; y < N; y++) a += rows[u * N + y] * cos(v, y); coeffs.push(a); }
  // Quantise relative to the largest AC term so float noise around exact zeros (symmetric scenes) cannot flip bits.
  const maxAbs = Math.max(...coeffs.slice(1).map(Math.abs)) || 1;
  const q = coeffs.map(c => Math.round((c / maxAbs) * 1e4));
  const ac = q.slice(1); // drop DC
  const median = [...ac].sort((a, b) => a - b)[Math.floor(ac.length / 2)];
  return bitsToHex(q.map((c, i) => (i === 0 ? false : c > median)));
}

/** Average hash of the 60 outer cells of a 16×16 grid (padded to 64 bits). */
export function peripheryHash(buf: Buffer): string | null {
  const g = decodeGrey(buf);
  if (!g || g.w < MIN_SIDE || g.h < MIN_SIDE) return null;
  const n = 16, s = resize(g, n);
  const ring: number[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (y === 0 || x === 0 || y === n - 1 || x === n - 1) ring.push(s[y * n + x]);
  if (variance(ring) < MIN_VARIANCE) return null;
  const mean = ring.reduce((a, b) => a + b, 0) / ring.length;
  const bits = ring.map(v => v > mean);
  while (bits.length < 64) bits.push(false);
  return bitsToHex(bits);
}

export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d + Math.abs(a.length - b.length) * 4;
}

// ── EXIF GPS (P3.1) ───────────────────────────────────────────────────────────
export interface ExifInfo { lat?: number; lng?: number; takenAt?: string }

/** Minimal EXIF reader: GPSLatitude/Longitude and DateTimeOriginal from a JPEG's APP1 segment. Never throws. */
export function readExif(buf: Buffer): ExifInfo {
  try {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return {};
    let i = 2;
    while (i + 4 < buf.length) {
      if (buf[i] !== 0xff) return {};
      const m = buf[i + 1];
      if (m === 0xda || m === 0xd9) return {};
      const len = buf.readUInt16BE(i + 2);
      if (m === 0xe1 && buf.subarray(i + 4, i + 10).toString("binary") === "Exif\0\0") return parseTiff(buf.subarray(i + 10, i + 2 + len));
      i += 2 + len;
    }
  } catch { /* malformed → no EXIF */ }
  return {};
}

function parseTiff(t: Buffer): ExifInfo {
  const le = t.toString("ascii", 0, 2) === "II";
  const u16 = (o: number) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o));
  const u32 = (o: number) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const ifd = (off: number) => {
    const out = new Map<number, { type: number; count: number; valOff: number }>();
    const n = u16(off);
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12;
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), valOff: e + 8 });
    }
    return out;
  };
  const rationals = (e: { count: number; valOff: number }) => {
    const p = u32(e.valOff), r: number[] = [];
    for (let k = 0; k < e.count; k++) r.push(u32(p + k * 8) / (u32(p + k * 8 + 4) || 1));
    return r;
  };
  const ascii = (e: { count: number; valOff: number }) => {
    const p = e.count > 4 ? u32(e.valOff) : e.valOff;
    return t.toString("ascii", p, p + e.count).replace(/\0+$/, "");
  };
  const out: ExifInfo = {};
  const ifd0 = ifd(u32(4));
  const exifPtr = ifd0.get(0x8769);
  if (exifPtr) {
    const dt = ifd(u32(exifPtr.valOff)).get(0x9003);
    if (dt) {
      const m = ascii(dt).match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (m) out.takenAt = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    }
  }
  const gpsPtr = ifd0.get(0x8825);
  if (gpsPtr) {
    const g = ifd(u32(gpsPtr.valOff));
    const lat = g.get(2), lng = g.get(4), latRef = g.get(1), lngRef = g.get(3);
    if (lat && lng) {
      const dms = (r: number[]) => r[0] + (r[1] ?? 0) / 60 + (r[2] ?? 0) / 3600;
      const sign = (e: { valOff: number } | undefined, neg: string) => (e && String.fromCharCode(t[e.valOff]) === neg ? -1 : 1);
      out.lat = sign(latRef, "S") * dms(rationals(lat));
      out.lng = sign(lngRef, "W") * dms(rationals(lng));
    }
  }
  return out;
}

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
