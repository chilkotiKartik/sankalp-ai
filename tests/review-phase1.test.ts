import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { registerTenant, tenant, loadTenants } from "../server/tenancy";
import { storage } from "../server/storage";
import { streamStillAuthorized } from "../server/lib/route";
import { lastConsoleOtp } from "../server/notify/sms";
import { app, stopApp, makeUser, auth, deptToken, nextPhone } from "./helpers";

/** Regression tests for the Phase 1 independent review (docs/reports/phase-1.md). */
beforeAll(() => {
  loadTenants();
  registerTenant({ ...tenant("uttarakhand"), id: "otherstate", name: "Other State", ticketPrefix: "OS" });
});
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("C1 department tokens are tenant-bound", () => {
  it("a department token from one state is rejected by another", async () => {
    const tok = await deptToken("pwd");
    expect((await request(app()).get("/api/dept/pwd/complaints").set(auth(tok))).status).toBe(200);
    expect((await request(app()).get("/api/dept/pwd/complaints").set("X-Tenant", "otherstate").set(auth(tok))).status).toBe(401);
  });
});

describe("C2 NUL characters never reach storage", () => {
  it("rejects a request containing U+0000", async () => {
    const c = await makeUser();
    const r = await request(app()).post("/api/complaints").set(auth(c.token))
      .send({ category: "pothole", description: "Pothole\u0000 near the stand", location: "Rajpur Road", geo: { lat: 30.33, lng: 78.06 } });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("INVALID_CHARACTERS");
  });
});

describe("H1 logout works with an expired access token", () => {
  it("revokes the session from the refresh token alone", async () => {
    const phone = nextPhone();
    const reg = await request(app()).post("/api/auth/register").send({ name: "Logout User", phone, pin: "135791", district: "Dehradun" });
    expect(reg.status).toBe(200);
    expect((await request(app()).post("/api/auth/logout").send({ refreshToken: reg.body.refreshToken })).status).toBe(200);
    expect((await request(app()).post("/api/auth/refresh").send({ refreshToken: reg.body.refreshToken })).status).toBe(401);
    expect((await request(app()).get("/api/auth/me").set(auth(reg.body.accessToken))).status).toBe(401);
  });
});

describe("M1 OTP hardening", () => {
  it("failed attempts carry over to a re-issued code", async () => {
    const phone = nextPhone();
    expect((await request(app()).post("/api/auth/otp/request").send({ phone })).status).toBe(200);
    const code = lastConsoleOtp(phone)!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await request(app()).post("/api/auth/otp/verify").send({ phone, code: wrong });
    const o = storage.s.otps.find(x => x.phone === phone)!;
    o.sentAt -= 60_000; // past the 30 s cooldown
    storage.createOtp(phone);
    expect(storage.s.otps.find(x => x.phone === phone)!.attempts).toBe(4);
  });

  it("staff accounts cannot sign in with an SMS code alone", async () => {
    const staff = await makeUser("district_admin");
    expect((await request(app()).post("/api/auth/otp/request").send({ phone: staff.user.phone })).status).toBe(200);
    const code = lastConsoleOtp(staff.user.phone)!;
    const r = await request(app()).post("/api/auth/otp/verify").send({ phone: staff.user.phone, code });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("PIN_REQUIRED");
  });
});

describe("M4 long-lived streams are re-validated", () => {
  it("a stream credential stops being valid after logout or erasure", async () => {
    const c = await makeUser();
    const req = (t: string) => ({ headers: { authorization: `Bearer ${t}` }, query: {} }) as never;
    expect(streamStillAuthorized(req(c.token))).toBe(true);
    storage.revokeToken(c.token);
    expect(streamStillAuthorized(req(c.token))).toBe(false);
    const phone = nextPhone();
    const reg = await request(app()).post("/api/auth/register").send({ name: "Stream User", phone, pin: "135791", district: "Dehradun" });
    expect(streamStillAuthorized(req(reg.body.accessToken))).toBe(true);
    storage.eraseUser(reg.body.user.id, "test");
    expect(streamStillAuthorized(req(reg.body.accessToken))).toBe(false);
  });
});

describe("M5 personal police accounts are district-scoped", () => {
  it("sees SOS of its own district only; the state control-room code sees all", async () => {
    const a = await makeUser("citizen", "Dehradun");
    const b = await makeUser("citizen", "Haridwar");
    await request(app()).post("/api/sos/women-safety").set(auth(a.token)).send({ geo: { lat: 30.3, lng: 78 } });
    await request(app()).post("/api/sos/women-safety").set(auth(b.token)).send({ geo: { lat: 29.9, lng: 78.1 } });
    const cop = await makeUser("police", "Dehradun");
    const mine = await request(app()).get("/api/sos").set(auth(cop.token));
    expect(mine.status).toBe(200);
    const districts = (mine.body.items ?? mine.body).map((x: { district: string }) => x.district);
    expect(districts).toEqual(["Dehradun"]);
    const control = await request(app()).get("/api/sos").set(auth(await deptToken("police")));
    expect((control.body.items ?? control.body).length).toBe(2);
  });
});

describe("Phase 7 review: department list pagination", () => {
  it("compound cursor returns every complaint exactly once, even with identical timestamps", async () => {
    const c = await makeUser();
    const u = storage.getUserById(c.user.id)!;
    for (let i = 0; i < 7; i++) storage.createComplaint({ category: "pothole", description: `p${i}`, location: "r", geo: { lat: 30.3, lng: 78 }, ward: "w", wardNumber: 1, district: "Dehradun", priority: "P3" }, u);
    const same = "2026-11-01T10:00:00.000Z";
    for (const x of storage.getComplaints()) x.submittedAt = same;
    const tok = await deptToken("pwd");
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const r: { body: { complaints: Array<{ id: string }>; hasMore: boolean; nextCursor: string | null } } = await request(app()).get(`/api/dept/pwd/complaints?limit=3${cursor ? `&cursor=${cursor}` : ""}`).set(auth(tok));
      seen.push(...r.body.complaints.map(x => x.id));
      if (!r.body.hasMore) break;
      cursor = r.body.nextCursor;
    }
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });
});
