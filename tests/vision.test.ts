import { describe, it, expect, afterEach, vi } from "vitest";
import { config, setConfig, loadConfig } from "../server/config";
import { vision } from "../server/ai/gateway";

/** Photo analysis goes to Sarvam's /v2 API (India) with the image attached; failures return null → manual review. */
const realFetch = globalThis.fetch;
const before = config();
afterEach(() => { globalThis.fetch = realFetch; setConfig(before); });
const sarvam = () => setConfig({ ...loadConfig({ JWT_SECRET: "a".repeat(32), DEPT_JWT_SECRET: "b".repeat(32), SARVAM_API_KEY: "test-key" }), EGRESS_ALLOWLIST: ["api.sarvam.ai"] });

describe("Sarvam vision", () => {
  it("sends the photo to Sarvam v2 with gemma4 and returns the answer", async () => {
    sarvam();
    let sent: { url: string; headers: Record<string, string>; body: { model: string; messages: { content: { type: string; image_url?: { url: string } }[] }[] } } | null = null;
    globalThis.fetch = vi.fn(async (u: string | URL, init?: RequestInit) => {
      sent = { url: String(u), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"fixed":true,"confidence":0.9}' } }] }), { status: 200 });
    }) as typeof fetch;
    const r = await vision("aGVsbG8=", "Is it fixed?");
    expect(r?.provider).toBe("sarvam-vision");
    expect(r?.model).toBe("gemma4");
    expect(sent!.url).toBe("https://api.sarvam.ai/v2/chat/completions");
    expect(sent!.headers["api-subscription-key"]).toBe("test-key");
    expect(sent!.body.messages[0].content[1].image_url!.url).toBe("data:image/jpeg;base64,aGVsbG8=");
  });

  it("returns null (manual review) when Sarvam fails", async () => {
    sarvam();
    globalThis.fetch = vi.fn(async () => new Response("bad", { status: 400 })) as typeof fetch;
    expect(await vision("aGVsbG8=", "Is it fixed?")).toBeNull();
  });
});
