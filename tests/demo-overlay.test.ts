import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { setConfig, loadConfig } from "../server/config";
import { addDemoData } from "../server/demo/seed";
import { app, stopApp, makeUser, fileComplaint } from "./helpers";

/** D-062: demo data is ADDED next to real data on the live site, and "off" removes exactly the demo part. */
beforeEach(() => storage.reset());
afterAll(() => { setConfig(loadConfig(process.env)); stopApp(); });

describe("demo overlay on the live site", () => {
  it("refuses to run unless DEMO_MODE is on", async () => {
    await expect(addDemoData(storage, "123456")).rejects.toThrow(/DEMO_MODE/);
  });

  it("adds demo records without touching real ones; the real admin survives the purge", async () => {
    const base = loadConfig(process.env);
    const real = await makeUser("citizen");
    await fileComplaint(real.token);
    const realComplaints = storage.getComplaints().length;
    setConfig({ ...base, DEMO_MODE: true });
    expect(await storage.makeAdmin("9876500002", "482913")).toBe("created");   // real admin made during demo mode
    await addDemoData(storage, "246810");
    expect(storage.getComplaints().length).toBeGreaterThan(realComplaints + 50);
    expect(storage.getComplaints().filter(c => c.state === "CLOSED" && c.isDemo).length).toBeGreaterThan(30);
    expect(storage.getSafetyIncidents().length).toBeGreaterThanOrEqual(6);
    setConfig(base);
    storage.purgeDemo();
    expect(storage.hasDemoData()).toBe(false);
    expect(storage.getComplaints().length).toBe(realComplaints);
    expect((await request(app()).post("/api/auth/login").send({ phone: real.user.phone, pin: real.pin })).status).toBe(200);
    expect((await request(app()).post("/api/auth/login").send({ phone: "9876500002", pin: "482913" })).status).toBe(200);
    expect((await request(app()).post("/api/auth/login").send({ phone: "9000000001", pin: "246810" })).status).toBe(401);
  });
});
