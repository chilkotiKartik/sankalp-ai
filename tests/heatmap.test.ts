import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth, deptToken } from "./helpers";

/** Police SOS heat map: aggregated ~1 km cells, counts only, police only. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("police SOS heat map", () => {
  it("aggregates SOS alerts into cells without names, phones or exact points", async () => {
    const a = await makeUser("citizen", "Dehradun");
    const b = await makeUser("citizen", "Dehradun");
    await request(app()).post("/api/sos/women-safety").set(auth(a.token)).send({ geo: { lat: 30.3161, lng: 78.0321 } });
    await request(app()).post("/api/sos/women-safety").set(auth(b.token)).send({ geo: { lat: 30.3169, lng: 78.0329 } });
    const police = await deptToken("police");
    const r = await request(app()).get("/api/cpr/heatmap?days=30").set(auth(police));
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.max).toBe(2);
    expect(r.body.cells[0]).toMatchObject({ count: 2, women: 2, lat: 30.315, lng: 78.035 });
    const raw = JSON.stringify(r.body);
    for (const leak of [a.user.name, a.user.phone, "30.3161", "78.0329"]) expect(raw).not.toContain(leak);
  });

  it("is police-only", async () => {
    const c = await makeUser("citizen", "Dehradun");
    expect((await request(app()).get("/api/cpr/heatmap").set(auth(c.token))).status).toBe(403);
    expect((await request(app()).get("/api/cpr/heatmap")).status).toBe(401);
  });
});
