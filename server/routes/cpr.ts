import type { Express } from "express";
import { z } from "zod";
import { storage, cprEmitter, type SafetyIncident } from "../storage";
import { route, none, idParams, type Actor } from "../lib/route";
import { forbidden, notFound, unauthorized } from "../lib/errors";
import { writeLimiter } from "./limits";
import { district, geo, text } from "./common";
import { toPublicVan } from "./dto";
import { DISTRICT_NAMES } from "../data/reference";

/**
 * CPR / PCR Safety Command (audit C2). All operational routes require a police/USDMA
 * department token or an admin account. Admin users are scoped to their district.
 */
function districtScope(actor: Actor, requested?: string): string | undefined {
  if (actor.user && actor.user.role === "admin") return actor.user.district;
  return requested;
}

const sse = (res: import("express").Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
};

export function registerCprRoutes(app: Express) {
  // Citizens may see patrol coverage in their district — without officer phone numbers.
  route(app, {
    method: "get", path: "/api/cpr/patrols", auth: "optional", permission: "cpr.patrols_read",
    params: none, query: z.object({ district: district.optional() }), body: none,
    handler: ({ query, actor }) => {
      if (actor.deptId === "police" || actor.deptId === "usdma") return storage.getPatrolVans(query.district);
      if (!actor.user) throw unauthorized();
      const user = actor.user;
      const staff = user.role === "admin" || user.role === "super_admin";
      const d = user.role === "super_admin" ? query.district : user.district;
      const vans = storage.getPatrolVans(d);
      return staff ? vans : vans.map(toPublicVan);
    },
  });

  route(app, {
    method: "get", path: "/api/cpr/command/patrols", auth: "police", permission: "cpr.command_read",
    params: none, query: z.object({ district: district.optional() }), body: none,
    handler: ({ actor, query }) => storage.getPatrolVans(districtScope(actor, query.district)),
  });

  route(app, {
    method: "get", path: "/api/cpr/incidents", auth: "police", permission: "cpr.command_read",
    params: none, query: z.object({ district: district.optional() }), body: none,
    handler: ({ actor, query }) => storage.getSafetyIncidents(districtScope(actor, query.district)),
  });

  route(app, {
    method: "post", path: "/api/cpr/incidents", auth: "police", permission: "cpr.incident_create",
    params: none, query: none,
    body: z.object({ citizenName: z.string().trim().min(1).max(80), district: z.enum(DISTRICT_NAMES as [string, ...string[]]), location: z.string().trim().min(2).max(300), lat: z.number().optional(), lng: z.number().optional() }),
    handler: ({ actor, body, res }) => {
      const d = districtScope(actor, body.district) ?? body.district;
      const c = storage.getDistrictCenter(d);
      res.status(201);
      return storage.createSafetyIncident({ citizenName: body.citizenName, district: d, location: body.location, lat: body.lat ?? c.lat, lng: body.lng ?? c.lng });
    },
  });

  route(app, {
    method: "put", path: "/api/cpr/incidents/:id/update", auth: "police", permission: "cpr.incident_update",
    params: idParams, query: none,
    body: z.object({ status: z.enum(["active", "patrol_dispatched", "police_responding", "safe", "closed"]), message: text(500).optional() }).passthrough(),
    handler: ({ actor, params, body }) => {
      const inc = storage.getSafetyIncidents().find(i => i.id === params.id);
      if (!inc) throw notFound("Incident not found");
      if (actor.user?.role === "admin" && actor.user.district !== inc.district) throw forbidden("Incident is outside your district");
      const who = actor.user ? `${actor.user.name}` : `dept:${actor.deptId}`;
      const updated = storage.updateIncidentStatus(inc.id, body.status as SafetyIncident["status"], body.message || "Status updated", who)!;
      storage.addAuditLog("cpr_incident_update", actor.user?.id ?? `dept:${actor.deptId}`, who, `Incident ${inc.id.slice(0, 8)} → ${body.status}`);
      return updated;
    },
  });

  route(app, {
    method: "put", path: "/api/cpr/patrols/:id/location", auth: "police", permission: "cpr.patrol_location",
    params: idParams, query: none, body: geo,
    handler: ({ actor, params, body }) => {
      const existing = storage.getPatrolVans().find(v => v.id === params.id);
      if (!existing) throw notFound("Patrol van not found");
      if (actor.user?.role === "admin" && actor.user.district !== existing.district) throw forbidden("Patrol van is outside your district");
      const van = storage.updatePatrolLocation(params.id, body);
      if (!van) throw notFound("Patrol van not found");
      return van;
    },
  });

  route(app, {
    method: "get", path: "/api/cpr/leaderboard", auth: "police", permission: "cpr.command_read",
    params: none, query: none, body: none,
    handler: () => {
      const incidents = storage.getSafetyIncidents();
      const board = storage.getPatrolVans().map(van => {
        const mine = incidents.filter(i => i.assignedPatrolVan === van.vanNumber);
        const resolved = mine.filter(i => i.status === "safe" || i.status === "closed").length;
        const rate = mine.length ? Math.round((resolved / mine.length) * 100) : 0;
        return { id: van.id, officerName: van.officerInCharge, vanNumber: van.vanNumber, district: van.district, zone: van.zone,
          isWomenSafetyUnit: van.isWomenSafetyUnit, status: van.status, shift: van.shift, crewCount: van.crewCount,
          incidentsTotal: mine.length, incidentsResolved: resolved, resolutionRate: rate, n: mine.length, rank: 0 };
      }).sort((a, b) => b.incidentsResolved - a.incidentsResolved || b.resolutionRate - a.resolutionRate);
      board.forEach((o, i) => { o.rank = i + 1; });
      return board;
    },
  });

  route(app, {
    method: "post", path: "/api/cpr/user-request", auth: "user", permission: "cpr.citizen_request",
    params: none, query: none,
    body: z.object({ location: z.string().trim().min(2).max(300), lat: z.number().optional(), lng: z.number().optional(), reason: text(500).optional() }),
    handler: ({ body, user, res }) => {
      const c = storage.getDistrictCenter(user.district);
      const incident = storage.createSafetyIncident({ citizenName: user.name, district: user.district, location: body.location, lat: body.lat ?? c.lat, lng: body.lng ?? c.lng });
      res.status(201);
      return { success: true, incidentId: incident.id, status: incident.status, message: incident.assignedPatrolVan ? "Help requested. A patrol unit has been notified." : "Help requested. The control room has been notified." };
    },
  });

  route(app, {
    method: "get", path: "/api/cpr/night-safety", auth: "optional", permission: "cpr.night_safety_read",
    params: none, query: none, body: none,
    handler: ({ actor }) => {
      const zones = storage.getNightSafetyZones().map(z => ({ ...z, reporterName: undefined }));
      if (actor.deptId === "police" || actor.deptId === "usdma") return zones;
      if (!actor.user) throw unauthorized();
      const u = actor.user;
      return zones.filter(z => u.role === "super_admin" || z.district === u.district);
    },
  });

  route(app, {
    method: "post", path: "/api/cpr/night-safety", auth: "user", permission: "cpr.night_safety_report",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ location: z.string().trim().min(2).max(300), description: text(1000).optional(), riskType: z.enum(["crime", "accident", "harassment", "lighting", "general"]).optional(), geo: geo.nullish() }).passthrough(),
    handler: ({ body, user, res }) => {
      const zone = storage.createNightSafetyZone({ location: body.location, district: user.district, description: body.description || "",
        riskType: body.riskType || "general", geo: body.geo ?? null, reporterName: user.name });
      cprEmitter.emit("event", { type: "night_safety_new", zone, district: user.district });
      res.status(201);
      return { ...zone, reporterName: undefined };
    },
  });

  // Reference data — safe to be public (no personal data).
  route(app, {
    method: "get", path: "/api/cpr/emergency-locations", auth: "public", permission: "public.reference",
    params: none, query: none, body: none,
    handler: () => storage.getEmergencyServices().filter(s => s.type === "hospital" || s.type === "fire").map(s => ({
      id: s.id, type: s.type, name: s.name, district: s.district, address: s.address, phone: s.phone, beds: s.beds, available: s.available, lat: s.geo.lat, lng: s.geo.lng,
    })),
  });

  route(app, {
    method: "get", path: "/api/cpr/emergency-services", auth: "public", permission: "public.reference",
    params: none, query: none, body: none,
    handler: () => [
      { id: "police", name: "Uttarakhand Police", type: "police", icon: "🚔", helpline: "100", helpline2: "112", description: "Police Emergency", color: "#3B82F6" },
      { id: "fire", name: "Fire Brigade", type: "fire", icon: "🔥", helpline: "101", helpline2: "112", description: "Fire & Rescue", color: "#EF4444" },
      { id: "ambulance", name: "Ambulance (108)", type: "medical", icon: "🚑", helpline: "108", helpline2: "104", description: "Medical Emergency", color: "#10B981" },
      { id: "women", name: "Women Helpline", type: "women", icon: "🛡️", helpline: "1090", helpline2: "181", description: "Women Safety & Support", color: "#8B5CF6" },
      { id: "disaster", name: "USDMA Disaster", type: "disaster", icon: "🆘", helpline: "1070", helpline2: "112", description: "Disaster Management", color: "#DC2626" },
      { id: "child", name: "Child Helpline", type: "child", icon: "👶", helpline: "1098", helpline2: "112", description: "Child Safety & Support", color: "#F97316" },
    ],
  });

  // SSE command feed — EventSource cannot send headers, so `?token=` is accepted here.
  route(app, {
    method: "get", path: "/api/cpr/stream", auth: "police", permission: "cpr.command_stream",
    allowQueryToken: true,
    params: none, query: none, body: none,
    handler: ({ actor, req, res }) => {
      const scoped = actor.user?.role === "admin" ? actor.user.district : undefined;
      sse(res);
      const hb = setInterval(() => res.write(`: ping\n\n`), 25_000);
      const listener = (ev: { district?: string; incident?: { district?: string }; alert?: { district?: string } }) => {
        const d = ev.district ?? ev.incident?.district ?? ev.alert?.district;
        if (scoped && d && d !== scoped) return;
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      };
      cprEmitter.on("event", listener);
      req.on("close", () => { clearInterval(hb); cprEmitter.off("event", listener); });
      res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
      return undefined;
    },
  });
}
