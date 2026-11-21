import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { storage } from "../server/storage";
import { lastConsoleOtp } from "../server/notify/sms";
import { signAccess } from "../server/auth/tokens";
import { app, stopApp, makeUser, auth, fileComplaint, nextPhone } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

async function pinLogin(phone: string, pin: string) {
  const r = await request(app()).post("/api/auth/login").send({ phone, pin });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as { token: string; accessToken: string; refreshToken: string; expiresIn: number };
}

describe("P1.5 access + refresh tokens", () => {
  it("login returns a 15-minute JWT access token and a refresh token; legacy `token` mirrors the access token", async () => {
    const { user, pin } = await makeUser();
    const s = await pinLogin(user.phone, pin);
    expect(s.accessToken.split(".")).toHaveLength(3);
    expect(s.token).toBe(s.accessToken);
    expect(s.expiresIn).toBe(900);
    expect(s.refreshToken).toMatch(/^rt_/);
    expect((await request(app()).get("/api/auth/me").set(auth(s.accessToken))).status).toBe(200);
  });

  it("refresh rotates; re-using an old refresh token revokes the whole session", async () => {
    const { user, pin } = await makeUser();
    const s1 = await pinLogin(user.phone, pin);
    const r1 = await request(app()).post("/api/auth/refresh").send({ refreshToken: s1.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(s1.refreshToken);
    const reuse = await request(app()).post("/api/auth/refresh").send({ refreshToken: s1.refreshToken });
    expect(reuse.status).toBe(401);
    // the family is revoked: even the newest refresh token and access token stop working
    expect((await request(app()).post("/api/auth/refresh").send({ refreshToken: r1.body.refreshToken })).status).toBe(401);
    expect((await request(app()).get("/api/auth/me").set(auth(r1.body.accessToken))).status).toBe(401);
  });

  it("logout revokes the access token immediately", async () => {
    const { user, pin } = await makeUser();
    const s = await pinLogin(user.phone, pin);
    expect((await request(app()).post("/api/auth/logout").set(auth(s.accessToken)).send({})).status).toBe(200);
    expect((await request(app()).get("/api/auth/me").set(auth(s.accessToken))).status).toBe(401);
    expect((await request(app()).post("/api/sos/women-safety").set(auth(s.accessToken)).send({})).status).toBe(401);
  });

  it("an expired access token is refused, except for SOS within the grace window (rule 9)", async () => {
    const { user, pin } = await makeUser();
    const s = await pinLogin(user.phone, pin);
    const sid = storage.s.sessions[0].sid;
    const expired = signAccess(user.id, sid, -60);
    expect((await request(app()).get("/api/auth/me").set(auth(expired))).status).toBe(401);
    expect((await request(app()).post("/api/sos/women-safety").set(auth(expired)).send({ geo: { lat: 30.3, lng: 78 } })).status).toBe(201);
    void s;
  });

  it("tampered or foreign-tenant tokens are rejected", async () => {
    const { user, pin } = await makeUser();
    const s = await pinLogin(user.phone, pin);
    const [h, p] = s.accessToken.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, tid: "other" })).toString("base64url");
    const sig = createHmac("sha256", "wrong-secret").update(`${h}.${forged}`).digest("base64url");
    expect((await request(app()).get("/api/auth/me").set(auth(`${h}.${forged}.${sig}`))).status).toBe(401);
    const noneAlg = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${p}.`;
    expect((await request(app()).get("/api/auth/me").set(auth(noneAlg))).status).toBe(401);
  });
});

describe("P1.5 phone OTP (console driver in tests)", () => {
  it("new number: request → verify with profile → citizen account + session; wrong code refused", async () => {
    const phone = nextPhone();
    expect((await request(app()).post("/api/auth/otp/request").send({ phone })).status).toBe(200);
    expect((await request(app()).post("/api/auth/otp/request").send({ phone })).status).toBe(429); // 30 s cooldown
    const code = lastConsoleOtp(phone)!;
    expect(code).toMatch(/^\d{6}$/);
    expect((await request(app()).post("/api/auth/otp/verify").send({ phone, code: code === "000000" ? "111111" : "000000" })).status).toBe(401);
    const ok = await request(app()).post("/api/auth/otp/verify").send({ phone, code, name: "Otp Citizen", district: "Almora" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.user).toMatchObject({ role: "citizen", district: "Almora" });
    // single use
    expect((await request(app()).post("/api/auth/otp/verify").send({ phone, code })).status).toBe(401);
  });
});

describe("P1.4 RBAC roles", () => {
  it("citizen cannot use admin, department or police routes", async () => {
    const { token } = await makeUser("citizen");
    expect((await request(app()).get("/api/admin/stats").set(auth(token))).status).toBe(403);
    expect((await request(app()).get("/api/cpr/incidents").set(auth(token))).status).toBe(403);
    expect((await request(app()).get("/api/dept/pwd/stats").set(auth(token))).status).toBe(401);
  });

  it("officer account acts for its own department only", async () => {
    const officer = await storage.createUser({ name: "PWD Officer", phone: nextPhone(), pin: "x", role: "officer", departmentId: "pwd", district: "Dehradun", points: 0, badges: [], level: 1 });
    const tok = storage.createToken(officer.id);
    expect((await request(app()).get("/api/dept/pwd/complaints").set(auth(tok))).status).toBe(200);
    expect((await request(app()).get("/api/dept/jal/complaints").set(auth(tok))).status).toBe(403);
    const citizen = await makeUser();
    const c = await fileComplaint(citizen.token);
    expect((await request(app()).put(`/api/dept/complaints/${c.id}`).set(auth(tok)).send({ status: "in_progress" })).status).toBe(200);
    // officers cannot post department-wide announcements (dept_admin only)
    expect((await request(app()).post("/api/dept/pwd/announcements").set(auth(tok)).send({ title: "Road closure", body: "Details here" })).status).toBe(403);
  });

  it("police account reads the CPR console; state_admin sees every district; district admin does not", async () => {
    const police = await makeUser("police");
    expect((await request(app()).get("/api/cpr/incidents").set(auth(police.token))).status).toBe(200);
    const a = await makeUser("citizen", "Dehradun");
    const b = await makeUser("citizen", "Almora");
    await fileComplaint(a.token);
    await fileComplaint(b.token);
    const state = await makeUser("state_admin", "Uttarakhand");
    const districts = new Set((await request(app()).get("/api/admin/complaints").set(auth(state.token))).body.map((c: { district: string }) => c.district));
    expect(districts).toEqual(new Set(["Dehradun", "Almora"]));
    const dist = await makeUser("district_admin", "Almora");
    const own = new Set((await request(app()).get("/api/admin/complaints").set(auth(dist.token))).body.map((c: { district: string }) => c.district));
    expect(own).toEqual(new Set(["Almora"]));
    // only super_admin manages staff
    expect((await request(app()).post("/api/superadmin/users").set(auth(state.token)).send({ name: "New Admin", phone: nextPhone(), pin: "246810", role: "district_admin", district: "Almora" })).status).toBe(403);
  });

  it("super admin can create an officer account bound to a department", async () => {
    const sup = await makeUser("super_admin", "Uttarakhand");
    const r = await request(app()).post("/api/superadmin/users").set(auth(sup.token))
      .send({ name: "Jal Officer", phone: nextPhone(), pin: "246810", role: "officer", district: "Dehradun", departmentId: "jal" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await request(app()).post("/api/superadmin/users").set(auth(sup.token))
      .send({ name: "Bad Officer", phone: nextPhone(), pin: "246810", role: "officer", district: "Dehradun" })).status).toBe(400);
  });
});
