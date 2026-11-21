import { defaultDistrict } from "../data/reference";
import type { Express } from "express";
import { z } from "zod";
import { storage, getDeptIdForCategory, type Complaint, type AppUser } from "../storage";
import { config } from "../config";
import { route, none, idParams, scopeDistrict, type Actor } from "../lib/route";
import { forbidden, notFound, unauthorized, unprocessable } from "../lib/errors";
import { classifyText } from "../ai/rules";
import { sendPush } from "../notify/push";
import { authLimiter, phoneLimiter, writeLimiter } from "./limits";
import { CATEGORIES, PRIORITIES, domain, geo, text, phone10 } from "./common";
import { complaintFor, toStaffComplaint } from "./dto";
import { resolveImage } from "./media";
import { deptEmitter } from "../storage";

const isAdmin = (u?: AppUser) => u?.role === "admin" || u?.role === "super_admin";

/** Staff with authority over this complaint: super admin, admin of its district, or the owning department. */
export function staffFor(actor: Actor, c: Complaint): boolean {
  if (actor.deptId) return getDeptIdForCategory(c.category) === actor.deptId;
  const u = actor.user;
  return !!u && (u.role === "super_admin" || (u.role === "admin" && u.district === c.district));
}

function canView(actor: Actor, c: Complaint): boolean {
  if (staffFor(actor, c)) return true;
  const u = actor.user;
  return !!u && (u.id === c.userId || u.district === c.district);
}

function mustComplaint(id: string): Complaint {
  const c = storage.getComplaint(id);
  if (!c) throw notFound("Complaint not found");
  return c;
}

export function notifyOwner(c: Complaint) {
  if (!c.userId) return;
  void sendPush(storage.pushTokensForUser(c.userId), { kind: "complaint", id: c.id, ref: c.ticketId });
}

function emitDept(type: string, c: Complaint) {
  const departmentId = getDeptIdForCategory(c.category);
  deptEmitter.emit("event", { type, departmentId, complaint: { ...toStaffComplaint(c), departmentId } });
}

const officerUpdate = z.object({
  status: z.enum(["in_progress", "acknowledged", "resolved", "pending", "closed"]).optional(),
  adminNote: text(1000).optional(),
  proofPhoto: z.string().max(22 * 1024 * 1024).optional(),
  proofNote: text(1000).optional(),
});

/** Shared officer status handler for admin + department routes (rule 4: no closure without proof). */
function applyOfficerUpdate(c: Complaint, body: z.infer<typeof officerUpdate>, actorId: string, actorName: string): Complaint {
  if (body.status === "closed" || body.status === "pending") {
    throw unprocessable("CITIZEN_CONFIRMATION_REQUIRED", body.status === "closed"
      ? "Only the citizen can close a complaint, by confirming the fix"
      : "A complaint cannot be moved back to pending");
  }
  if (body.status === "resolved" && !body.proofPhoto) throw unprocessable("PROOF_REQUIRED", "Upload a proof photo of the completed work to mark it resolved");
  if (body.status === "resolved") {
    const url = resolveImage(body.proofPhoto, actorId, { proofFor: c })!;
    domain(() => storage.submitProof(c.id, { photoUrl: url, note: body.proofNote }, "officer", actorId));
  }
  if (body.status === "in_progress" || body.status === "acknowledged") domain(() => storage.startWork(c.id, "officer", actorId));
  if (body.adminNote !== undefined) storage.setAdminNote(c.id, body.adminNote);
  if (body.status) {
    storage.addAuditLog("complaint_status", actorId, actorName, `${c.ticketId} → ${c.state}`, c.id);
    notifyOwner(c);
    emitDept("complaint_updated", c);
  }
  return c;
}

export function registerComplaintRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/complaints", auth: "user", permission: "complaints.list",
    params: none, query: z.object({ mine: z.enum(["true", "false"]).optional() }).passthrough(), body: none,
    handler: ({ actor, user, query }) => {
      const staff = isAdmin(user);
      let list = storage.getComplaints(scopeDistrict(actor));
      if (query.mine === "true") list = list.filter(c => c.userId === user.id);
      return list.map(c => complaintFor(user, c, staff));
    },
  });

  route(app, {
    method: "get", path: "/api/complaints/:id", auth: "user", permission: "complaints.read",
    params: idParams, query: none, body: none,
    handler: ({ actor, params, user }) => {
      const c = mustComplaint(params.id);
      if (!canView(actor, c)) throw forbidden();
      return complaintFor(user, c, staffFor(actor, c));
    },
  });

  route(app, {
    method: "post", path: "/api/complaints", auth: "user", permission: "complaints.create",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({
      category: z.enum(CATEGORIES),
      description: z.string().trim().min(3).max(2000),
      location: z.string().trim().min(2).max(300),
      geo: geo.optional(),
      ward: text(120).optional(),
      wardNumber: z.number().int().min(0).max(10000).optional(),
      priority: z.enum(PRIORITIES).optional(),
      beforePhoto: z.string().max(22 * 1024 * 1024).optional(),
    }).passthrough(),
    handler: ({ body, user, res }) => {
      const district = user.district || defaultDistrict();
      const photoUrl = resolveImage(body.beforePhoto, user.id);
      const guess = classifyText(body.description);
      const complaint = storage.createComplaint({
        category: body.category,
        description: body.description,
        location: body.location,
        geo: body.geo ?? storage.getDistrictCenter(district),
        ward: body.ward || `${district} Block`,
        wardNumber: body.wardNumber ?? 1,
        district,
        priority: body.priority || "P3",
        beforePhoto: photoUrl,
        hasProof: false,
        aiRouting: {
          method: "rules:category→department",
          department: getDeptIdForCategory(body.category),
          confidence: guess.category === body.category ? guess.confidence : 0.5,
          reason: guess.category === body.category ? `citizen category confirmed by ${guess.reason}` : "routed by citizen-selected category",
        },
        // M4: without a sovereign vision model the photo is queued for a human — never auto-approved.
        photoReview: photoUrl ? "manual_review" : "not_required",
      }, user);
      if (photoUrl && config().visionProvider === "manual_review") {
        storage.createReviewTask({ kind: "photo_authenticity", complaintId: complaint.id, reason: "No vision model configured — verify photo manually" });
      }
      emitDept("complaint_new", complaint);
      res.status(201);
      return complaintFor(user, complaint, false);
    },
  });

  route(app, {
    method: "put", path: "/api/complaints/:id/upvote", auth: "user", permission: "complaints.upvote",
    params: idParams, query: none, body: none,
    handler: ({ actor, params, user }) => {
      const c = mustComplaint(params.id);
      if (!canView(actor, c)) throw forbidden();
      storage.upvoteComplaint(c.id, user.id);
      return complaintFor(user, c, false);
    },
  });

  // Citizen confirms the fix (legacy name kept: /resolve). Only the owner; only after proof (M7).
  const confirm = (path: string) => route(app, {
    method: "put", path, auth: "user", permission: "complaints.citizen_confirm",
    params: idParams, query: none,
    body: z.object({ rating: z.number().int().min(1).max(5).optional(), feedback: text(1000).optional() }).passthrough(),
    handler: ({ params, body, user }) => {
      const c = mustComplaint(params.id);
      if (c.userId !== user.id) {
        throw forbidden(isAdmin(user)
          ? "Officers cannot close complaints. Submit a proof photo; the citizen then confirms the fix."
          : "Only the citizen who filed this complaint can confirm the fix");
      }
      domain(() => storage.citizenConfirm(c.id, user.id, body.rating, body.feedback));
      emitDept("complaint_updated", c);
      return complaintFor(user, c, false);
    },
  });
  confirm("/api/complaints/:id/resolve");
  confirm("/api/complaints/:id/confirm");

  route(app, {
    method: "put", path: "/api/complaints/:id/reject", auth: "user", permission: "complaints.citizen_reject",
    params: idParams, query: none, body: z.object({ reason: text(1000).optional() }).passthrough(),
    handler: ({ params, body, user }) => {
      const c = mustComplaint(params.id);
      if (c.userId !== user.id) throw forbidden("Only the citizen who filed this complaint can reject the fix");
      domain(() => storage.citizenReject(c.id, user.id, body.reason));
      emitDept("complaint_updated", c);
      return complaintFor(user, c, false);
    },
  });

  route(app, {
    method: "put", path: "/api/complaints/:id/cancel", auth: "user", permission: "complaints.citizen_cancel",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => {
      const c = mustComplaint(params.id);
      domain(() => storage.citizenCancel(c.id, user.id));
      return complaintFor(user, c, false);
    },
  });

  route(app, {
    method: "get", path: "/api/complaints/:id/events", auth: "optional", permission: "complaints.events",
    params: idParams, query: none, body: none,
    handler: ({ actor, params }) => {
      const c = mustComplaint(params.id);
      if (!actor.user && !actor.deptId) throw unauthorized();
      if (!staffFor(actor, c) && actor.user?.id !== c.userId) throw forbidden();
      return storage.getComplaintEvents(c.id);
    },
  });

  route(app, {
    method: "get", path: "/api/complaints/:id/chat", auth: "user", permission: "complaints.chat_read",
    params: idParams, query: none, body: none,
    handler: ({ actor, params, user }) => {
      const c = mustComplaint(params.id);
      if (!staffFor(actor, c) && user.id !== c.userId) throw forbidden();
      return storage.getChatMessages(c.id);
    },
  });

  route(app, {
    method: "post", path: "/api/complaints/:id/chat", auth: "user", permission: "complaints.chat_write",
    middleware: [writeLimiter],
    params: idParams, query: none, body: z.object({ message: z.string().trim().min(1).max(1000) }),
    handler: ({ actor, params, body, user, res }) => {
      const c = mustComplaint(params.id);
      const staff = staffFor(actor, c);
      if (!staff && user.id !== c.userId) throw forbidden();
      res.status(201);
      return storage.addChatMessage(c.id, body.message, staff ? `${user.name} (Officer)` : user.name, staff ? "officer" : "citizen");
    },
  });

  route(app, {
    method: "get", path: "/api/complaints/:id/audit", auth: "user", permission: "complaints.audit_read",
    params: idParams, query: none, body: none,
    handler: ({ actor, params, user }) => {
      const c = mustComplaint(params.id);
      if (!staffFor(actor, c) && user.id !== c.userId) throw forbidden();
      return storage.getAuditLogs(c.id);
    },
  });

  // ── Worker (temporary PIN, no account) ─────────────────────────────────────
  route(app, {
    method: "post", path: "/api/auth/worker-login", auth: "public", permission: "worker.pin_login",
    middleware: [authLimiter, phoneLimiter],
    params: none, query: none,
    body: z.object({ phone: phone10, pin: z.string().regex(/^\d{6}$/), complaintId: z.string().min(1).max(100) }),
    handler: ({ body }) => {
      if (!storage.verifyWorkerPin(body.phone, body.pin, body.complaintId)) throw unauthorized("Invalid credentials or expired. Contact your department.");
      const c = mustComplaint(body.complaintId);
      return {
        success: true, complaintId: c.id, workerName: c.assignedWorkerName,
        complaint: { id: c.id, ticketId: c.ticketId, category: c.category, description: c.description, location: c.location, geo: c.geo, status: c.status, state: c.state, priority: c.priority, beforePhoto: c.beforePhoto },
      };
    },
  });

  route(app, {
    method: "put", path: "/api/complaints/:id/proof", auth: "public", permission: "worker.submit_proof",
    middleware: [authLimiter, phoneLimiter],
    params: idParams, query: none,
    body: z.object({ phone: phone10, pin: z.string().regex(/^\d{6}$/), proofPhoto: z.string().min(16).max(22 * 1024 * 1024), proofNote: text(1000).optional() }),
    handler: ({ params, body }) => {
      if (!storage.verifyWorkerPin(body.phone, body.pin, params.id)) throw unauthorized("Invalid worker credentials");
      const c = mustComplaint(params.id);
      const url = resolveImage(body.proofPhoto, `worker:${c.id}`, { proofFor: c })!;
      domain(() => storage.submitProof(c.id, { photoUrl: url, note: body.proofNote }, "worker", `worker:${c.assignedWorkerName ?? "unknown"}`));
      storage.addAuditLog("proof_submitted", "worker", c.assignedWorkerName || "worker", `Proof submitted for ${c.ticketId}`, c.id);
      notifyOwner(c);
      emitDept("complaint_resolved_proof", c);
      return { success: true, complaintId: c.id, ticketId: c.ticketId, status: c.status, state: c.state };
    },
  });

  // ── Admin ──────────────────────────────────────────────────────────────────
  route(app, {
    method: "get", path: "/api/admin/complaints", auth: "admin", permission: "complaints.admin_list",
    params: none,
    query: z.object({ status: z.string().max(30).optional(), priority: z.enum(PRIORITIES).optional(), ward: z.coerce.number().int().optional(), state: z.string().max(30).optional() }),
    body: none,
    handler: ({ actor, query }) => {
      let list = storage.getComplaints(scopeDistrict(actor));
      if (query.status) list = list.filter(c => c.status === query.status);
      if (query.state) list = list.filter(c => c.state === query.state);
      if (query.priority) list = list.filter(c => c.priority === query.priority);
      if (query.ward !== undefined) list = list.filter(c => c.wardNumber === query.ward);
      return list.map(toStaffComplaint);
    },
  });

  route(app, {
    method: "put", path: "/api/admin/complaints/:id", auth: "admin", permission: "complaints.officer_update",
    params: idParams, query: none, body: officerUpdate,
    handler: ({ actor, params, body, user }) => {
      const c = mustComplaint(params.id);
      if (!staffFor(actor, c)) throw forbidden("This complaint is outside your district");
      return toStaffComplaint(applyOfficerUpdate(c, body, user.id, user.name));
    },
  });

  route(app, {
    method: "put", path: "/api/admin/complaints/:id/review", auth: "admin", permission: "complaints.review",
    params: idParams, query: none, body: z.object({ decision: z.enum(["verify", "reopen"]), note: text(1000).optional() }),
    handler: ({ actor, params, body, user }) => {
      const c = mustComplaint(params.id);
      if (!staffFor(actor, c)) throw forbidden("This complaint is outside your district");
      domain(() => storage.reviewDecision(c.id, body.decision, user.id, body.note));
      storage.addAuditLog("review_decision", user.id, user.name, `${c.ticketId}: ${body.decision}`, c.id);
      notifyOwner(c);
      return toStaffComplaint(c);
    },
  });

  // ── Department portal ──────────────────────────────────────────────────────
  route(app, {
    method: "put", path: "/api/dept/complaints/:id", auth: "dept", permission: "complaints.officer_update",
    params: idParams, query: none, body: officerUpdate,
    handler: ({ actor, params, body }) => {
      const c = mustComplaint(params.id);
      if (!staffFor(actor, c)) throw forbidden("This complaint belongs to another department");
      return toStaffComplaint(applyOfficerUpdate(c, body, `dept:${actor.deptId}`, `dept:${actor.deptId}`));
    },
  });

  route(app, {
    method: "put", path: "/api/dept/complaints/:id/assign-worker", auth: "dept", permission: "complaints.assign_worker",
    params: idParams, query: none,
    body: z.object({ workerName: z.string().trim().min(2).max(80), workerPhone: phone10 }),
    handler: ({ actor, params, body }) => {
      const c = mustComplaint(params.id);
      if (!staffFor(actor, c)) throw forbidden("This complaint belongs to another department");
      const pin = domain(() => storage.assignWorkerToComplaint(c.id, body.workerName, body.workerPhone, `dept:${actor.deptId}`));
      storage.addAuditLog("worker_assigned", `dept:${actor.deptId}`, `dept:${actor.deptId}`, `Worker assigned to ${c.ticketId}`, c.id);
      emitDept("worker_assigned", c);
      notifyOwner(c);
      // The PIN is returned exactly once to the assigning department and is never stored in plain text.
      return { success: true, pin, complaint: toStaffComplaint(c), credentials: { phone: body.workerPhone, pin, complaintId: c.id, validFor: "48 hours" } };
    },
  });
}
