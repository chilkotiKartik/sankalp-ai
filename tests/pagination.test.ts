import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth, fileComplaint } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("m10 cursor pagination (/api/v2)", () => {
  it("pages through complaints without gaps or duplicates; v1 stays a full array", async () => {
    const c = await makeUser();
    for (let i = 0; i < 7; i++) await fileComplaint(c.token, { description: `Issue number ${i} on the road` });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: request.Response = await request(app()).get(`/api/v2/complaints?limit=3${cursor ? `&cursor=${cursor}` : ""}`).set(auth(c.token));
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(7);
      seen.push(...r.body.items.map((x: { id: string }) => x.id));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(7);
    const v1 = await request(app()).get("/api/complaints").set(auth(c.token));
    expect(Array.isArray(v1.body)).toBe(true);
    expect(v1.body).toHaveLength(7);
  });

  it("enforces default 50 / max 200 and rejects bad cursors", async () => {
    const c = await makeUser();
    await fileComplaint(c.token);
    expect((await request(app()).get("/api/v2/complaints?limit=500").set(auth(c.token))).status).toBe(400);
    expect((await request(app()).get("/api/v2/complaints?cursor=garbage").set(auth(c.token))).status).toBe(400);
    const d = await request(app()).get("/api/v2/complaints").set(auth(c.token));
    expect(d.body.items.length).toBeLessThanOrEqual(50);
  });

  it("v2 routes keep the same auth and permissions as v1", async () => {
    const c = await makeUser();
    expect((await request(app()).get("/api/v2/admin/complaints").set(auth(c.token))).status).toBe(403);
    expect((await request(app()).get("/api/v2/complaints")).status).toBe(401);
  });
});
