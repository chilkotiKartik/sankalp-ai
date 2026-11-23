import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import request from "supertest";
import { loadTenants } from "../server/tenancy";
import { config, setConfig } from "../server/config";
import { parseRss, stateTerms, matchesState, tidyBulletins, POLICY_RX, getNews, _resetNewsCache } from "../server/news";
import { app, stopApp } from "./helpers";

/** Official news: real feeds (recorded fixtures from newsonair.gov.in and pib.gov.in), never invented items. */
const fx = (f: string) => fs.readFileSync(`tests/fixtures/${f}`, "utf8");
const realFetch = globalThis.fetch;
let calls: string[] = [];

beforeAll(() => { loadTenants(); });
beforeEach(() => {
  _resetNewsCache(); calls = [];
  setConfig({ ...config(), EGRESS_ALLOWLIST: ["api.sarvam.ai", "newsonair.gov.in", "www.pib.gov.in"] });
  globalThis.fetch = vi.fn(async (u: string | URL) => {
    const url = String(u); calls.push(url);
    const body = url.includes("pib.gov.in") ? fx("pib-national.xml") : url.includes("?s=") ? fx("air-kerala.xml") : fx("air-regional.xml");
    return new Response(body, { status: 200, headers: { "Content-Type": "application/rss+xml" } });
  }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = realFetch; stopApp(); });

describe("RSS parsing", () => {
  it("reads titles, official links, dates and clean summaries", () => {
    const items = parseRss(fx("air-kerala.xml"), "AIR");
    expect(items.length).toBeGreaterThan(0);
    for (const i of items) {
      expect(i.link).toMatch(/^https:\/\/newsonair\.gov\.in\//);
      expect(i.title).not.toMatch(/&#\d+;|<[a-z]/i);
      expect(i.summary).not.toMatch(/<[a-z]/i);
    }
    expect(items.some(i => i.publishedAt)).toBe(true);
    const pib = parseRss(fx("pib-national.xml"), "PIB");
    expect(pib.length).toBeGreaterThan(0);
    expect(pib.every(i => i.link.startsWith("https://pib.gov.in/"))).toBe(true);
  });

  it("drops items whose link is not an official government news link", () => {
    const xml = `<rss><channel><item><title>Bad</title><link>https://evil.example/x</link></item><item><title>Good</title><link>https://newsonair.gov.in/a/</link></item></channel></rss>`;
    expect(parseRss(xml, "AIR").map(i => i.title)).toEqual(["Good"]);
  });
});

describe("state relevance", () => {
  it("knows each state's names, aliases and its unique district names", () => {
    const k = stateTerms("kerala");
    expect(k).toEqual(expect.arrayContaining(["Kerala", "Keralam", "Ernakulam", "Alappuzha"]));
    // A district name shared by two states is not used (it cannot say which state the story is about).
    expect(stateTerms("maharashtra")).not.toContain("Aurangabad");
  });

  it("keeps only stories that name the state", () => {
    const terms = stateTerms("kerala");
    const yes = { id: "1", title: "Birds culled in Keralam's Alappuzha district", summary: "", link: "", publishedAt: null, source: "" };
    const no = { id: "2", title: "Seven killed in collision in Gujarat's Kutch district", summary: "", link: "", publishedAt: null, source: "" };
    expect(matchesState(yes, terms)).toBeGreaterThan(0);
    expect(matchesState(no, terms)).toBe(0);
    // Whole words, case-sensitive: the verb "erode" is not the district Erode.
    const verb = { id: "3", title: "Floods erode the river bank", summary: "", link: "", publishedAt: null, source: "" };
    expect(matchesState(verb, stateTerms("tamil-nadu"))).toBe(0);
  });
});

describe("GET /api/public/news", () => {
  it("returns this state's official local news, newest first, with attribution", async () => {
    const r = await request(app()).get("/api/public/news").set("X-Tenant", "kerala");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
    expect(r.body.sources[0].url).toBe("https://newsonair.gov.in");
    expect(r.body.items.length).toBeGreaterThan(0);
    const terms = stateTerms("kerala");
    for (const it of r.body.items) expect(matchesState(it, terms)).toBeGreaterThan(0);
    const dates = r.body.items.map((i: { publishedAt: string | null }) => Date.parse(i.publishedAt ?? "") || 0);
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    // Only the state's name is sent to the source.
    expect(calls.some(u => u.includes("?s=Kerala&feed=rss2"))).toBe(true);
  });

  it("national scope serves PIB press releases", async () => {
    const r = await request(app()).get("/api/public/news?scope=national").set("X-Tenant", "goa");
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.sources[0].name).toMatch(/Press Information Bureau/);
  });

  it("caches per state (no refetch inside 30 minutes)", async () => {
    await getNews("state", "kerala", { wait: true });
    const n = calls.length;
    await getNews("state", "kerala");
    expect(calls.length).toBe(n);
  });

  it("when the sources fail it says so — it never invents news", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); }) as typeof fetch;
    const r = await getNews("state", "goa", { wait: true });
    expect(r.status).toBe("unavailable");
    expect(r.items).toEqual([]);
  });

  it("fails closed when the news host is not allow-listed (data-residency guard)", async () => {
    setConfig({ ...config(), EGRESS_ALLOWLIST: ["api.sarvam.ai"] });
    const r = await getNews("state", "punjab", { wait: true });
    expect(r.status).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });
});

describe("district, policy and regional news (P9.24)", () => {
  it("district news keeps only stories that name the district, and labels AIR station bulletins", async () => {
    const r = await request(app()).get("/api/public/news?scope=district&district=Alappuzha").set("X-Tenant", "kerala");
    expect(r.status).toBe(200);
    expect(r.body.scope).toBe("district");
    expect(r.body.items.length).toBeGreaterThan(0);
    for (const it of r.body.items) expect(`${it.title} ${it.summary}`).toMatch(/Alappuzha/);
    expect(calls.some(u => u.includes("?s=Alappuzha"))).toBe(true);
  });

  it("refuses a district that is not in the state (no free text reaches the news servers)", async () => {
    const r = await request(app()).get("/api/public/news?scope=district&district=Mumbai").set("X-Tenant", "kerala");
    expect(r.status).toBe(422);
    expect(calls.some(u => u.includes("Mumbai"))).toBe(false);
  });

  it("policy news reads PIB regional offices and keeps only scheme/policy releases", async () => {
    const r = await request(app()).get("/api/public/news?scope=policy").set("X-Tenant", "kerala");
    expect(r.status).toBe(200);
    for (const it of r.body.items) expect(POLICY_RX.test(`${it.title} ${it.summary}`)).toBe(true);
    expect(calls.some(u => /Regid=(31|44)&reg=(31|44)/.test(u))).toBe(true);
  });

  it("tidyBulletins keeps the newest bulletin per AIR station with a clear title", () => {
    const b = (n: number, at: string) => ({ id: `b${n}`, title: "Lucknow", summary: "", link: `https://newsonair.gov.in/bulletins/lucknow-${n}/`, publishedAt: at, source: "AIR" });
    const out = tidyBulletins([b(1, "2026-11-22T07:00:00Z"), b(2, "2026-11-22T13:00:00Z")]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b2");
    expect(out[0].title).toBe("Akashvani Lucknow — latest regional news bulletin");
  });
});

describe("Hindi news", () => {
  it("asks PIB for its official Hindi national feed when the app is in Hindi", async () => {
    const r = await request(app()).get("/api/public/news?scope=national&lang=hi").set("X-Tenant", "kerala");
    expect(r.status).toBe(200);
    expect(calls.some(u => u.includes("Lang=2&Regid=3"))).toBe(true);
  });
});
