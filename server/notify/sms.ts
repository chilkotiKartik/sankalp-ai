import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";

/**
 * SMS (P1.5; also used by Phase 3/5/6). Interface + drivers:
 *  - console (default): writes to DATA_DIR/sms-outbox.log — development/demo only; refused in production.
 *  - msg91: MSG91 (India) Flow API v5. POSTs {template_id, short_url:"0", recipients:[{mobiles, var1, var2…}]} to
 *    https://control.msg91.com/api/v5/flow with header `authkey: MSG91_AUTH_KEY`. Each template needs its DLT-approved
 *    MSG91 template id in SMS_TEMPLATE_IDS (JSON: {"otp":"<id>",…}); variables are named ##var1##, ##var2##… in MSG91.
 *    A template without an id is not sent (fail closed). Host control.msg91.com must be in EGRESS_ALLOWLIST.
 *  - dlt-http: generic Indian DLT-registered gateway. POSTs JSON {to, templateId, variables, sender, entityId} to SMS_API_URL
 *    with `Authorization: Bearer SMS_API_KEY`. The host must be in EGRESS_ALLOWLIST (safeFetch).
 * Messages use DLT templates with variables only — never names, addresses or locations (rule 2).
 */
export type SmsTemplate = "otp" | "status_update" | "sos_fallback" | "checkin_alert" | "verify_request" | "ops_alert"
  | "complaint_received" | "consent_request" | "status_reply" | "channel_help" | "voice_received" | "sos_contact" | "sos_cancelled" | "checkin_safe";

export const TEMPLATES: Record<SmsTemplate, string> = {
  otp: "Your SANKALP verification code is {#var#}. Valid 5 minutes. Do not share it.",
  status_update: "SANKALP: Complaint #{#var#} has an update. Open the app to view.",
  sos_fallback: "SANKALP SOS: Help needed. Location: {#var#}. Call 112.",
  checkin_alert: "SANKALP: someone who listed you as a trusted contact did not check in on time. Details: {#var#} . If you cannot reach them, call 112.",
  verify_request: "SANKALP: Was complaint #{#var#} fixed? Reply 1 for YES, 2 for NO.",
  ops_alert: "SANKALP OPS: service {#var#} is {#var#}. Check the status page.",
  // P5.2 basic-phone channels (register each with DLT before use). Variables: ticket ids, states, URLs — never PII.
  complaint_received: "SANKALP: Complaint #{#var#} registered. Reply STATUS {#var#} for updates.",
  consent_request: "SANKALP: To file complaints by SMS, read the privacy notice at {#var#} and reply AGREE.",
  status_reply: "SANKALP: Complaint #{#var#} is {#var#}.",
  channel_help: "SANKALP: Send SANKALP <problem> to file, STATUS <ticket> to track. Emergency: call 112.",
  voice_received: "SANKALP: Your voice complaint #{#var#} is registered. An officer will listen to it.",
  // P6.1: the location is behind a signed link that expires — never in the SMS text itself.
  sos_contact: "SANKALP SOS: someone who listed you as a trusted contact needs help. Live location: {#var#} . Call 112.",
  sos_cancelled: "SANKALP: the SOS alert you received was cancelled by the sender.",
  checkin_safe: "SANKALP: the person who missed a check-in has now confirmed they are safe.",
};

export interface SmsResult { ok: boolean; driver: string; error?: string; messageId?: string }

export async function sendSms(to: string, template: SmsTemplate, variables: string[]): Promise<SmsResult> {
  const c = config();
  const driver = process.env.SMS_DRIVER || "console";
  const text = variables.reduce((t, v) => t.replace("{#var#}", v), TEMPLATES[template]);
  if (driver === "console") {
    if (c.NODE_ENV === "production" && !c.DEMO_MODE) return { ok: false, driver, error: "console SMS driver is disabled in production" };
    const file = path.join(path.resolve(c.DATA_DIR), "sms-outbox.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()}\t${to}\t${text}\n`, { mode: 0o600 });
    logger.info("sms_console", { template });
    return { ok: true, driver };
  }
  if (driver === "msg91") {
    const key = process.env.MSG91_AUTH_KEY;
    let ids: Record<string, string> = {};
    try { ids = JSON.parse(process.env.SMS_TEMPLATE_IDS || "{}"); } catch { return { ok: false, driver, error: "SMS_TEMPLATE_IDS is not valid JSON" }; }
    if (!key) return { ok: false, driver, error: "MSG91_AUTH_KEY not configured" };
    const templateId = ids[template];
    if (!templateId) return { ok: false, driver, error: `no DLT template id for ${template} in SMS_TEMPLATE_IDS` };
    const recipient: Record<string, string> = { mobiles: `91${to}` };
    variables.forEach((v, i) => { recipient[`var${i + 1}`] = v; });
    try {
      const res = await safeFetch("https://control.msg91.com/api/v5/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json", authkey: key },
        body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [recipient] }),
      });
      const j = (await res.json().catch(() => ({}))) as { type?: string; message?: unknown };
      if (!res.ok || j.type === "error") return { ok: false, driver, error: `MSG91 HTTP ${res.status}${j.message ? `: ${String(j.message).slice(0, 120)}` : ""}` };
      return { ok: true, driver, messageId: j.message ? String(j.message) : undefined };
    } catch (err) {
      return { ok: false, driver, error: (err as Error).message };
    }
  }
  if (driver === "dlt-http") {
    const url = process.env.SMS_API_URL;
    if (!url || !process.env.SMS_API_KEY) return { ok: false, driver, error: "SMS_API_URL / SMS_API_KEY not configured" };
    try {
      const res = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SMS_API_KEY}` },
        body: JSON.stringify({ to: `+91${to}`, templateId: template, variables, sender: process.env.SMS_SENDER_ID, entityId: process.env.DLT_ENTITY_ID }),
      });
      if (!res.ok) return { ok: false, driver, error: `HTTP ${res.status}` };
      const j = (await res.json().catch(() => ({}))) as { id?: unknown; messageId?: unknown };
      return { ok: true, driver, messageId: String(j.messageId ?? j.id ?? "") || undefined };
    } catch (err) {
      return { ok: false, driver, error: (err as Error).message };
    }
  }
  return { ok: false, driver, error: `Unknown SMS_DRIVER ${driver}` };
}

/** Test/dev helper: last OTP delivered by the console driver for a phone. */
export function lastConsoleOtp(phone: string): string | null {
  const file = path.join(path.resolve(config().DATA_DIR), "sms-outbox.log");
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").reverse();
  const hit = lines.find(l => l.split("\t")[1] === phone && l.includes("verification code"));
  return hit?.match(/code is (\d{6})/)?.[1] ?? null;
}
