import type { Express } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import { route, none, idParams, scopeDistrict, type Actor } from "../lib/route";
import { forbidden, notFound, AppError } from "../lib/errors";
import { runInTenant, hasTenant, tenant, currentTenantId } from "../tenancy";
import { getDeptIdForCategory } from "../data/reference";
import { readConfirmToken } from "../notify/voice";
import { parseReply } from "../verification/confirm";
import { smsCommand, senderPhone } from "./channels";
import { evaluate } from "../verification";
import { resolutionRates, RRR_DEFINITION } from "../verification/rate";
import { config } from "../config";
import { toStaffComplaint } from "./dto";
import { isDistrictAdmin, isStateUser } from "../auth/roles";
import { writeLimiter, authLimiter, channelLimiter } from "./limits";
import { text, domain } from "./common";
import type { Complaint } from "../types";

/** P3.5–P3.8 routes: confirmation channels, neighbour answers, reviewer queues, Real Resolution Rate. */
const AWAITING = new Set(["VERIFYING", "NEEDS_REVIEW"]);
export const INDEPENDENT_REVIEW = new Set(["reused_photo", "proof_is_before_photo", "proof_far_from_site", "gps_sources_disagree", "photo_taken_before_complaint"]);

function reviewItem(c: Complaint) {
  const v = c.verification ? evaluate(c) : null;
  return { ...toStaffComplaint(c), verification: v };
}

const deptOf = (c: Complaint) => getDeptIdForCategory(c.category);

function canReview(actor: Actor, c: Complaint): boolean {
  if (actor.deptId) return deptOf(c) === actor.deptId;
  const u = actor.user;
  return !!u && (isStateUser(u) || (isDistrictAdmin(u) && u.district === c.district));
}

export function registerVerificationRoutes(app: Express) {
  // ── P3.5 voice callback (IVR provider posts the pressed digit). The signed token binds tenant + complaint. ──
  route(app, {
    method: "post", path: "/api/verification/ivr/:token", auth: "public", permission: "verification.ivr_callback",
    middleware: [authLimiter],
    params: z.object({ token: z.string().min(20).max(400) }), query: none,
    body: z.object({ digit: z.string().max(4) }).passthrough(),
    handler: ({ params, body }) => {
      const t = readConfirmToken(params.token);
      if (!t || !hasTenant(t.tenantId)) throw forbidden("Link expired or invalid");
      return runInTenant(t.tenantId, () => {
        const c = storage.getComplaint(t.complaintId);
        if (!c || !c.userId) throw notFound();
        const answer = body.digit.trim() === "1" ? "yes" : body.digit.trim() === "2" ? "no" : null;
        if (!answer) return { accepted: false, reason: "Press 1 for yes or 2 for no" };
        // Single use per proof round (review P3-4): a stale or replayed token cannot change the answer.
        if (t.round !== (c.proofSubmittedAt ?? "")) return { accepted: false, reason: "This call was about an earlier repair" };
        if (!AWAITING.has(c.state) || c.citizenAnswer) return { accepted: false, reason: "Already answered" };
        domain(() => answer === "yes" ? storage.citizenConfirm(c.id, c.userId!, undefined, undefined, "voice") : storage.citizenReject(c.id, c.userId!, "Said no on the voice callback", "voice"));
        return { accepted: true, state: c.state };
      });
    },
  });

  // ── P3.5 SMS fallback: the SMS gateway forwards replies here. Shared secret, constant-time compare. ──
  route(app, {
    method: "post", path: "/api/verification/sms-inbound", auth: "public", permission: "verification.sms_inbound",
    middleware: [channelLimiter],
    params: none, query: none,
    body: z.object({ from: z.string().max(20), text: z.string().max(500) }).passthrough(),
    handler: async ({ req, body }) => {
      // Review P3-6: a per-state secret (INBOUND_SMS_SECRET_<TENANT>) binds the webhook to one tenant; the global one is a fallback.
      const secret = process.env[`INBOUND_SMS_SECRET_${currentTenantId().toUpperCase()}`] || process.env.INBOUND_SMS_SECRET;
      if (!secret) throw new AppError(503, "SMS_INBOUND_DISABLED", "Inbound SMS is not configured");
      const got = Buffer.from(String(req.headers["x-webhook-secret"] ?? ""));
      const want = Buffer.from(secret);
      if (got.length !== want.length || !timingSafeEqual(got, want)) throw forbidden("Bad webhook secret");
      const phone = senderPhone(body.from);
      if (!phone) return { accepted: false, reason: "not an Indian mobile number" };
      const answer = parseReply(body.text);
      const ids = new Set(storage.s.users.filter(u => u.phone === phone).map(u => u.id));
      const open = storage.getComplaints().filter(c => c.userId && ids.has(c.userId) && AWAITING.has(c.state) && !c.citizenAnswer);
      const ticket = body.text.match(/[A-Z]{2,4}-[0-9A-F]{6,10}/i)?.[0]?.toUpperCase();
      const target = answer ? (ticket ? open.find(c => c.ticketId.toUpperCase() === ticket) : open.length === 1 ? open[0] : undefined) : undefined;
      // Not a 1/2 answer to a pending confirmation → P5.2 SMS commands (SANKALP … / STATUS … / AGREE / HELP).
      if (!target) {
        if (answer && open.length > 1) return { accepted: false, reason: "ambiguous" };
        return { accepted: true, command: await smsCommand(phone, body.text) };
      }
      const uid = target.userId!;
      domain(() => answer === "yes" ? storage.citizenConfirm(target.id, uid, undefined, undefined, "sms") : storage.citizenReject(target.id, uid, "Replied NO by SMS", "sms"));
      return { accepted: true };
    },
  });

  // ── P3.6 neighbour confirmation ──
  route(app, {
    method: "put", path: "/api/me/neighbour-opt-in", auth: "user", permission: "verification.neighbour_optin",
    params: none, query: none, body: z.object({ optIn: z.boolean() }),
    handler: ({ body, user }) => {
      user.neighbourOptIn = body.optIn;
      storage.touch();
      return { neighbourOptIn: body.optIn };
    },
  });

  route(app, {
    method: "post", path: "/api/complaints/:id/neighbour-answer", auth: "user", permission: "verification.neighbour_answer",
    middleware: [writeLimiter],
    params: idParams, query: none, body: z.object({ fixed: z.boolean() }),
    handler: ({ params, body, user }) => {
      const c = storage.getComplaint(params.id);
      if (!c) throw notFound();
      if (!c.neighbourInvites?.includes(user.id)) throw forbidden("You were not asked about this complaint");
      if (!AWAITING.has(c.state)) throw new AppError(409, "NOT_AWAITING", "This complaint is no longer awaiting confirmation");
      c.neighbourAnswers = [...(c.neighbourAnswers ?? []).filter(a => a.userId !== user.id), { userId: user.id, fixed: body.fixed, at: new Date().toISOString() }];
      c.verification = evaluate(c);
      storage.addAuditLog("neighbour_answer", "neighbour", "Neighbour", `${c.ticketId}: a neighbour says ${body.fixed ? "fixed" : "not fixed"}`, c.id);
      storage.touch();
      return { recorded: true };
    },
  });

  // ── P3.7 reviewer queues ──
  route(app, {
    method: "get", path: "/api/admin/review-queue", auth: "admin", permission: "complaints.review", paginate: true,
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getComplaints(scopeDistrict(actor)).filter(c => c.state === "NEEDS_REVIEW").map(reviewItem),
  });

  route(app, {
    method: "get", path: "/api/dept/review-queue", auth: "dept", permission: "dept.review",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getComplaints().filter(c => c.state === "NEEDS_REVIEW" && deptOf(c) === actor.deptId).map(reviewItem),
  });

  route(app, {
    method: "put", path: "/api/dept/complaints/:id/review", auth: "dept", permission: "dept.review",
    params: idParams, query: none, body: z.object({ decision: z.enum(["verify", "reopen"]), note: text(1000).optional() }),
    handler: ({ actor, params, body }) => {
      const c = storage.getComplaint(params.id);
      if (!c) throw notFound();
      if (!canReview(actor, c)) throw forbidden("This complaint belongs to another department");
      // Review P3-5: a department cannot clear fraud-type flags on its own proof — a district/state reviewer must.
      const fraud = (c.verification?.flags ?? []).filter(f => INDEPENDENT_REVIEW.has(f));
      if (body.decision === "verify" && fraud.length && actor.deptId) throw forbidden(`Flags ${fraud.join(", ")} need a district or state reviewer`);
      const who = actor.user?.id ?? `dept:${actor.deptId}`;
      domain(() => storage.reviewDecision(c.id, body.decision, who, body.note));
      storage.addAuditLog("review_decision", who, actor.user?.name ?? who, `${c.ticketId}: ${body.decision}`, c.id);
      return reviewItem(c);
    },
  });

  // ── P3.8 Real Resolution Rate (public) ──
  route(app, {
    method: "get", path: "/api/public/resolution-rate", auth: "public", permission: "public.resolution_rate",
    params: none, query: z.object({ by: z.enum(["department", "ward"]).default("department"), district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => {
      const rows = resolutionRates(query.by, query.district);
      return {
        definition: RRR_DEFINITION,
        by: query.by, state: tenant().name, demo: config().DEMO_MODE, rows,
      };
    },
  });
}
