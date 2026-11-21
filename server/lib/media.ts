import { randomUUID } from "node:crypto";
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
  return { publicDir: path.join(root, "uploads"), privateDir: path.join(root, "private") };
}

export interface StoredFile { id: string; fileName: string; mime: string; kind: MediaKind; size: number; visibility: "public" | "private" }

/**
 * Validate + store. Images are public (served from /uploads with nosniff);
 * audio is always private (served via authenticated /api/media/audio/:id).
 */
export function storeMedia(payload: string, expected: MediaKind): StoredFile {
  const buf = decodeBase64Payload(payload, LIMITS[expected]);
  const s = sniff(buf);
  if (!s || s.kind !== expected) {
    throw unprocessable("UNSUPPORTED_MEDIA", expected === "image" ? "Only JPEG, PNG or WebP images are accepted" : "Only M4A, AAC, WebM, Ogg or WAV audio is accepted");
  }
  const id = randomUUID();
  const fileName = `${id}.${s.ext}`;
  const visibility = expected === "image" ? "public" : "private";
  const { publicDir, privateDir } = dirs();
  const dir = visibility === "public" ? publicDir : privateDir;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), buf, { mode: 0o600 });
  return { id, fileName, mime: s.mime, kind: s.kind, size: buf.length, visibility };
}

export function privatePath(fileName: string): string | null {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(fileName)) return null;
  const p = path.join(dirs().privateDir, fileName);
  return fs.existsSync(p) ? p : null;
}

export function publicPathExists(fileName: string): boolean {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(fileName)) return false;
  return fs.existsSync(path.join(dirs().publicDir, fileName));
}
