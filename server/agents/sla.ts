import { storage, deptEmitter } from "../storage";
import { SLA_HOURS, getDeptIdForCategory } from "../data/reference";
import { TERMINAL } from "../domain/complaintState";
import { hoursBetween } from "../lib/time";
import { sendPush } from "../notify/push";
import type { Complaint } from "../types";

/**
 * P4.2 SLA escalation ladder — the agent only REMINDS and ESCALATES (audited, once per level):
 *   75% of SLA → level 1: the assigned officer / department queue
 *  100% of SLA → level 2: department head (dept_admin)
 *  150% of SLA → level 3: district admin (push to district staff)
 * A snooze (with a reason, audited) pauses escalation until a set time. Paused while awaiting the citizen.
 */
export const LEVELS = [{ level: 1, at: 0.75, to: "officer" }, { level: 2, at: 1.0, to: "dept_head" }, { level: 3, at: 1.5, to: "district_admin" }] as const;
const PAUSED = new Set(["PROOF_SUBMITTED", "VERIFYING", "NEEDS_REVIEW", "CITIZEN_VERIFIED"]);

export function slaFraction(c: Complaint, at = Date.now()): number {
  const sla = SLA_HOURS[c.priority] ?? 72;
  return hoursBetween(c.submittedAt, at) / sla;
}

export function runSlaEscalation(at = Date.now()): Array<{ id: string; level: number }> {
  const out: Array<{ id: string; level: number }> = [];
  for (const c of storage.getComplaints()) {
    if (TERMINAL.has(c.state) || PAUSED.has(c.state) || c.duplicateOf) continue;
    if (c.slaSnoozedUntil && new Date(c.slaSnoozedUntil).getTime() > at) continue;
    const f = slaFraction(c, at);
    const due = [...LEVELS].reverse().find(l => f >= l.at);
    if (!due || (c.slaLevel ?? 0) >= due.level) continue;
    c.slaLevel = due.level;
    out.push({ id: c.id, level: due.level });
    const departmentId = getDeptIdForCategory(c.category);
    storage.addAuditLog("agent_sla_escalation", "agent:sla", "SLA agent",
      `${c.ticketId}: ${Math.round(f * 100)}% of the ${SLA_HOURS[c.priority] ?? 72} h SLA → level ${due.level} (${due.to})`, c.id);
    deptEmitter.emit("event", { type: "sla_escalation", departmentId, level: due.level, complaint: { id: c.id, ticketId: c.ticketId, priority: c.priority, district: c.district } });
    if (due.level === 3) void sendPush(storage.adminPushTokensForDistrict(c.district), { kind: "complaint", id: c.id, ref: c.ticketId });
  }
  if (out.length) storage.touch();
  return out;
}

export function snoozeSla(c: Complaint, hours: number, reason: string, actorId: string, actorName: string) {
  c.slaSnoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
  c.slaSnoozeReason = reason;
  storage.addAuditLog("sla_snoozed", actorId, actorName, `${c.ticketId}: escalation snoozed ${hours} h — ${reason}`, c.id);
  storage.touch();
}
