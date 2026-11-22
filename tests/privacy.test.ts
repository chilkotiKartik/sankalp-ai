import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { tenant } from "../server/tenancy";
import { storage } from "../server/storage";
import { runRetention } from "../server/routes/privacy";
import { originalPath } from "../server/lib/media";
import { app, stopApp, makeUser, auth, fileComplaint, PNG_1PX } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("P1.9 DPDP", () => {
  it("bilingual privacy notice is public and names the grievance officer", async () => {
    const hi = await request(app()).get("/api/public/privacy-notice?lang=hi");
    expect(hi.status).toBe(200);
    expect(hi.body.purposes[0].text).toMatch(/[ऀ-ॿ]/);
    expect(hi.body.grievanceOfficer.email).toBeTruthy();
    expect(hi.body.version).toBe("2026-11-v1");
  });

  it("complaints need consent, SOS never does", async () => {
    const c = await makeUser("citizen", "Dehradun", "135792", { consent: false });
    const r = await request(app()).post("/api/complaints").set(auth(c.token)).send({ category: "pothole", description: "Pothole here", location: "Main road" });
    expect(r.status).toBe(428);
    expect(r.body.code).toBe("CONSENT_REQUIRED");
    expect((await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.3, lng: 78 } })).status).toBe(201);
    expect((await request(app()).post("/api/privacy/consent").set(auth(c.token)).send({ version: "old", accepted: true })).status).toBe(409);
    expect((await request(app()).post("/api/privacy/consent").set(auth(c.token)).send({ version: "2026-11-v1", lang: "hi", accepted: true })).status).toBe(201);
    expect((await request(app()).post("/api/complaints").set(auth(c.token)).send({ category: "pothole", description: "Pothole here", location: "Main road" })).status).toBe(201);
  });

  it("data export contains the user's own data and never their PIN hash", async () => {
    const c = await makeUser();
    await fileComplaint(c.token);
    const r = await request(app()).get("/api/privacy/my-data").set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.complaints).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toContain("$2b$");
    expect(r.headers["content-disposition"]).toContain("attachment");
  });

  it("erasure deletes the account and pseudonymises complaints", async () => {
    const c = await makeUser();
    const comp = await fileComplaint(c.token);
    expect((await request(app()).post("/api/privacy/erasure").set(auth(c.token)).send({ confirm: "nope" })).status).toBe(400);
    const r = await request(app()).post("/api/privacy/erasure").set(auth(c.token)).send({ confirm: "DELETE MY ACCOUNT" });
    expect(r.body.status).toBe("completed");
    expect(storage.getUserById(c.user.id)).toBeUndefined();
    const kept = storage.getComplaint(comp.id)!;
    expect(kept.submittedByPhone).toBeUndefined();
    expect(kept.submittedBy).toBe("Erased citizen");
    expect((await request(app()).get("/api/auth/me").set(auth(c.token))).status).toBe(401);
    expect(JSON.stringify(storage.getAuditLogs())).not.toContain(c.user.phone);
  });

  it("users with SOS records are placed on legal hold for state review", async () => {
    const c = await makeUser();
    await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.3, lng: 78 } });
    const r = await request(app()).post("/api/privacy/erasure").set(auth(c.token)).send({ confirm: "DELETE MY ACCOUNT" });
    expect(r.status).toBe(202);
    expect(r.body.status).toBe("legal_hold");
    expect(storage.getUserById(c.user.id)).toBeDefined();
    const state = await makeUser("state_admin", "Uttarakhand");
    const list = await request(app()).get("/api/privacy/erasure-requests").set(auth(state.token));
    expect(list.body[0].status).toBe("legal_hold");
    expect(JSON.stringify(list.body)).not.toContain(c.user.id);
  });

  it("retention purges old closed complaints and their photos, respecting SOS legal hold", async () => {
    const c = await makeUser();
    const admin = await makeUser("admin");
    const comp = await fileComplaint(c.token, { beforePhoto: PNG_1PX });
    const up = await request(app()).post("/api/upload").set(auth(admin.token)).send({ image: PNG_1PX });
    await request(app()).put(`/api/admin/complaints/${comp.id}`).set(auth(admin.token)).send({ status: "resolved", proofPhoto: up.body.url });
    await request(app()).put(`/api/complaints/${comp.id}/confirm`).set(auth(c.token)).send({});
    const sos = await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.3, lng: 78 } });
    storage.getSOSAlert(sos.body.alert.id)!.legalHold = true;
    const fourYears = Date.now() + 4 * 365 * 86400000;
    // Review P1-M7: with unconfirmed retention periods it is a dry run — nothing is deleted.
    expect(tenant().retention.needsLegalConfirmation).toBe(true);
    const dry = runRetention(fourYears);
    expect(dry.dryRun).toBe(true);
    expect(dry.complaints).toBe(0);
    expect(storage.getComplaint(comp.id)).toBeDefined();
    expect(storage.getAuditLogs().some(l => l.action === "retention_dry_run")).toBe(true);
    tenant().retention.needsLegalConfirmation = false;
    let r;
    try { r = runRetention(fourYears); } finally { tenant().retention.needsLegalConfirmation = true; }
    expect(r.complaints).toBe(1);
    expect(r.media.length).toBe(2);
    expect(storage.getComplaint(comp.id)).toBeUndefined();
    expect(storage.getSOSAlert(sos.body.alert.id)).toBeDefined();
    expect((await request(app()).get(up.body.url)).status).toBe(404);
  });

  it("retention never purges evidence of an open SOS", async () => {
    const c = await makeUser();
    const sos = await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.3, lng: 78 } });
    const a = storage.getSOSAlert(sos.body.alert.id)!;
    storage.addMedia({ id: "m-open", fileName: "00000000-0000-0000-0000-000000000001.m4a", mime: "audio/mp4", kind: "audio", size: 1, visibility: "private", ownerId: c.user.id, sosId: a.id });
    tenant().retention.needsLegalConfirmation = false;
    try {
      expect(runRetention(Date.now() + 4 * 365 * 86400000).sosEvidence).toEqual([]);
      a.status = "resolved"; a.resolvedAt = new Date().toISOString();
      expect(runRetention(Date.now() + 4 * 365 * 86400000).sosEvidence).toEqual(["00000000-0000-0000-0000-000000000001.m4a"]);
    } finally { tenant().retention.needsLegalConfirmation = true; }
  });
});

describe("review P1-H2: erasure leaves no personal data behind", () => {
  it("removes the person from chats, votes, upvotes, safety reports and original photos; export covers them first", async () => {
    const c = await makeUser();
    const other = await makeUser();
    // Same display name as the erased user: must NOT be touched.
    storage.getUserById(other.user.id)!.name = c.user.name;
    const comp = await fileComplaint(other.token);
    await request(app()).put(`/api/complaints/${comp.id}/upvote`).set(auth(c.token)).send({});
    await request(app()).post(`/api/complaints/${comp.id}/chat`).set(auth(other.token)).send({ message: "message from the other person" });
    const mine = await fileComplaint(c.token);
    await request(app()).post(`/api/complaints/${mine.id}/chat`).set(auth(c.token)).send({ message: "call me on my number" });
    const zone = await request(app()).post("/api/cpr/night-safety").set(auth(c.token)).send({ location: "Dark lane behind the market", description: "No street lights" });
    expect(zone.status).toBe(201);
    const up = await request(app()).post("/api/upload").set(auth(c.token)).send({ image: PNG_1PX });
    const exported = await request(app()).get("/api/privacy/my-data").set(auth(c.token));
    expect(exported.body.chatMessages.length).toBe(1);
    expect(exported.body.nightSafetyReports.length).toBe(1);
    expect(exported.body.complaintsUpvoted.map((x: { id: string }) => x.id)).toContain(comp.id);

    expect((await request(app()).post("/api/privacy/erasure").set(auth(c.token)).send({ confirm: "DELETE MY ACCOUNT" })).status).toBe(200);
    const { auditLogs: _audit, ...rest } = storage.s;
    const dump = JSON.stringify(rest);
    expect(dump).not.toContain(c.user.id);
    expect(dump).not.toContain(c.user.phone);
    expect(dump).not.toContain("call me on my number");
    expect(dump).toContain("message from the other person");
    expect(storage.getChatMessages(comp.id).find(m => m.message === "message from the other person")!.senderName).toBe(c.user.name);
    expect(originalPath(up.body.filename)).toBeNull();
  });
});
