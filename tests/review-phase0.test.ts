import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import type { AddressInfo } from "node:net";
import { storage } from "../server/storage";
import { setConfig, loadConfig } from "../server/config";
import { app, server, stopApp, makeUser, deptToken, auth, fileComplaint, PNG_1PX } from "./helpers";

/** Regression tests for the independent Phase 0 review findings (docs/reports/phase-0.md). */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("review H1: department SOS feed", () => {
  it("health department stream does not receive women-safety SOS", async () => {
    const srv = server();
    await new Promise<void>(r => (srv.listening ? r() : srv.listen(0, "127.0.0.1", () => r())));
    const port = (srv.address() as AddressInfo).port;
    const tok = await deptToken("health");
    const victim = await makeUser();
    const got: string[] = [];
    const ctrl = new AbortController();
    const done = fetch(`http://127.0.0.1:${port}/api/dept/health/stream?token=${encodeURIComponent(tok)}`, { signal: ctrl.signal })
      .then(async r => { const rd = r.body!.getReader(); for (;;) { const { value, done } = await rd.read(); if (done) break; got.push(Buffer.from(value).toString()); } })
      .catch(() => undefined);
    await new Promise(r => setTimeout(r, 200));
    await request(app()).post("/api/sos/women-safety").set(auth(victim.token)).send({ geo: { lat: 30.3, lng: 78 } });
    await new Promise(r => setTimeout(r, 300));
    ctrl.abort();
    await done;
    expect(got.join("")).toContain("connected");
    expect(got.join("")).not.toContain(victim.user.phone);
  });
});

describe("review H2/L5: police console endpoints accept the control-room code", () => {
  it("patrols, night-safety and SOS list work with a police department token", async () => {
    const police = await deptToken("police");
    expect((await request(app()).get("/api/cpr/patrols").set(auth(police))).status).toBe(200);
    expect((await request(app()).get("/api/cpr/night-safety").set(auth(police))).status).toBe(200);
    expect((await request(app()).get("/api/sos").set(auth(police))).status).toBe(200);
    const pwd = await deptToken("pwd");
    expect((await request(app()).get("/api/sos").set(auth(pwd))).status).toBe(403);
    expect((await request(app()).get("/api/cpr/patrols")).status).toBe(401);
  });
});

describe("review M1: proof must be a fresh, own photo", () => {
  it("re-using the complaint's before photo (or someone else's upload) as proof is rejected", async () => {
    const citizen = await makeUser();
    const admin = await makeUser("admin");
    const c = await fileComplaint(citizen.token, { beforePhoto: PNG_1PX });
    const reuse = await request(app()).put(`/api/admin/complaints/${c.id}`).set(auth(admin.token)).send({ status: "resolved", proofPhoto: c.beforePhoto });
    expect(reuse.status).toBe(422);
    expect(storage.getComplaint(c.id)!.state).toBe("NEW");
    const own = await request(app()).post("/api/upload").set(auth(admin.token)).send({ image: PNG_1PX });
    expect((await request(app()).put(`/api/admin/complaints/${c.id}`).set(auth(admin.token)).send({ status: "resolved", proofPhoto: own.body.url })).status).toBe(200);
  });

  it("review L3: a rejected officer update changes nothing", async () => {
    const citizen = await makeUser();
    const admin = await makeUser("admin");
    const c = await fileComplaint(citizen.token);
    await request(app()).put(`/api/admin/complaints/${c.id}`).set(auth(admin.token)).send({ status: "resolved", adminNote: "should not persist" });
    expect(storage.getComplaint(c.id)!.adminNote).toBeUndefined();
  });
});

describe("review M2: demo data fully purged", () => {
  it("every record created in DEMO_MODE is flagged and purged", async () => {
    const base = loadConfig(process.env);
    setConfig({ ...base, DEMO_MODE: true });
    const u = await makeUser();
    storage.createAnnouncement({ title: "Demo scheme", body: "x", type: "scheme", department: "d", priority: "urgent", postedBy: "demo" });
    storage.createSafetyIncident({ citizenName: "x", district: "Dehradun", location: "x", lat: 30, lng: 78 });
    await fileComplaint(u.token);
    setConfig(base);
    expect(storage.hasDemoData()).toBe(true);
    storage.purgeDemo();
    expect(storage.hasDemoData()).toBe(false);
    expect((await request(app()).get("/api/public/announcements")).body).toEqual([]);
    expect(storage.getSafetyIncidents()).toHaveLength(0);
  });
});

describe("review M3/M4/L6", () => {
  it("night-safety report accepts geo: null", async () => {
    const { token } = await makeUser();
    expect((await request(app()).post("/api/cpr/night-safety").set(auth(token)).send({ location: "Bus stand", geo: null })).status).toBe(201);
  });

  it("citizens do not get worker GPS or identity", async () => {
    const worker = await makeUser("worker");
    await request(app()).post("/api/worker/location").set(auth(worker.token)).send({ lat: 30.31, lng: 78.05 });
    const citizen = await makeUser();
    const res = await request(app()).get("/api/workers").set(auth(citizen.token));
    expect(JSON.stringify(res.body)).not.toContain("30.31");
    expect(JSON.stringify(res.body)).not.toContain(worker.user.id);
  });

  it("leaderboard shows only first name + initial and no phone digits", async () => {
    const u = await storage.createUser({ name: "Asha Devi Rawat", phone: "9000000444", pin: "x", role: "citizen", district: "Dehradun", points: 50, badges: [], level: 1 });
    const viewer = await makeUser();
    const res = await request(app()).get("/api/leaderboard").set(auth(viewer.token));
    const row = res.body.find((r: { id: string }) => r.id === u.id);
    expect(row.name).toBe("Asha R.");
    expect(JSON.stringify(res.body)).not.toContain("9000000444");
  });
});

describe("review M5: SOS is never blocked by an expired session", () => {
  it("an SOS succeeds on a recently expired session, ordinary routes do not", async () => {
    const victim = await makeUser();
    storage.s.tokens.forEach(t => { t.expiresAt = Date.now() - 3600_000; });
    expect((await request(app()).get("/api/complaints").set(auth(victim.token))).status).toBe(401);
    expect((await request(app()).post("/api/sos/women-safety").set(auth(victim.token)).send({ geo: { lat: 30.3, lng: 78 } })).status).toBe(201);
  });

  it("a revoked (logged-out) session cannot raise SOS", async () => {
    const victim = await makeUser();
    await request(app()).post("/api/auth/logout").set(auth(victim.token));
    expect((await request(app()).post("/api/sos/women-safety").set(auth(victim.token)).send({})).status).toBe(401);
  });
});
