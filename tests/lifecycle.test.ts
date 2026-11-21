import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import * as fs from "node:fs";
import { storage, AppStorage } from "../server/storage";
import { saveSnapshot, loadSnapshot, snapshotPath } from "../server/persistence";
import { runSlaCheck } from "../server/jobs";
import { app, stopApp, makeUser, deptToken, auth, fileComplaint, PNG_1PX } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("end-to-end complaint lifecycle", () => {
  it("citizen files → dept assigns worker → worker submits proof → citizen confirms → CLOSED", async () => {
    const citizen = await makeUser();
    const c = await fileComplaint(citizen.token, { beforePhoto: PNG_1PX });
    expect(c).toMatchObject({ status: "pending", state: "NEW", department: "PWD (Public Works Department)" });
    expect(c.aiRouting.department).toBe("pwd");

    const pwd = await deptToken("pwd");
    const assign = await request(app()).put(`/api/dept/complaints/${c.id}/assign-worker`).set(auth(pwd)).send({ workerName: "Ram Singh", workerPhone: "9000000222" });
    expect(assign.body.complaint.state).toBe("ASSIGNED");

    const wl = await request(app()).post("/api/auth/worker-login").send({ phone: "9000000222", pin: assign.body.pin, complaintId: c.id });
    expect(wl.status).toBe(200);
    expect(JSON.stringify(wl.body)).not.toContain(citizen.user.phone);

    const noPhoto = await request(app()).put(`/api/complaints/${c.id}/proof`).send({ phone: "9000000222", pin: assign.body.pin });
    expect(noPhoto.status).toBe(400);
    const proof = await request(app()).put(`/api/complaints/${c.id}/proof`).send({ phone: "9000000222", pin: assign.body.pin, proofPhoto: PNG_1PX, proofNote: "Filled and compacted" });
    expect(proof.status).toBe(200);
    expect(proof.body.state).toBe("VERIFYING");

    const confirm = await request(app()).put(`/api/complaints/${c.id}/confirm`).set(auth(citizen.token)).send({ rating: 5, feedback: "Fixed well" });
    expect(confirm.status).toBe(200);
    expect(confirm.body).toMatchObject({ state: "CLOSED", status: "closed" });

    const events = await request(app()).get(`/api/complaints/${c.id}/events`).set(auth(citizen.token));
    expect(events.body.map((e: { to: string }) => e.to)).toEqual(["NEW", "ASSIGNED", "IN_PROGRESS", "PROOF_SUBMITTED", "VERIFYING", "CITIZEN_VERIFIED", "CLOSED"]);
  });

  it("three citizen rejections escalate the complaint", async () => {
    const citizen = await makeUser();
    const admin = await makeUser("admin");
    const c = await fileComplaint(citizen.token);
    for (let i = 1; i <= 3; i++) {
      await request(app()).put(`/api/admin/complaints/${c.id}`).set(auth(admin.token)).send({ status: "resolved", proofPhoto: PNG_1PX });
      const r = await request(app()).put(`/api/complaints/${c.id}/reject`).set(auth(citizen.token)).send({ reason: "Still broken" });
      expect(r.body.state).toBe(i < 3 ? "REOPENED" : "ESCALATED");
    }
  });

  it("citizen can cancel only before assignment", async () => {
    const citizen = await makeUser();
    const c = await fileComplaint(citizen.token);
    expect((await request(app()).put(`/api/complaints/${c.id}/cancel`).set(auth(citizen.token))).body.state).toBe("CANCELLED_BY_CITIZEN");
    const c2 = await fileComplaint(citizen.token);
    const admin = await makeUser("admin");
    await request(app()).put(`/api/admin/complaints/${c2.id}`).set(auth(admin.token)).send({ status: "in_progress" });
    expect((await request(app()).put(`/api/complaints/${c2.id}/cancel`).set(auth(citizen.token))).status).toBe(409);
  });

  it("reviewer can resolve a NEEDS_REVIEW case", async () => {
    const citizen = await makeUser();
    const admin = await makeUser("admin");
    const c = await fileComplaint(citizen.token);
    await request(app()).put(`/api/admin/complaints/${c.id}`).set(auth(admin.token)).send({ status: "resolved", proofPhoto: PNG_1PX });
    const raw = storage.getComplaint(c.id)!;
    raw.state = "NEEDS_REVIEW";
    const r = await request(app()).put(`/api/admin/complaints/${c.id}/review`).set(auth(admin.token)).send({ decision: "verify" });
    expect(r.body.state).toBe("CLOSED");
  });
});

describe("persistence (M8)", () => {
  it("snapshot survives a restart (atomic write + reload)", async () => {
    const citizen = await makeUser();
    const c = await fileComplaint(citizen.token);
    saveSnapshot(storage);
    expect(fs.existsSync(snapshotPath())).toBe(true);
    const fresh = new AppStorage();
    expect(loadSnapshot(fresh)).toBe(true);
    expect(fresh.getComplaint(c.id)?.ticketId).toBe(c.ticketId);
    expect(fresh.validateToken(citizen.token)?.id).toBe(citizen.user.id);
  });

  it("purgeDemo removes demo records only", async () => {
    const real = await makeUser();
    await fileComplaint(real.token);
    const demo = await storage.createUser({ name: "D", phone: "9000000999", pin: "x", role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1, isDemo: true });
    storage.createComplaint({ category: "garbage", description: "demo", location: "x", geo: { lat: 30, lng: 78 }, ward: "w", wardNumber: 1, district: "Dehradun", priority: "P3", isDemo: true }, demo);
    expect(storage.purgeDemo()).toBeGreaterThan(0);
    expect(storage.getComplaints().length).toBe(1);
    expect(storage.getUserById(demo.id)).toBeUndefined();
  });
});

describe("honest data (M1, M9)", () => {
  it("M1: with DEMO_MODE off, worker positions change only on a real POST", async () => {
    const worker = await makeUser("worker");
    expect((await request(app()).post("/api/worker/location").set(auth(worker.token)).send({ lat: 30.3, lng: 78.04 })).status).toBe(200);
    const before = JSON.stringify(storage.getWorkers());
    storage.simulateDemoWorkerMovement();
    expect(JSON.stringify(storage.getWorkers())).toBe(before);
    expect((await request(app()).post("/api/worker/location").set(auth(worker.token)).send({ lat: 30.31, lng: 78.05 })).status).toBe(200);
    expect(storage.getWorkers()[0].geo).toEqual({ lat: 30.31, lng: 78.05 });
    const citizen = await makeUser();
    expect((await request(app()).post("/api/worker/location").set(auth(citizen.token)).send({ lat: 1, lng: 1 })).status).toBe(403);
  });

  it("M9: predictive signals are computed counts with n + method, no invented percentages", async () => {
    const citizen = await makeUser();
    await fileComplaint(citizen.token);
    const res = await request(app()).get("/api/predictive").set(auth(citizen.token));
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ status: "insufficient_data", weekOverWeekPct: null, n: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/\d+% (increase|of complaints)/);
    const src = fs.readFileSync("server/storage.ts", "utf8");
    expect(src).not.toMatch(/73% increase|40% of complaints/);
  });

  it("fresh install has no fabricated complaints, workers or budget", () => {
    expect(storage.getComplaints()).toHaveLength(0);
    expect(storage.getWorkers()).toHaveLength(0);
    expect(storage.getBudgetItems()).toHaveLength(0);
  });

  it("bills are not faked when DEMO_MODE is off", async () => {
    const citizen = await makeUser();
    const res = await request(app()).get("/api/bills").set(auth(citizen.token));
    expect(res.body).toMatchObject({ bills: [], integration: "not_connected" });
    expect((await request(app()).post("/api/bills/b1/pay").set(auth(citizen.token)).send({})).status).toBe(501);
  });

  it("SLA breaches are audited exactly once per complaint", async () => {
    const citizen = await makeUser();
    const c = await fileComplaint(citizen.token, { priority: "P1" });
    storage.getComplaint(c.id)!.submittedAt = new Date(Date.now() - 30 * 3600000).toISOString();
    expect(runSlaCheck()).toEqual([c.id]);
    expect(runSlaCheck()).toEqual([]);
  });
});
