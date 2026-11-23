import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

/** Budget: only official, sourced lines; published by officials; audited. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());
const line = { department: "Public Works Department", category: "Road repair", allocated: 25000000, spent: 9000000, district: "Dehradun", year: 2026, description: "District road repair and resurfacing programme", sourceUrl: "https://dehradun.nic.in/budget-2026.pdf" };

describe("budget", () => {
  it("officials publish lines that cite an official .gov.in/.nic.in source; citizens see them with the source", async () => {
    const admin = await makeUser("state_admin", "Dehradun");
    const c = await makeUser("citizen", "Dehradun");
    const p = await request(app()).post("/api/budget").set(auth(admin.token)).send(line);
    expect(p.status).toBe(201);
    const list = await request(app()).get("/api/budget").set(auth(c.token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].sourceUrl).toBe(line.sourceUrl);
    expect(storage.s.auditLogs.some(l => l.action === "budget_published")).toBe(true);
  });

  it("refuses unsourced or non-government sources, and citizens cannot publish", async () => {
    const admin = await makeUser("state_admin", "Dehradun");
    const c = await makeUser("citizen", "Dehradun");
    expect((await request(app()).post("/api/budget").set(auth(admin.token)).send({ ...line, sourceUrl: "https://example.com/x.pdf" })).status).toBe(400);
    expect((await request(app()).post("/api/budget").set(auth(admin.token)).send({ ...line, sourceUrl: "http://dehradun.nic.in/x.pdf" })).status).toBe(400);
    expect((await request(app()).post("/api/budget").set(auth(c.token)).send(line)).status).toBe(403);
  });

  it("hides unsourced legacy lines outside demo mode", async () => {
    const c = await makeUser("citizen", "Dehradun");
    storage.s.budgetItems.push({ id: "old", department: "X", category: "Y", allocated: 1, spent: 0, district: "Dehradun", year: 2024, description: "unsourced" });
    expect((await request(app()).get("/api/budget").set(auth(c.token))).body).toHaveLength(0);
  });
});
