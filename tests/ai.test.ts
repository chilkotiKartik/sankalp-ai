import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** P2.1–P2.6: gateway resilience, PII masking, versioned prompts, rules fallback. No real network: safeFetch is mocked. */
const calls: Array<{ url: string; body: string }> = [];
let responder: () => Response | Promise<Response> = () => new Response("{}", { status: 500 });
vi.mock("../server/lib/safeFetch", () => ({
  safeFetch: vi.fn(async (url: string, init: { body?: string }) => { calls.push({ url, body: String(init?.body ?? "") }); return responder(); }),
}));

import { config, loadConfig, setConfig } from "../server/config";
import { maskPII, looksLikePII } from "../server/ai/pii";
import { chat, runPrompt, aiMetrics, resetAiState, extractJson, vision } from "../server/ai/gateway";
import { classify } from "../server/ai/prompts";
import { classifyComplaint, RULES_VERSION } from "../server/ai/classify";

const base = config();
const ok = (content: string) => () => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }), { status: 200, headers: { "Content-Type": "application/json" } });

function useSelfHosted() {
  setConfig(loadConfig({ ...process.env, AI_TEXT_PROVIDER: "selfhosted", AI_TEXT_BASE_URL: "https://llm.example.in/v1", SARVAM_API_KEY: "" }));
}

beforeEach(() => { calls.length = 0; resetAiState(); });
afterEach(() => setConfig(base));

describe("P2.3 PII masking (English + Hindi)", () => {
  it.each([
    ["Call me on 9876543210 please", "[PHONE]"],
    ["मेरा नंबर +91 98765 43210 है", "[PHONE]"],
    ["Devanagari digits ९८७६५४३२१० here", "[PHONE]"],
    ["Aadhaar 2345 6789 0123 attached", "[ID_NUMBER]"],
    ["mail ravi.k@example.com", "[EMAIL]"],
    ["House No. 42B near the temple", "[ADDRESS]"],
    ["मकान नं 17 के पास गड्ढा", "[ADDRESS]"],
    ["pincode 248001 area", "[PINCODE]"],
  ])("masks %s", (input, token) => {
    const out = maskPII(input);
    expect(out).toContain(token);
    expect(looksLikePII(out)).toBe(false);
  });

  it("keeps the civic content and ticket numbers", () => {
    const out = maskPII("Pothole on Rajpur Road, ticket UK-0A5F6DF4, 3 metres wide");
    expect(out).toBe("Pothole on Rajpur Road, ticket UK-0A5F6DF4, 3 metres wide");
  });
});

describe("P2.1 gateway resilience", () => {
  it("returns null without a provider (rules mode) and makes no network call", async () => {
    expect(config().textProvider).toBe("rules");
    expect(await chat([{ role: "user", content: "hi" }])).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("masks PII before the request leaves the server", async () => {
    useSelfHosted();
    responder = ok("namaste");
    const r = await chat([{ role: "user", content: "My number is 9876543210" }]);
    expect(r?.text).toBe("namaste");
    expect(calls[0].body).not.toContain("9876543210");
    expect(calls[0].body).toContain("[PHONE]");
    expect(aiMetrics().selfhosted).toMatchObject({ calls: 1, ok: 1, tokens: 42 });
  });

  it("retries once on 5xx, then opens the circuit after 3 failed calls", async () => {
    useSelfHosted();
    responder = () => new Response("down", { status: 503 });
    for (let i = 0; i < 3; i++) expect(await chat([{ role: "user", content: "x" }])).toBeNull();
    expect(calls).toHaveLength(6); // 3 calls × (1 + 1 retry)
    expect(aiMetrics().selfhosted).toMatchObject({ breaker: "open" });
    await chat([{ role: "user", content: "x" }]);
    expect(calls).toHaveLength(6); // short-circuited, no request
    expect(aiMetrics().selfhosted).toMatchObject({ shortCircuited: 1 });
  });

  it("does not retry on 4xx", async () => {
    useSelfHosted();
    responder = () => new Response("bad", { status: 400 });
    expect(await chat([{ role: "user", content: "x" }])).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("vision is self-hosted only: null (→ manual review) when not configured", async () => {
    expect(await vision("AAAA", "is the pothole fixed?")).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe("P2.4 versioned prompts with schema-checked output", () => {
  it("accepts valid JSON output and records the prompt version + input hash", async () => {
    useSelfHosted();
    responder = ok('Sure: {"category":"water","priority":"P2","reason":"no supply","confidence":0.9}');
    const r = await runPrompt(classify, { text: "No water since morning" });
    expect(r?.data.category).toBe("water");
    expect(r?.promptVersion).toBe(classify.version);
    expect(r?.inputHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rejects output that fails the schema (fail closed → rules)", async () => {
    useSelfHosted();
    responder = ok('{"category":"spaceship","priority":"P9"}');
    expect(await runPrompt(classify, { text: "x" })).toBeNull();
    const d = await classifyComplaint("कूड़ा कई दिनों से नहीं उठा");
    expect(d.method).toBe("rules");
    expect(d.promptVersion).toBe(RULES_VERSION);
  });

  it("extractJson tolerates prose around the object", () => {
    expect(extractJson('text {"a":1} more')).toEqual({ a: 1 });
    expect(extractJson("no json")).toBeNull();
  });
});

describe("P2.6 explainable rules fallback", () => {
  it.each([
    ["Huge pothole on the main road", "pothole"],
    ["सड़क पर बड़ा गड्ढा है", "pothole"],
    ["Street light not working since a week", "streetlight"],
    ["pani nahi aa raha hai do din se", "water"],
  ])("classifies %s", async (text, cat) => {
    const d = await classifyComplaint(text);
    expect(d.method).toBe("rules");
    expect(d.output.category).toBe(cat);
    expect(d.reason).toBeTruthy();
    expect(d.inputHash).toMatch(/^[0-9a-f]{16}$/);
  });
});
