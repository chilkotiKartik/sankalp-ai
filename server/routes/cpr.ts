import { openSse, sseKey } from "../lib/sse";
import { isAdminUser, isStateUser, isDistrictAdmin } from "../auth/roles";
import { currentTenantId, tenant } from "../tenancy";
import type { Express } from "express";
import { z } from "zod";
import { storage, cprEmitter, type SafetyIncident } from "../storage";
import { route, none, idParams, emergencyDistrict, type Actor } from "../lib/route";
import { forbidden, notFound, unauthorized } from "../lib/errors";
import { writeLimiter } from "./limits";
import { district, geo, text, tenantDistrict } from "./common";
import { toPublicVan } from "./dto";

/**
 * CPR / PCR Safety Command (audit C2). All operational routes require a police/USDMA
 * department token or an admin account. Admin users are scoped to their district.
 */
function districtScope(actor: Actor, requested?: string): string | undefined {
  return emergencyDistrict(actor) ?? requested;
}

export function registerCprRoutes(app: Express) {
  // Citizens may see patrol coverage in their district — without officer phone numbers.
  route(app, {
    method: "get", path: "/api/cpr/patrols", auth: "optional", permission: "cpr.patrols_read",
    params: none, query: z.object({ district: district.optional() }), body: none,
    handler: ({ query, actor }) => {
      if (actor.deptId === "police" || actor.deptId === "usdma") return storage.getPatrolVans(districtScope(actor, query.district));
      if (!actor.user) throw unauthorized();
      const user = actor.user;
      const staff = isAdminUser(user);
      const d = isStateUser(user) ? query.district : user.district;
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
    method: "get", path: "/api/cpr/incidents", auth: "police", permission: "cpr.command_read", paginate: true,
    params: none, query: z.object({ district: district.optional() }), body: none,
    handler: ({ actor, query }) => storage.getSafetyIncidents(districtScope(actor, query.district)),
  });

  route(app, {
    method: "post", path: "/api/cpr/incidents", auth: "police", permission: "cpr.incident_create",
    params: none, query: none,
    body: z.object({ citizenName: z.string().trim().min(1).max(80), district: tenantDistrict, location: z.string().trim().min(2).max(300), lat: z.number().optional(), lng: z.number().optional() }),
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
      if (actor.user && isDistrictAdmin(actor.user) && actor.user.district !== inc.district) throw forbidden("Incident is outside your district");
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
      if (actor.user && isDistrictAdmin(actor.user) && actor.user.district !== existing.district) throw forbidden("Patrol van is outside your district");
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
      const incident = storage.createSafetyIncident({ citizenName: user.name, citizenId: user.id, district: user.district, location: body.location, lat: body.lat ?? c.lat, lng: body.lng ?? c.lng });
      res.status(201);
      return { success: true, incidentId: incident.id, status: incident.status, message: incident.assignedPatrolVan ? "Help requested. A patrol unit has been notified." : "Help requested. The control room has been notified." };
    },
  });

  route(app, {
    method: "get", path: "/api/cpr/night-safety", auth: "optional", permission: "cpr.night_safety_read",
    params: none, query: none, body: none,
    handler: ({ actor }) => {
      const zones = storage.getNightSafetyZones().map(z => ({ ...z, reporterName: undefined }));
      if (actor.deptId === "police" || actor.deptId === "usdma") { const d = emergencyDistrict(actor); return d ? zones.filter(z => z.district === d) : zones; }
      if (!actor.user) throw unauthorized();
      const u = actor.user;
      return zones.filter(z => isStateUser(u) || z.district === u.district);
    },
  });

  route(app, {
    method: "post", path: "/api/cpr/night-safety", auth: "user", permission: "cpr.night_safety_report",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ location: z.string().trim().min(2).max(300), description: text(1000).optional(), riskType: z.enum(["crime", "accident", "harassment", "lighting", "general"]).optional(), geo: geo.nullish() }).passthrough(),
    handler: ({ body, user, res }) => {
      const zone = storage.createNightSafetyZone({ location: body.location, district: user.district, description: body.description || "",
        riskType: body.riskType || "general", geo: body.geo ?? null, reporterName: user.name, reporterId: user.id });
      cprEmitter.emit("event", { type: "night_safety_new", zone, district: user.district });
      res.status(201);
      return { ...zone, reporterName: undefined };
    },
  });

  // Reference data — safe to be public (no personal data).
  route(app, {
    method: "get", path: "/api/cpr/emergency-locations", auth: "public", permission: "public.reference",
    params: none,
    query: z.object({ district: z.string().max(60).optional(), bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional(), limit: z.coerce.number().int().min(1).max(1500).default(800) }),
    body: none,
    handler: ({ query }) => {
      const [s0, w0, n0, e0] = query.bbox ? query.bbox.split(",").map(Number) : [-90, -180, 90, 180];
      return storage.getEmergencyServices()
        .filter(s => s.type === "hospital" || s.type === "fire")
        .filter(s => !query.district || s.district === query.district)
        .filter(s => s.geo.lat >= s0 && s.geo.lat <= n0 && s.geo.lng >= w0 && s.geo.lng <= e0)
        .slice(0, query.limit).map(s => ({
      id: s.id, type: s.type, name: s.name, district: s.district, address: s.address, phone: s.phone, beds: s.beds, available: s.available, lat: s.geo.lat, lng: s.geo.lng,
    }));
    },
  });

  route(app, {
    method: "get", path: "/api/cpr/emergency-services", auth: "public", permission: "public.reference",
    params: none, query: none, body: none,
    handler: () => [
      { id: "police", name: `${tenant().stateLabel} Police`, type: "police", icon: "🚔", helpline: "100", helpline2: "112", description: "Police Emergency", color: "#3B82F6" },
      { id: "fire", name: "Fire Brigade", type: "fire", icon: "🔥", helpline: "101", helpline2: "112", description: "Fire & Rescue", color: "#EF4444" },
      { id: "ambulance", name: "Ambulance (108)", type: "medical", icon: "🚑", helpline: "108", helpline2: "104", description: "Medical Emergency", color: "#10B981" },
      { id: "women", name: "Women Helpline", type: "women", icon: "🛡️", helpline: "181", helpline2: "1091", description: "Women Safety & Support", color: "#8B5CF6" },
      { id: "disaster", name: tenant().departments.usdma?.name ?? "State Disaster Management Authority", type: "disaster", icon: "🆘", helpline: "1070", helpline2: "112", description: "Disaster Management", color: "#DC2626" },
      { id: "child", name: "Child Helpline", type: "child", icon: "👶", helpline: "1098", helpline2: "112", description: "Child Safety & Support", color: "#F97316" },
    ],
  });

  // SSE command feed — EventSource cannot send headers, so `?token=` is accepted here.
  route(app, {
    method: "get", path: "/api/cpr/stream", auth: "police", permission: "cpr.command_stream",
    allowQueryToken: true,
    params: none, query: none, body: none,
    handler: ({ actor, req, res }) => {
      const scoped = emergencyDistrict(actor);
      const send = openSse(req, res, sseKey(actor));
      const tid = currentTenantId();
      const listener = (ev: { tenantId?: string; district?: string; incident?: { district?: string }; alert?: { district?: string } }) => {
        if (ev.tenantId !== tid) return;
        const d = ev.district ?? ev.incident?.district ?? ev.alert?.district;
        if (scoped && d && d !== scoped) return;
        send(ev);
      };
      cprEmitter.on("event", listener);
      req.on("close", () => { cprEmitter.off("event", listener); });
      send({ type: "connected" });
      return undefined;
    },
  });
}
