import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";

/**
 * SMS (P1.5; also used by Phase 3/5/6). Interface + drivers:
 *  - console (default): writes to DATA_DIR/sms-outbox.log — development/demo only; refused in production.
 *  - dlt-http: generic Indian DLT-registered gateway. POSTs JSON {to, templateId, variables, sender, entityId} to SMS_API_URL
 *    with `Authorization: Bearer SMS_API_KEY`. The host must be in EGRESS_ALLOWLIST (safeFetch).
 * Messages use DLT templates with variables only — never names, addresses or locations (rule 2).
 */
export type SmsTemplate = "otp" | "status_update" | "sos_fallback" | "checkin_alert" | "verify_request" | "ops_alert";

export const TEMPLATES: Record<SmsTemplate, string> = {
  otp: "Your SANKALP verification code is {#var#}. Valid 5 minutes. Do not share it.",
  status_update: "SANKALP: Complaint #{#var#} has an update. Open the app to view.",
  sos_fallback: "SANKALP SOS: Help needed. Location: {#var#}. Call 112.",
  checkin_alert: "SANKALP: A contact did not check in on time. Please call them.",
  verify_request: "SANKALP: Was complaint #{#var#} fixed? Reply 1 for YES, 2 for NO.",
  ops_alert: "SANKALP OPS: service {#var#} is {#var#}. Check the status page.",
};

export interface SmsResult { ok: boolean; driver: string; error?: string }

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
  if (driver === "dlt-http") {
    const url = process.env.SMS_API_URL;
    if (!url || !process.env.SMS_API_KEY) return { ok: false, driver, error: "SMS_API_URL / SMS_API_KEY not configured" };
    try {
      const res = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SMS_API_KEY}` },
        body: JSON.stringify({ to: `+91${to}`, templateId: template, variables, sender: process.env.SMS_SENDER_ID, entityId: process.env.DLT_ENTITY_ID }),
      });
      return res.ok ? { ok: true, driver } : { ok: false, driver, error: `HTTP ${res.status}` };
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
