import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage, auditHash } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("P1.7 hash-chained audit log", () => {
  const seed = () => { for (let i = 0; i < 5; i++) storage.addAuditLog("test_event", "actor", "Actor", `event ${i}`); };

  it("a clean chain verifies, with gap-free sequence numbers", () => {
    seed();
    expect(storage.verifyAuditChain()).toEqual({ ok: true, checked: 5, legacyUnchained: 0 });
    expect(storage.s.auditLogs.map(l => l.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("detects an edited entry", () => {
    seed();
    storage.s.auditLogs[2].details = "rewritten history";
    expect(storage.verifyAuditChain()).toMatchObject({ ok: false, brokenAt: 3, reason: expect.stringContaining("content changed") });
  });

  it("detects a deleted entry even if the attacker recomputes later hashes", () => {
    seed();
    storage.s.auditLogs.splice(1, 1);
    expect(storage.verifyAuditChain()).toMatchObject({ ok: false, brokenAt: 3 });
    // attacker re-links prevHash/hash but cannot fix the sequence gap
    let prev = storage.s.auditLogs[0].hash!;
    for (const e of storage.s.auditLogs.slice(1)) { e.prevHash = prev; e.hash = auditHash(prev, e); prev = e.hash; }
    expect(storage.verifyAuditChain()).toMatchObject({ ok: false, reason: expect.stringContaining("sequence gap") });
  });

  it("state admins can verify the chain over the API; citizens and district admins cannot", async () => {
    seed();
    const state = await makeUser("state_admin", "Uttarakhand");
    const r = await request(app()).get("/api/admin/audit/verify").set(auth(state.token));
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    const dist = await makeUser("district_admin", "Almora");
    expect((await request(app()).get("/api/admin/audit/verify").set(auth(dist.token))).status).toBe(403);
  });
});
