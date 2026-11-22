import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { loadTenants, tenantIds, tenant, stateRegistry } from "../server/tenancy";
import { app, stopApp, nextPhone, auth } from "./helpers";

/** P9: every Indian state and UT is a tenant, with its real districts, departments and maps. */
beforeAll(() => { loadTenants(); });
afterAll(() => stopApp());

describe("national state registry", () => {
  it("loads all 28 states and 8 union territories", () => {
    const reg = stateRegistry();
    expect(reg.filter(r => r.type === "state")).toHaveLength(28);
    expect(reg.filter(r => r.type === "ut")).toHaveLength(8);
    for (const r of reg) expect(tenantIds()).toContain(r.id);
    expect(new Set(reg.map(r => r.ticketPrefix)).size).toBe(reg.length);
  });

  it("every state/UT has its real districts (787 in all), each centred inside the state", () => {
    let n = 0;
    for (const r of stateRegistry()) {
      const t = tenant(r.id);
      expect(t.districts.length, r.id).toBeGreaterThan(0);
      expect(t.districts.map(d => d.district)).not.toContain("Other districts");
      expect(t.districts.map(d => d.district)).toContain(t.defaultDistrict);
      for (const d of t.districts) {
        expect(d.center.lat).toBeGreaterThanOrEqual(t.mapBounds.south);
        expect(d.center.lat).toBeLessThanOrEqual(t.mapBounds.north);
      }
      n += r.districts?.length ?? 0;
    }
    expect(n).toBe(787);
    expect(tenant("uttar-pradesh").districts.length).toBe(75);
    expect(tenant("kerala").districts.length).toBe(14);
  });

  it("every complaint category has an owning department in every state", () => {
    const cats = ["pothole", "road_damage", "garbage", "drain", "sewage", "water", "electricity", "streetlight", "transformer", "tree", "noise", "health_hazard", "disaster", "other"];
    for (const id of tenantIds()) {
      const t = tenant(id);
      for (const c of cats) expect(t.departments[t.categoryDepartment[c] ?? t.fallbackDepartment], `${id}/${c}`).toBeTruthy();
    }
  });
});

describe("public state endpoints", () => {
  it("/api/public/tenants lists every state with its map bounds", async () => {
    const r = await request(app()).get("/api/public/tenants");
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(36);
    const tn = r.body.find((x: { id: string }) => x.id === "tamil-nadu");
    expect(tn.bounds.north).toBeGreaterThan(tn.bounds.south);
    expect(tn.ticketPrefix).toBe("TN");
  });

  it("/api/public/config follows X-Tenant and ?tenant=", async () => {
    const h = await request(app()).get("/api/public/config").set("X-Tenant", "maharashtra");
    expect(h.body.tenant.name).toBe("Maharashtra");
    expect(h.body.tenant.districts.length).toBe(36);
    expect(h.body.tenant.departments.length).toBeGreaterThanOrEqual(8);
    const q = await request(app()).get("/api/public/config?tenant=goa");
    expect(q.body.tenant.id).toBe("goa");
    expect((await request(app()).get("/api/public/config").set("X-Tenant", "atlantis")).status).toBe(404);
  });

  it("serves district boundaries for the selected state and the national state outlines", async () => {
    const k = await request(app()).get("/api/public/geo/districts").set("X-Tenant", "kerala");
    expect(k.status).toBe(200);
    const g = JSON.parse(k.text);
    expect(g.features).toHaveLength(14);
    expect(g.features.map((f: { properties: { name: string } }) => f.properties.name)).toContain("Ernakulam");
    const s = JSON.parse((await request(app()).get("/api/public/geo/states")).text);
    expect(s.features.length).toBe(36);
  });

  it("portals receive the selected state's config, not a hard-coded one", async () => {
    const r = await request(app()).get("/web/portal?tenant=punjab");
    expect(r.status).toBe(200);
    expect(r.text).toContain('"name":"Punjab"');
    expect(r.text).toContain("Ludhiana");
  });
});

describe("a citizen in a state-level tenant", () => {
  it("registers in a real district and files a complaint routed to the state's department", async () => {
    const T = "kerala";
    const phone = nextPhone();
    const reg = await request(app()).post("/api/auth/register").set("X-Tenant", T).send({ name: "Kerala Citizen", phone, pin: "246813", district: "Ernakulam" });
    expect(reg.status).toBe(200);
    const tok = reg.body.accessToken as string;
    const cfg = await request(app()).get("/api/public/config").set("X-Tenant", T);
    const version = cfg.body.privacy?.noticeVersion ?? tenant(T).privacy.noticeVersion;
    expect((await request(app()).post("/api/privacy/consent").set("X-Tenant", T).set(auth(tok)).send({ version, accepted: true })).status).toBe(201);
    const c = await request(app()).post("/api/complaints").set("X-Tenant", T).set(auth(tok))
      .send({ category: "water", description: "No water supply since two days in our lane", location: "MG Road", geo: { lat: 9.98, lng: 76.28 } });
    expect(c.status).toBe(201);
    expect(c.body.ticketId.startsWith("KL-")).toBe(true);
    expect(c.body.district).toBe("Ernakulam");
    // The token is bound to Kerala: another state rejects it.
    expect((await request(app()).get("/api/auth/me").set("X-Tenant", "goa").set(auth(tok))).status).toBe(401);
  });

  it("rejects a district that does not belong to the state", async () => {
    const r = await request(app()).post("/api/auth/register").set("X-Tenant", "kerala").send({ name: "Wrong District", phone: nextPhone(), pin: "246813", district: "Dehradun" });
    expect(r.status).toBe(400);
  });
});
