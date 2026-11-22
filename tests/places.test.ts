import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { loadTenants, tenant, stateRegistry } from "../server/tenancy";
import { storage } from "../server/storage";
import { app, stopApp, makeUser, auth } from "./helpers";

/** P9.14: police stations, hospitals and fire stations for every state (config/places, from OpenStreetMap). */
const ROOT = path.resolve(__dirname, "..");
afterAll(() => { loadTenants(); stopApp(); });

describe("places loader", () => {
  let dir = "";
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "places-"));
    fs.cpSync(path.join(ROOT, "config", "tenants"), path.join(dir, "tenants"), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "config", "states.json"), path.join(dir, "states.json"));
    fs.mkdirSync(path.join(dir, "places"));
    const ps = (id: string, district: string, lat: number, lng: number) => ({ id, name: `PS ${id}`, address: district, phone: "112", geo: { lat, lng }, ward: `${district} (district)`, district });
    const kDistrict = stateRegistry().find(r => r.id === "kerala")?.districts?.[0]?.name ?? "Thiruvananthapuram";
    fs.writeFileSync(path.join(dir, "places", "kerala.json"), JSON.stringify({
      policeStations: [ps("osm-n1", kDistrict, 8.5, 76.95), ps("osm-n2", "Not a Kerala district", 8.6, 76.9)],
      emergencyServices: [{ id: "osm-n3", type: "hospital", name: "H", district: kDistrict, address: kDistrict, phone: "108", geo: { lat: 8.51, lng: 76.96 } }],
    }));
    // Uttarakhand: one duplicate of its own Kotwali entry (a few metres away) and one new station.
    fs.writeFileSync(path.join(dir, "places", "uttarakhand.json"), JSON.stringify({
      policeStations: [ps("osm-dup", "Dehradun", 30.3166, 78.0323), ps("osm-new", "Dehradun", 30.4, 78.1)],
      emergencyServices: [],
    }));
    loadTenants(path.join(dir, "tenants"));
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("gives a state-level state its stations and drops points outside its districts", () => {
    const k = tenant("kerala");
    expect(k.policeStations.map(p => p.id)).toEqual(["osm-n1"]);
    expect(k.emergencyServices.map(s => s.id)).toEqual(["osm-n3"]);
  });

  it("keeps a full-config state's own entries and adds only new, non-duplicate ones", () => {
    const u = tenant("uttarakhand").policeStations.map(p => p.id);
    expect(u).toContain("ps1");
    expect(u).toContain("osm-new");
    expect(u).not.toContain("osm-dup");
  });
});

describe("built places data", () => {
  const placesDir = path.join(ROOT, "config", "places");
  it.runIf(fs.existsSync(placesDir) && fs.readdirSync(placesDir).some(f => f.endsWith(".json")))("has police stations for every state and UT, each inside the state's map", () => {
    loadTenants();
    for (const r of stateRegistry()) {
      const t = tenant(r.id);
      expect(t.policeStations.length, r.id).toBeGreaterThan(0);
      const names = new Set(t.districts.map(d => d.district));
      for (const p of t.policeStations) {
        expect(names.has(p.district), `${r.id}: ${p.district}`).toBe(true);
        expect(p.phone).toBeTruthy();
      }
    }
  });
});

describe("station endpoints are bounded", () => {
  beforeAll(() => { loadTenants(); storage.reset(); });

  it("police stations: own district by default, nearest-first with lat/lng, capped by limit", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const own = await request(app()).get("/api/police-stations").set(auth(c.token));
    expect(own.status).toBe(200);
    expect(own.body.length).toBeGreaterThan(0);
    for (const p of own.body) expect(p.district).toBe("Dehradun");

    const near = await request(app()).get("/api/police-stations?lat=30.3165&lng=78.0322&limit=3").set(auth(c.token));
    expect(near.body).toHaveLength(3);
    expect(near.body[0].distance).toBeLessThanOrEqual(near.body[1].distance);
    expect(near.body[1].distance).toBeLessThanOrEqual(near.body[2].distance);

    expect((await request(app()).get("/api/police-stations?limit=9999").set(auth(c.token))).status).toBe(400);
  });

  it("emergency services: nearest-first and capped", async () => {
    const c = await makeUser("citizen", "Dehradun");
    const r = await request(app()).get("/api/emergency-services?type=hospital&lat=30.32&lng=78.04&limit=2").set(auth(c.token));
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(2);
    expect(r.body.every((s: { type: string }) => s.type === "hospital")).toBe(true);
  });

  it("public command-centre locations filter by bounding box", async () => {
    const all = await request(app()).get("/api/cpr/emergency-locations");
    const box = await request(app()).get("/api/cpr/emergency-locations?bbox=30.2,77.9,30.5,78.2");
    expect(box.status).toBe(200);
    expect(box.body.length).toBeLessThanOrEqual(all.body.length);
    for (const s of box.body) { expect(s.lat).toBeGreaterThanOrEqual(30.2); expect(s.lng).toBeLessThanOrEqual(78.2); }
    expect((await request(app()).get("/api/cpr/emergency-locations?bbox=not-a-box")).status).toBe(400);
  });

  it("public config carries counts, not thousands of stations", async () => {
    const r = await request(app()).get("/api/public/config").set("X-Tenant", "uttarakhand");
    expect(r.status).toBe(200);
    expect(r.body.tenant.policeStations).toBeUndefined();
    expect(r.body.tenant.counts.policeStations).toBeGreaterThan(0);
  });
});
