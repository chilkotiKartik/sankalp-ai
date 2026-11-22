import { createHmac, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { config } from "../config";
import { currentTenantId } from "../tenancy";

/**
 * Access + refresh tokens (P1.5).
 *  - Access token: HS256 JWT, 15 minutes, claims {sub, tid (tenant), sid (session family), typ:"access"}.
 *  - Refresh token: opaque 256-bit, 30 days, stored only as HMAC; rotated on every use.
 *    Re-using an already-rotated refresh token revokes the whole session family (token theft detection).
 *  - Logout revokes the family → its access tokens stop working immediately (sid check).
 */
export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000;

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export interface AccessClaims { sub: string; tid: string; sid: string; typ: "access"; iat: number; exp: number }

export function signAccess(sub: string, sid: string, ttlS = ACCESS_TTL_S): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64u(JSON.stringify({ sub, tid: currentTenantId(), sid, typ: "access", iat: now, exp: now + ttlS } satisfies AccessClaims));
  const sig = createHmac("sha256", config().JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

/** Verifies signature, type and tenant. `graceS` allows an expired token (SOS routes, rule 9). */
export function verifyAccess(token: string, graceS = 0): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 2000) return null;
  const [h, p, sig] = parts;
  const expected = createHmac("sha256", config().JWT_SECRET).update(`${h}.${p}`).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    if (header.alg !== "HS256") return null;
    const c = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as AccessClaims;
    if (c.typ !== "access" || typeof c.exp !== "number" || typeof c.sub !== "string") return null;
    if (c.tid !== currentTenantId()) return null;
    if (c.exp + graceS < Math.floor(Date.now() / 1000)) return null;
    return c;
  } catch {
    return null;
  }
}

export const isJwtShape = (t: string) => t.split(".").length === 3;

export function newRefreshToken(): string {
  return `rt_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(raw: string): string {
  return createHmac("sha256", config().JWT_SECRET).update(raw).digest("hex");
}

export const newSessionId = (): string => randomUUID();
