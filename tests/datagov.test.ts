import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import { config, setConfig } from "../server/config";
import { _resetDatagovCache, MANDI_RESOURCE } from "../server/datagov";
import { app, stopApp } from "./helpers";

/** data.gov.in mandi prices: official data only, key never leaked, district first then state, hidden when not configured. */
const realFetch = globalThis.fetch;
const before = config();
let urls: string[] = [];
const rec = (district: string, commodity: string, date: string) => ({ state: "Kerala", district, market: `${district} market`, commodity, variety: "Local", grade: "FAQ", arrival_date: date, min_price: "2000", max_price: "2600", modal_price: "2300" });
beforeEach(() => { _resetDatagovCache(); urls = []; });
afterEach(() => { globalThis.fetch = realFetch; setConfig(before); });
afterAll(() => stopApp());

describe("mandi prices (data.gov.in)", () => {
  it("is hidden (not_configured) without a key and sends nothing", async () => {
    setConfig({ ...before, DATAGOV_API_KEY: undefined });
    globalThis.fetch = vi.fn(async () => { throw new Error("must not be called"); }) as typeof fetch;
    const r = await request(app()).get("/api/public/mandi-prices?district=Ernakulam").set("X-Tenant", "kerala");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("not_configured");
  });

  it("asks for the district first, falls back to the state, newest first, and never returns the key", async () => {
    setConfig({ ...before, DATAGOV_API_KEY: "secret-key-123", EGRESS_ALLOWLIST: ["api.data.gov.in"] });
    globalThis.fetch = vi.fn(async (u: string | URL) => {
      const url = String(u); urls.push(url);
      const records = url.includes("filters%5Bdistrict%5D") ? [] : [rec("Kollam", "Banana", "20/11/2026"), rec("Ernakulam", "Coconut", "22/11/2026")];
      return new Response(JSON.stringify({ records, total: records.length }), { status: 200 });
    }) as typeof fetch;
    const r = await request(app()).get("/api/public/mandi-prices?district=Ernakulam").set("X-Tenant", "kerala");
    expect(r.body.status).toBe("ok");
    expect(r.body.scope).toBe("state");
    expect(r.body.items.map((i: { commodity: string }) => i.commodity)).toEqual(["Coconut", "Banana"]);
    expect(r.body.items[0]).toMatchObject({ modal: 2300, min: 2000, max: 2600, market: "Ernakulam market" });
    expect(urls[0]).toContain(`/resource/${MANDI_RESOURCE}`);
    expect(urls[0]).toContain("filters%5Bdistrict%5D=Ernakulam");
    expect(JSON.stringify(r.body)).not.toContain("secret-key-123");
  });

  it("only sends a real district of the state", async () => {
    setConfig({ ...before, DATAGOV_API_KEY: "k", EGRESS_ALLOWLIST: ["api.data.gov.in"] });
    globalThis.fetch = vi.fn(async (u: string | URL) => { urls.push(String(u)); return new Response(JSON.stringify({ records: [] }), { status: 200 }); }) as typeof fetch;
    await request(app()).get("/api/public/mandi-prices?district=Mumbai").set("X-Tenant", "kerala");
    expect(urls.some(u => u.includes("Mumbai"))).toBe(false);
  });
});
