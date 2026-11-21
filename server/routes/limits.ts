import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

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
  keyGenerator: (req) => `phone:${String((req.body as { phone?: unknown })?.phone ?? "").slice(0, 20)}`,
  message: json("Too many attempts for this number — try again in 15 minutes"),
});
export const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many registrations from this network") });
export const uploadLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many uploads — slow down") });
export const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many AI requests — please wait a moment") });
export const writeLimiter = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: "draft-7", legacyHeaders: false, keyGenerator: ip, message: json("Too many requests") });
