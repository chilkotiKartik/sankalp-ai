import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import { route, none, idParams, type Actor } from "../lib/route";
import { forbidden, notFound, AppError } from "../lib/errors";
import { tenant } from "../tenancy";
import { isStateWide } from "../data/reference";
import { isStateUser } from "../auth/roles";
import { publishEmergencyBroadcast } from "../realtime";
import { maskPII } from "../ai/pii";
import { geo, text, tenantDistrict } from "./common";
import { writeLimiter } from "./limits";
import type { DisasterReport, MissingPerson, ReliefCamp } from "../types";

/**
 * P6.5 disaster mode. Turned on by config (`features.disasterMode`) or at runtime by the state / disaster authority.
 *  - Citizens report road blocks, landslides, floods, damaged bridges. Only VERIFIED reports are public.
 *  - Disaster staff manage relief camps and send area broadcasts.
 *  - Missing persons: shown publicly while missing (DPDP Act s.7 — emergency), without the reporter's identity;
 *    removed from the public list when found or withdrawn. Free text is PII-masked (no phone numbers in public).
 *  - /web/disaster: a server-rendered page under 30 KB with no JavaScript, for 2G and feature-phone browsers.
 */
export function disasterActive(district?: string): boolean {
  const m = storage.s.disasterMode;
  if (tenant().features.disasterMode) return true;
  if (!m?.active) return false;
  return !district || !m.districts?.length || m.districts.includes(district);
}

/** District the actor may manage, or undefined for state-wide. */
function manageScope(actor: Actor): string | undefined {
  if (actor.deptId === "usdma" && !actor.user) return undefined;
  const u = actor.user!;
  return isStateUser(u) || isStateWide(u.district) ? undefined : u.district;
}
const inScope = (actor: Actor, district: string) => { const d = manageScope(actor); return !d || d === district; };
/** Review P6-4: management routes take a disaster user OR a USDMA department session (no user). */
function requireManager(actor: Actor) {
  if (!actor.user && actor.deptId !== "usdma") throw new AppError(401, "UNAUTHORIZED", "Sign in as disaster staff");
}
const who = (actor: Actor) => actor.user?.id ?? `dept:${actor.deptId}`;

const publicReport = (r: DisasterReport) => ({ id: r.id, kind: r.kind, district: r.district, geo: r.geo, description: r.description, reportedAt: r.reportedAt, status: r.status, verifiedAt: r.verifiedAt });
const publicMissing = (m: MissingPerson) => ({ id: m.id, name: m.name, age: m.age, gender: m.gender, description: m.description, lastSeenArea: m.lastSeenArea, district: m.district, lastSeenAt: m.lastSeenAt, reportedAt: m.reportedAt });

export function registerDisasterRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/disaster/status", auth: "public", permission: "disaster.read",
    params: none, query: none, body: none,
    handler: () => ({ active: disasterActive(), since: storage.s.disasterMode?.since ?? null, districts: storage.s.disasterMode?.districts ?? [], byConfig: tenant().features.disasterMode }),
  });

  route(app, {
    method: "put", path: "/api/disaster/mode", auth: "user", permission: "disaster.mode",
    params: none, query: none, body: z.object({ active: z.boolean(), districts: z.array(tenantDistrict).max(50).optional() }),
    handler: ({ body, user, actor }) => {
      const own = manageScope(actor); // undefined = state-wide authority
      const cur = storage.s.disasterMode ?? { active: false };
      if (!own) {
        storage.s.disasterMode = body.active ? { active: true, since: new Date().toISOString(), by: user.id, districts: body.districts ?? [] } : { active: false };
      } else {
        // Review P6-3: a district authority switches only its own district, never the whole state.
        if (body.districts?.some(d => d !== own)) throw forbidden("You can only change disaster mode for your own district");
        if (cur.active && !cur.districts?.length) {
          if (!body.active) throw forbidden("Disaster mode is on state-wide; only the state authority can turn it off");
        } else {
          const set = new Set(cur.active ? cur.districts ?? [] : []);
          if (body.active) set.add(own); else set.delete(own);
          storage.s.disasterMode = set.size ? { active: true, since: cur.since ?? new Date().toISOString(), by: user.id, districts: [...set] } : { active: false };
        }
      }
      storage.addAuditLog("disaster_mode", user.id, user.name, `Disaster mode ${body.active ? "ON" : "OFF"} (${own ?? (body.districts?.length ? body.districts.join(", ") : "state-wide")})`);
      storage.touch();
      return { active: disasterActive(), districts: storage.s.disasterMode.districts ?? [] };
    },
  });

  // ── road blocks / landslides ──
  route(app, {
    method: "post", path: "/api/disaster/reports", auth: "user", permission: "disaster.report",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ kind: z.enum(["road_block", "landslide", "flood", "bridge_damage", "other"]), geo, description: text(500), district: tenantDistrict.optional() }),
    handler: ({ body, user, res }) => {
      const district = body.district ?? user.district;
      if (!disasterActive(district)) throw new AppError(409, "DISASTER_MODE_OFF", "Disaster reporting is not active in this district");
      const r: DisasterReport = { id: randomUUID(), reporterId: user.id, kind: body.kind, district, geo: body.geo, description: maskPII(body.description), reportedAt: new Date().toISOString(), status: "unverified" };
      storage.s.disasterReports.unshift(r);
      storage.s.disasterReports = storage.s.disasterReports.slice(0, 5000);
      storage.touch();
      res.status(201);
      return { id: r.id, status: r.status, message: "Thank you. Disaster staff will verify this report before it is shown publicly." };
    },
  });

  route(app, {
    method: "get", path: "/api/disaster/reports", auth: "public", permission: "disaster.read",
    params: none, query: z.object({ district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => storage.s.disasterReports.filter(r => r.status === "verified" && (!query.district || r.district === query.district)).map(publicReport),
  });

  route(app, {
    method: "get", path: "/api/disaster/reports/queue", auth: "optional", permission: "disaster.manage",
    params: none, query: none, body: none,
    handler: ({ actor }) => { requireManager(actor); return storage.s.disasterReports.filter(r => inScope(actor, r.district)).map(publicReport); },
  });

  route(app, {
    method: "put", path: "/api/disaster/reports/:id", auth: "optional", permission: "disaster.manage",
    params: idParams, query: none, body: z.object({ status: z.enum(["verified", "cleared", "rejected"]) }),
    handler: ({ actor, params, body }) => {
      requireManager(actor);
      const r = storage.s.disasterReports.find(x => x.id === params.id);
      if (!r) throw notFound();
      if (!inScope(actor, r.district)) throw forbidden("Outside your district");
      r.status = body.status; r.verifiedBy = who(actor); r.verifiedAt = new Date().toISOString();
      storage.addAuditLog("disaster_report_reviewed", who(actor), actor.user?.name ?? who(actor), `${r.kind} in ${r.district} → ${body.status}`);
      storage.touch();
      return publicReport(r);
    },
  });

  // ── relief camps ──
  const campBody = z.object({
    name: text(120), district: tenantDistrict, geo, capacity: z.number().int().min(0).max(100000), occupancy: z.number().int().min(0).max(100000),
    facilities: z.array(z.enum(["food", "water", "medical", "shelter", "toilets", "power", "women_safe_space", "child_care"])).max(8), officialPhone: z.string().regex(/^[0-9 +-]{3,15}$/).optional(), open: z.boolean().default(true),
  });
  route(app, {
    method: "get", path: "/api/disaster/camps", auth: "public", permission: "disaster.read",
    params: none, query: z.object({ district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => storage.s.reliefCamps.filter(c => c.open && (!query.district || c.district === query.district)),
  });
  route(app, {
    method: "post", path: "/api/disaster/camps", auth: "optional", permission: "disaster.manage",
    params: none, query: none, body: campBody,
    handler: ({ actor, body, res }) => {
      requireManager(actor);
      if (!inScope(actor, body.district)) throw forbidden("Outside your district");
      const c: ReliefCamp = { ...body, id: randomUUID(), updatedAt: new Date().toISOString(), updatedBy: who(actor) };
      storage.s.reliefCamps.push(c);
      storage.addAuditLog("relief_camp_created", who(actor), actor.user?.name ?? who(actor), `${c.name} (${c.district})`);
      storage.touch();
      res.status(201);
      return c;
    },
  });
  route(app, {
    method: "put", path: "/api/disaster/camps/:id", auth: "optional", permission: "disaster.manage",
    params: idParams, query: none, body: campBody.partial(),
    handler: ({ actor, params, body }) => {
      requireManager(actor);
      const c = storage.s.reliefCamps.find(x => x.id === params.id);
      if (!c) throw notFound();
      if (!inScope(actor, c.district) || (body.district && !inScope(actor, body.district))) throw forbidden("Outside your district");
      Object.assign(c, body, { updatedAt: new Date().toISOString(), updatedBy: who(actor) });
      storage.touch();
      return c;
    },
  });

  // ── area broadcast ──
  route(app, {
    method: "post", path: "/api/disaster/broadcast", auth: "optional", permission: "disaster.manage",
    middleware: [writeLimiter],
    params: none, query: none, body: z.object({ message: text(500), severity: z.enum(["info", "warning", "critical"]).default("warning") }),
    handler: ({ body, actor }) => {
      requireManager(actor);
      const message = maskPII(body.message);
      // A USDMA department session broadcasts state-wide; a district authority to its district.
      const sender = actor.user ?? ({ id: "dept:usdma", name: "USDMA", role: "state_admin", district: tenant().stateLabel } as unknown as Parameters<typeof publishEmergencyBroadcast>[0]);
      publishEmergencyBroadcast(sender, message, body.severity);
      storage.addAuditLog("disaster_broadcast", who(actor), actor.user?.name ?? "USDMA", `Broadcast (${body.severity}) to ${manageScope(actor) ?? "all districts"}`);
      return { sent: true };
    },
  });

  // ── missing persons ──
  route(app, {
    method: "post", path: "/api/disaster/missing", auth: "user", permission: "disaster.missing_report",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ name: text(80), age: z.number().int().min(0).max(120).optional(), gender: z.enum(["female", "male", "other"]).optional(), description: text(500), lastSeenArea: text(200), district: tenantDistrict, lastSeenAt: z.string().datetime().optional() }),
    handler: ({ body, user, res }) => {
      if (!disasterActive(body.district)) throw new AppError(409, "DISASTER_MODE_OFF", "Missing-person reports open when disaster mode is active. Otherwise contact the police (112).");
      // Review P6-8: at most 10 open reports per person; everything is masked; staff publish after a check.
      const open = storage.s.missingPersons.filter(x => x.reporterId === user.id && (x.status === "missing" || x.status === "pending_review")).length;
      if (open >= 10) throw new AppError(429, "TOO_MANY_REPORTS", "You already have 10 open reports");
      const staffReporter = ["disaster_authority", "police", "district_admin", "admin", "state_admin", "super_admin"].includes(user.role);
      const m: MissingPerson = { ...body, name: maskPII(body.name), description: maskPII(body.description), lastSeenArea: maskPII(body.lastSeenArea), id: randomUUID(), reporterId: user.id,
        status: staffReporter ? "missing" : "pending_review", reportedAt: new Date().toISOString() };
      storage.s.missingPersons.unshift(m);
      storage.addAuditLog("missing_person_reported", user.id, "citizen", `Missing person report in ${m.district}`);
      storage.touch();
      res.status(201);
      return { id: m.id, status: m.status, message: m.status === "pending_review" ? "Disaster staff will check this report and publish it." : undefined };
    },
  });
  route(app, {
    method: "get", path: "/api/disaster/missing/queue", auth: "optional", permission: "disaster.manage",
    params: none, query: none, body: none,
    handler: ({ actor }) => { requireManager(actor); return storage.s.missingPersons.filter(m => m.status === "pending_review" && inScope(actor, m.district)).map(publicMissing); },
  });
  route(app, {
    method: "put", path: "/api/disaster/missing/:id/review", auth: "optional", permission: "disaster.manage",
    params: idParams, query: none, body: z.object({ decision: z.enum(["publish", "reject"]) }),
    handler: ({ actor, params, body }) => {
      requireManager(actor);
      const m = storage.s.missingPersons.find(x => x.id === params.id);
      if (!m) throw notFound();
      if (!inScope(actor, m.district)) throw forbidden("Outside your district");
      m.status = body.decision === "publish" ? "missing" : "withdrawn";
      storage.addAuditLog("missing_person_reviewed", who(actor), actor.user?.name ?? who(actor), `Missing person report → ${m.status}`);
      storage.touch();
      return { id: m.id, status: m.status };
    },
  });
  route(app, {
    method: "get", path: "/api/disaster/missing", auth: "public", permission: "disaster.read",
    params: none, query: z.object({ district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => storage.s.missingPersons.filter(m => m.status === "missing" && (!query.district || m.district === query.district)).map(publicMissing),
  });
  route(app, {
    method: "put", path: "/api/disaster/missing/:id", auth: "user", permission: "disaster.missing_report",
    params: idParams, query: none, body: z.object({ status: z.enum(["found", "withdrawn"]) }),
    handler: ({ actor, params, body, user }) => {
      const m = storage.s.missingPersons.find(x => x.id === params.id);
      if (!m) throw notFound();
      const staff = ["disaster_authority", "district_admin", "admin", "state_admin", "super_admin", "police"].includes(user.role) && inScope(actor, m.district);
      if (m.reporterId !== user.id && !staff) throw forbidden("Only the reporter or disaster staff can update this");
      m.status = body.status; m.closedAt = new Date().toISOString();
      storage.addAuditLog("missing_person_closed", user.id, user.name, `Missing person report → ${body.status}`);
      storage.touch();
      return { id: m.id, status: m.status };
    },
  });

  // ── low-bandwidth page ──
  route(app, {
    method: "get", path: "/web/disaster", auth: "public", permission: "disaster.read",
    params: none, query: z.object({ district: z.string().max(60).optional() }), body: none,
    handler: ({ query, res }) => {
      const d = query.district;
      const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const camps = storage.s.reliefCamps.filter(c => c.open && (!d || c.district === d));
      const roads = storage.s.disasterReports.filter(r => r.status === "verified" && (!d || r.district === d)).slice(0, 50);
      const missing = storage.s.missingPersons.filter(m => m.status === "missing" && (!d || m.district === d)).slice(0, 50);
      const help = tenant().emergencyServices.filter(s => s.type === "disaster" || s.type === "ambulance").slice(0, 8);
      const list = (items: string[], empty: string) => (items.length ? `<ul>${items.join("")}</ul>` : `<p>${empty}</p>`);
      res.setHeader("Cache-Control", "public, max-age=60");
      res.setHeader("Vary", "X-Tenant, Host"); // review P6-10: never serve one state's page to another
      res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(tenant().stateLabel)} — disaster information</title>
<style>body{font:15px system-ui,sans-serif;margin:0 auto;max-width:720px;padding:12px;color:#111}h1{font-size:19px}h2{font-size:16px;border-bottom:2px solid #B91C1C;padding-bottom:2px}li{margin:6px 0}a.t{font-weight:700;color:#B91C1C}small{color:#374151}form{margin:8px 0}</style></head><body>
<h1>${esc(tenant().stateLabel)}: disaster information${d ? ` — ${esc(d)}` : ""}</h1>
<p><strong>${disasterActive(d) ? "⚠️ Disaster mode is ACTIVE." : "No disaster alert is active."}</strong> Emergency: <a class="t" href="tel:112">112</a> · Disaster: <a class="t" href="tel:1070">1070</a> · Ambulance: <a class="t" href="tel:108">108</a></p>
<form method="get"><label>District <select name="district"><option value="">All</option>${tenant().districts.map(x => `<option${x.district === d ? " selected" : ""}>${esc(x.district)}</option>`).join("")}</select></label> <button>Show</button></form>
<h2>Relief camps</h2>${list(camps.map(c => `<li><strong>${esc(c.name)}</strong> (${esc(c.district)}) — ${c.occupancy}/${c.capacity} people · ${esc(c.facilities.join(", "))}${c.officialPhone ? ` · <a href="tel:${esc(c.officialPhone)}">${esc(c.officialPhone)}</a>` : ""}</li>`), "No relief camps listed.")}
<h2>Verified road blocks &amp; landslides</h2>${list(roads.map(r => `<li><strong>${esc(r.kind.replace("_", " "))}</strong> (${esc(r.district)}): ${esc(r.description)} <small>verified ${esc(new Date(r.verifiedAt ?? r.reportedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))}</small></li>`), "No verified reports.")}
<h2>Missing persons</h2>${list(missing.map(m => `<li><strong>${esc(m.name)}</strong>${m.age !== undefined ? `, ${m.age}` : ""} — last seen ${esc(m.lastSeenArea)} (${esc(m.district)}). ${esc(m.description)}</li>`), "No open reports.")}
<p><small>If you have seen a missing person, call 112. Reporter details are never shown here.</small></p>
<h2>Helplines</h2>${list(help.map(h => `<li>${esc(h.name)} (${esc(h.district)}): <a href="tel:${esc(h.phone)}">${esc(h.phone)}</a></li>`), "Call 112.")}
<p><small>Updated ${esc(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST · works without JavaScript on any phone browser.</small></p></body></html>`);
      return undefined;
    },
  });
}
