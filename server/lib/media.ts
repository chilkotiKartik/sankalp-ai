import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config";
import { unprocessable, AppError } from "./errors";

/**
 * Upload validation (M2) and private evidence storage (M3).
 * File type is decided ONLY from magic bytes; the client filename is ignored.
 */
export type MediaKind = "image" | "audio";

export const LIMITS = { image: 8 * 1024 * 1024, audio: 15 * 1024 * 1024 } as const;

interface Sniffed { ext: string; mime: string; kind: MediaKind }

export function sniff(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  const hex = buf.subarray(0, 12).toString("hex");
  if (hex.startsWith("ffd8ff")) return { ext: "jpg", mime: "image/jpeg", kind: "image" };
  if (hex.startsWith("89504e470d0a1a0a")) return { ext: "png", mime: "image/png", kind: "image" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return { ext: "webp", mime: "image/webp", kind: "image" };
  // ISO BMFF (m4a / mp4 audio / 3gp): "ftyp" at offset 4
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (/^(M4A |M4B |mp42|isom|3gp\d|3gp|dash|iso2|mp41)/.test(brand)) return { ext: "m4a", mime: "audio/mp4", kind: "audio" };
    return null;
  }
  if (hex.startsWith("1a45dfa3")) return { ext: "webm", mime: "audio/webm", kind: "audio" };
  if (buf.subarray(0, 4).toString("ascii") === "OggS") return { ext: "ogg", mime: "audio/ogg", kind: "audio" };
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return { ext: "aac", mime: "audio/aac", kind: "audio" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE")
    return { ext: "wav", mime: "audio/wav", kind: "audio" };
  return null;
}

/** Decode a base64 or data-URL payload into bytes; rejects anything that is not base64. */
export function decodeBase64Payload(input: string, max: number): Buffer {
  const b64 = input.replace(/^data:[\w/+.-]+;base64,/, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw unprocessable("INVALID_MEDIA", "Payload is not valid base64");
  // decoded size ≈ 3/4 of base64 length
  if (Math.floor((b64.length * 3) / 4) > max) throw new AppError(413, "PAYLOAD_TOO_LARGE", `File exceeds ${Math.round(max / 1048576)} MB limit`);
  return Buffer.from(b64, "base64");
}

export function dirs() {
  const root = path.resolve(config().DATA_DIR);
  return { publicDir: path.join(root, "uploads"), privateDir: path.join(root, "private"), originalsDir: path.join(root, "private", "originals") };
}

// ── Storage driver interface (P1.6). Local disk today; an India-region S3-compatible driver plugs in here. ─
export interface MediaDriver {
  put(area: "public" | "private" | "originals", fileName: string, data: Buffer): void;
  path(area: "public" | "private" | "originals", fileName: string): string | null;
  remove(area: "public" | "private" | "originals", fileName: string): void;
}

export const localDriver: MediaDriver = {
  put(area, fileName, data) {
    const d = dirs();
    const dir = area === "public" ? d.publicDir : area === "private" ? d.privateDir : d.originalsDir;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), data, { mode: 0o600 });
  },
  path(area, fileName) {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(fileName)) return null;
    const d = dirs();
    const p = path.join(area === "public" ? d.publicDir : area === "private" ? d.privateDir : d.originalsDir, fileName);
    return fs.existsSync(p) ? p : null;
  },
  remove(area, fileName) {
    const p = this.path(area, fileName);
    if (p) fs.rmSync(p, { force: true });
  },
};

export function mediaDriver(): MediaDriver {
  const d = process.env.MEDIA_DRIVER || "local";
  if (d !== "local") throw new Error(`MEDIA_DRIVER=${d} is not available in this build (use local); see docs/OPERATIONS.md`);
  return localDriver;
}

// ── Metadata stripping (P1.6): public copies never carry EXIF/GPS/device identifiers ─
/** JPEG: drop APP1–APP15 (EXIF, XMP, ICC, maker notes) and COM segments; keep APP0 (JFIF) and image data. */
export function stripJpeg(buf: Buffer): Buffer {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // malformed → keep original bytes (still validated as JPEG)
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); return Buffer.concat(out); } // start of scan: rest is image data
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const drop = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

/** PNG: drop text and EXIF chunks (tEXt, zTXt, iTXt, eXIf, tIME). */
export function stripPng(buf: Buffer): Buffer {
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return buf;
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString("ascii");
    const chunk = buf.subarray(i, i + 12 + len);
    if (!["tEXt", "zTXt", "iTXt", "eXIf", "tIME"].includes(type)) out.push(chunk);
    i += 12 + len;
  }
  return Buffer.concat(out);
}

/** WebP: drop EXIF and XMP chunks and clear their flags in VP8X. */
export function stripWebp(buf: Buffer): Buffer {
  if (buf.subarray(0, 4).toString("ascii") !== "RIFF" || buf.subarray(8, 12).toString("ascii") !== "WEBP") return buf;
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = buf.subarray(i, i + 4).toString("ascii");
    const size = buf.readUInt32LE(i + 4);
    const total = 8 + size + (size % 2);
    let c = Buffer.from(buf.subarray(i, i + total));
    if (type === "VP8X" && c.length > 8) { c[8] &= ~(0x08 | 0x04); } // clear EXIF (0x08) and XMP (0x04) flags
    if (type !== "EXIF" && type !== "XMP ") chunks.push(c);
    i += total;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "ascii");
  return Buffer.concat([header, body]);
}

export function stripMetadata(buf: Buffer, ext: string): Buffer {
  return ext === "jpg" ? stripJpeg(buf) : ext === "png" ? stripPng(buf) : ext === "webp" ? stripWebp(buf) : buf;
}

export interface StoredFile { id: string; fileName: string; mime: string; kind: MediaKind; size: number; visibility: "public" | "private"; hasOriginal?: boolean }

/**
 * Validate + store. Images: metadata-stripped public copy + private original (EXIF kept for Phase 3 geo checks).
 * Audio: always private (served via authenticated or signed URLs).
 */
export function storeMedia(payload: string, expected: MediaKind): StoredFile {
  const buf = decodeBase64Payload(payload, LIMITS[expected]);
  const s = sniff(buf);
  if (!s || s.kind !== expected) {
    throw unprocessable("UNSUPPORTED_MEDIA", expected === "image" ? "Only JPEG, PNG or WebP images are accepted" : "Only M4A, AAC, WebM, Ogg or WAV audio is accepted");
  }
  const id = randomUUID();
  const fileName = `${id}.${s.ext}`;
  const drv = mediaDriver();
  if (expected === "image") {
    const clean = stripMetadata(buf, s.ext);
    drv.put("public", fileName, clean);
    drv.put("originals", fileName, buf);
    return { id, fileName, mime: s.mime, kind: s.kind, size: clean.length, visibility: "public", hasOriginal: true };
  }
  drv.put("private", fileName, buf);
  return { id, fileName, mime: s.mime, kind: s.kind, size: buf.length, visibility: "private" };
}

export function privatePath(fileName: string): string | null {
  return mediaDriver().path("private", fileName);
}

export function originalPath(fileName: string): string | null {
  return mediaDriver().path("originals", fileName);
}

export function publicPathExists(fileName: string): boolean {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(fileName)) return false;
  return !!mediaDriver().path("public", fileName);
}

// ── Signed URLs (P1.6): 5-minute, file-bound, tenant-bound HMAC links for <audio>/<img> of private media ─
export const SIGNED_URL_TTL_S = 300;

export function signMediaUrl(fileName: string, tenantId: string, ttlS = SIGNED_URL_TTL_S): string {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const sig = createHmac("sha256", config().JWT_SECRET).update(`media:${tenantId}:${fileName}:${exp}`).digest("base64url");
  return `/api/media/signed/${fileName}?t=${encodeURIComponent(tenantId)}&exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(fileName: string, tenantId: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", config().JWT_SECRET).update(`media:${tenantId}:${fileName}:${exp}`).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
