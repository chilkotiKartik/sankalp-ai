import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import * as fs from "node:fs";
import { app, stopApp } from "./helpers";

/** Web app (PWA): installable on Android and iPhone, offline shell, never caches API data. */
afterAll(() => stopApp());

describe("installable web app", () => {
  it("serves a valid manifest with install icons", async () => {
    const r = await request(app()).get("/manifest.webmanifest");
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toContain("application/manifest+json");
    const m = JSON.parse(r.text);
    expect(m.display).toBe("standalone");
    expect(m.start_url).toMatch(/^\//);
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect((await request(app()).get(i.src)).status).toBe(200);
  });

  it("serves the service worker uncached, scoped to the whole app", async () => {
    const r = await request(app()).get("/sw.js");
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-cache");
    expect(r.headers["service-worker-allowed"]).toBe("/");
  });

  it("the service worker never intercepts API, streams, signed links or portals", () => {
    const sw = fs.readFileSync("public/sw.js", "utf8");
    const never = new RegExp(sw.match(/const NEVER = \/(.+)\/;/)![1]);
    for (const p of ["/api/sos", "/api/complaints", "/ws", "/web/portal", "/s/abc", "/c/abc", "/uploads/x.jpg", "/widget/report"]) expect(never.test(p), p).toBe(true);
    for (const p of ["/", "/sos", "/complaints", "/_expo/static/js/web/entry.js"]) expect(never.test(p), p).toBe(false);
  });

  it("the app page carries the install tags for Android and iPhone", async () => {
    if (!fs.existsSync("static-build/web/index.html")) return; // web build not present in this checkout
    const r = await request(app()).get("/");
    expect(r.status).toBe(200);
    for (const tag of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'viewport-fit=cover', '/pwa/register.js'])
      expect(r.text).toContain(tag);
    expect(r.text.match(/name="viewport"/g)).toHaveLength(1);
  });
});

describe("search and share metadata", () => {
  it("the app page has a title, description, link-preview tags and structured data", async () => {
    const r = await request(app()).get("/");
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/<title>SANKALP AI — [^<]+<\/title>/);
    expect(r.text).toContain('<html lang="en-IN">');
    for (const tag of ['name="description"', 'property="og:title"', 'property="og:description"', 'property="og:image"', 'name="twitter:card"', 'application/ld+json'])
      expect(r.text, tag).toContain(tag);
    const og = /property="og:image" content="([^"]+)"/.exec(r.text)![1];
    expect((await request(app()).get(new URL(og, "http://x").pathname)).status).toBe(200);
  });

  it("robots.txt lets search engines index pages but never the API", async () => {
    const r = await request(app()).get("/robots.txt");
    expect(r.status).toBe(200);
    expect(r.text).toContain("Disallow: /api/");
  });
});
