import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

/** Family live-location link: the person in danger can share it themselves (no SMS needed). */
beforeEach(() => storage.reset());
afterAll(() => stopApp());

describe("SOS share link", () => {
  it("gives the owner a signed link whose page shows a live map that follows them", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const sos = (await request(app()).post("/api/sos/women-safety").set(auth(c.token)).send({ geo: { lat: 30.31, lng: 78.03 } })).body.alert;
    const r = await request(app()).get(`/api/sos/${sos.id}/share-link`).set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body.path).toMatch(/^\/s\/[\w-]+\.[\w-]+$/);
    expect(r.headers["cache-control"]).toBe("no-store");

    const page = await request(app()).get(r.body.path);
    expect(page.status).toBe(200);
    expect(page.text).toContain('id="map"');
    expect(page.text).toContain("/leaflet/leaflet.js");
    expect(page.text).not.toMatch(/30\.31|78\.03/); // the position is fetched live, never baked into the page

    await request(app()).put(`/api/sos/${sos.id}/location`).set(auth(c.token)).send({ lat: 30.335, lng: 78.061 });
    const live = await request(app()).get(`/api/sos/shared/${r.body.path.slice(3)}`);
    expect(live.body).toMatchObject({ lat: 30.335, lng: 78.061 });
    expect(JSON.stringify(live.body)).not.toContain(c.user.phone); // no personal data on the public page
  });

  it("only the person who raised the SOS can get the link, and not after it is closed", async () => {
    const a = await makeUser("citizen", "Dehradun");
    const b = await makeUser("citizen", "Dehradun");
    const sos = (await request(app()).post("/api/sos/women-safety").set(auth(a.token)).send({ geo: { lat: 30.31, lng: 78.03 } })).body.alert;
    expect((await request(app()).get(`/api/sos/${sos.id}/share-link`).set(auth(b.token))).status).toBe(403);
    await request(app()).put(`/api/sos/${sos.id}/cancel`).set(auth(a.token)).send({ pin: a.pin, reason: "safe" });
    expect((await request(app()).get(`/api/sos/${sos.id}/share-link`).set(auth(a.token))).status).toBe(422);
  });
});
