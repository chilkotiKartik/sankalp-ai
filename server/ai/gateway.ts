import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";

/**
 * Sovereign AI gateway (M10). The only module allowed to call a model.
 *  - text:   Sarvam (api.sarvam.ai) | self-hosted OpenAI-compatible endpoint on Indian infra | null (caller uses rules)
 *  - vision: self-hosted only | null (caller MUST route to manual_review — fail closed, rule 5)
 *  - stt/tts: Sarvam only (Phase 2 completes this); null when not configured.
 * No foreign provider exists in this file, by design.
 */
export interface Msg { role: "system" | "user" | "assistant"; content: string }
export interface AIResult { text: string; provider: string; model: string; latencyMs: number }

const TIMEOUT_MS = 8000;

async function openAICompatible(baseUrl: string, model: string, headers: Record<string, string>, body: Record<string, unknown>): Promise<string | null> {
  const res = await safeFetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify({ model, ...body }),
    timeoutMs: TIMEOUT_MS,
  });
  if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text || null;
}

export async function chat(messages: Msg[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<AIResult | null> {
  const c = config();
  const started = Date.now();
  const body = { messages, max_tokens: opts.maxTokens ?? 500, temperature: opts.temperature ?? 0.4 };
  try {
    if (c.textProvider === "sarvam" && c.SARVAM_API_KEY) {
      const text = await openAICompatible("https://api.sarvam.ai/v1", c.SARVAM_MODEL, { "api-subscription-key": c.SARVAM_API_KEY }, body);
      return text ? { text, provider: "sarvam", model: c.SARVAM_MODEL, latencyMs: Date.now() - started } : null;
    }
    if (c.textProvider === "selfhosted" && c.AI_TEXT_BASE_URL) {
      const model = c.AI_TEXT_MODEL || "default";
      const text = await openAICompatible(c.AI_TEXT_BASE_URL, model, {}, body);
      return text ? { text, provider: "selfhosted", model, latencyMs: Date.now() - started } : null;
    }
  } catch (err) {
    logger.warn("ai_text_failed", { provider: c.textProvider, err: (err as Error).message });
  }
  return null;
}

/** Returns null when no sovereign vision model is configured or it fails → caller must use manual_review. */
export async function vision(imageBase64: string, prompt: string): Promise<AIResult | null> {
  const c = config();
  if (c.visionProvider !== "selfhosted" || !c.AI_VISION_BASE_URL) return null;
  const started = Date.now();
  const model = c.AI_VISION_MODEL || "default";
  const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
  try {
    const text = await openAICompatible(c.AI_VISION_BASE_URL, model, {}, {
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: dataUrl } }] }],
      max_tokens: 300,
      temperature: 0.2,
    });
    return text ? { text, provider: "selfhosted-vision", model, latencyMs: Date.now() - started } : null;
  } catch (err) {
    logger.warn("ai_vision_failed", { err: (err as Error).message });
    return null;
  }
}

/** Speech-to-text / text-to-speech: interface only in Phase 0 (Sarvam wiring in Phase 2). */
export async function stt(_audio: Buffer, _lang: string): Promise<string | null> {
  return null;
}
export async function tts(_text: string, _lang: string): Promise<Buffer | null> {
  return null;
}

/** Extract the first flat JSON object from model output. */
export function extractJson<T = Record<string, unknown>>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

export function aiStatus() {
  const c = config();
  return { text: c.textProvider, vision: c.visionProvider };
}
