import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { runYatraHousekeeping } from "../server/routes/yatra";
import { app, stopApp, makeUser, auth } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("P6.5 disaster mode", () => {
  it("reports need disaster mode; only verified reports are public; authority scope is its district", async () => {
    const citizen = await makeUser("citizen", "Chamoli");
    const report = { kind: "landslide", geo: { lat: 30.4, lng: 79.3 }, description: "Road blocked by debris near the bridge, call 9876543210" };
    expect((await request(app()).post("/api/disaster/reports").set(auth(citizen.token)).send(report)).status).toBe(409);
    const auth1 = await makeUser("disaster_authority", "Chamoli");
    const otherDistrict = await makeUser("disaster_authority", "Almora");
    expect((await request(app()).put("/api/disaster/mode").set(auth(citizen.token)).send({ active: true })).status).toBe(403);
    expect((await request(app()).put("/api/disaster/mode").set(auth(auth1.token)).send({ active: true, districts: ["Chamoli"] })).body.active).toBe(true);
    const r = await request(app()).post("/api/disaster/reports").set(auth(citizen.token)).send(report);
    expect(r.status).toBe(201);
    expect((await request(app()).get("/api/disaster/reports")).body).toHaveLength(0);
    expect((await request(app()).put(`/api/disaster/reports/${r.body.id}`).set(auth(otherDistrict.token)).send({ status: "verified" })).status).toBe(403);
    expect((await request(app()).put(`/api/disaster/reports/${r.body.id}`).set(auth(auth1.token)).send({ status: "verified" })).status).toBe(200);
    const pub = await request(app()).get("/api/disaster/reports");
    expect(pub.body).toHaveLength(1);
    expect(JSON.stringify(pub.body)).not.toContain(citizen.user.id);
    expect(pub.body[0].description).not.toContain("9876543210");
  });

  it("relief camps and missing persons are public without reporter identity; found people leave the list", async () => {
    const a = await makeUser("disaster_authority", "Chamoli");
    await request(app()).put("/api/disaster/mode").set(auth(a.token)).send({ active: true });
    const camp = await request(app()).post("/api/disaster/camps").set(auth(a.token)).send({ name: "GIC Gopeshwar", district: "Chamoli", geo: { lat: 30.4, lng: 79.32 }, capacity: 300, occupancy: 120, facilities: ["food", "medical"] });
    expect(camp.status).toBe(201);
    expect((await request(app()).get("/api/disaster/camps")).body).toHaveLength(1);
    const c = await makeUser("citizen", "Chamoli");
    const m = await request(app()).post("/api/disaster/missing").set(auth(c.token)).send({ name: "Ram Singh", age: 67, description: "Grey jacket", lastSeenArea: "Near the temple gate", district: "Chamoli" });
    expect(m.status).toBe(201);
    await request(app()).put(`/api/disaster/missing/${m.body.id}/review`).set(auth(a.token)).send({ decision: "publish" });
    const list = await request(app()).get("/api/disaster/missing");
    expect(list.body[0].name).toBe("Ram Singh");
    expect(JSON.stringify(list.body)).not.toContain(c.user.id);
    const stranger = await makeUser("citizen", "Chamoli");
    expect((await request(app()).put(`/api/disaster/missing/${m.body.id}`).set(auth(stranger.token)).send({ status: "found" })).status).toBe(403);
    expect((await request(app()).put(`/api/disaster/missing/${m.body.id}`).set(auth(c.token)).send({ status: "found" })).status).toBe(200);
    expect((await request(app()).get("/api/disaster/missing")).body).toHaveLength(0);
    const page = await request(app()).get("/web/disaster?district=Chamoli");
    expect(page.text).toContain("GIC Gopeshwar");
    expect(page.text).not.toContain("<script");
    expect(Buffer.byteLength(page.text)).toBeLessThan(30_000);
  });
});

describe("P6.6 yatra mode", () => {
  it("group join by code; members see each other; lost alert; leaving and expiry delete locations", async () => {
    const lead = await makeUser(), mem = await makeUser(), outsider = await makeUser();
    const g = await request(app()).post("/api/yatra/groups").set(auth(lead.token)).send({ name: "Kedarnath family", hours: 48, displayName: "Papa" });
    expect(g.status).toBe(201);
    const j = await request(app()).post("/api/yatra/join").set(auth(mem.token)).send({ code: g.body.code.toLowerCase(), displayName: "Rinku" });
    expect(j.body.members).toHaveLength(2);
    await request(app()).put(`/api/yatra/groups/${g.body.id}/location`).set(auth(mem.token)).send({ geo: { lat: 30.73, lng: 79.07 } });
    expect((await request(app()).get(`/api/yatra/groups/${g.body.id}`).set(auth(outsider.token))).status).toBe(403);
    const view = await request(app()).get(`/api/yatra/groups/${g.body.id}`).set(auth(lead.token));
    expect(view.body.members.find((x: { displayName: string }) => x.displayName === "Rinku").geo).toEqual({ lat: 30.73, lng: 79.07 });
    expect(JSON.stringify(view.body)).not.toContain(mem.user.phone);
    const lost = await request(app()).post(`/api/yatra/groups/${g.body.id}/lost`).set(auth(mem.token)).send({ lost: true });
    expect(lost.body.members.find((x: { displayName: string }) => x.displayName === "Rinku").lost).toBe(true);
    expect(runYatraHousekeeping(Date.now() + 3 * 86400_000).expired).toBe(1);
    expect(storage.s.yatraGroups).toHaveLength(0);
  });

  it("flags a member silent for an hour; nearest medical point and helplines are public", async () => {
    const lead = await makeUser();
    const g = await request(app()).post("/api/yatra/groups").set(auth(lead.token)).send({ name: "Group", hours: 24, displayName: "Lead" });
    await request(app()).put(`/api/yatra/groups/${g.body.id}/location`).set(auth(lead.token)).send({ geo: { lat: 30.3, lng: 78 } });
    expect(runYatraHousekeeping(Date.now() + 61 * 60_000).flagged).toBe(1);
    const med = await request(app()).get("/api/yatra/nearest-medical?lat=30.32&lng=78.03");
    expect(med.status).toBe(200);
    expect(Array.isArray(med.body)).toBe(true);
    expect((await request(app()).get("/api/yatra/helplines")).body.emergency[0].phone).toBe("112");
  });
});

describe("Phase 6 review regressions (disaster / yatra)", () => {
  it("P6-3: a district authority changes only its own district", async () => {
    const state = await makeUser("state_admin", "Uttarakhand");
    const chamoli = await makeUser("disaster_authority", "Chamoli");
    const almora = await makeUser("disaster_authority", "Almora");
    await request(app()).put("/api/disaster/mode").set(auth(state.token)).send({ active: true, districts: ["Chamoli"] });
    expect((await request(app()).put("/api/disaster/mode").set(auth(almora.token)).send({ active: true, districts: ["Chamoli", "Almora"] })).status).toBe(403);
    expect((await request(app()).put("/api/disaster/mode").set(auth(almora.token)).send({ active: true })).body.districts.sort()).toEqual(["Almora", "Chamoli"]);
    expect((await request(app()).put("/api/disaster/mode").set(auth(almora.token)).send({ active: false })).body.districts).toEqual(["Chamoli"]);
    await request(app()).put("/api/disaster/mode").set(auth(state.token)).send({ active: true });
    expect((await request(app()).put("/api/disaster/mode").set(auth(chamoli.token)).send({ active: false })).status).toBe(403);
  });

  it("P6-4: a USDMA department session can manage camps and read the queue", async () => {
    const { deptToken } = await import("./helpers");
    const tok = await deptToken("usdma");
    expect((await request(app()).get("/api/disaster/reports/queue").set(auth(tok))).status).toBe(200);
    expect((await request(app()).post("/api/disaster/camps").set(auth(tok)).send({ name: "Camp", district: "Chamoli", geo: { lat: 30.4, lng: 79.3 }, capacity: 10, occupancy: 0, facilities: [] })).status).toBe(201);
    expect((await request(app()).get("/api/disaster/reports/queue")).status).toBe(401);
  });

  it("P6-8: citizen missing-person reports wait for review, and names are masked", async () => {
    const a = await makeUser("disaster_authority", "Chamoli");
    await request(app()).put("/api/disaster/mode").set(auth(a.token)).send({ active: true });
    const c = await makeUser("citizen", "Chamoli");
    const m = await request(app()).post("/api/disaster/missing").set(auth(c.token)).send({ name: "Ram 9876543210", description: "Grey jacket", lastSeenArea: "Gate", district: "Chamoli" });
    expect(m.body.status).toBe("pending_review");
    expect((await request(app()).get("/api/disaster/missing")).body).toHaveLength(0);
    await request(app()).put(`/api/disaster/missing/${m.body.id}/review`).set(auth(a.token)).send({ decision: "publish" });
    const list = (await request(app()).get("/api/disaster/missing")).body;
    expect(list).toHaveLength(1);
    expect(list[0].name).not.toContain("9876543210");
  });

  it("P6-9: a silence flag clears on the next location; pushes never carry the join code", async () => {
    const lead = await makeUser();
    const g = await request(app()).post("/api/yatra/groups").set(auth(lead.token)).send({ name: "G", hours: 24, displayName: "Lead" });
    await request(app()).put(`/api/yatra/groups/${g.body.id}/location`).set(auth(lead.token)).send({ geo: { lat: 30.3, lng: 78 } });
    runYatraHousekeeping(Date.now() + 61 * 60_000);
    await request(app()).put(`/api/yatra/groups/${g.body.id}/location`).set(auth(lead.token)).send({ geo: { lat: 30.31, lng: 78 } });
    expect(storage.s.yatraGroups[0].members[0].lost).toBe(false);
    const src = (await import("node:fs")).readFileSync("server/routes/yatra.ts", "utf8");
    expect(src).not.toMatch(/ref: g\.code/);
  });
});
