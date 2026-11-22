import { openSse, sseKey } from "../lib/sse";
import { isSameIstDay } from "../lib/time";
import { currentTenantId } from "../tenancy";
import type { Express } from "express";
import { z } from "zod";
import { storage, DEPARTMENTS, getDeptIdForCategory, deptEmitter } from "../storage";
import { route, none } from "../lib/route";
import { forbidden, notFound } from "../lib/errors";
import { toStaffComplaint, toPublicWorker } from "./dto";

const deptParams = z.object({ deptId: z.string().min(2).max(20) });

/** Department portal (scoped strictly to the token's department — audit C7). */
export function registerDeptRoutes(app: Express) {
  const mine = (deptId: string) => storage.getComplaints().filter(c => getDeptIdForCategory(c.category) === deptId);
  const check = (tokenDept: string | undefined, pathDept: string) => {
    if (tokenDept !== pathDept) throw forbidden("Access denied");
  };

  route(app, {
    method: "get", path: "/api/dept/list", auth: "public", permission: "public.reference",
    params: none, query: none, body: none,
    handler: () => Object.values(DEPARTMENTS),
  });

  route(app, {
    method: "get", path: "/api/dept/:deptId/complaints", auth: "dept", permission: "dept.complaints_read",
    // P7.3 (D-046): newest first, 500 per page by default (max 2000). `cursor` (from `nextCursor`) is a compound
    // (submittedAt, id) key, so complaints that share a timestamp are never skipped (review P7-7).
    params: deptParams,
    query: z.object({ limit: z.coerce.number().int().min(1).max(2000).default(500), cursor: z.string().max(200).optional(), open: z.enum(["1", "0"]).optional() }),
    body: none,
    handler: ({ actor, params, query }) => {
      check(actor.deptId, params.deptId);
      let all = mine(params.deptId);
      if (query.open === "1") all = all.filter(c => !["CLOSED", "AUTO_CLOSED_UNVERIFIED", "CANCELLED_BY_CITIZEN"].includes(c.state));
      const key = (c: { submittedAt: string; id: string }) => `${c.submittedAt}|${c.id}`;
      const sorted = all.slice().sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
      const after = query.cursor ? Buffer.from(query.cursor, "base64url").toString() : null;
      const from = after ? sorted.filter(c => key(c) < after) : sorted;
      const page = from.slice(0, query.limit);
      const list = page.map(c => ({ ...toStaffComplaint(c), departmentId: params.deptId, departmentName: DEPARTMENTS[params.deptId]?.name }));
      const more = from.length > page.length;
      return { complaints: list, total: all.length, hasMore: more, nextCursor: more ? Buffer.from(key(page[page.length - 1])).toString("base64url") : null };
    },
  });

  route(app, {
    method: "get", path: "/api/dept/:deptId/stats", auth: "dept", permission: "dept.stats_read",
    params: deptParams, query: none, body: none,
    handler: ({ actor, params }) => {
      check(actor.deptId, params.deptId);
      const m = mine(params.deptId);
      const t = Date.now();
      return {
        total: m.length,
        pending: m.filter(c => c.status === "pending").length,
        inProgress: m.filter(c => c.status === "in_progress").length,
        awaitingCitizen: m.filter(c => c.status === "resolved").length,
        resolved: m.filter(c => c.state === "CLOSED").length,
        p1Critical: m.filter(c => c.priority === "P1").length,
        todayCount: m.filter(c => isSameIstDay(c.submittedAt, t)).length, // IST calendar day (m9)
        weekCount: m.filter(c => t - new Date(c.submittedAt).getTime() < 7 * 86400000).length,
      };
    },
  });

  route(app, {
    method: "get", path: "/api/dept/:deptId/workers", auth: "dept", permission: "dept.workers_read",
    params: deptParams, query: none, body: none,
    handler: ({ actor, params }) => {
      check(actor.deptId, params.deptId);
      return storage.getWorkers().slice(0, 50).map(toPublicWorker);
    },
  });

  route(app, {
    method: "get", path: "/api/dept/:deptId/announcements", auth: "dept", permission: "dept.announcements_read",
    params: deptParams, query: none, body: none,
    handler: ({ actor, params }) => {
      check(actor.deptId, params.deptId);
      return storage.getAnnouncements().filter(a => !a.department || a.department === params.deptId || a.department === "all").slice(0, 50);
    },
  });

  route(app, {
    method: "post", path: "/api/dept/:deptId/announcements", auth: "dept", permission: "dept.announcements_write",
    params: deptParams, query: none,
    body: z.object({
      title: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(5000),
      type: z.enum(["general", "scheme", "emergency", "welfare", "tender", "holiday"]).optional(),
      priority: z.enum(["normal", "important", "urgent"]).optional(),
      targetDistrict: z.string().max(60).optional(), expiresAt: z.string().max(40).optional(), link: z.string().url().max(500).optional(),
    }),
    handler: ({ actor, params, body, res }) => {
      check(actor.deptId, params.deptId);
      const dept = DEPARTMENTS[params.deptId];
      const ann = storage.createAnnouncement({ title: body.title, body: body.body, type: body.type || "general", priority: body.priority || "normal",
        department: params.deptId, targetDistrict: body.targetDistrict || "all", postedBy: dept?.name || params.deptId, link: body.link, expiresAt: body.expiresAt });
      deptEmitter.emit("event", { type: "announcement_new", departmentId: params.deptId, announcement: ann });
      storage.addAuditLog("announcement_posted", `dept:${params.deptId}`, dept?.name || params.deptId, `Announcement posted: ${body.title}`);
      res.status(201);
      return ann;
    },
  });

  route(app, {
    method: "delete", path: "/api/dept/:deptId/announcements/:annId", auth: "dept", permission: "dept.announcements_write",
    params: z.object({ deptId: z.string().min(2).max(20), annId: z.string().min(1).max(100) }), query: none, body: none,
    handler: ({ actor, params }) => {
      check(actor.deptId, params.deptId);
      const ann = storage.getAnnouncement(params.annId);
      if (!ann) throw notFound("Announcement not found");
      if (ann.department !== params.deptId) throw forbidden("Cannot delete another department's announcement");
      return { success: storage.deleteAnnouncement(ann.id) };
    },
  });

  route(app, {
    method: "get", path: "/api/dept/:deptId/stream", auth: "dept", permission: "dept.stream",
    allowQueryToken: true,
    params: deptParams, query: none, body: none,
    handler: ({ actor, params, req, res }) => {
      check(actor.deptId, params.deptId);
      const deptId = params.deptId;
      const send = openSse(req, res, sseKey(actor));
      const tid = currentTenantId();
      const listener = (ev: { type: string; departmentId?: string; tenantId?: string }) => {
        if (ev.tenantId !== tid) return;
        const own = ev.departmentId === deptId;
        if ((["complaint_new", "complaint_updated", "complaint_resolved_proof", "worker_assigned"].includes(ev.type) && own)
          || (ev.type === "sos_alert" && own)
          || (ev.type === "announcement_new" && (own || ev.departmentId === "all"))) {
          send(ev);
        }
      };
      deptEmitter.on("event", listener);
      req.on("close", () => { deptEmitter.off("event", listener); });
      send({ type: "connected", departmentId: deptId });
      return undefined;
    },
  });

}
