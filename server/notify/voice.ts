import * as fs from "node:fs";
import * as path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";
import { tts } from "../ai/gateway";

/**
 * P3.5 voice callback: "Was complaint #X fixed? Press 1 for yes, 2 for no."
 * Interface + drivers (no provider hard-coded — pick an Indian telephony/IVR provider):
 *  - console (default): writes to DATA_DIR/voice-outbox.log — development/demo only; refused in production.
 *  - ivr-http: POSTs {to, text, lang, audioBase64?, callbackUrl, digits} to VOICE_API_URL with Bearer VOICE_API_KEY.
 *    The provider plays the prompt and POSTs the pressed digit to callbackUrl. The host must be in EGRESS_ALLOWLIST.
 * The prompt contains only the ticket number — never names or locations (rule 2). Audio is generated with Sarvam TTS
 * when configured, otherwise the provider's own TTS reads `text`.
 */
export interface CallResult { ok: boolean; driver: string; error?: string }

export const VOICE_PROMPTS: Record<"hi" | "en", (ticket: string) => string> = {
  hi: t => `नमस्ते। यह संकल्प से कॉल है। क्या आपकी शिकायत संख्या ${t.split("").join(" ")} ठीक हो गई है? हाँ के लिए 1 दबाएँ, नहीं के लिए 2 दबाएँ।`,
  en: t => `Hello, this is SANKALP. Has your complaint number ${t.split("").join(" ")} been fixed? Press 1 for yes, 2 for no.`,
};

export async function placeConfirmCall(to: string, ticket: string, callbackUrl: string, lang: "hi" | "en" = "hi"): Promise<CallResult> {
  const c = config();
  const driver = process.env.VOICE_DRIVER || "console";
  const text = VOICE_PROMPTS[lang](ticket);
  if (driver === "console") {
    if (c.NODE_ENV === "production" && !c.DEMO_MODE) return { ok: false, driver, error: "console voice driver is disabled in production" };
    const file = path.join(path.resolve(c.DATA_DIR), "voice-outbox.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Review P3-7: masked number, and no callback token in the log.
    fs.appendFileSync(file, `${new Date().toISOString()}\t******${to.slice(-4)}\t${ticket}\n`, { mode: 0o600 });
    logger.info("voice_console", { ticket });
    return { ok: true, driver };
  }
  if (driver === "ivr-http") {
    const url = process.env.VOICE_API_URL;
    if (!url || !process.env.VOICE_API_KEY) return { ok: false, driver, error: "VOICE_API_URL / VOICE_API_KEY not configured" };
    try {
      const audio = await tts(text, lang === "hi" ? "hi-IN" : "en-IN");
      const res = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VOICE_API_KEY}` },
        body: JSON.stringify({ to: `+91${to}`, text, lang, audioBase64: audio ? audio.toString("base64") : undefined, callbackUrl, digits: ["1", "2"] }),
        timeoutMs: 15000,
      });
      return res.ok ? { ok: true, driver } : { ok: false, driver, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, driver, error: (err as Error).message };
    }
  }
  return { ok: false, driver, error: `Unknown VOICE_DRIVER ${driver}` };
}

// ── signed callback tokens (bind tenant + complaint + channel, expire in 72 h) ──────────────────────
const sig = (payload: string) => createHmac("sha256", config().JWT_SECRET).update(`confirm:${payload}`).digest("base64url");

/** Review P3-4: the token is bound to one proof round (proofSubmittedAt) — a new proof makes old tokens useless. */
export function confirmToken(tenantId: string, complaintId: string, channel: "voice", round: string, ttlS = 72 * 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const payload = `${tenantId}.${complaintId}.${channel}.${exp}.${Buffer.from(round).toString("base64url")}`;
  return `${Buffer.from(payload).toString("base64url")}.${sig(payload)}`;
}

export function readConfirmToken(token: string): { tenantId: string; complaintId: string; channel: "voice"; round: string } | null {
  const [b, s] = token.split(".");
  if (!b || !s) return null;
  const payload = Buffer.from(b, "base64url").toString();
  const expected = sig(payload);
  const a = Buffer.from(s), e = Buffer.from(expected);
  if (a.length !== e.length || !timingSafeEqual(a, e)) return null;
  const [tenantId, complaintId, channel, exp, round] = payload.split(".");
  if (channel !== "voice" || !round || Number(exp) < Date.now() / 1000) return null;
  return { tenantId, complaintId, channel, round: Buffer.from(round, "base64url").toString() };
}
