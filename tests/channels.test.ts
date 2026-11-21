import { describe, it, expect, beforeEach, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import request from "supertest";
import { storage } from "../server/storage";
import { config } from "../server/config";
import { app, stopApp, nextPhone, M4A_HEADER } from "./helpers";

beforeEach(() => {
  storage.reset();
  process.env.INBOUND_SMS_SECRET = "sms-secret-for-tests";
  process.env.WHATSAPP_WEBHOOK_SECRET = "wa-secret-for-tests";
  process.env.IVR_WEBHOOK_SECRET = "ivr-secret-for-tests";
});
afterAll(() => { delete process.env.INBOUND_SMS_SECRET; delete process.env.WHATSAPP_WEBHOOK_SECRET; delete process.env.IVR_WEBHOOK_SECRET; stopApp(); });

const sms = (from: string, text: string) => request(app()).post("/api/verification/sms-inbound").set("X-Webhook-Secret", "sms-secret-for-tests").send({ from, text });
const outbox = (f: string) => { const p = path.join(path.resolve(config().DATA_DIR), f); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""; };

describe("P5.2 SMS keyword channel", () => {
  it("asks for consent first, files after AGREE, answers STATUS — replies carry no personal data", async () => {
    const phone = nextPhone();
    const first = await sms(`+91${phone}`, "SANKALP Dehradun pani nahi aa raha 2 din se");
    expect(first.body).toMatchObject({ accepted: true, command: "consent_request" });
    expect(storage.getComplaints()).toHaveLength(0);
    const agree = await sms(phone, "AGREE");
    expect(agree.body.command).toBe("complaint_received");
    const [c] = storage.getComplaints();
    expect(c).toMatchObject({ category: "water", district: "Dehradun", channel: "sms", geoApproximate: true });
    const st = await sms(phone, `STATUS ${c.ticketId}`);
    expect(st.body.command).toBe("status_reply");
    const log = outbox("sms-outbox.log");
    expect(log).toContain(`Complaint #${c.ticketId} is received`);
    expect(log).not.toContain("pani");
    // someone else cannot read the status of this ticket
    expect((await sms(nextPhone(), `STATUS ${c.ticketId}`)).body.command).toBe("channel_help");
  });

  it("rejects calls without the webhook secret", async () => {
    expect((await request(app()).post("/api/verification/sms-inbound").send({ from: nextPhone(), text: "HELP" })).status).toBe(403);
  });
});

describe("P5.3 WhatsApp channel", () => {
  it("same commands; replies masked in the dev log", async () => {
    const phone = nextPhone();
    const wa = (text: string) => request(app()).post("/api/channels/whatsapp/inbound").set("X-Webhook-Secret", "wa-secret-for-tests").send({ from: `91${phone}`, text });
    expect((await wa("SANKALP street light not working near temple")).body.reply).toBe("consent_request");
    expect((await wa("AGREE")).body.reply).toBe("complaint_received");
    expect(storage.getComplaints()[0]).toMatchObject({ category: "streetlight", channel: "whatsapp" });
    expect(outbox("whatsapp-outbox.log")).not.toContain(phone);
  });
});

describe("P5.2 missed call → IVR → STT → ticket", () => {
  it("needs consent; without a speech model the recording is filed for a human to transcribe", async () => {
    const ivr = (consent: boolean) => request(app()).post("/api/channels/ivr/recording").set("X-Webhook-Secret", "ivr-secret-for-tests").send({ from: nextPhone(), audioBase64: M4A_HEADER, consent });
    expect((await ivr(false)).status).toBe(428);
    const r = await ivr(true);
    expect(r.status).toBe(201);
    expect(r.body.transcribed).toBe(false);
    const c = storage.getComplaints()[0];
    expect(c.channel).toBe("ivr");
    expect(storage.getReviewTasks("open").some(t => t.complaintId === c.id && t.kind === "transcription")).toBe(true);
    expect(storage.s.media.some(m => m.complaintId === c.id && m.kind === "audio")).toBe(true);
  });
});
