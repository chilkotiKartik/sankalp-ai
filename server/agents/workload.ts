import { storage } from "../storage";
import { getDeptIdForCategory } from "../data/reference";
import { TERMINAL } from "../domain/complaintState";
import { haversineM } from "../verification/image";
import type { Complaint } from "../types";

/**
 * P4.3 workload balancer — SUGGESTS an assignee; the officer confirms with the normal assign-worker action.
 * score (lower is better) = 0.5·load + 0.3·distance + 0.2·skill-mismatch, each normalised to 0..1.
 *  load:     open complaints currently assigned to the worker (cap 10)
 *  distance: worker's last known location (or ward centre unknown → 0.5) to the complaint, cap 10 km
 *  skill:    0 if the worker lists this category (or no skills recorded), 1 otherwise
 * Phone numbers are not returned — only the name and the reasons.
 */
export function suggestAssignees(c: Complaint, limit = 3) {
  const dept = getDeptIdForCategory(c.category);
  const open = storage.getComplaints().filter(x => !TERMINAL.has(x.state) && x.assignedWorkerPhone);
  const workers = storage.getWorkers(c.district).filter(w => w.status !== "on_leave" && (!w.departmentId || w.departmentId === dept));
  return workers.map(w => {
    const load = open.filter(x => x.assignedWorkerPhone === w.phone).length;
    const km = w.geo && c.geo ? haversineM(w.geo, c.geo) / 1000 : null;
    const skilled = !w.skills?.length || w.skills.includes(c.category);
    const score = 0.5 * Math.min(load, 10) / 10 + 0.3 * (km === null ? 0.5 : Math.min(km, 10) / 10) + 0.2 * (skilled ? 0 : 1);
    return {
      workerId: w.id, name: w.name, score: Math.round(score * 1000) / 1000,
      reasons: [`${load} open task${load === 1 ? "" : "s"}`, km === null ? "location unknown" : `${km.toFixed(1)} km away`, skilled ? "skill match" : "no listed skill for this category"],
    };
  }).sort((a, b) => a.score - b.score).slice(0, limit);
}
