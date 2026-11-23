import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

/** RTI: SANKALP drafts and tracks; the legal filing happens on the government portal — never faked. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

async function draft(token: string) {
  const r = await request(app()).post("/api/rti").set(auth(token)).send({ subject: "Road repair spending in my ward", description: "Please provide the sanctioned amount and expenditure for road repairs in Ward 12 for 2025-26.", department: "Municipal Corporation" });
  expect(r.status).toBe(201);
  return r.body;
}

describe("RTI", () => {
  it("starts as a draft and is never marked acknowledged by SANKALP", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const r = await draft(c.token);
    expect(r.status).toBe("draft");
    const sub = await request(app()).post(`/api/rti/${r.id}/submit`).set(auth(c.token));
    expect(sub.status).toBe(409);
    expect(sub.body.code).toBe("FILE_ON_PORTAL");
    expect(storage.getRTI(r.id)!.status).toBe("draft");
  });

  it("records the official registration number and starts the 30-day clock from the filing date", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const r = await draft(c.token);
    const filedOn = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const o = await request(app()).put(`/api/rti/${r.id}/official`).set(auth(c.token)).send({ regNo: "DOPAT/R/2026/60123", filedOn, portal: "central" });
    expect(o.status).toBe(200);
    expect(o.body.status).toBe("filed_official");
    expect(Date.parse(o.body.deadline) - Date.parse(filedOn)).toBe(30 * 86400000);
    const done = await request(app()).put(`/api/rti/${r.id}/reply-received`).set(auth(c.token)).send({ receivedOn: new Date().toISOString().slice(0, 10) });
    expect(done.body.status).toBe("responded");
  });

  it("rejects future dates, bad numbers and other people's RTIs", async () => {
    const a = await makeUser("citizen", "Dehradun");
    const b = await makeUser("citizen", "Dehradun");
    const r = await draft(a.token);
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    expect((await request(app()).put(`/api/rti/${r.id}/official`).set(auth(a.token)).send({ regNo: "ABC/R/2026/1", filedOn: future, portal: "central" })).status).toBe(422);
    expect((await request(app()).put(`/api/rti/${r.id}/official`).set(auth(a.token)).send({ regNo: "<script>", filedOn: "2026-11-20", portal: "central" })).status).toBe(400);
    expect((await request(app()).put(`/api/rti/${r.id}/official`).set(auth(b.token)).send({ regNo: "ABC/R/2026/1", filedOn: "2026-11-20", portal: "central" })).status).toBe(403);
  });
});

describe("community petitions", () => {
  it("reaching the goal marks it ready — it is not falsely 'delivered', and it stays open", async () => {
    const a = await makeUser("citizen", "Dehradun");
    const p = await request(app()).post("/api/petitions").set(auth(a.token)).send({ title: "Streetlights for the park road", description: "The park road has been dark for two months.", target: "Municipal Corporation", goalSignatures: 10 });
    for (let i = 0; i < 10; i++) { const u = await makeUser("citizen", "Dehradun"); await request(app()).put(`/api/petitions/${p.body.id}/sign`).set(auth(u.token)).send({}); }
    const pet = storage.s.petitions.find(x => x.id === p.body.id)!;
    expect(pet.status).toBe("active");
    expect(pet.goalReachedAt).toBeTruthy();
    const late = await makeUser("citizen", "Dehradun");
    expect((await request(app()).put(`/api/petitions/${p.body.id}/sign`).set(auth(late.token)).send({})).status).toBe(200);
    expect(pet.signerIds).toHaveLength(11);
  });
});

describe("department code rotation", () => {
  it("rotateAllDeptCodes replaces every code: old codes stop working, new ones work, and it is audited", async () => {
    await storage.ensureDeptCodes();
    const before = await storage.rotateDeptCode("police");
    const all = await storage.rotateAllDeptCodes();
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(8);
    expect(await storage.verifyDeptCode("police", before)).toBe(false);
    expect(await storage.verifyDeptCode("police", all.police)).toBe(true);
    expect(storage.s.auditLogs.some(l => l.action === "dept_codes_rotated_all")).toBe(true);
  });
});
