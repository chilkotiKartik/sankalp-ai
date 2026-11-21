import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";
import { TEMPLATES, type SmsTemplate } from "./sms";

/**
 * P5.3 WhatsApp (citizen-initiated only: we reply inside the 24 h window the citizen opened).
 * Drivers:
 *  - console (default): DATA_DIR/whatsapp-outbox.log, development/demo only
 *  - cloud-api: WHATSAPP_API_URL (a Business Solution Provider endpoint or the Cloud API messages URL) with
 *    Bearer WHATSAPP_TOKEN. Its host must be added to EGRESS_ALLOWLIST explicitly. NOTE: Meta's Cloud API is a
 *    foreign service — message content leaves India. Prefer an Indian BSP with in-country hosting; the templates
 *    carry only ticket ids and states, never personal data (rule 2). Off by default.
 */
export async function sendWhatsApp(to: string, template: SmsTemplate, vars: string[]): Promise<{ ok: boolean; driver: string; error?: string }> {
  const c = config();
  const driver = process.env.WHATSAPP_DRIVER || "console";
  const text = vars.reduce((t, v) => t.replace("{#var#}", v), TEMPLATES[template]);
  if (driver === "console" || driver === "mock") {
    if (c.NODE_ENV === "production" && !c.DEMO_MODE) return { ok: false, driver, error: "console WhatsApp driver is disabled in production" };
    const file = path.join(path.resolve(c.DATA_DIR), "whatsapp-outbox.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()}\t******${to.slice(-4)}\t${text}\n`, { mode: 0o600 });
    logger.info("whatsapp_console", { template });
    return { ok: true, driver };
  }
  if (driver === "cloud-api") {
    const url = process.env.WHATSAPP_API_URL, token = process.env.WHATSAPP_TOKEN;
    if (!url || !token) return { ok: false, driver, error: "WHATSAPP_API_URL / WHATSAPP_TOKEN not configured" };
    try {
      const res = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: `91${to}`, type: "text", text: { body: text } }),
      });
      return res.ok ? { ok: true, driver } : { ok: false, driver, error: `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, driver, error: (err as Error).message };
    }
  }
  return { ok: false, driver, error: `Unknown WHATSAPP_DRIVER ${driver}` };
}
