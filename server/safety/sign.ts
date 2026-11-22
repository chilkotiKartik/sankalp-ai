import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";

/** Signed, expiring opaque tokens for public safety links (SOS live location, missed check-in). */
const mac = (purpose: string, p: string) => createHmac("sha256", config().JWT_SECRET).update(`${purpose}:${p}`).digest("base64url");

export function signPayload(purpose: string, payload: string, ttlS: number): string {
  const p = `${payload}.${Math.floor(Date.now() / 1000) + ttlS}`;
  return `${Buffer.from(p).toString("base64url")}.${mac(purpose, p)}`;
}

export function readPayload(purpose: string, token: string): string | null {
  const [b, s] = token.split(".");
  if (!b || !s) return null;
  const p = Buffer.from(b, "base64url").toString();
  const e = Buffer.from(mac(purpose, p)), g = Buffer.from(s);
  if (e.length !== g.length || !timingSafeEqual(e, g)) return null;
  const i = p.lastIndexOf(".");
  if (Number(p.slice(i + 1)) < Date.now() / 1000) return null;
  return p.slice(0, i);
}
