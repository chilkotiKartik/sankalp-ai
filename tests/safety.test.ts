import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import request from "supertest";
import { storage } from "../server/storage";
import { config } from "../server/config";
import { runSosDeliveries, BACKOFF_MS } from "../server/safety/sos";
import { app, stopApp, makeUser, auth, nextPhone, M4A_HEADER } from "./helpers";

beforeEach(() => storage.reset());
afterAll(() => { delete process.env.SMS_DLR_SECRET; stopApp(); });

const smsLog = () => { const p = path.join(path.resolve(config().DATA_DIR), "sms-outbox.log"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };

async function withContacts() {
  const u = await makeUser("citizen", "Dehradun");
  const c1 = nextPhone(), c2 = nextPhone();
  const r = await request(app()).put("/api/me/trusted-contacts").set(auth(u.token)).send({ contacts: [{ label: "Mother", phone: c1 }, { label: "Friend", phone: c2 }] });
  expect(r.status).toBe(200);
  return { u, c1, c2 };
}

describe("P6.1 SOS to trusted contacts", () => {
  it("validates contacts (max 5, not own number, no duplicates)", async () => {
    const u = await makeUser();
    expect((await request(app()).put("/api/me/trusted-contacts").set(auth(u.token)).send({ contacts: [{ label: "Me", phone: u.user.phone }] })).status).toBe(422);
    const p = nextPhone();
    expect((await request(app()).put("/api/me/trusted-contacts").set(auth(u.token)).send({ contacts: [{ label: "A", phone: p }, { label: "B", phone: p }] })).status).toBe(422);
    expect((await request(app()).put("/api/me/trusted-contacts").set(auth(u.token)).send({ contacts: Array.from({ length: 6 }, (_, i) => ({ label: `C${i}`, phone: nextPhone() })) })).status).toBe(400);
  });

  it("SMS to every contact with a signed link (no location or name in the text); the link shows live location only", async () => {
    const { u, c1, c2 } = await withContacts();
    const r = await request(app()).post("/api/sos/women-safety").set(auth(u.token)).send({ geo: { lat: 30.3165, lng: 78.0322 } });
    expect(r.status).toBe(201);
    await runSosDeliveries();
    const a = storage.getSOSAlert(r.body.alert.id)!;
    expect(a.contactDeliveries!.map(d => d.status)).toEqual(["sent", "sent"]);
    expect(JSON.stringify(a.contactDeliveries)).not.toContain(c1);
    const log = smsLog();
    const line = log.split("\n").find(l => l.includes(c1) && l.includes("trusted contact"))!;
    expect(line).toBeTruthy();
    expect(log).toContain(c2);
    expect(line).not.toContain("30.31");
    expect(line).not.toContain(u.user.name);
    const token = line.match(/\/s\/([\w.-]+)/)![1];
    const page = await request(app()).get(`/s/${token}`);
    expect(page.text).toContain("tel:112");
    const live = await request(app()).get(`/api/sos/shared/${token}`);
    expect(live.body).toMatchObject({ status: "active", lat: 30.3165, lng: 78.0322 });
    expect(JSON.stringify(live.body)).not.toContain(u.user.phone);
    expect((await request(app()).get(`/api/sos/shared/${token.slice(0, -3)}abc`)).status).toBe(410);
  });

  it("retries a failed delivery with backoff and marks it failed after the last attempt; receipts mark delivered", async () => {
    const { u } = await withContacts();
    process.env.SMS_DRIVER = "dlt-http"; // not configured → every send fails
    try {
      const r = await request(app()).post("/api/sos").set(auth(u.token)).send({ category: "medical", geo: { lat: 30.3, lng: 78 } });
      const a = storage.getSOSAlert(r.body.id)!;
      let t = Date.now();
      for (let i = 0; i < BACKOFF_MS.length; i++) { await runSosDeliveries(t); t += 11 * 60_000; }
      expect(a.contactDeliveries!.every(d => d.status === "failed" && d.attempts === BACKOFF_MS.length)).toBe(true);
    } finally { delete process.env.SMS_DRIVER; }
    const r2 = await request(app()).post("/api/sos/forest-fire").set(auth(u.token)).send({ geo: { lat: 30.3, lng: 78 } });
    const id2 = (r2.body.alert ?? r2.body).id;
    const a2 = storage.getSOSAlert(id2)!;
    a2.contactDeliveries![0].messageId = "msg-123";
    process.env.SMS_DLR_SECRET = "dlr-secret";
    const dlr = await request(app()).post("/api/sos/delivery-receipt").set("X-Webhook-Secret", "dlr-secret").send({ messageId: "msg-123", status: "delivered" });
    expect(dlr.body.matched).toBe(true);
    expect(a2.contactDeliveries![0].status).toBe("delivered");
  });

  it("cancel needs the sender's PIN; wrong PINs lock after 5; contacts are told it was cancelled", async () => {
    const { u, c1 } = await withContacts();
    const r = await request(app()).post("/api/sos").set(auth(u.token)).send({ category: "medical", geo: { lat: 30.3, lng: 78 } });
    await runSosDeliveries();
    expect((await request(app()).put(`/api/sos/${r.body.id}/cancel`).set(auth(u.token)).send({ pin: "000000" })).status).toBe(401);
    const ok = await request(app()).put(`/api/sos/${r.body.id}/cancel`).set(auth(u.token)).send({ pin: u.pin });
    expect(ok.body.status).toBe("cancelled");
    expect(storage.getSOSAlert(r.body.id)!.status).toBe("cancelled");
    expect(smsLog().split("\n").some(l => l.includes(c1) && l.includes("cancelled"))).toBe(true);
    const other = await makeUser();
    const r2 = await request(app()).post("/api/sos").set(auth(u.token)).send({ category: "medical", geo: { lat: 30.3, lng: 78 } });
    expect((await request(app()).put(`/api/sos/${r2.body.id}/cancel`).set(auth(other.token)).send({ pin: other.pin })).status).toBe(403);
    for (let i = 0; i < 5; i++) await request(app()).put(`/api/sos/${r2.body.id}/cancel`).set(auth(u.token)).send({ pin: "000000" });
    expect((await request(app()).put(`/api/sos/${r2.body.id}/cancel`).set(auth(u.token)).send({ pin: u.pin })).status).toBe(423);
  });
});

describe("P6.2 evidence vault", () => {
  it("SOS audio is encrypted at rest and every view is audited", async () => {
    const u = await makeUser("citizen", "Dehradun");
    const sos = await request(app()).post("/api/sos").set(auth(u.token)).send({ category: "medical", geo: { lat: 30.3, lng: 78 } });
    const up = await request(app()).post("/api/upload/audio").set(auth(u.token)).send({ audio: M4A_HEADER, sosId: sos.body.id });
    expect(up.status).toBe(200);
    const file = up.body.filename ?? up.body.url.split("/").pop();
    const raw = fs.readFileSync(path.join(path.resolve(config().DATA_DIR), "private", file));
    expect(raw.subarray(0, 4).toString()).toBe("SKV1");
    expect(raw.includes(Buffer.from("ftypM4A"))).toBe(false);
    const got = await request(app()).get(`/api/media/audio/${file}`).set(auth(u.token)).buffer(true).parse((res, cb) => { const ch: Buffer[] = []; res.on("data", (c: Buffer) => ch.push(c)); res.on("end", () => cb(null, Buffer.concat(ch))); });
    expect(got.status).toBe(200);
    expect((got.body as Buffer).includes(Buffer.from("ftypM4A"))).toBe(true);
    expect(storage.getAuditLogs().some(l => l.action === "evidence_viewed")).toBe(true);
  });
});
