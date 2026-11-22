import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import request from "supertest";
import { storage } from "../server/storage";
import { similarity, priorityFor } from "../server/agents/duplicates";
import { runSlaEscalation } from "../server/agents/sla";
import { suggestAssignees } from "../server/agents/workload";
import { seasonalTrends } from "../server/agents/trends";
import { SLA_HOURS } from "../server/data/reference";
import { app, stopApp, makeUser, auth, deptToken, PNG_1PX } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

const file = (token: string, extra: Record<string, unknown> = {}) => request(app()).post("/api/complaints").set(auth(token))
  .send({ category: "pothole", description: "Deep pothole near the bus stand on Rajpur Road", location: "Rajpur Road", geo: { lat: 30.33, lng: 78.06 }, ...extra });

describe("P4.6 hard limit: agents never close, reject or move a complaint's state", () => {
  it("no agent module calls a state-changing storage method or assigns .state", () => {
    const dir = path.join(__dirname, "../server/agents");
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      expect(src, f).not.toMatch(/\.(citizenConfirm|citizenReject|citizenCancel|reviewDecision|submitProof|startWork|assignWorkerToComplaint|applyVerification)\(/);
      expect(src, f).not.toMatch(/applyPath\(|smConfirm|\.state\s*=(?!=)/);
      expect(src, f).not.toMatch(/\.(complaints|media)\s*=\s*.*filter/); // never deletes records
    }
  });
});

describe("P4.1 duplicate merge", () => {
  it("text similarity and priority bumps", () => {
    expect(similarity("Deep pothole near the bus stand", "pothole near bus stand is deep")).toBeGreaterThan(0.5);
    expect(similarity("Garbage not collected", "Street light broken")).toBe(0);
    expect([priorityFor("P3", 1), priorityFor("P3", 3), priorityFor("P3", 10), priorityFor("P1", 10)]).toEqual(["P3", "P2", "P1", "P1"]);
  });

  it("review P4-1/P4-2: no merge into a parent past proof; one account cannot inflate 'affected'", async () => {
    const a = await makeUser("citizen", "Dehradun"), b = await makeUser("citizen", "Dehradun");
    const p = await file(a.token, { priority: "P4" });
    for (let i = 0; i < 4; i++) await file(b.token, { geo: { lat: 30.3301, lng: 78.0601 } });
    const parent = storage.getComplaint(p.body.id)!;
    expect(parent.affectedCount).toBe(2);
    expect(parent.priority).toBe("P4");
    const dept = await deptToken("pwd");
    await request(app()).put(`/api/dept/complaints/${p.body.id}`).set(auth(dept)).send({ status: "resolved", proofPhoto: PNG_1PX });
    const c = await makeUser("citizen", "Dehradun");
    const late = await file(c.token, { geo: { lat: 30.3301, lng: 78.0601 } });
    expect(storage.getComplaint(late.body.id)!.duplicateOf).toBeUndefined();
  });

  it("links nearby duplicates to a parent, raises priority with N, and unmerge restores everything", async () => {
    const users = await Promise.all([1, 2, 3].map(() => makeUser("citizen", "Dehradun")));
    const first = await file(users[0].token, { priority: "P3" });
    const second = await file(users[1].token, { geo: { lat: 30.3301, lng: 78.0601 }, description: "Big pothole at the bus stand, Rajpur Road" });
    const third = await file(users[2].token, { geo: { lat: 30.3302, lng: 78.06 } });
    const parent = storage.getComplaint(first.body.id)!;
    expect(storage.getComplaint(second.body.id)!.duplicateOf).toBe(parent.id);
    expect(parent.affectedCount).toBe(3);
    expect(parent.priority).toBe("P2");
    expect(storage.getAuditLogs().some(l => l.action === "agent_duplicate_merged")).toBe(true);

    const admin = await makeUser("admin", "Dehradun");
    const un = await request(app()).put(`/api/complaints/${third.body.id}/unmerge`).set(auth(admin.token)).send({ note: "different spot" });
    expect(un.status).toBe(200);
    expect(storage.getComplaint(third.body.id)!.duplicateOf).toBeUndefined();
    expect(parent.affectedCount).toBe(2);
    expect(parent.priority).toBe("P3");
  });

  it("does not merge complaints filed without GPS, other categories or far away", async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser();
    const x = await file(a.token, { geo: undefined });
    await file(b.token, { geo: undefined });
    await file(c.token, { category: "garbage", description: "Garbage pile" });
    expect(storage.getComplaint(x.body.id)!.affectedCount).toBeUndefined();
    expect(storage.getComplaints().every(k => !k.duplicateOf)).toBe(true);
  });

  it("proof on the parent reaches the child, but the child closes only on its own citizen's yes", async () => {
    const a = await makeUser("citizen", "Dehradun"), b = await makeUser("citizen", "Dehradun");
    const p = await file(a.token);
    const ch = await file(b.token, { geo: { lat: 30.3301, lng: 78.0601 } });
    const dept = await deptToken("pwd");
    await request(app()).put(`/api/dept/complaints/${p.body.id}`).set(auth(dept)).send({ status: "resolved", proofPhoto: PNG_1PX });
    expect(storage.getComplaint(ch.body.id)!.state).toBe("VERIFYING");
    await request(app()).put(`/api/complaints/${p.body.id}/confirm`).set(auth(a.token)).send({});
    expect(storage.getComplaint(p.body.id)!.state).toBe("CLOSED");
    expect(storage.getComplaint(ch.body.id)!.state).toBe("VERIFYING");
    await request(app()).put(`/api/complaints/${ch.body.id}/confirm`).set(auth(b.token)).send({});
    expect(storage.getComplaint(ch.body.id)!.state).toBe("CLOSED");
  });
});

describe("P4.2 SLA escalation", () => {
  it("review P4-3: crossing several levels at once audits every level", async () => {
    const u = await makeUser();
    const r = await file(u.token, { priority: "P2" });
    const c = storage.getComplaint(r.body.id)!;
    const sla = (SLA_HOURS.P2 ?? 72) * 3600000;
    expect(runSlaEscalation(new Date(c.submittedAt).getTime() + 2 * sla).map(x => x.level)).toEqual([1, 2, 3]);
  });

  it("escalates once per level, audits it, and respects a snooze with a reason", async () => {
    const u = await makeUser();
    const r = await file(u.token, { priority: "P2" });
    const c = storage.getComplaint(r.body.id)!;
    const sla = (SLA_HOURS.P2 ?? 72) * 3600000;
    const t0 = new Date(c.submittedAt).getTime();
    expect(runSlaEscalation(t0 + 0.5 * sla)).toEqual([]);
    expect(runSlaEscalation(t0 + 0.8 * sla)).toEqual([{ id: c.id, level: 1 }]);
    expect(runSlaEscalation(t0 + 0.9 * sla)).toEqual([]);
    expect(runSlaEscalation(t0 + 1.1 * sla)).toEqual([{ id: c.id, level: 2 }]);
    const dept = await deptToken("pwd");
    // Review P4-3: the department being escalated cannot snooze itself; a district admin can, within a cap.
    expect((await request(app()).put(`/api/complaints/${c.id}/sla-snooze`).set(auth(dept)).send({ hours: 48, reason: "Waiting for road-cutting permission" })).status).toBe(403);
    const admin = await makeUser("admin", "Dehradun");
    expect((await request(app()).put(`/api/complaints/${c.id}/sla-snooze`).set(auth(admin.token)).send({ hours: 4, reason: "no" })).status).toBe(400);
    expect((await request(app()).put(`/api/complaints/${c.id}/sla-snooze`).set(auth(admin.token)).send({ hours: 48, reason: "Waiting for permission, call 9876543210" })).status).toBe(200);
    expect((await request(app()).put(`/api/complaints/${c.id}/sla-snooze`).set(auth(admin.token)).send({ hours: 168, reason: "Another long wait" })).status).toBe(409);
    expect(storage.getComplaint(c.id)!.slaSnoozeReason).not.toContain("9876543210");
    const other = await makeUser("citizen", "Dehradun");
    expect((await request(app()).get(`/api/complaints/${c.id}`).set(auth(other.token))).body.slaSnoozeReason).toBeUndefined();
    expect(runSlaEscalation(Date.now() + 3600000)).toEqual([]);
    expect(storage.getAuditLogs().filter(l => l.action === "agent_sla_escalation")).toHaveLength(2);
    expect(storage.getAuditLogs().some(l => l.action === "sla_snoozed")).toBe(true);
  });
});

describe("P4.3 workload balancer", () => {
  it("prefers the nearby, less loaded, skilled worker and returns reasons, never phone numbers", async () => {
    const u = await makeUser();
    const r = await file(u.token);
    const c = storage.getComplaint(r.body.id)!;
    storage.s.workers.push(
      { id: "w1", name: "Far Busy", phone: "9000099901", ward: "w", wardNumber: 1, district: "Dehradun", score: 0, resolvedToday: 0, totalResolved: 0, avgRating: 0, status: "active", geo: { lat: 30.40, lng: 78.10 } },
      { id: "w2", name: "Near Free", phone: "9000099902", ward: "w", wardNumber: 1, district: "Dehradun", score: 0, resolvedToday: 0, totalResolved: 0, avgRating: 0, status: "active", geo: { lat: 30.331, lng: 78.061 }, skills: ["pothole"] },
      { id: "w3", name: "On Leave", phone: "9000099903", ward: "w", wardNumber: 1, district: "Dehradun", score: 0, resolvedToday: 0, totalResolved: 0, avgRating: 0, status: "on_leave" },
    );
    const s = suggestAssignees(c);
    expect(s.map(x => x.name)).toEqual(["Near Free", "Far Busy"]);
    const dept = await deptToken("pwd");
    const api = await request(app()).get(`/api/complaints/${c.id}/suggest-assignee`).set(auth(dept));
    expect(api.status).toBe(200);
    expect(JSON.stringify(api.body)).not.toContain("90000999");
  });
});

describe("P4.4 weekly briefing", () => {
  it("every figure has a source; PDF export is a valid PDF; district admins are scoped to their district", async () => {
    const u = await makeUser("citizen", "Dehradun");
    await file(u.token);
    const admin = await makeUser("admin", "Dehradun");
    const j = await request(app()).get("/api/admin/briefing?district=Haridwar").set(auth(admin.token));
    expect(j.status).toBe(200);
    expect(j.body.title).toContain("Dehradun");
    expect(j.body.items.find((i: { label: string }) => i.label === "Complaints filed this week").value).toBe(1);
    expect(j.body.items.every((i: { source: string }) => i.source.length > 5)).toBe(true);
    const pdf = await request(app()).get("/api/admin/briefing?format=pdf").set(auth(admin.token)).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = []; res.on("data", (c: Buffer) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    const body = pdf.body as Buffer;
    expect(body.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(body.toString("latin1")).toMatch(/startxref\n\d+\n%%EOF\n$/);
    const citizen = await request(app()).get("/api/admin/briefing").set(auth(u.token));
    expect(citizen.status).toBe(403);
  });
});

describe("P4.5 seasonal trends", () => {
  it("says insufficient_data without history and 'rising' only above the 95% bound", async () => {
    const u = await makeUser("citizen", "Dehradun");
    for (let i = 0; i < 3; i++) await file(u.token, { category: "water", description: `No water supply ${i}`, geo: { lat: 30.2 + i * 0.05, lng: 78.0 } });
    expect(seasonalTrends("Dehradun").find(t => t.category === "water")!.status).toBe("insufficient_data");
    // two earlier years with ~6 per 3-week window → expected 2/week; 12 now is clearly above the bound
    const year = 364 * 86400000;
    const c0 = storage.getComplaints().find(k => k.category === "water")!;
    storage.s.complaints.push({ ...c0, id: "coverage-start", category: "garbage", submittedAt: new Date(Date.now() - 3 * year).toISOString() });
    for (const y of [1, 2]) for (let i = 0; i < 6; i++) {
      const c = storage.getComplaints().find(k => k.category === "water")!;
      storage.s.complaints.push({ ...c, id: `hist-${y}-${i}`, submittedAt: new Date(Date.now() - y * year - i * 3600000).toISOString() });
    }
    for (let i = 0; i < 9; i++) await file(u.token, { category: "water", description: `Taps dry in lane ${i}`, geo: { lat: 30.0 + i * 0.05, lng: 78.3 } });
    const row = seasonalTrends("Dehradun").find(t => t.category === "water")!;
    expect(row.yearsOfHistory).toBe(2);
    expect(row.status).toBe("rising");
    expect(row.observed).toBe(12);
  });

  it("review P4-5: at New Year this week's complaints are never their own baseline", async () => {
    const u = await makeUser("citizen", "Dehradun");
    const r = await file(u.token, { category: "water", description: "No water" });
    const base = storage.getComplaint(r.body.id)!;
    storage.s.complaints = [];
    for (let i = 0; i < 12; i++) storage.s.complaints.push({ ...base, id: `n${i}`, submittedAt: `2026-12-${28 + (i % 4)}T10:00:00+05:30` });
    for (let i = 0; i < 2; i++) storage.s.complaints.push({ ...base, id: `o${i}`, submittedAt: `2025-12-30T10:00:00+05:30` });
    const row = seasonalTrends("Dehradun", Date.parse("2027-01-01T12:00:00+05:30")).find(t => t.category === "water")!;
    expect(row.status).toBe("insufficient_data");
    expect(row.observed).toBe(12);
  });
});
