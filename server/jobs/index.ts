import { config } from "../config";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { unref } from "../lib/errors";

/**
 * Background jobs (m12 groundwork). Started once from server/index.ts; stopped on shutdown.
 *  - SLA watcher: audits each breach ONCE (no repeated logs/broadcasts — audit M4 fix).
 *  - Demo worker movement: only when DEMO_MODE=true (M1).
 */
const timers: Array<ReturnType<typeof setInterval>> = [];
const slaLogged = new Set<string>();

export function runSlaCheck(at = Date.now()): string[] {
  const newly: string[] = [];
  for (const c of storage.getComplaints()) {
    if (!storage.slaBreached(c, at) || slaLogged.has(c.id)) continue;
    slaLogged.add(c.id);
    newly.push(c.id);
    storage.addAuditLog("sla_breach", "system", "SANKALP System", `SLA breached for ${c.ticketId} (${c.priority})`, c.id);
  }
  return newly;
}

export function startJobs() {
  if (timers.length) return; // no duplicate timers on hot reload
  timers.push(setInterval(() => { try { runSlaCheck(); } catch (err) { logger.error("sla_job_failed", { err }); } }, 5 * 60 * 1000));
  if (config().DEMO_MODE) timers.push(setInterval(() => storage.simulateDemoWorkerMovement(), 8000));
  timers.forEach(t => unref(t));
}

export function stopJobs() {
  timers.splice(0).forEach(t => clearInterval(t));
}
