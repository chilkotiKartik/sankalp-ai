import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { currentTenantId } from "../tenancy";

/**
 * Rate limits (M14). Keyed on req.ip, which respects `trust proxy` (X-Forwarded-For can't be spoofed past the proxy hop).
 * SOS routes are deliberately NOT rate-limited (rule 9) — they are de-duplicated in storage instead.
 */
const json = (message: string) => ({ code: "RATE_LIMITED", message });
const ip = (req: Request) => ipKeyGenerator(req.ip || "unknown");

export const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many attempts — try again in 15 minutes") });
/** Per-phone limit: blocks PIN brute force even across many IPs. */
export const phoneLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false,
  // Normalised (digits only, last 10) and tenant-scoped, so " 9xxxx" / "+91…" variants share one bucket (review P1-M1).
  keyGenerator: (req) => `phone:${currentTenantId()}:${String((req.body as { phone?: unknown })?.phone ?? "").slice(0, 40).replace(/\D/g, "").slice(-10)}`,
  message: json("Too many attempts for this number — try again in 15 minutes"),
});
export const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many registrations from this network") });
export const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many uploads — slow down") });
export const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many AI requests — please wait a moment") });
/** Review P5 low: inbound SMS/WhatsApp webhooks arrive from one gateway IP — limit per sender number instead. */
export const channelLimiter = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false,
  keyGenerator: (req) => `chan:${currentTenantId()}:${String((req.body as { from?: unknown })?.from ?? "").replace(/\D/g, "").slice(-12)}`,
  message: json("Too many messages from this number"),
});
export const writeLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many requests") });
