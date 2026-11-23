import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import request from "supertest";
import { loadTenants } from "../server/tenancy";
import { config, setConfig } from "../server/config";
import { parseSachet, selectAlerts, _resetAlertsCache } from "../server/alerts";
import { app, stopApp } from "./helpers";

/** Official NDMA SACHET alerts (real feed sample from 23 Nov 2026): parsed, matched to state and district, never invented. */
const xml = fs.readFileSync("tests/fixtures/sachet-india.xml", "utf8");
const NOW = Date.parse("2026-11-23T18:00:00Z");
const realFetch = globalThis.fetch;
beforeAll(() => loadTenants());
beforeEach(() => _resetAlertsCache());
afterAll(() => { globalThis.fetch = realFetch; stopApp(); });

describe("NDMA SACHET alerts", () => {
  it("reads official alerts with issuer, category and official link", () => {
    const a = parseSachet(xml);
    expect(a).toHaveLength(6);
    expect(a.map(x => x.issuer)).toEqual(expect.arrayContaining(["IMD Chennai", "IMD Agartala", "IMD Guwahati", "IMD Raipur", "CWC"]));
    for (const x of a) expect(x.link).toMatch(/^https:\/\/sachet\.ndma\.gov\.in\//);
    expect(parseSachet(`<item><title>x</title><link>https://evil.example/</link></item>`)).toHaveLength(0);
  });

  it("matches alerts to the right state by issuer or place names", () => {
    const a = parseSachet(xml);
    expect(selectAlerts(a, "tamil-nadu", undefined, NOW).items.map(x => x.issuer)).toEqual(["IMD Chennai"]);
    expect(selectAlerts(a, "tripura", undefined, NOW).items.map(x => x.issuer)).toEqual(["IMD Agartala"]);
    expect(selectAlerts(a, "assam", undefined, NOW).items.map(x => x.issuer)).toEqual(["IMD Guwahati"]);
    expect(selectAlerts(a, "kerala", undefined, NOW).items).toHaveLength(0); // nothing for Kerala in this sample → nothing shown
  });

  it("prefers alerts that name the user's district, and drops alerts older than 36 hours", () => {
    const a = parseSachet(xml);
    const r = selectAlerts(a, "chhattisgarh", "Raipur", NOW);
    expect(r.scope).toBe("district");
    expect(r.items[0].title).toMatch(/Dense Fog/);
    expect(selectAlerts(a, "odisha", undefined, NOW).items).toHaveLength(0); // the Odisha river alert is from 21 Nov → expired
    expect(selectAlerts(a, "odisha", undefined, Date.parse("2026-11-21T20:00:00Z")).items).toHaveLength(1);
  });

  it("serves alerts through the public API from the official feed only", async () => {
    setConfig({ ...config(), EGRESS_ALLOWLIST: ["sachet.ndma.gov.in"] });
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (u: string | URL) => { calls.push(String(u)); return new Response(xml, { status: 200 }); }) as typeof fetch;
    const r = await request(app()).get("/api/public/alerts?district=Raipur").set("X-Tenant", "chhattisgarh");
    expect(r.status).toBe(200);
    expect(["ok", "stale"]).toContain(r.body.status);
    expect(calls).toEqual(["https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml"]);
  });
});
