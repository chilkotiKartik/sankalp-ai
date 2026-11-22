import { storage } from "../storage";
import { TERMINAL } from "../domain/complaintState";
import { haversineM } from "../verification/image";
import type { Complaint } from "../types";

/**
 * P4.1 duplicate merge — an agent that LINKS, never deletes. Reversible: unmerge restores both tickets exactly.
 * Candidate parent: same category, ≤ 100 m, filed ≤ 7 days earlier, still open, not itself a duplicate, and either
 * very close (≤ 30 m) or textually similar (token Jaccard ≥ 0.3, English/Hindi/Hinglish tokens).
 * Merging never closes anything: the child keeps its own lifecycle and its own citizen must still confirm the fix.
 */
export const DUP_RADIUS_M = 100, DUP_CLOSE_M = 30, DUP_WINDOW_DAYS = 7, DUP_MIN_SIMILARITY = 0.3;
const PRIORITY = ["P4", "P3", "P2", "P1"] as const;
export const MERGEABLE = new Set(["NEW", "ASSIGNED", "IN_PROGRESS"]);

/** Review P4-2: "citizens affected" counts distinct people, so one account cannot inflate it. */
export function distinctAffected(parent: Complaint): number {
  const ids = new Set<string>();
  if (parent.userId) ids.add(parent.userId);
  for (const id of parent.duplicates ?? []) { const u = storage.getComplaint(id)?.userId; if (u) ids.add(u); }
  return Math.max(1, ids.size);
}

/** A child is "covered by its parent" only while both are still before proof. Otherwise it stands alone. */
export function coveredByParent(c: Complaint): boolean {
  if (!c.duplicateOf || !MERGEABLE.has(c.state)) return false;
  const p = storage.getComplaint(c.duplicateOf);
  return !!p && !TERMINAL.has(p.state);
}

const STOP = new Set("the a an is are was of to in on at and or for near my our is it this that there have has been since from with hai hain ka ki ke ko se mein me par nahi bahut ek yah yeh wah है हैं का की के को से में पर और यह वह एक नहीं बहुत".split(" "));

export function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().normalize("NFC").split(/[^\p{L}\p{M}\p{N}]+/u).filter(t => t.length > 1 && !STOP.has(t)));
}

export function similarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(t => { if (B.has(t)) inter++; });
  return inter / (A.size + B.size - inter);
}

export function findDuplicateParent(c: Complaint): { parent: Complaint; distanceM: number; similarity: number } | null {
  if (!c.geo || c.geoApproximate) return null;
  const since = new Date(c.submittedAt).getTime() - DUP_WINDOW_DAYS * 86400000;
  let best: { parent: Complaint; distanceM: number; similarity: number } | null = null;
  for (const p of storage.getComplaints()) {
    // Review P4-1: only parents whose work has not reached proof yet — later children could never get the proof.
    if (p.id === c.id || p.duplicateOf || p.category !== c.category || !p.geo || p.geoApproximate || !MERGEABLE.has(p.state)) continue;
    if (p.district !== c.district || new Date(p.submittedAt).getTime() < since || p.submittedAt > c.submittedAt) continue;
    const d = haversineM(c.geo, p.geo);
    if (d > DUP_RADIUS_M) continue;
    const sim = similarity(c.description, p.description);
    if (d > DUP_CLOSE_M && sim < DUP_MIN_SIMILARITY) continue;
    if (!best || d < best.distanceM) best = { parent: p, distanceM: Math.round(d), similarity: Math.round(sim * 100) / 100 };
  }
  return best;
}

/** Priority rises with the number of affected citizens: 3+ → one level, 10+ → two levels (never above P1). */
export function priorityFor(base: string, affected: number): string {
  const i = Math.max(0, PRIORITY.indexOf(base as (typeof PRIORITY)[number]));
  const bump = affected >= 10 ? 2 : affected >= 3 ? 1 : 0;
  return PRIORITY[Math.min(PRIORITY.length - 1, i + bump)];
}

export function mergeDuplicate(child: Complaint, parent: Complaint, reason: string): void {
  child.duplicateOf = parent.id;
  parent.duplicates = [...new Set([...(parent.duplicates ?? []), child.id])];
  parent.affectedCount = distinctAffected(parent);
  parent.priorityBeforeMerge ??= parent.priority;
  parent.priority = priorityFor(parent.priorityBeforeMerge, parent.affectedCount) as Complaint["priority"];
  storage.addAuditLog("agent_duplicate_merged", "agent:duplicates", "Duplicate agent",
    `${child.ticketId} linked to ${parent.ticketId} (${reason}); ${parent.affectedCount} citizens affected; priority ${parent.priority}. Reversible via unmerge.`, parent.id);
  storage.touch();
}

export function unmergeDuplicate(child: Complaint, actorId: string, actorName: string, note?: string): Complaint | null {
  const parent = child.duplicateOf ? storage.getComplaint(child.duplicateOf) : undefined;
  child.duplicateOf = undefined;
  if (parent) {
    parent.duplicates = (parent.duplicates ?? []).filter(id => id !== child.id);
    parent.affectedCount = distinctAffected(parent);
    if (parent.priorityBeforeMerge) parent.priority = priorityFor(parent.priorityBeforeMerge, parent.affectedCount) as Complaint["priority"];
    if (!parent.duplicates.length) { parent.affectedCount = undefined; parent.priorityBeforeMerge = undefined; }
  }
  storage.addAuditLog("duplicate_unmerged", actorId, actorName, `${child.ticketId} unlinked from ${parent?.ticketId ?? "?"}${note ? ` — ${note}` : ""}`, child.id);
  storage.touch();
  return parent ?? null;
}

/** Run on every new complaint. Returns the parent it was linked to, if any. */
export function autoMerge(c: Complaint): Complaint | null {
  const hit = findDuplicateParent(c);
  if (!hit) return null;
  mergeDuplicate(c, hit.parent, `${hit.distanceM} m apart, text similarity ${hit.similarity}`);
  return hit.parent;
}
