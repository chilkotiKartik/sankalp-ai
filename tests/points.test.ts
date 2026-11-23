import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { levelFor } from "../server/domain/points";
import { app, stopApp, makeUser, auth } from "./helpers";

/** Sankalp Points: earned only for real outcomes, transparent, capped, verifiable. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("Sankalp Points", () => {
  it("gives nothing just for filing a complaint", async () => {
    const c = await makeUser("citizen", "Dehradun");
    await request(app()).post("/api/complaints").set(auth(c.token)).send({ category: "pothole", description: "Big pothole near the school gate", location: "School road" });
    expect(storage.getUserById(c.user.id)!.points).toBe(0);
  });

  it("awards once per outcome, with daily caps against farming", async () => {
    const c = await makeUser("citizen", "Dehradun");
    expect(storage.awardPoints(c.user.id, "complaint_fixed", "c1")).toBe(10);
    expect(storage.awardPoints(c.user.id, "complaint_fixed", "c1")).toBe(0); // same complaint twice → nothing
    for (let i = 0; i < 5; i++) expect(storage.awardPoints(c.user.id, "upvote_given", `u${i}`)).toBe(1);
    expect(storage.awardPoints(c.user.id, "upvote_given", "u5")).toBe(0); // 6th upvote today → capped
    expect(storage.getUserById(c.user.id)!.points).toBe(15);
  });

  it("does not reward supporting your own complaint", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const r = await request(app()).post("/api/complaints").set(auth(c.token)).send({ category: "garbage", description: "Garbage pile not cleared for a week", location: "Market" });
    const id = (r.body.complaint ?? r.body).id;
    await request(app()).put(`/api/complaints/${id}/upvote`).set(auth(c.token)).send({});
    expect(storage.getUserById(c.user.id)!.points).toBe(0);
  });

  it("levels and badges follow real counts; history and rules are visible", async () => {
    const c = await makeUser("citizen", "Dehradun");
    for (let i = 0; i < 5; i++) storage.awardPoints(c.user.id, "complaint_fixed", `f${i}`);
    const r = await request(app()).get("/api/me/points").set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.points).toBe(50);
    expect(r.body.level.name).toBe("Sajag");
    expect(r.body.badges.filter((b: { earned: boolean }) => b.earned).map((b: { id: string }) => b.id)).toEqual(expect.arrayContaining(["first_fix", "fix_5"]));
    expect(r.body.history).toHaveLength(5);
    expect(r.body.rules.find((x: { id: string }) => x.id === "complaint_fixed").points).toBe(10);
    expect(levelFor(2500).name).toBe("Sankalp Ratna");
  });

  it("keeps points earned before the ledger as one 'earlier activity' line", async () => {
    const c = await makeUser("citizen", "Dehradun");
    storage.getUserById(c.user.id)!.points = 42;
    const s = storage.pointsSummary(c.user.id)!;
    expect(s.points).toBe(42);
    expect(s.history[0]).toMatchObject({ reason: "earlier_activity", delta: 42 });
  });

  it("issues a certificate anyone can verify, showing first name and initial only", async () => {
    const c = await makeUser("citizen", "Dehradun");
    storage.getUserById(c.user.id)!.name = "Ravi Kumar Sharma";
    storage.awardPoints(c.user.id, "complaint_fixed", "x1");
    const cert = await request(app()).get("/api/me/certificate").set(auth(c.token));
    const page = await request(app()).get(cert.body.path);
    expect(page.status).toBe(200);
    expect(page.text).toContain("Ravi S.");
    expect(page.text).not.toContain("Sharma");
    expect(page.text).not.toContain(c.user.phone);
    expect(page.text).toContain("verified fixes");
    const forged = await request(app()).get(cert.body.path.replace(/.$/, (m: string) => (m === "A" ? "B" : "A")));
    expect(forged.text).toContain("Certificate not found");
  });
});
