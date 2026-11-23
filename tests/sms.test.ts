import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { config, setConfig } from "../server/config";
import { sendSms } from "../server/notify/sms";

/** MSG91 (India) DLT SMS: right request shape, fails closed without an approved template, never leaves the allowlist. */
const realFetch = globalThis.fetch;
const env = { ...process.env };
let sent: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  sent = [];
  setConfig({ ...config(), EGRESS_ALLOWLIST: ["control.msg91.com"] });
  process.env.SMS_DRIVER = "msg91";
  process.env.MSG91_AUTH_KEY = "test-key";
  process.env.SMS_TEMPLATE_IDS = JSON.stringify({ otp: "tpl-otp", status_reply: "tpl-status" });
  globalThis.fetch = vi.fn(async (u: string | URL, init?: RequestInit) => {
    sent.push({ url: String(u), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ type: "success", message: "req-123" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env }; });

describe("MSG91 SMS driver", () => {
  it("sends the DLT template id with numbered variables to the Indian number", async () => {
    const r = await sendSms("9876543210", "status_reply", ["UK-1234", "resolved"]);
    expect(r).toEqual({ ok: true, driver: "msg91", messageId: "req-123" });
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://control.msg91.com/api/v5/flow");
    expect(sent[0].headers.authkey).toBe("test-key");
    expect(sent[0].body).toEqual({ template_id: "tpl-status", short_url: "0", recipients: [{ mobiles: "919876543210", var1: "UK-1234", var2: "resolved" }] });
  });

  it("does not send a message type that has no approved template (fail closed)", async () => {
    const r = await sendSms("9876543210", "sos_cancelled", []);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("no DLT template id");
    expect(sent).toHaveLength(0);
  });

  it("reports MSG91's own error instead of claiming success", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ type: "error", message: "Invalid template" }), { status: 200 })) as typeof fetch;
    const r = await sendSms("9876543210", "otp", ["482915"]);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Invalid template");
  });

  it("is blocked when MSG91 is not in the egress allowlist", async () => {
    setConfig({ ...config(), EGRESS_ALLOWLIST: [] });
    const r = await sendSms("9876543210", "otp", ["482915"]);
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
