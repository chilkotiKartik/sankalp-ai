import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { registerTenant, tenant, runInTenant, parseTenantConfig, loadTenants } from "../server/tenancy";
import { storeFor } from "../server/storage";
import { app, server, stopApp, auth } from "./helpers";

/** P1.3: tenant A can never read or receive tenant B's data. */
beforeAll(() => {
  loadTenants();
  const uk = tenant("uttarakhand");
  registerTenant({ ...uk, id: "testland", name: "Testland", ticketPrefix: "TL", stateLabel: "Testland",
    districts: [{ district: "Alpha", center: { lat: 20, lng: 80 } }], defaultDistrict: "Alpha",
    wards: [{ name: "Alpha Ward", number: 1, area: "A", district: "Alpha", center: { lat: 20, lng: 80 }, pop: 1000 }],
    policeStations: [], emergencyServices: [] });
});
afterAll(() => stopApp());

async function register(tenantId: string, phone: string, district: string) {
  const r = await request(app()).post("/api/auth/register").set("X-Tenant", tenantId).send({ name: "Tenant User", phone, pin: "135791", district });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.token as string;
}

describe("tenant isolation (P1.3)", () => {
  it("unknown tenants are rejected", async () => {
    expect((await request(app()).get("/api/health").set("X-Tenant", "nowhere")).status).toBe(404);
  });

  it("each tenant uses its own reference data and ticket prefix", async () => {
    const t = await register("testland", "9000000771", "Alpha");
    const c = await request(app()).post("/api/complaints").set("X-Tenant", "testland").set(auth(t))
      .send({ category: "pothole", description: "Pothole on main road", location: "Alpha market" });
    expect(c.status).toBe(201);
    expect(c.body.ticketId).toMatch(/^TL-/);
    expect(c.body.district).toBe("Alpha");
    const cfg = await request(app()).get("/api/public/config").set("X-Tenant", "testland");
    expect(cfg.body.districts).toEqual(["Alpha"]);
    // Uttarakhand districts are not valid in Testland
    expect((await request(app()).post("/api/auth/register").set("X-Tenant", "testland").send({ name: "X Y", phone: "9000000772", pin: "135791", district: "Dehradun" })).status).toBe(400);
  });

  it("a tenant A token is useless against tenant B, and B cannot see A's complaints", async () => {
    const a = await register("uttarakhand", "9000000781", "Dehradun");
    await request(app()).post("/api/complaints").set(auth(a)).send({ category: "garbage", description: "Garbage dump near school", location: "Rajpur" });
    expect((await request(app()).get("/api/complaints").set("X-Tenant", "testland").set(auth(a))).status).toBe(401);
    const b = await register("testland", "9000000782", "Alpha");
    const list = await request(app()).get("/api/complaints").set("X-Tenant", "testland").set(auth(b));
    expect(list.body.every((c: { district: string }) => c.district === "Alpha")).toBe(true);
    expect(runInTenant("testland", () => storeFor("testland").getComplaints().some(c => c.district === "Dehradun"))).toBe(false);
    // Same phone can exist independently in two tenants
    expect((await request(app()).post("/api/auth/register").set("X-Tenant", "testland").send({ name: "Same Phone", phone: "9000000781", pin: "135791", district: "Alpha" })).status).toBe(200);
  });

  it("WebSocket clients only receive events from their own tenant", async () => {
    const srv = server();
    await new Promise<void>(r => (srv.listening ? r() : srv.listen(0, "127.0.0.1", () => r())));
    const port = (srv.address() as AddressInfo).port;
    const adminB = runInTenant("testland", () => {
      const s = storeFor("testland");
      const u = { id: "tl-admin", name: "TL Admin", phone: "9000000790", pin: "x", role: "super_admin" as const, district: "Testland", points: 0, badges: [], level: 1, createdAt: new Date().toISOString() };
      s.s.users.push(u);
      return s.createToken(u.id);
    });
    const got: string[] = [];
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?tenant=testland&token=${adminB}`);
    ws.on("message", m => got.push(String(m)));
    await new Promise(r => ws.on("open", r));
    const victim = await register("uttarakhand", "9000000791", "Dehradun");
    await request(app()).post("/api/sos/women-safety").set(auth(victim)).send({ geo: { lat: 30.3, lng: 78 } });
    await new Promise(r => setTimeout(r, 400));
    ws.close();
    expect(got.join("")).toContain("connected");
    expect(got.join("")).not.toContain("sos_new");
  });

  it("invalid tenant configs are rejected with a clear message", () => {
    const uk = tenant("uttarakhand");
    expect(() => parseTenantConfig({ ...uk, defaultDistrict: "Atlantis" })).toThrow(/defaultDistrict/);
    expect(() => parseTenantConfig({ ...uk, categoryDepartment: { pothole: "nope" } })).toThrow(/unknown department/);
    expect(() => parseTenantConfig({ ...uk, id: "Bad Id" })).toThrow(/id/);
  });
});
