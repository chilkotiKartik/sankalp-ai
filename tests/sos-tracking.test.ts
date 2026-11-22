import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage, cprEmitter } from "../server/storage";
import { app, stopApp, makeUser, auth, deptToken } from "./helpers";

/** Live tracking: when a person in an SOS moves, every police map follows them. */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("SOS live tracking", () => {
  it("moves the police command-centre incident and announces it to the maps", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const r = await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.31, lng: 78.03 } });
    expect(r.status).toBe(201);
    const alert = r.body.alert;
    expect(alert.cprRequestId).toBeTruthy();

    const events: Array<{ type: string; incident?: { id: string; geo: { lat: number; lng: number } } }> = [];
    const on = (e: (typeof events)[number]) => events.push(e);
    cprEmitter.on("event", on);
    const u = await request(app()).put(`/api/sos/${alert.id}/location`).set(auth(c.token)).send({ lat: 30.335, lng: 78.061 });
    cprEmitter.off("event", on);
    expect(u.status).toBe(200);

    // The police SOS list and the CPR incident both carry the new position.
    const police = await deptToken("police");
    const list = await request(app()).get("/api/sos").set(auth(police));
    const a = (list.body.items ?? list.body).find((x: { id: string }) => x.id === alert.id);
    expect(a.liveGeo).toEqual({ lat: 30.335, lng: 78.061 });
    const inc = storage.s.safetyIncidents.find(i => i.id === alert.cprRequestId)!;
    expect(inc.geo).toEqual({ lat: 30.335, lng: 78.061 });
    if (inc.location.startsWith("GPS:")) expect(inc.location).toContain("30.3350, 78.0610");
    // Maps get both the raw location event and the incident update that moves the marker.
    expect(events.map(e => e.type)).toEqual(expect.arrayContaining(["sos_location_update", "incident_updated"]));
    expect(events.find(e => e.type === "incident_updated")!.incident!.geo).toEqual({ lat: 30.335, lng: 78.061 });
  });

  it("only the person who raised the SOS can move it", async () => {
    const a = await makeUser("citizen", "Dehradun");
    const b = await makeUser("citizen", "Dehradun");
    const r = await request(app()).post("/api/sos/women-safety").set(auth(a.token)).send({ geo: { lat: 30.31, lng: 78.03 } });
    const u = await request(app()).put(`/api/sos/${r.body.alert.id}/location`).set(auth(b.token)).send({ lat: 1, lng: 1 });
    expect(u.status).toBe(403);
  });
});
