import { createHash } from "node:crypto";
import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";
import { maskPII, looksLikePII } from "./pii";
import type { PromptDef } from "./prompts";

/**
 * Sovereign AI gateway (M10, P2.1–P2.3). The ONLY module allowed to call a model.
 *  text:   Sarvam (api.sarvam.ai) | self-hosted OpenAI-compatible endpoint on Indian infra | null → caller uses rules
 *  vision: self-hosted only | null → caller routes to manual_review (fail closed)
 *  stt/tts: Sarvam
 * Resilience: 8 s timeout, 1 retry on network/5xx, per-provider circuit breaker (3 failures → open 60 s).
 * Every text sent to a model is PII-masked first. Every call is recorded in metrics.
 */
export interface Msg { role: "system" | "user" | "assistant"; content: string }
export interface AIResult { text: string; provider: string; model: string; latencyMs: number; tokens?: number }

const TIMEOUT_MS = 8000;
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 60_000;

// ── circuit breaker + metrics ─────────────────────────────────────────────────
interface Breaker { failures: number; openUntil: number; probing: boolean }
const breakers = new Map<string, Breaker>();
interface Metric { calls: number; ok: number; failed: number; shortCircuited: number; tokens: number; latencies: number[] }
const metrics = new Map<string, Metric>();

function metric(provider: string): Metric {
  let m = metrics.get(provider);
  if (!m) { m = { calls: 0, ok: 0, failed: 0, shortCircuited: 0, tokens: 0, latencies: [] }; metrics.set(provider, m); }
  return m;
}

export function aiMetrics() {
  const out: Record<string, unknown> = {};
  metrics.forEach((m, p) => {
    const sorted = [...m.latencies].sort((a, b) => a - b);
    const pct = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
    out[p] = { calls: m.calls, ok: m.ok, failed: m.failed, shortCircuited: m.shortCircuited, tokens: m.tokens, p50ms: pct(0.5), p95ms: pct(0.95),
      breaker: breakers.get(p)?.openUntil && breakers.get(p)!.openUntil > Date.now() ? "open" : "closed" };
  });
  return out;
}

export function resetAiState() { breakers.clear(); metrics.clear(); }

class RetryableError extends Error {}

/**
 * Review P2-3/4/11: a timeout is never retried (it already cost the full budget); 5xx/429/network errors get one
 * retry after a short backoff, and only if the overall deadline allows. Latency is recorded for failures too.
 * After the breaker's open period a single half-open probe goes through; other callers keep short-circuiting.
 */
async function guarded<T>(provider: string, fn: (timeoutMs: number) => Promise<T>, deadlineMs = 2 * TIMEOUT_MS): Promise<T | null> {
  const b = breakers.get(provider) ?? { failures: 0, openUntil: 0, probing: false };
  breakers.set(provider, b);
  const m = metric(provider);
  const now = Date.now();
  if (b.openUntil > now || (b.openUntil && b.probing)) { m.shortCircuited++; return null; }
  const halfOpen = b.openUntil !== 0;
  if (halfOpen) b.probing = true;
  const end = now + deadlineMs;
  const record = (t0: number) => { m.latencies.push(Date.now() - t0); if (m.latencies.length > 500) m.latencies.shift(); };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const budget = Math.min(TIMEOUT_MS, end - Date.now());
      if (budget < 250) break;
      const t0 = Date.now();
      m.calls++;
      try {
        const out = await fn(budget);
        m.ok++; record(t0);
        b.failures = 0; b.openUntil = 0;
        return out;
      } catch (err) {
        m.failed++; record(t0);
        const timedOut = (err as Error).name === "AbortError" || (err as Error).name === "TimeoutError";
        const retryable = !timedOut && !halfOpen && (err instanceof RetryableError || (err as Error).name === "TypeError");
        logger.warn("ai_call_failed", { provider, attempt, err: (err as Error).message });
        if (!retryable) break;
        await new Promise(r => setTimeout(r, err instanceof RetryableError && /429/.test((err as Error).message) ? 1000 : 250));
      }
    }
    b.failures++;
    if (halfOpen || b.failures >= BREAKER_THRESHOLD) { b.openUntil = Date.now() + BREAKER_OPEN_MS; logger.warn("ai_breaker_open", { provider }); }
    return null;
  } finally {
    if (halfOpen) b.probing = false;
  }
}

/** Last guard (review P2-2): if masking missed something that still looks like a phone/ID/e-mail, nothing is sent. */
function safeToSend(texts: string[]): boolean {
  if (texts.some(looksLikePII)) { logger.warn("ai_blocked_residual_pii"); return false; }
  return true;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = TIMEOUT_MS): Promise<unknown> {
  const res = await safeFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
    timeoutMs,
  });
  if (res.status >= 500 || res.status === 429) throw new RetryableError(`provider HTTP ${res.status}`);
  if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
  return res.json();
}

function textProvider(): { name: string; url: string; model: string; headers: Record<string, string> } | null {
  const c = config();
  if (c.textProvider === "sarvam" && c.SARVAM_API_KEY) return { name: "sarvam", url: "https://api.sarvam.ai/v1/chat/completions", model: c.SARVAM_MODEL, headers: { "api-subscription-key": c.SARVAM_API_KEY } };
  if (c.textProvider === "selfhosted" && c.AI_TEXT_BASE_URL) return { name: "selfhosted", url: `${c.AI_TEXT_BASE_URL.replace(/\/$/, "")}/chat/completions`, model: c.AI_TEXT_MODEL || "default", headers: {} };
  return null;
}

/** Free-form chat (assistant). PII is masked in every message. Returns null → caller uses the rules engine. */
export async function chat(messages: Msg[], opts: { maxTokens?: number; temperature?: number; deadlineMs?: number } = {}): Promise<AIResult | null> {
  const p = textProvider();
  if (!p) return null;
  const masked = messages.map(m => ({ ...m, content: maskPII(m.content) }));
  if (!safeToSend(masked.map(m => m.content))) return null;
  const t0 = Date.now();
  const data = await guarded(p.name, (ms) => postJson(p.url, p.headers, { model: p.model, messages: masked, max_tokens: opts.maxTokens ?? 500, temperature: opts.temperature ?? 0.4 }, ms), opts.deadlineMs) as
    { choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) return null;
  if (data?.usage?.total_tokens) metric(p.name).tokens += data.usage.total_tokens;
  return { text, provider: p.name, model: p.model, latencyMs: Date.now() - t0, tokens: data?.usage?.total_tokens };
}

/** Extract the first JSON object from model output. */
export function extractJson<T = Record<string, unknown>>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch {
    const lazy = raw.match(/\{[\s\S]*?\}/);
    try { return lazy ? (JSON.parse(lazy[0]) as T) : null; } catch { return null; }
  }
}

export interface PromptOutcome<T> {
  data: T;
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  latencyMs: number;
}

export const inputHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Run a versioned prompt; returns null if no provider, provider failure, or output that fails its zod schema. */
export async function runPrompt<T>(def: PromptDef<T>, input: Record<string, string>, vars: Record<string, string> = {}, opts: { deadlineMs?: number } = {}): Promise<PromptOutcome<T> | null> {
  // Literal substitution of every {k} (review P2-11: no `$&` interpretation, no first-only replace).
  const system = Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(v), def.system);
  const user = def.user(input);
  const r = await chat([{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: def.maxTokens, temperature: 0.1, deadlineMs: opts.deadlineMs });
  if (!r) return null;
  const parsed = def.output.safeParse(extractJson(r.text));
  if (!parsed.success) { logger.warn("ai_output_invalid", { prompt: def.version, provider: r.provider }); return null; }
  return { data: parsed.data, provider: r.provider, model: r.model, promptVersion: def.version, inputHash: inputHash(maskPII(user)), latencyMs: r.latencyMs };
}

/** Vision — self-hosted only. null → caller MUST use manual_review. */
export async function vision(imageBase64: string, prompt: string): Promise<AIResult | null> {
  const c = config();
  if (c.visionProvider !== "selfhosted" || !c.AI_VISION_BASE_URL) return null;
  const model = c.AI_VISION_MODEL || "default";
  const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  const text0 = maskPII(prompt);
  if (!safeToSend([text0])) return null;
  const t0 = Date.now();
  const data = await guarded("selfhosted-vision", (ms) => postJson(`${c.AI_VISION_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {}, {
    model, max_tokens: 300, temperature: 0.2,
    messages: [{ role: "user", content: [{ type: "text", text: text0 }, { type: "image_url", image_url: { url: dataUrl } }] }],
  }, ms)) as { choices?: Array<{ message?: { content?: string } }> } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  return text ? { text, provider: "selfhosted-vision", model, latencyMs: Date.now() - t0 } : null;
}

/** Speech-to-text via Sarvam (Indian languages). null when not configured or on failure. */
export async function stt(audio: Buffer, mime: string, lang = "hi-IN"): Promise<{ transcript: string; provider: string } | null> {
  const c = config();
  if (!c.SARVAM_API_KEY) return null;
  const out = await guarded("sarvam-stt", async (ms) => {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), `audio.${mime.split("/")[1] || "wav"}`);
    form.append("model", process.env.SARVAM_STT_MODEL || "saarika:v2.5");
    form.append("language_code", lang);
    const res = await safeFetch("https://api.sarvam.ai/speech-to-text", { method: "POST", headers: { "api-subscription-key": c.SARVAM_API_KEY! }, body: form, timeoutMs: Math.max(ms, 15000) });
    if (res.status >= 500) throw new RetryableError(`stt HTTP ${res.status}`);
    if (!res.ok) throw new Error(`stt HTTP ${res.status}`);
    return (await res.json()) as { transcript?: string };
  });
  return out?.transcript ? { transcript: out.transcript, provider: "sarvam" } : null;
}

/** Text-to-speech via Sarvam. Returns WAV/MP3 bytes or null. */
export async function tts(text: string, lang = "hi-IN"): Promise<Buffer | null> {
  const c = config();
  if (!c.SARVAM_API_KEY) return null;
  const masked = maskPII(text);
  if (!safeToSend([masked])) return null;
  const out = await guarded("sarvam-tts", (ms) => postJson("https://api.sarvam.ai/text-to-speech", { "api-subscription-key": c.SARVAM_API_KEY! }, {
    text: masked, inputs: [masked], target_language_code: lang, model: process.env.SARVAM_TTS_MODEL || "bulbul:v2",
  }, ms)) as { audios?: string[] } | null;
  return out?.audios?.[0] ? Buffer.from(out.audios[0], "base64") : null;
}

export function aiStatus() {
  const c = config();
  return { text: c.textProvider, vision: c.visionProvider, speech: c.SARVAM_API_KEY ? "sarvam" : "none" };
}
