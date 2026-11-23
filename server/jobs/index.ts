import { config } from "../config";
import { storage, storeFor } from "../storage";
import { tenantIds, runInTenant } from "../tenancy";
import { logger } from "../lib/logger";
import { unref } from "../lib/errors";
import { runRetention, runAudioRetention } from "../routes/privacy";
import { readiness } from "../health";
import { sendSms } from "../notify/sms";
import { safeFetch } from "../lib/safeFetch";
import { runConfirmationReminders } from "../verification/confirm";
import { runSlaEscalation } from "../agents/sla";
import { runSosDeliveries } from "../safety/sos";
import { runCheckInAlerts } from "../safety/checkin";
import { runYatraHousekeeping } from "../routes/yatra";

/** P1.10 downtime alert hook: notify ops (SMS to ALERT_PHONES and/or ALERT_WEBHOOK_URL) on state changes. No PII. */
let lastReady = true;
export async function watchReadiness(): Promise<boolean> {
  const r = await readiness();
  if (r.ready !== lastReady) {
    lastReady = r.ready;
    const state = r.ready ? "RECOVERED" : "DOWN";
    logger.warn("readiness_changed", { state, checks: r.checks });
    for (const ph of (process.env.ALERT_PHONES || "").split(",").map(s => s.trim()).filter(Boolean)) await sendSms(ph, "ops_alert", ["api", state]);
    if (process.env.ALERT_WEBHOOK_URL) {
      await safeFetch(process.env.ALERT_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service: "sankalp-api", state, checks: r.checks, at: new Date().toISOString() }) }).catch(err => logger.error("alert_webhook_failed", { err: (err as Error).message }));
    }
  }
  return r.ready;
}

/**
 * Background jobs (m12 groundwork). Started once from server/index.ts; stopped on shutdown.
 *  - SLA watcher: audits each breach ONCE (no repeated logs/broadcasts — audit M4 fix).
 *  - Demo worker movement: only when DEMO_MODE=true (M1).
 */
const timers: Array<ReturnType<typeof setInterval>> = [];
const slaLogged = new Set<string>(); // keys: tenant:complaintId

export function runSlaCheck(at = Date.now()): string[] {
  const newly: string[] = [];
  for (const c of storage.getComplaints()) {
    const key = `${storage.tenantId}:${c.id}`;
    if (!storage.slaBreached(c, at) || slaLogged.has(key)) continue;
    slaLogged.add(key);
    newly.push(c.id);
    storage.addAuditLog("sla_breach", "system", "SANKALP System", `SLA breached for ${c.ticketId} (${c.priority})`, c.id);
  }
  return newly;
}

export function startJobs() {
  if (timers.length) return; // no duplicate timers on hot reload
  const eachTenant = (name: string, fn: () => void) => () => {
    for (const id of tenantIds()) {
      try { runInTenant(id, fn); } catch (err) { logger.error(`${name}_failed`, { tenant: id, err }); }
    }
  };
  timers.push(setInterval(eachTenant("sla_job", () => { runSlaCheck(); runSlaEscalation(); }), 5 * 60 * 1000));
  timers.push(setInterval(eachTenant("retention_job", () => { runRetention(); }), 24 * 3600 * 1000));
  timers.push(setInterval(eachTenant("sos_audio_retention_job", () => { runAudioRetention(); }), 3600 * 1000));
  timers.push(setInterval(() => { void watchReadiness(); }, 60_000));
  // P6.1: SOS SMS to trusted contacts — retries with backoff.
  timers.push(setInterval(() => { for (const id of tenantIds()) void runInTenant(id, () => runSosDeliveries()).catch(err => logger.error("sos_deliveries_failed", { tenant: id, err })); }, 15_000));
  // P6.3: missed check-ins alert trusted contacts.
  timers.push(setInterval(() => { for (const id of tenantIds()) void runInTenant(id, () => runCheckInAlerts()).catch(err => logger.error("checkin_alerts_failed", { tenant: id, err })); }, 60_000));
  // P6.6: yatra groups — flag silent members, delete expired groups and their locations.
  timers.push(setInterval(eachTenant("yatra_job", () => { runYatraHousekeeping(); }), 5 * 60 * 1000));
  // P3.5: SMS reminder / voice callback for citizens who have not answered "was it fixed?".
  timers.push(setInterval(() => { for (const id of tenantIds()) void runInTenant(id, () => runConfirmationReminders()).catch(err => logger.error("confirm_reminders_failed", { tenant: id, err })); }, 10 * 60 * 1000));
  if (config().DEMO_MODE) timers.push(setInterval(eachTenant("demo_workers", () => storeFor(storage.tenantId).simulateDemoWorkerMovement()), 8000));
  timers.forEach(t => unref(t));
}

export function stopJobs() {
  timers.splice(0).forEach(t => clearInterval(t));
}
