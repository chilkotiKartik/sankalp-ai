import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

async function file(n: number, category = "pothole") {
  const u = await makeUser("citizen", "Dehradun");
  for (let i = 0; i < n; i++) {
    await request(app()).post("/api/complaints").set(auth(u.token))
      .send({ category, description: `Secret description ${i} near my house`, location: "Private Lane 7", geo: { lat: 30.1 + i * 0.01, lng: 78.4 + i * 0.01 } });
  }
  return u;
}

describe("P8.1 open data with k-anonymity", () => {
  it("suppresses counts below 5 and never publishes text, locations or ids", async () => {
    const u = await file(3, "water");
    await file(6, "pothole");
    const j = await request(app()).get("/api/open-data/complaints.json");
    expect(j.status).toBe(200);
    const water = j.body.rows.find((r: { category: string }) => r.category === "water");
    const pothole = j.body.rows.find((r: { category: string }) => r.category === "pothole");
    expect(water.filed).toBe("<5");
    expect(pothole.filed).toBe(6);
    const csv = await request(app()).get("/api/open-data/complaints.csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text.split("\n")[0]).toBe("month,district,ward,department,category,filed,markedResolved,citizenVerified,closedWithinSla");
    for (const leak of ["Secret description", "Private Lane", u.user.id, u.user.phone, "30.1"]) expect(csv.text).not.toContain(leak);
    expect(j.body.dictionary.licence).toContain("GODL");
  });

  it("scorecard and dashboard show rates only with n ≥ 5; the page has no scripts", async () => {
    await file(2);
    const s = await request(app()).get("/api/public/scorecard");
    expect(s.body.departments.find((d: { department: string }) => d.department === "pwd").officialRate).toBeNull();
    const page = await request(app()).get("/web/transparency");
    expect(page.text).toContain("Real Resolution Rate");
    expect(page.text).toContain("not enough data");
    expect(page.text).not.toContain("<script");
  });
});

describe("P8.3 embeddable widgets", () => {
  it("widgets may be framed by other sites; the rest of the app may not", async () => {
    const w = await request(app()).get("/widget/ward-score?ward=Unknown");
    expect(w.status).toBe(200);
    expect(w.headers["x-frame-options"]).toBeUndefined();
    expect(w.headers["content-security-policy"]).toContain("frame-ancestors *");
    expect(w.text).toContain("Not enough data");
    const r = await request(app()).get("/widget/report?lang=hi");
    expect(r.text).toContain("समस्या दर्ज करें");
    const other = await request(app()).get("/web/transparency");
    expect(other.headers["x-frame-options"] ?? other.headers["content-security-policy"]).toBeTruthy();
    expect(String(other.headers["content-security-policy"] ?? "")).not.toContain("frame-ancestors *");
  });
});

describe("P8.2 integration adapters", () => {
  it("map without contact details unless consented; portal statuses never close a case", async () => {
    const { cpgrams, stateCmHelpline, exportToOutbox } = await import("../server/integrations");
    const u = await file(1);
    const c = storage.getComplaints()[0];
    const p = cpgrams.toExternal(c, { includeContact: false });
    expect(JSON.stringify(p)).not.toContain(u.user.phone);
    expect(cpgrams.toExternal(c, { includeContact: true }).complainantMobile).toBe(u.user.phone);
    expect(stateCmHelpline.fromExternalStatus("FORCE_CLOSED").kind).toBe("action_taken");
    expect(["acknowledged", "in_progress", "action_taken", "rejected_by_portal", "unknown"]).toContain(cpgrams.fromExternalStatus("DISPOSED").kind);
    expect(exportToOutbox("cpgrams", [c])).toBe(1);
    expect(storage.getComplaint(c.id)!.state).toBe("NEW");
  });
});
