import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import * as fs from "node:fs";
import { storage } from "../server/storage";
import { stripJpeg, stripPng, sniff, publicPathExists, originalPath, readStored, sealEvidence, openEvidence } from "../server/lib/media";
import { app, stopApp, makeUser, auth, M4A_HEADER, PNG_1PX } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => stopApp());

/** Minimal JPEG with an EXIF APP1 segment containing a fake GPS marker string. */
function jpegWithExif(): Buffer {
  const app1Payload = Buffer.concat([Buffer.from("Exif\0\0"), Buffer.from("GPSLatitude=30.3165;Device=SecretPhone")]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([0, app1Payload.length + 2]), app1Payload]);
  const app0 = Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sos = Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, sos]);
}

describe("P1.6 metadata stripping", () => {
  it("removes EXIF from JPEG but keeps image data", () => {
    const src = jpegWithExif();
    const out = stripJpeg(src);
    expect(src.includes(Buffer.from("GPSLatitude"))).toBe(true);
    expect(out.includes(Buffer.from("GPSLatitude"))).toBe(false);
    expect(out.includes(Buffer.from("JFIF"))).toBe(true);
    expect(out.subarray(-2).toString("hex")).toBe("ffd9");
    expect(sniff(out)?.ext).toBe("jpg");
  });

  it("removes text chunks from PNG", () => {
    const png = Buffer.from(PNG_1PX, "base64");
    const text = Buffer.concat([Buffer.from([0, 0, 0, 12]), Buffer.from("tEXt"), Buffer.from("Author\0Asha!"), Buffer.alloc(4)]);
    const withText = Buffer.concat([png.subarray(0, 33), text, png.subarray(33)]);
    expect(stripPng(withText).includes(Buffer.from("Author"))).toBe(false);
    expect(stripPng(withText).length).toBe(png.length);
  });

  it("upload: public copy has no EXIF, private original keeps it", async () => {
    const { token } = await makeUser();
    const r = await request(app()).post("/api/upload").set(auth(token)).send({ image: jpegWithExif().toString("base64") });
    expect(r.status).toBe(200);
    const file = r.body.filename as string;
    expect(publicPathExists(file)).toBe(true);
    const pub = await request(app()).get(r.body.url);
    expect(Buffer.from(pub.body).includes(Buffer.from("GPSLatitude"))).toBe(false);
    // P6.2: the original is encrypted at rest (AES-256-GCM); decrypted it still has the EXIF for verification.
    expect(fs.readFileSync(originalPath(file)!).includes(Buffer.from("GPSLatitude"))).toBe(false);
    expect(fs.readFileSync(originalPath(file)!).subarray(0, 4).toString()).toBe("SKV1");
    expect(readStored("originals", file)!.includes(Buffer.from("GPSLatitude"))).toBe(true);
  });
});

describe("P1.6 signed URLs for private media", () => {
  it("owner gets a 5-minute signed link that works without a header; tampering and other users fail", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const up = await request(app()).post("/api/upload/audio").set(auth(owner.token)).send({ audio: M4A_HEADER });
    const file = up.body.filename as string;
    expect((await request(app()).post(`/api/media/${file}/sign`).set(auth(other.token))).status).toBe(403);
    const signed = await request(app()).post(`/api/media/${file}/sign`).set(auth(owner.token));
    expect(signed.status).toBe(200);
    expect(signed.body.expiresInSeconds).toBe(300);
    expect((await request(app()).get(signed.body.url)).status).toBe(200);
    expect((await request(app()).get(signed.body.url.replace(/sig=[^&]+/, "sig=forged"))).status).toBe(403);
    expect((await request(app()).get(signed.body.url.replace(/exp=\d+/, "exp=1"))).status).toBe(403);
    expect(storage.getAuditLogs().some(l => l.action === "signed_url_used")).toBe(true);
  });

  it("original photos (with EXIF) are signable by staff only", async () => {
    const citizen = await makeUser();
    const up = await request(app()).post("/api/upload").set(auth(citizen.token)).send({ image: jpegWithExif().toString("base64") });
    expect((await request(app()).post(`/api/media/${up.body.filename}/sign?variant=original`).set(auth(citizen.token))).status).toBe(403);
    // Not linked to any case: a district admin cannot open it (review P1-M2); state staff can.
    const admin = await makeUser("admin");
    expect((await request(app()).post(`/api/media/${up.body.filename}/sign?variant=original`).set(auth(admin.token))).status).toBe(403);
    const state = await makeUser("state_admin");
    const s = await request(app()).post(`/api/media/${up.body.filename}/sign?variant=original`).set(auth(state.token));
    expect(s.status).toBe(200);
    const got = await request(app()).get(s.body.url);
    expect(Buffer.from(got.body).includes(Buffer.from("GPSLatitude"))).toBe(true);
    // The variant is signed: a private link cannot be upgraded to the original, nor the reverse.
    expect((await request(app()).get(s.body.url.replace("&v=original", ""))).status).toBe(403);
  });

  it("district admin can open originals for a complaint in their own district only", async () => {
    const citizen = await makeUser("citizen", "Dehradun");
    const up = await request(app()).post("/api/upload").set(auth(citizen.token)).send({ image: jpegWithExif().toString("base64") });
    const c = await request(app()).post("/api/complaints").set(auth(citizen.token))
      .send({ category: "pothole", description: "Large pothole near the bus stand", location: "Rajpur Road", geo: { lat: 30.33, lng: 78.06 }, images: [up.body.url] });
    expect(c.status).toBe(201);
    const rec = storage.getMediaByFile(up.body.filename)!;
    if (!rec.complaintId) storage.linkMedia(rec.id, { complaintId: c.body.id });
    const local = await makeUser("admin", "Dehradun");
    const other = await makeUser("admin", "Haridwar");
    expect((await request(app()).post(`/api/media/${up.body.filename}/sign?variant=original`).set(auth(local.token))).status).toBe(200);
    expect((await request(app()).post(`/api/media/${up.body.filename}/sign?variant=original`).set(auth(other.token))).status).toBe(403);
  });

  it("JPEG stripping removes metadata after fill bytes and between progressive scans, and fails closed on garbage", () => {
    const exif = (txt: string) => { const p = Buffer.from(`Exif\0\0${txt}`); return Buffer.concat([Buffer.from([0xff, 0xe1, 0, p.length + 2]), p]); };
    const sos = Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0xff, 0x00, 0x34]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xff]), exif("GPS-A"), sos, exif("GPS-B"), sos, Buffer.from([0xff, 0xd9])]);
    const out = stripJpeg(jpg);
    expect(out.includes(Buffer.from("GPS-A"))).toBe(false);
    expect(out.includes(Buffer.from("GPS-B"))).toBe(false);
    expect(out.subarray(-2).toString("hex")).toBe("ffd9");
    expect(() => stripJpeg(Buffer.from([0xff, 0xd8, 0x12, 0x34, 0x56]))).toThrow();
    expect(() => stripJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 0x00]))).toThrow();
  });

  it("P6.2 vault: AES-256-GCM round trip, tamper detection, legacy plaintext still readable", () => {
    const plain = Buffer.from("SOS audio bytes");
    const sealed = sealEvidence(plain);
    expect(sealed.includes(plain)).toBe(false);
    expect(openEvidence(sealed).equals(plain)).toBe(true);
    const bad = Buffer.from(sealed); bad[bad.length - 1] ^= 1;
    expect(() => openEvidence(bad)).toThrow();
    expect(openEvidence(plain).equals(plain)).toBe(true);
  });
});
