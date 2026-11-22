import { describe, it, expect, afterAll } from "vitest";
import { app, stopApp } from "./helpers";
import { registry } from "../server/lib/route";
import { PERMISSIONS } from "../server/auth/permissions";
import { loadConfig } from "../server/config";
import { safeFetch, EgressBlockedError, isAllowedHost } from "../server/lib/safeFetch";
import { redact } from "../server/lib/logger";
import { buildPayload } from "../server/notify/push";
import { sniff } from "../server/lib/media";

afterAll(() => stopApp());

interface Layer { route?: { path: string | string[]; methods: Record<string, boolean> } }

describe("route inventory (M14)", () => {
  it("every /api route is declared through the registry with permission + schemas", () => {
    const a = app();
    const stack: Layer[] = (a as unknown as { router: { stack: Layer[] } }).router.stack;
    const mounted = stack.filter(l => l.route).flatMap(l => ([] as string[]).concat(l.route!.path)
      .filter(p => p.startsWith("/api") || p === "/healthz")
      .flatMap(p => Object.keys(l.route!.methods).map(m => `${m.toUpperCase()} ${p}`)));
    expect(mounted.length).toBeGreaterThan(90);
    const declared = new Set(registry.map(r => `${r.method.toUpperCase()} ${r.path}`));
    const undeclared = mounted.filter(m => !declared.has(m));
    expect(undeclared).toEqual([]);
    expect(registry.length).toBeGreaterThan(90);
    for (const r of registry) {
      expect(r.permission, `${r.method} ${r.path}`).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(r.hasParams && r.hasQuery && r.hasBody, `${r.method} ${r.path} schemas`).toBe(true);
    }
  });

  it("P1.4: every route permission is defined in the RBAC map (fail closed otherwise)", () => {
    app();
    const missing = [...new Set(registry.map(r => r.permission))].filter(p => !PERMISSIONS[p]);
    expect(missing).toEqual([]);
    for (const r of registry.filter(x => x.auth === "public")) expect(PERMISSIONS[r.permission], r.path).toContain("public");
    for (const r of registry.filter(x => x.auth !== "public")) expect(PERMISSIONS[r.permission], r.path).not.toContain("public");
  });

  it("no duplicate method+path declarations", () => {
    const keys = registry.map(r => `${r.method} ${r.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("public routes are an explicit, reviewed allow-list", () => {
    const pub = registry.filter(r => r.auth === "public").map(r => `${r.method.toUpperCase()} ${r.path}`).sort();
    expect(pub).toEqual([
      "GET /api/cpr/emergency-locations", "GET /api/cpr/emergency-services", "GET /api/dept/list", "GET /api/disaster/camps",
      "GET /api/disaster/missing", "GET /api/disaster/reports", "GET /api/disaster/status", "GET /api/health",
      "GET /api/media/signed/:file", "GET /api/open-data/complaints.csv", "GET /api/open-data/complaints.json", "GET /api/public/announcements",
      "GET /api/public/anomalies", "GET /api/public/budget", "GET /api/public/config", "GET /api/public/department-report",
      "GET /api/public/district-stats", "GET /api/public/geo/districts", "GET /api/public/geo/states", "GET /api/public/news", "GET /api/public/privacy-notice", "GET /api/public/resolution-rate", "GET /api/public/scorecard",
      "GET /api/public/stats", "GET /api/public/tenants", "GET /api/public/ward-health", "GET /api/sos/shared/:token", "GET /api/yatra/helplines",
      "GET /api/yatra/nearest-medical", "GET /c/:token", "GET /healthz", "GET /readyz",
      "GET /s/:token", "GET /web/disaster", "GET /web/transparency", "GET /widget/report",
      "GET /widget/ward-score", "POST /api/auth/login", "POST /api/auth/logout", "POST /api/auth/otp/request",
      "POST /api/auth/otp/verify", "POST /api/auth/refresh", "POST /api/auth/register", "POST /api/auth/worker-login",
      "POST /api/channels/ivr/recording", "POST /api/channels/whatsapp/inbound", "POST /api/dept/login", "POST /api/sos/delivery-receipt",
      "POST /api/verification/ivr/:token", "POST /api/verification/sms-inbound", "PUT /api/complaints/:id/proof",
    ]);
  });
});

describe("config (m13, M5)", () => {
  const base = { JWT_SECRET: "a".repeat(32), DEPT_JWT_SECRET: "b".repeat(32) };
  it("refuses short or missing secrets", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ JWT_SECRET: "short", DEPT_JWT_SECRET: "b".repeat(32) })).toThrow(/at least 32/);
    expect(() => loadConfig({ JWT_SECRET: "a".repeat(32), DEPT_JWT_SECRET: "a".repeat(32) })).toThrow(/must differ/);
  });
  it("defaults to rules + manual_review with no Indian AI configured, and never OSM tiles in production", () => {
    const c = loadConfig({ ...base, NODE_ENV: "production" });
    expect(c.textProvider).toBe("rules");
    expect(c.visionProvider).toBe("manual_review");
    expect(c.mapTileUrl).toBeNull();
    expect(loadConfig({ ...base, SARVAM_API_KEY: "k" }).textProvider).toBe("sarvam");
  });
});

describe("egress (rule 1)", () => {
  it("blocks non-allow-listed hosts before any network I/O", async () => {
    await expect(safeFetch("https://api.openai.com/v1/chat/completions")).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(safeFetch("https://api.groq.com/x")).rejects.toBeInstanceOf(EgressBlockedError);
    expect(isAllowedHost("api.sarvam.ai")).toBe(true);
    expect(isAllowedHost("api.sarvam.ai.evil.com")).toBe(false);
  });
});

describe("privacy helpers (rule 2, M17)", () => {
  it("logger redacts phones, names and GPS", () => {
    const out = JSON.stringify(redact({ msg: "call 9876500000 now", phone: "9000000001", geo: { lat: 1, lng: 2 }, name: "Asha" }));
    expect(out).not.toContain("9876500000");
    expect(out).not.toContain("9000000001");
    expect(out).not.toContain("Asha");
    expect(out).not.toContain("\"lat\"");
  });
  it("push payload carries only a reference", () => {
    expect(buildPayload({ kind: "sos", id: "abc", ref: "SOS-1" })).toEqual({ title: "Sankalp", body: "Update on #SOS-1", data: { kind: "sos", id: "abc" } });
  });
});

describe("media sniffing (M2)", () => {
  it("recognises only real image/audio signatures", () => {
    expect(sniff(Buffer.from("ffd8ffe000104a464946000101", "hex"))?.ext).toBe("jpg");
    expect(sniff(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniff(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(8)]))?.kind).toBe("audio");
  });
});

describe("m19 OpenAPI", () => {
  it("documents every registered route with its permission", async () => {
    const { buildOpenApi } = await import("../server/openapi");
    app();
    const doc = buildOpenApi() as { openapi: string; paths: Record<string, Record<string, { "x-permission": string }>> };
    expect(doc.openapi).toBe("3.1.0");
    for (const r of registry) {
      const op = doc.paths[r.path.replace(/:(\w+)/g, "{$1}")]?.[r.method];
      expect(op, `${r.method} ${r.path}`).toBeDefined();
      expect(op["x-permission"]).toBe(r.permission);
    }
  });
});
