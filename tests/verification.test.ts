import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { PNG } from "pngjs";
import { storage } from "../server/storage";
import { tenant } from "../server/tenancy";
import { wilson, decide } from "../server/verification/engine";
import { pHash, peripheryHash, hamming, readExif, haversineM } from "../server/verification/image";
import { confirmToken } from "../server/notify/voice";
import { runConfirmationReminders } from "../server/verification/confirm";
import type { VerificationSignal } from "../server/types";
import { app, stopApp, makeUser, auth, deptToken, PNG_1PX } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

/** Deterministic test pictures (64×64): f(x, y) → grey level. */
function png(f: (x: number, y: number) => number): string {
  const img = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const v = Math.max(0, Math.min(255, Math.round(f(x, y))));
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  return PNG.sync.write(img).toString("base64");
}
const stripes = (x: number, y: number) => ((Math.floor(x / 8) + Math.floor(y / 16)) % 2 ? 220 : 30);
const rings = (x: number, y: number) => 128 + 120 * Math.sin(Math.hypot(x - 32, y - 32) / 3);
const buf = (b64: string) => Buffer.from(b64, "base64");

describe("P3.8 Wilson interval", () => {
  it("matches known values", () => {
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(5, 10)).toEqual({ p: 0.5, low: 0.237, high: 0.763, n: 10 });
    expect(wilson(10, 10)!.low).toBeCloseTo(0.722, 3);
    expect(wilson(0, 10)!.high).toBeCloseTo(0.278, 3);
    expect(wilson(81, 100)).toMatchObject({ p: 0.81, low: 0.722, high: 0.875 });
  });
});

describe("P3.7 decision engine", () => {
  const w = { geo: 0.25, reuse: 0.2, scene: 0.15, change: 0.15, citizen: 0.25, neighbour: 0.1 };
  const t = { verifiedThreshold: 0.7, rejectThreshold: 0.35 };
  const sig = (name: VerificationSignal["name"], score: number | null): VerificationSignal => ({ name, score, method: "t", detail: "" });
  it("unknown signals are excluded, never counted as a pass", () => {
    const d = decide([sig("geo", null), sig("reuse", 1), sig("citizen", null)], [], w, t);
    expect(d.score).toBe(1);
    expect(d.coverage).toBeCloseTo(0.2 / 0.7, 3);
    expect(d.decision).toBe("PENDING_CITIZEN");
  });
  it("citizen yes + good score → VERIFIED; flags → NEEDS_REVIEW; citizen no → REJECTED", () => {
    expect(decide([sig("geo", 1), sig("citizen", 1)], [], w, t).decision).toBe("VERIFIED");
    expect(decide([sig("geo", 1), sig("citizen", 1)], ["reused_photo"], w, t).decision).toBe("NEEDS_REVIEW");
    expect(decide([sig("geo", 1), sig("citizen", 0)], [], w, t).decision).toBe("REJECTED");
    expect(decide([sig("geo", 0), sig("reuse", 0), sig("citizen", 1)], [], w, t).decision).toBe("NEEDS_REVIEW");
  });
  it("machine signals alone never verify", () => {
    expect(decide([sig("geo", 1), sig("reuse", 1), sig("scene", 1), sig("change", 1), sig("citizen", null)], [], w, t).decision).toBe("PENDING_CITIZEN");
  });
});

describe("P3.2/P3.3 fingerprints", () => {
  it("pHash: identical → 0, re-encoded/brightened → small, different picture → large; flat/tiny → unknown", () => {
    const a = pHash(buf(png(stripes)))!, b = pHash(buf(png((x, y) => stripes(x, y) * 0.9 + 10)))!, c = pHash(buf(png(rings)))!;
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(a, a)).toBe(0);
    expect(hamming(a, b)).toBeLessThanOrEqual(8);
    expect(hamming(a, c)).toBeGreaterThan(8);
    expect(pHash(buf(PNG_1PX))).toBeNull();
    expect(pHash(buf(png(() => 128)))).toBeNull();
  });
  it("periphery hash ignores a change in the middle", () => {
    const before = peripheryHash(buf(png(stripes)))!;
    const after = peripheryHash(buf(png((x, y) => (x > 16 && x < 48 && y > 16 && y < 48 ? 128 : stripes(x, y)))))!;
    expect(hamming(before, after)).toBeLessThanOrEqual(4);
  });
});

describe("P3.1 geo + EXIF", () => {
  it("haversine", () => {
    expect(haversineM({ lat: 30.3165, lng: 78.0322 }, { lat: 30.3165, lng: 78.0322 })).toBe(0);
    expect(haversineM({ lat: 30, lng: 78 }, { lat: 30.001, lng: 78 })).toBeCloseTo(111.2, 0);
  });
  it("reads GPS and DateTimeOriginal from EXIF", () => {
    // Little-endian TIFF: IFD0 {ExifIFD, GPSIFD} → Exif {DateTimeOriginal}, GPS {N, 30/1 18/1 59/1, E, 78/1 1/1 56/1}
    const t = Buffer.alloc(200);
    t.write("II", 0, "ascii"); t.writeUInt16LE(42, 2); t.writeUInt32LE(8, 4);
    t.writeUInt16LE(2, 8);
    t.writeUInt16LE(0x8769, 10); t.writeUInt16LE(4, 12); t.writeUInt32LE(1, 14); t.writeUInt32LE(38, 18);
    t.writeUInt16LE(0x8825, 22); t.writeUInt16LE(4, 24); t.writeUInt32LE(1, 26); t.writeUInt32LE(56, 30);
    t.writeUInt16LE(1, 38); t.writeUInt16LE(0x9003, 40); t.writeUInt16LE(2, 42); t.writeUInt32LE(20, 44); t.writeUInt32LE(110, 48);
    t.write("2026:11:20 10:15:00\0", 110, "ascii");
    t.writeUInt16LE(4, 56);
    const ent = (o: number, tag: number, type: number, count: number, val: number) => { t.writeUInt16LE(tag, o); t.writeUInt16LE(type, o + 2); t.writeUInt32LE(count, o + 4); t.writeUInt32LE(val, o + 8); };
    ent(58, 1, 2, 2, 0x4e); ent(70, 2, 5, 3, 140); ent(82, 3, 2, 2, 0x45); ent(94, 4, 5, 3, 164);
    [30, 1, 18, 1, 59, 1].forEach((v, k) => t.writeUInt32LE(v, 140 + k * 4));
    [78, 1, 1, 1, 56, 1].forEach((v, k) => t.writeUInt32LE(v, 164 + k * 4));
    const app1 = Buffer.concat([Buffer.from("Exif\0\0", "binary"), t]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), Buffer.from([(app1.length + 2) >> 8, (app1.length + 2) & 0xff]), app1, Buffer.from([0xff, 0xd9])]);
    const e = readExif(jpg);
    expect(e.lat).toBeCloseTo(30.3164, 3);
    expect(e.lng).toBeCloseTo(78.0322, 3);
    expect(e.takenAt).toBe("2026-11-20T10:15:00");
    expect(readExif(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toEqual({});
  });
});

async function caseWithBefore(before = png(stripes)) {
  const citizen = await makeUser("citizen", "Dehradun");
  const c = await request(app()).post("/api/complaints").set(auth(citizen.token))
    .send({ category: "pothole", description: "Large pothole near the bus stand", location: "Rajpur Road", geo: { lat: 30.33, lng: 78.06 }, beforePhoto: before });
  expect(c.status).toBe(201);
  return { citizen, id: c.body.id as string, dept: await deptToken("pwd") };
}
const resolve = (id: string, dept: string, proofPhoto: string, proofGeo?: { lat: number; lng: number }) =>
  request(app()).put(`/api/dept/complaints/${id}`).set(auth(dept)).send({ status: "resolved", proofPhoto, proofGeo });

describe("P3 proof-of-fix through the API", () => {
  it("re-submitting the 'before' photo as proof is flagged and sent to review", async () => {
    const { id, dept } = await caseWithBefore();
    const r = await resolve(id, dept, png(stripes));
    expect(r.body.state).toBe("NEEDS_REVIEW");
    expect(r.body.verification.flags).toContain("proof_is_before_photo");
    const q = await request(app()).get("/api/dept/review-queue").set(auth(dept));
    expect(q.body.map((x: { id: string }) => x.id)).toContain(id);
  });

  it("proof taken far from the site is flagged; nearby proof with a different picture waits for the citizen", async () => {
    const a = await caseWithBefore();
    const far = await resolve(a.id, a.dept, png(rings), { lat: 30.40, lng: 78.06 });
    expect(far.body.verification.flags).toContain("proof_far_from_site");
    const b = await caseWithBefore(png(rings));
    const near = await resolve(b.id, b.dept, png((x, y) => (x > 16 && x < 48 && y > 16 && y < 48 ? 128 : rings(x, y))), { lat: 30.3301, lng: 78.0601 });
    expect(near.body.state).toBe("VERIFYING");
    const geo = near.body.verification.signals.find((s: VerificationSignal) => s.name === "geo");
    expect(geo.score).toBe(1);
    expect(near.body.verification.decision).toBe("PENDING_CITIZEN");
    const ok = await request(app()).put(`/api/complaints/${b.id}/confirm`).set(auth(b.citizen.token)).send({});
    expect(storage.getComplaint(b.id)!.state).toBe("CLOSED");
    expect(ok.status).toBe(200);
  });

  it("voice callback: press 1 closes a clean case; the token is tenant- and complaint-bound", async () => {
    const { id, dept } = await caseWithBefore(png(rings));
    await resolve(id, dept, png(stripes), { lat: 30.33, lng: 78.06 });
    const tok = confirmToken("uttarakhand", id, "voice", storage.getComplaint(id)!.proofSubmittedAt!);
    expect((await request(app()).post(`/api/verification/ivr/${tok.slice(0, -2)}xx`).send({ digit: "1" })).status).toBe(403);
    const r = await request(app()).post(`/api/verification/ivr/${tok}`).send({ digit: "1" });
    expect(r.body).toMatchObject({ accepted: true, state: "CLOSED" });
    expect(storage.getComplaint(id)!.citizenAnswerChannel).toBe("voice");
    // replay is refused (review P3-4)
    expect((await request(app()).post(`/api/verification/ivr/${tok}`).send({ digit: "2" })).body.accepted).toBe(false);
  });

  it("review P3-4: a token from an earlier proof round cannot answer the new one", async () => {
    const { id, dept } = await caseWithBefore(png(rings));
    await resolve(id, dept, png(stripes));
    const old = confirmToken("uttarakhand", id, "voice", "2020-01-01T00:00:00.000Z");
    const r = await request(app()).post(`/api/verification/ivr/${old}`).send({ digit: "1" });
    expect(r.body.accepted).toBe(false);
    expect(storage.getComplaint(id)!.state).toBe("VERIFYING");
  });

  it("review P3-1: a 'yes' while checks run is held; a flagged result then goes to review, not CLOSED", async () => {
    const { citizen, id } = await caseWithBefore(png(rings));
    const c = storage.getComplaint(id)!;
    storage.submitProof(id, { photoUrl: c.beforePhoto! }, "officer", "officer-1");
    expect(c.verificationPending).toBe(true);
    storage.citizenConfirm(id, citizen.user.id);
    expect(c.state).toBe("VERIFYING");
    storage.applyVerification(id, { engineVersion: "t", signals: [], flags: ["reused_photo"], score: null, coverage: 0, decision: "NEEDS_REVIEW", at: new Date().toISOString() });
    expect(c.state).toBe("NEEDS_REVIEW");
  });

  it("review P3-1: a held 'yes' closes once clean checks arrive", async () => {
    const { citizen, id } = await caseWithBefore(png(rings));
    storage.submitProof(id, { photoUrl: storage.getComplaint(id)!.beforePhoto! }, "officer", "officer-1");
    storage.citizenConfirm(id, citizen.user.id);
    storage.applyVerification(id, { engineVersion: "t", signals: [], flags: [], score: null, coverage: 0, decision: "PENDING_CITIZEN", at: new Date().toISOString() });
    expect(storage.getComplaint(id)!.state).toBe("CLOSED");
  });

  it("review P3-3: complaints without GPS get geo 'unknown', not a far-away flag", async () => {
    const citizen = await makeUser("citizen", "Dehradun");
    const c = await request(app()).post("/api/complaints").set(auth(citizen.token))
      .send({ category: "pothole", description: "Large pothole near the bus stand", location: "Rajpur Road", beforePhoto: png(rings) });
    const dept = await deptToken("pwd");
    const r = await resolve(c.body.id, dept, png(stripes), { lat: 30.5, lng: 78.5 });
    expect(r.body.verification.flags).not.toContain("proof_far_from_site");
    expect(r.body.verification.signals.find((s: VerificationSignal) => s.name === "geo").score).toBeNull();
  });

  it("review P3-5: a department cannot clear a reused-photo flag on its own proof", async () => {
    const { id, dept } = await caseWithBefore();
    await resolve(id, dept, png(stripes));
    const r = await request(app()).put(`/api/dept/complaints/${id}/review`).set(auth(dept)).send({ decision: "verify" });
    expect(r.status).toBe(403);
    expect((await request(app()).put(`/api/dept/complaints/${id}/review`).set(auth(dept)).send({ decision: "reopen" })).status).toBe(200);
  });

  it("review P3-2: oversized images are not decoded (header check)", async () => {
    const { fingerprint } = await import("../server/verification/fingerprint");
    const big = Buffer.from(png(stripes), "base64");
    big.writeUInt32BE(20000, 16); big.writeUInt32BE(20000, 20); // claims 400 MP
    const t0 = Date.now();
    expect(await fingerprint(big)).toEqual({});
    expect(Date.now() - t0).toBeLessThan(100);
    expect((await fingerprint(Buffer.from(png(stripes), "base64"))).phash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("reminder job sends SMS then voice; inbound SMS '2' reopens", async () => {
    const { citizen, id, dept } = await caseWithBefore(png(rings));
    await resolve(id, dept, png(stripes));
    const c = storage.getComplaint(id)!;
    const later = new Date(c.proofSubmittedAt!).getTime() + 25 * 3600000;
    expect(await runConfirmationReminders(later)).toEqual({ sms: 1, voice: 1 });
    expect(await runConfirmationReminders(later)).toEqual({ sms: 0, voice: 0 });
    process.env.INBOUND_SMS_SECRET = "test-inbound-secret";
    try {
      expect((await request(app()).post("/api/verification/sms-inbound").send({ from: citizen.user.phone, text: "2" })).status).toBe(403);
      const r = await request(app()).post("/api/verification/sms-inbound").set("X-Webhook-Secret", "test-inbound-secret").send({ from: `+91${citizen.user.phone}`, text: "2 nahi hua" });
      expect(r.body.accepted).toBe(true);
      expect(storage.getComplaint(id)!.state).toBe("REOPENED");
    } finally { delete process.env.INBOUND_SMS_SECRET; }
  });

  it("opted-in neighbours are asked; only they can answer; identities are not exposed", async () => {
    tenant().features.neighbourConfirmation = true;
    try { await neighbourCase(); } finally { tenant().features.neighbourConfirmation = false; }
  });

  it("neighbours are never asked when the tenant has not enabled it", async () => {
    const n = await makeUser("citizen", "Dehradun");
    await request(app()).put("/api/me/neighbour-opt-in").set(auth(n.token)).send({ optIn: true });
    await request(app()).post("/api/complaints").set(auth(n.token)).send({ category: "garbage", description: "Garbage pile near the shop", location: "Rajpur Road", geo: { lat: 30.3305, lng: 78.0605 } });
    const { id, dept } = await caseWithBefore(png(rings));
    const r = await resolve(id, dept, png(stripes));
    expect(r.body.neighbours).toMatchObject({ asked: 0 });
  });

  async function neighbourCase() {
    const n = await makeUser("citizen", "Dehradun");
    await request(app()).put("/api/me/neighbour-opt-in").set(auth(n.token)).send({ optIn: true });
    await request(app()).post("/api/complaints").set(auth(n.token)).send({ category: "garbage", description: "Garbage pile near the shop", location: "Rajpur Road", geo: { lat: 30.3305, lng: 78.0605 } });
    const stranger = await makeUser("citizen", "Dehradun");
    const { id, dept } = await caseWithBefore(png(rings));
    const r = await resolve(id, dept, png(stripes));
    expect(r.body.neighbours).toMatchObject({ asked: 1 });
    expect(JSON.stringify(r.body)).not.toContain(n.user.id);
    expect((await request(app()).post(`/api/complaints/${id}/neighbour-answer`).set(auth(stranger.token)).send({ fixed: true })).status).toBe(403);
    expect((await request(app()).post(`/api/complaints/${id}/neighbour-answer`).set(auth(n.token)).send({ fixed: true })).status).toBe(200);
    expect(storage.getComplaint(id)!.verification!.signals.find(s => s.name === "neighbour")!.score).toBe(1);
  }

  it("Real Resolution Rate: citizen-verified ÷ marked resolved, with Wilson CI and n", async () => {
    const a = await caseWithBefore(png(rings));
    await resolve(a.id, a.dept, png(stripes));
    await request(app()).put(`/api/complaints/${a.id}/confirm`).set(auth(a.citizen.token)).send({});
    const b = await caseWithBefore(png(rings));
    await resolve(b.id, b.dept, png((x, y) => 255 - stripes(x, y)));
    // exact figures for staff (briefing), suppressed figures for the public (review P8-3)
    const { resolutionRates } = await import("../server/verification/rate");
    const exact = resolutionRates("department").find(x => x.key === "pwd")!;
    expect(exact).toMatchObject({ filed: 2, officialResolved: 2, citizenVerified: 1 });
    expect(exact.realResolutionRate).toMatchObject({ p: 0.5, n: 2 });
    const r = await request(app()).get("/api/public/resolution-rate?by=department");
    const pwd = r.body.rows.find((x: { key: string }) => x.key === "pwd");
    expect(pwd).toMatchObject({ filed: "<5", officialResolved: "<5", citizenVerified: "<5", realResolutionRate: null });
    expect(r.body.definition).toContain("Wilson");
  });

  it("tenant weights come from config", () => {
    expect(tenant().verification.weights.citizen).toBeGreaterThan(0);
  });
});
