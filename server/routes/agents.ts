import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { route, none, idParams, type Actor } from "../lib/route";
import { forbidden, notFound, AppError } from "../lib/errors";
import { isStateWide, DISTRICT_NAMES } from "../data/reference";
import { isDistrictAdmin, isAdminUser } from "../auth/roles";
import { unmergeDuplicate } from "../agents/duplicates";
import { snoozeSla } from "../agents/sla";
import { suggestAssignees } from "../agents/workload";
import { weeklyBriefing, briefingPdf } from "../agents/briefing";
import { seasonalTrends } from "../agents/trends";
import { staffFor } from "./complaints";
import { toStaffComplaint } from "./dto";
import { text, tenantDistrict } from "./common";
import type { Complaint } from "../types";

/** P4 routes: every agent output here is a suggestion, a summary or a reversible link — never a close or reject. */
function mustStaffComplaint(actor: Actor, id: string): Complaint {
  const c = storage.getComplaint(id);
  if (!c) throw notFound();
  if (!staffFor(actor, c)) throw forbidden("This complaint is outside your scope");
  return c;
}

const who = (actor: Actor) => ({ id: actor.user?.id ?? `dept:${actor.deptId}`, name: actor.user?.name ?? `dept:${actor.deptId}` });

/** District admins see their own district only; state staff choose (default: their own district or the first). */
function briefingDistrict(actor: Actor, requested?: string): string {
  const u = actor.user!;
  if (isDistrictAdmin(u) && !isStateWide(u.district)) return u.district;
  return requested ?? (isStateWide(u.district) ? DISTRICT_NAMES[0] ?? u.district : u.district);
}

export function registerAgentRoutes(app: Express) {
  // P4.1 human unmerge
  route(app, {
    method: "put", path: "/api/complaints/:id/unmerge", auth: "staff", permission: "agents.unmerge",
    params: idParams, query: none, body: z.object({ note: text(500).optional() }),
    handler: ({ actor, params, body }) => {
      const c = mustStaffComplaint(actor, params.id);
      if (!c.duplicateOf) throw notFound("This complaint is not linked as a duplicate");
      const w = who(actor);
      const parent = unmergeDuplicate(c, w.id, w.name, body.note);
      return { complaint: toStaffComplaint(c), parent: parent ? toStaffComplaint(parent) : null };
    },
  });

  // P4.2 snooze escalation with a reason
  route(app, {
    method: "put", path: "/api/complaints/:id/sla-snooze", auth: "staff", permission: "agents.sla_snooze",
    params: idParams, query: none, body: z.object({ hours: z.number().int().min(1).max(168), reason: z.string().trim().min(5).max(300) }),
    handler: ({ actor, params, body }) => {
      const c = mustStaffComplaint(actor, params.id);
      // Review P4-3: once escalated to the department head (level 2+), only a district/state admin may snooze.
      if ((c.slaLevel ?? 0) >= 2 && !isAdminUser(actor.user)) throw forbidden("Escalated cases can only be snoozed by a district or state admin");
      const w = who(actor);
      try { snoozeSla(c, body.hours, body.reason, w.id, w.name); } catch (err) { throw new AppError(409, "SNOOZE_LIMIT", (err as Error).message); }
      return { slaSnoozedUntil: c.slaSnoozedUntil, slaSnoozeReason: c.slaSnoozeReason };
    },
  });

  // P4.3 workload suggestion (the officer still assigns with the normal action)
  route(app, {
    method: "get", path: "/api/complaints/:id/suggest-assignee", auth: "staff", permission: "agents.suggest_assignee",
    params: idParams, query: none, body: none,
    handler: ({ actor, params }) => ({ suggestions: suggestAssignees(mustStaffComplaint(actor, params.id)), note: "Suggestion only — confirm by assigning the worker." }),
  });

  // P4.4 weekly briefing (JSON or PDF)
  route(app, {
    method: "get", path: "/api/admin/briefing", auth: "admin", permission: "agents.briefing",
    params: none, query: z.object({ district: tenantDistrict.optional(), format: z.enum(["json", "pdf"]).default("json") }), body: none,
    handler: ({ actor, query, res }) => {
      const b = weeklyBriefing(briefingDistrict(actor, query.district));
      storage.addAuditLog("briefing_generated", actor.user!.id, actor.user!.name, `Weekly briefing for ${b.title}`);
      if (query.format === "json") return b;
      const pdf = briefingPdf(b);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="sankalp-briefing.pdf"`);
      res.end(pdf);
      return undefined;
    },
  });

  // P4.5 seasonal trend signals
  route(app, {
    method: "get", path: "/api/admin/trends", auth: "admin", permission: "agents.trends",
    params: none, query: z.object({ district: tenantDistrict.optional() }), body: none,
    handler: ({ actor, query }) => {
      const district = briefingDistrict(actor, query.district);
      return { district, rows: seasonalTrends(district), method: "Same IST week ±1 in previous years; needs ≥ 2 years and ≥ 10 complaints; rising = above the 95% Poisson upper bound." };
    },
  });
}
