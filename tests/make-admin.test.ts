import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser } from "./helpers";

/** deploy/make-admin.sh → storage.makeAdmin: owner-run admin setup that works for new and already-registered numbers. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("make-admin", () => {
  it("creates a super admin for a new number; the PIN signs in", async () => {
    expect(await storage.makeAdmin("9876500001", "482913")).toBe("created");
    const res = await request(app()).post("/api/auth/login").send({ phone: "9876500001", pin: "482913" });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("super_admin");
  });

  it("promotes an existing citizen, replaces the PIN and signs out old sessions", async () => {
    const { user, token, pin } = await makeUser("citizen");
    expect(await storage.makeAdmin(user.phone, "604217")).toBe("promoted");
    expect((await request(app()).post("/api/auth/login").send({ phone: user.phone, pin })).status).toBe(401);
    const ok = await request(app()).post("/api/auth/login").send({ phone: user.phone, pin: "604217" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("super_admin");
    expect((await request(app()).get("/api/auth/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
    expect(storage.getUserById(user.id)?.points).toBe(user.points); // nothing else about the account changes
  });
});
