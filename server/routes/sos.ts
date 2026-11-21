import type { Express } from "express";
import { z } from "zod";
import { storage, cprEmitter, deptEmitter, type SOSAlert, type AppUser } from "../storage";
import { route, none, idParams, scopeDistrict, type Actor } from "../lib/route";
import { forbidden, notFound, unprocessable, unauthorized } from "../lib/errors";
import { sendPush } from "../notify/push";
import { SOS_CATEGORIES, geo, text } from "./common";
import { canAccessEvidence } from "./media";

/**
 * SOS (rule 9: never rate-limited or blocked — duplicates are merged in storage).
 * Victim details go only to district staff, police/USDMA and the victim (audit C1/C2 fix).
 */
const isAdmin = (u?: AppUser) => u?.role === "admin" || u?.role === "super_admin";

function staffForSos(actor: Actor, a: SOSAlert): boolean {
  if (actor.deptId === "police" || actor.deptId === "usdma") return true;
  if (actor.deptId === "forest" && a.category === "forest_fire") return true;
  const u = actor.user;
  return !!u && (u.role === "super_admin" || (u.role === "admin" && u.district === a.district));
}

function mustSos(id: string): SOSAlert {
  const a = storage.getSOSAlert(id);
  if (!a) throw notFound("SOS alert not found");
  return a;
}

function mustOwn(a: SOSAlert, user: AppUser) {
  if (a.userId !== user.id) throw forbidden("You can only update your own SOS");
}

const loc = (g: { lat: number; lng: number }) => `GPS: ${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}`;

function alertStaff(a: SOSAlert, kind: "women_safety_sos" | "forest_fire_sos" | "sos_new") {
  const payload = { type: kind, alert: a, district: a.district, timestamp: new Date().toISOString() };
  cprEmitter.emit("event", { ...payload, type: "sos_new" });
  const depts = a.category === "forest_fire" ? ["forest", "usdma"] : a.category === "women_safety" ? ["police", "usdma"] : ["usdma"];
  for (const departmentId of depts) deptEmitter.emit("event", { type: "sos_alert", departmentId, alert: a, priority: "HIGH" });
  // M17: no name, phone or location in the push body.
  void sendPush(storage.adminPushTokensForDistrict(a.district), { kind: "sos", id: a.id, ref: `SOS-${a.id.slice(0, 6).toUpperCase()}` }, { urgent: true });
}

export function registerSosRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/sos", auth: "optional", permission: "sos.list",
    params: none, query: none, body: none,
    handler: ({ actor }) => {
      if (actor.deptId === "police" || actor.deptId === "usdma") return storage.getSosAlerts();
      if (actor.deptId === "forest") return storage.getSosAlerts().filter(a => a.category === "forest_fire");
      if (actor.deptId) throw forbidden("SOS data is restricted to police, USDMA and forest departments");
      if (!actor.user) throw unauthorized();
      const user = actor.user;
      // Citizens see only their own alerts; staff see their district.
      if (!isAdmin(user)) return storage.getSosAlerts().filter(a => a.userId === user.id);
      return storage.getSosAlerts(scopeDistrict(actor));
    },
  });

  const sosBody = z.object({
    category: z.enum(SOS_CATEGORIES),
    description: text(1000).optional(),
    location: text(300).optional(),
    geo: geo.optional(),
    ward: text(120).optional(),
    wardNumber: z.number().int().min(0).max(10000).optional(),
  }).passthrough();

  route(app, {
    method: "post", path: "/api/sos", auth: "sos", permission: "sos.create",
    params: none, query: none, body: sosBody,
    handler: ({ body, user, res }) => {
      const g = body.geo ?? storage.getDistrictCenter(user.district);
      const near = storage.getNearestPoliceStations(g, 1, user.district)[0];
      const { alert, deduplicated } = storage.createSos({
        category: body.category, description: body.description || "Emergency reported via SANKALP AI",
        location: body.location || loc(g), geo: g, ward: body.ward || `${user.district} Block`, wardNumber: body.wardNumber ?? 1,
        district: user.district, status: "active", triggeredBy: user.name, triggeredByPhone: user.phone,
        nearestPoliceStation: near?.name, policeDistance: near?.distance, isWomenSafety: body.category === "women_safety",
      }, user.id);
      if (!deduplicated) alertStaff(alert, "sos_new");
      res.status(deduplicated ? 200 : 201);
      return { ...alert, deduplicated };
    },
  });

  route(app, {
    method: "post", path: "/api/sos/women-safety", auth: "sos", permission: "sos.create_women_safety",
    params: none, query: none,
    body: z.object({ geo: geo.optional(), location: text(300).optional(), audioUrl: z.string().max(200).optional(), geoApproximate: z.boolean().optional() }).passthrough(),
    handler: ({ body, user, res }) => {
      const g = body.geo ?? storage.getDistrictCenter(user.district);
      const approx = !body.geo || !!body.geoApproximate;
      const stations = storage.getNearestPoliceStations(g, 2, user.district);
      const { alert, deduplicated } = storage.createSos({
        category: "women_safety",
        description: `PANIC SOS — Women Safety Emergency${approx ? " (location approximate — district centre)" : ""}`,
        location: body.location || loc(g), geo: g, ward: user.district, wardNumber: 1, district: user.district,
        status: "active", triggeredBy: user.name, triggeredByPhone: user.phone, isWomenSafety: true,
        nearestPoliceStation: stations[0]?.name, nearestPolicePhone: stations[0]?.phone, policeDistance: stations[0]?.distance,
        notifiedStations: stations.map(s => ({ name: s.name, phone: s.phone, distance: s.distance, address: s.address })),
      }, user.id);
      let cprIncident = undefined;
      if (!deduplicated) {
        alertStaff(alert, "women_safety_sos");
        cprIncident = storage.createSafetyIncident({ citizenName: user.name, district: user.district, location: alert.location, lat: g.lat, lng: g.lng });
        alert.cprRequestId = cprIncident.id;
      }
      res.status(deduplicated ? 200 : 201);
      return { alert, nearestStations: stations, cprIncident, deduplicated, locationApproximate: approx };
    },
  });

  route(app, {
    method: "post", path: "/api/sos/forest-fire", auth: "sos", permission: "sos.create_forest_fire",
    params: none, query: none,
    body: z.object({ geo: geo.optional(), location: text(300).optional(), description: text(1000).optional() }).passthrough(),
    handler: ({ body, user, res }) => {
      const g = body.geo ?? storage.getDistrictCenter(user.district);
      const { alert, deduplicated } = storage.createSos({
        category: "forest_fire", description: body.description || "FOREST FIRE EMERGENCY — Reported via SANKALP AI",
        location: body.location || loc(g), geo: g, ward: user.district, wardNumber: 1, district: user.district,
        status: "active", triggeredBy: user.name, triggeredByPhone: user.phone, isWomenSafety: false,
      }, user.id);
      if (!deduplicated) alertStaff(alert, "forest_fire_sos");
      res.status(deduplicated ? 200 : 201);
      return { alert, deduplicated };
    },
  });

  route(app, {
    method: "put", path: "/api/sos/:id/location", auth: "sos", permission: "sos.update_location",
    params: idParams, query: none, body: geo,
    handler: ({ params, body, user }) => {
      const a = mustSos(params.id);
      mustOwn(a, user);
      storage.updateSosLocation(a.id, body);
      cprEmitter.emit("event", { type: "sos_location_update", alertId: a.id, district: a.district, lat: body.lat, lng: body.lng, timestamp: new Date().toISOString() });
      return a;
    },
  });

  route(app, {
    method: "put", path: "/api/sos/:id/resolve", auth: "staff", permission: "sos.resolve",
    params: idParams, query: none, body: none,
    handler: ({ actor, params }) => {
      const a = mustSos(params.id);
      if (!staffForSos(actor, a)) throw forbidden("This SOS is outside your jurisdiction");
      storage.resolveSos(a.id);
      storage.addAuditLog("sos_resolved", actor.user?.id ?? `dept:${actor.deptId}`, actor.user?.name ?? `dept:${actor.deptId}`, `SOS ${a.id.slice(0, 8)} resolved`);
      cprEmitter.emit("event", { type: "sos_resolved", alertId: a.id, district: a.district });
      return a;
    },
  });

  const ownedAudio = (url: string, user: AppUser, sosId: string) => {
    const m = url.match(/^\/api\/media\/audio\/([0-9a-f-]{36}\.[a-z0-9]{2,4})$/);
    const rec = m ? storage.getMediaByFile(m[1]) : undefined;
    if (!rec || rec.ownerId !== user.id) throw unprocessable("INVALID_MEDIA", "Upload the audio via /api/upload/audio first");
    storage.linkMedia(rec.id, { sosId });
  };

  route(app, {
    method: "put", path: "/api/sos/:id/audio-url", auth: "sos", permission: "sos.attach_audio",
    params: idParams, query: none, body: z.object({ audioUrl: z.string().max(200) }),
    handler: ({ params, body, user }) => {
      const a = mustSos(params.id);
      mustOwn(a, user);
      ownedAudio(body.audioUrl, user, a.id);
      storage.setSosAudioUrl(a.id, body.audioUrl);
      cprEmitter.emit("event", { type: "sos_audio_evidence", alertId: a.id, district: a.district, timestamp: new Date().toISOString() });
      return { success: true, alertId: a.id, audioUrl: body.audioUrl };
    },
  });

  route(app, {
    method: "put", path: "/api/sos/:id/audio-chunk", auth: "sos", permission: "sos.attach_audio",
    params: idParams, query: none,
    body: z.object({ chunkUrl: z.string().max(200), chunkIndex: z.number().int().min(0).max(10000), duration: z.number().min(0).max(600).optional() }),
    handler: ({ params, body, user }) => {
      const a = mustSos(params.id);
      mustOwn(a, user);
      ownedAudio(body.chunkUrl, user, a.id);
      storage.addSOSAudioChunk(a.id, { url: body.chunkUrl, chunkIndex: body.chunkIndex, duration: body.duration ?? 10 });
      cprEmitter.emit("event", { type: "audio_chunk", sosId: a.id, chunkUrl: body.chunkUrl, chunkIndex: body.chunkIndex, district: a.district, isWomenSafety: a.isWomenSafety, timestamp: new Date().toISOString() });
      return { ok: true, chunkIndex: body.chunkIndex, totalChunks: a.audioChunks?.length ?? 0 };
    },
  });

  route(app, {
    method: "get", path: "/api/sos/:id/audio-chunks", auth: "staff", permission: "sos.read_evidence",
    params: idParams, query: none, body: none,
    handler: ({ actor, params }) => {
      const a = mustSos(params.id);
      if (!staffForSos(actor, a) || !canAccessEvidence(actor, { ownerId: a.userId ?? "", sosId: a.id })) throw forbidden();
      return { alertId: a.id, category: a.category, isWomenSafety: !!a.isWomenSafety, triggeredBy: a.triggeredBy ?? null, district: a.district, audioChunks: a.audioChunks ?? [] };
    },
  });
}
