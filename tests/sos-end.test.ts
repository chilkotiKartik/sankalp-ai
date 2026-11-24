import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

/** "I'm safe": the sender ends a women-safety SOS with their PIN; police see it safe; the next SOS is a new alert. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

const panic = (token: string) => request(app()).post("/api/sos/women-safety").set(auth(token)).send({ geo: { lat: 30.3165, lng: 78.0322 }, location: "test" });

describe("ending an SOS", () => {
  it("PIN ends it, the police incident turns safe, and the next SOS is fresh (not de-duplicated)", async () => {
    const { user, token, pin } = await makeUser("citizen");
    const first = await panic(token);
    expect(first.status).toBe(201);
    const id = first.body.alert.id;
    expect((await request(app()).put(`/api/sos/${id}/cancel`).set(auth(token)).send({ pin: "000000" })).status).toBe(401);
    expect(storage.getSOSAlert(id)?.status).toBe("active");
    const ok = await request(app()).put(`/api/sos/${id}/cancel`).set(auth(token)).send({ pin, reason: "Sender says they are safe" });
    expect(ok.status).toBe(200);
    expect(storage.getSOSAlert(id)?.status).toBe("cancelled");
    expect(storage.s.safetyIncidents.find(i => i.sosId === id)?.status).toBe("safe");
    const second = await panic(token);
    expect(second.status).toBe(201);
    expect(second.body.deduplicated).toBe(false);
    expect(second.body.alert.id).not.toBe(id);
    expect(user.id).toBe(second.body.alert.userId ?? user.id);
  });

  it("police marking the person safe closes the SOS itself", async () => {
    const { token } = await makeUser("citizen");
    const r = await panic(token);
    const inc = storage.s.safetyIncidents.find(i => i.sosId === r.body.alert.id)!;
    storage.updateIncidentStatus(inc.id, "safe", "Officer confirmed the person is safe", "PCR");
    expect(storage.getSOSAlert(r.body.alert.id)?.status).toBe("resolved");
  });
});

describe("every SOS reaches the police control room", () => {
  it.each(["medical", "road_accident", "fire_risk", "gas_leak", "women_safety"] as const)("%s SOS opens a police case, alerts police, follows location, ends with PIN", async category => {
    const { cprEmitter, deptEmitter } = await import("../server/storage");
    const cpr: Array<{ type: string; incident?: { emergencyType?: string } }> = [];
    const dept: Array<{ type: string; departmentId?: string }> = [];
    const onC = (e: (typeof cpr)[number]) => cpr.push(e); const onD = (e: (typeof dept)[number]) => dept.push(e);
    cprEmitter.on("event", onC); deptEmitter.on("event", onD);
    try {
      const { token, pin } = await makeUser("citizen");
      const r = await request(app()).post("/api/sos").set(auth(token)).send({ category, geo: { lat: 30.3165, lng: 78.0322 }, location: "GPS: 30.3165, 78.0322" });
      expect(r.status).toBe(201);
      const inc = storage.s.safetyIncidents.find(i => i.sosId === r.body.id);
      expect(inc?.emergencyType).toBe(category);
      expect(cpr.some(e => e.type === "safety_incident_new" && e.incident?.emergencyType === category)).toBe(true);
      expect(dept.some(e => e.type === "sos_alert" && e.departmentId === "police")).toBe(true);
      expect((await request(app()).put(`/api/sos/${r.body.id}/location`).set(auth(token)).send({ lat: 30.32, lng: 78.04 })).status).toBe(200);
      expect(storage.s.safetyIncidents.find(i => i.sosId === r.body.id)?.geo).toEqual({ lat: 30.32, lng: 78.04 });
      expect((await request(app()).put(`/api/sos/${r.body.id}/cancel`).set(auth(token)).send({ pin })).status).toBe(200);
      expect(storage.s.safetyIncidents.find(i => i.sosId === r.body.id)?.status).toBe("safe");
    } finally { cprEmitter.off("event", onC); deptEmitter.off("event", onD); }
  });
});
