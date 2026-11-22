import { tenant } from "../tenancy";
import { isAdminUser, isStateUser, isDistrictAdmin } from "../auth/roles";
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { DISTRICT_NAMES } from "../data/reference";
import { route, none, idParams, scopeDistrict } from "../lib/route";
import { forbidden, notFound, badRequest } from "../lib/errors";
import { publishEmergencyBroadcast } from "../realtime";
import { writeLimiter } from "./limits";
import { aiMetrics, aiStatus } from "../ai/gateway";
import { text, tenantDistrict } from "./common";
import { requireConsent } from "./privacy";
import { toStaffComplaint, toPublicWorker } from "./dto";

const annBody = z.object({
  title: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(5000),
  type: z.enum(["general", "scheme", "emergency", "welfare", "tender", "holiday"]).optional(),
  department: text(120).optional(), priority: z.enum(["normal", "important", "urgent"]).optional(),
  targetWards: z.array(z.number().int()).max(200).optional(), targetDistrict: z.string().max(60).optional(),
  expiresAt: z.string().max(40).optional(), link: z.string().url().max(500).optional(),
});

/** Admin, governance and community routes. Every admin action is scoped to the admin's district (audit C7). */
export function registerAdminRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/admin/stats", auth: "admin", permission: "admin.stats",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getAdminStats(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/admin/alerts", auth: "admin", permission: "sos.list", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getSosAlerts(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/admin/workers", auth: "admin", permission: "workers.list",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getWorkers(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/admin/risk-zones", auth: "admin", permission: "risk.read",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getRiskZones(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/admin/review-tasks", auth: "admin", permission: "complaints.review",
    params: none, query: z.object({ status: z.enum(["open", "done"]).optional() }), body: none,
    handler: ({ actor, query }) => {
      const d = scopeDistrict(actor);
      return storage.getReviewTasks(query.status).filter(t => !d || !t.complaintId || storage.getComplaint(t.complaintId)?.district === d);
    },
  });

  route(app, {
    method: "get", path: "/api/superadmin/districts", auth: "superAdmin", permission: "admin.state_overview",
    params: none, query: none, body: none,
    handler: () => DISTRICT_NAMES.map(district => {
      const stats = storage.getAdminStats(district);
      return { district, ...stats, avgHealthScore: stats.avgHealthScore, wardCount: stats.totalWards };
    }),
  });

  route(app, {
    method: "post", path: "/api/admin/emergency-broadcast", auth: "admin", permission: "broadcast.emergency",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ message: z.string().trim().min(5).max(500).optional(), severity: z.enum(["low", "medium", "high", "critical"]).optional() }),
    handler: ({ body, user }) => {
      const message = body.message || "DISTRICT-WIDE EMERGENCY ALERT: Take immediate precautions. Follow official instructions.";
      publishEmergencyBroadcast(user, message, body.severity || "high");
      storage.addAuditLog("emergency_broadcast", user.id, user.name, `Emergency broadcast to ${isStateUser(user) ? "all districts" : user.district}`);
      return { success: true, scope: isStateUser(user) ? "all" : user.district };
    },
  });

  route(app, {
    method: "post", path: "/api/superadmin/assign-task", auth: "superAdmin", permission: "admin.assign_task",
    params: none, query: none,
    body: z.object({ district: tenantDistrict, task: z.string().trim().min(5).max(2000) }),
    handler: ({ body, user }) => {
      const ann = storage.createAnnouncement({ title: "📋 Task Assigned by State Administration",
        body: `Directive from State Command:\n\n${body.task}\n\nPlease acknowledge and act.`, type: "emergency",
        department: `Government of ${tenant().stateLabel}`, priority: "urgent", targetDistrict: body.district, postedBy: user.name });
      storage.addAuditLog("task_assigned", user.id, user.name, `Task assigned to ${body.district}`);
      return { success: true, announcement: ann, message: `Task assigned to ${body.district} administration` };
    },
  });

  // ── Announcements ──────────────────────────────────────────────────────────
  route(app, {
    method: "get", path: "/api/announcements", auth: "user", permission: "announcements.read", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getAnnouncements(scopeDistrict(actor)),
  });

  route(app, {
    method: "post", path: "/api/announcements/:id/view", auth: "user", permission: "announcements.read",
    params: idParams, query: none, body: none,
    handler: ({ params }) => { storage.incrementAnnouncementViews(params.id); return { success: true }; },
  });

  route(app, {
    method: "post", path: "/api/announcements", auth: "admin", permission: "announcements.write",
    params: none, query: none, body: annBody,
    handler: ({ body, user, res }) => {
      const ann = storage.createAnnouncement({ ...body, type: body.type || "general", department: body.department || "District Administration",
        priority: body.priority || "normal", targetDistrict: isStateUser(user) ? body.targetDistrict : user.district, postedBy: user.name });
      storage.addAuditLog("announcement_posted", user.id, user.name, `Announcement: ${body.title}`);
      res.status(201);
      return ann;
    },
  });

  route(app, {
    method: "delete", path: "/api/announcements/:id", auth: "admin", permission: "announcements.write",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => {
      const a = storage.getAnnouncement(params.id);
      if (!a) throw notFound();
      if (!isStateUser(user) && a.targetDistrict !== user.district) throw forbidden("You can only delete announcements for your district");
      storage.deleteAnnouncement(a.id);
      storage.addAuditLog("announcement_deleted", user.id, user.name, `Announcement deleted: ${a.title}`);
      return { success: true };
    },
  });

  // ── Polls / petitions / events ─────────────────────────────────────────────
  route(app, {
    method: "get", path: "/api/polls", auth: "user", permission: "community.read", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor, user }) => storage.getPolls(scopeDistrict(actor)).map(p => ({ ...p, voterIds: p.voterIds.includes(user.id) ? [user.id] : [], totalVoters: p.voterIds.length })),
  });

  route(app, {
    method: "post", path: "/api/polls", auth: "admin", permission: "community.poll_create",
    params: none, query: none,
    body: z.object({ question: z.string().trim().min(5).max(300), options: z.array(z.string().trim().min(1).max(120)).min(2).max(8), expiresAt: z.string().max(40).optional() }),
    handler: ({ body, user, res }) => {
      res.status(201);
      return storage.createPoll({ question: body.question, options: body.options, votes: body.options.map(() => 0), voterIds: [],
        district: isStateUser(user) ? undefined : user.district, createdAt: new Date().toISOString(), createdBy: user.name, status: "active", expiresAt: body.expiresAt });
    },
  });

  route(app, {
    method: "put", path: "/api/polls/:id/vote", auth: "user", permission: "community.vote",
    params: idParams, query: none, body: z.object({ optionIndex: z.number().int().min(0).max(20) }),
    handler: ({ params, body, user }) => {
      const p = storage.votePoll(params.id, body.optionIndex, user.id);
      if (!p) throw notFound("Poll not found or closed");
      return { ...p, voterIds: [user.id], totalVoters: p.voterIds.length };
    },
  });

  route(app, {
    method: "get", path: "/api/petitions", auth: "user", permission: "community.read", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor, user }) => storage.getPetitions(scopeDistrict(actor)).map(p => ({ ...p, signerIds: p.signerIds.includes(user.id) ? [user.id] : [], signatureCount: p.signerIds.length })),
  });

  route(app, {
    method: "post", path: "/api/petitions", auth: "user", permission: "community.petition_create",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ title: z.string().trim().min(5).max(200), description: z.string().trim().min(10).max(3000), target: z.string().trim().min(2).max(200), goalSignatures: z.number().int().min(10).max(1_000_000).optional(), department: text(120).optional() }),
    handler: ({ body, user, res }) => {
      requireConsent(user);
      res.status(201);
      return storage.createPetition({ title: body.title, description: body.description, target: body.target, goalSignatures: body.goalSignatures || 500,
        signerIds: [], district: user.district, createdAt: new Date().toISOString(), createdBy: user.name, status: "active", department: body.department || "District Administration" });
    },
  });

  route(app, {
    method: "put", path: "/api/petitions/:id/sign", auth: "user", permission: "community.sign",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => {
      const p = storage.signPetition(params.id, user.id);
      if (!p) throw notFound("Petition not found or closed");
      return { ...p, signerIds: [user.id], signatureCount: p.signerIds.length };
    },
  });

  route(app, {
    method: "get", path: "/api/events", auth: "user", permission: "community.read", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor, user }) => storage.getEvents(scopeDistrict(actor)).map(e => ({ ...e, rsvpIds: e.rsvpIds.includes(user.id) ? [user.id] : [], rsvpCount: e.rsvpIds.length })),
  });

  route(app, {
    method: "post", path: "/api/events", auth: "admin", permission: "community.event_create",
    params: none, query: none,
    body: z.object({ title: z.string().trim().min(3).max(200), description: text(3000).optional(), date: z.string().min(8).max(30), time: text(30).optional(), location: z.string().trim().min(2).max(300), type: z.enum(["meeting", "camp", "drive", "scheme", "emergency"]).optional() }),
    handler: ({ body, user, res }) => {
      res.status(201);
      return storage.createEvent({ title: body.title, description: body.description || "", date: body.date, time: body.time || "TBD", location: body.location,
        type: body.type || "meeting", district: isStateUser(user) ? undefined : user.district, organizer: user.name });
    },
  });

  route(app, {
    method: "put", path: "/api/events/:id/rsvp", auth: "user", permission: "community.rsvp",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => {
      const e = storage.rsvpEvent(params.id, user.id);
      if (!e) throw notFound("Event not found");
      return { ...e, rsvpIds: [user.id], rsvpCount: e.rsvpIds.length };
    },
  });

  // ── RTI ────────────────────────────────────────────────────────────────────
  const listRti = (path: string) => route(app, {
    method: "get", path, auth: "user", permission: "rti.read",
    params: none, query: none, body: none,
    handler: ({ actor, user }) => user.role === "citizen" || user.role === "worker" ? storage.getRTIsByPhone(user.phone) : storage.getRTIs(scopeDistrict(actor)),
  });
  listRti("/api/rti");
  listRti("/api/rti/my");

  route(app, {
    method: "post", path: "/api/rti", auth: "user", permission: "rti.file",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({
      subject: text(300).optional(), title: text(300).optional(), description: text(5000).optional(), questionText: text(5000).optional(),
      department: text(200).optional(), targetDepartment: text(200).optional(),
    }).passthrough(),
    handler: ({ body, user, res }) => {
      requireConsent(user);
      const subject = body.subject || body.title;
      const description = body.description || body.questionText;
      const department = body.department || body.targetDepartment;
      if (!subject || !description || !department) throw badRequest("subject/title, description/questionText, department/targetDepartment required");
      res.status(201);
      return storage.createRTI({ subject, description, department, filedBy: user.name, filedByPhone: user.phone, district: user.district }, user.id);
    },
  });

  route(app, {
    method: "post", path: "/api/rti/:id/submit", auth: "user", permission: "rti.file",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => {
      const r = storage.getRTI(params.id);
      if (!r) throw notFound("RTI not found");
      if (r.filedByPhone !== user.phone) throw forbidden("You can only submit your own RTI");
      return storage.submitRTI(r.id);
    },
  });

  route(app, {
    method: "put", path: "/api/rti/:id/respond", auth: "admin", permission: "rti.respond",
    params: idParams, query: none, body: z.object({ response: z.string().trim().min(5).max(10000) }),
    handler: ({ params, body, user }) => {
      const r = storage.getRTI(params.id);
      if (!r) throw notFound("RTI not found");
      if (!isStateUser(user) && r.district !== user.district) throw forbidden("RTI is outside your district");
      storage.addAuditLog("rti_responded", user.id, user.name, `RTI ${r.ticketId} responded`);
      return storage.respondRTI(r.id, body.response);
    },
  });

  // ── Audit / departments summary / budget / predictive ──────────────────────
  route(app, {
    method: "get", path: "/api/audit", auth: "admin", permission: "audit.read", paginate: true,
    params: none, query: z.object({ complaintId: z.string().max(100).optional() }), body: none,
    handler: ({ actor, query }) => {
      const d = scopeDistrict(actor);
      const logs = storage.getAuditLogs(query.complaintId);
      return d ? logs.filter(l => !l.complaintId || storage.getComplaint(l.complaintId)?.district === d) : logs;
    },
  });

  route(app, {
    method: "get", path: "/api/admin/audit/verify", auth: "admin", permission: "audit.verify",
    params: none, query: none, body: none,
    handler: () => storage.verifyAuditChain(),
  });

  // P2.1: AI provider health — calls, failures, breaker state, p50/p95 latency. No prompts or personal data.
  route(app, {
    method: "get", path: "/api/admin/ai/metrics", auth: "admin", permission: "ai.metrics",
    params: none, query: none, body: none,
    handler: () => ({ providers: aiStatus(), metrics: aiMetrics() }),
  });

  route(app, {
    method: "get", path: "/api/departments", auth: "user", permission: "departments.summary",
    params: none, query: none, body: none,
    handler: ({ actor }) => {
      const map: Record<string, { name: string; complaints: number; pending: number; resolved: number; categories: string[] }> = {};
      for (const c of storage.getComplaints(scopeDistrict(actor))) {
        const dept = c.department || "DM Office (District Magistrate)";
        map[dept] ??= { name: dept, complaints: 0, pending: 0, resolved: 0, categories: [] };
        map[dept].complaints++;
        if (c.status === "pending" || c.status === "in_progress") map[dept].pending++;
        if (c.state === "CLOSED") map[dept].resolved++;
        if (!map[dept].categories.includes(c.category)) map[dept].categories.push(c.category);
      }
      return Object.values(map).sort((a, b) => b.complaints - a.complaints);
    },
  });

  route(app, {
    method: "get", path: "/api/departments/:name/complaints", auth: "admin", permission: "complaints.admin_list",
    params: z.object({ name: z.string().max(200) }), query: none, body: none,
    handler: ({ actor, params }) => storage.getComplaints(scopeDistrict(actor))
      .filter(c => (c.department || "DM Office (District Magistrate)") === params.name).map(toStaffComplaint),
  });

  route(app, {
    method: "get", path: "/api/budget", auth: "user", permission: "budget.read",
    params: none, query: z.object({ district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => storage.getBudgetItems(query.district),
  });

  route(app, {
    method: "get", path: "/api/predictive", auth: "user", permission: "insights.read",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getPredictiveAlerts(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/workers", auth: "user", permission: "workers.list", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor, user }) => {
      const list = storage.getWorkers(scopeDistrict(actor));
      return isAdminUser(user) ? list : list.map(toPublicWorker);
    },
  });
}
