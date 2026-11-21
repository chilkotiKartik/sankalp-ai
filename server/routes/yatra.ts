import type { Express } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import { route, none, idParams } from "../lib/route";
import { forbidden, notFound, AppError } from "../lib/errors";
import { tenant } from "../tenancy";
import { haversineM } from "../verification/image";
import { sendPush } from "../notify/push";
import { geo, text } from "./common";
import { writeLimiter } from "./limits";
import type { YatraGroup } from "../types";

/**
 * P6.6 yatra / tourist mode (opt-in; tenant feature `yatraMode`).
 *  - A leader creates a group (expires in ≤ 10 days); members join with a 6-character code. Joining is the consent.
 *  - Members share location only with their own group. Leaving deletes your location; expiry deletes the group.
 *  - "I'm lost" alerts the group at once; a member silent for 60 min is flagged for the group (no SMS, no PII).
 *  - Nearest medical point and helplines come from the tenant's emergency services list.
 */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SILENT_MS = 60 * 60_000;
const newCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

function requireYatra() {
  if (!tenant().features.yatraMode) throw new AppError(409, "YATRA_OFF", "Yatra mode is not enabled in this state");
}

const memberView = (g: YatraGroup) => ({
  id: g.id, name: g.name, code: g.code, expiresAt: g.expiresAt,
  members: g.members.map(m => ({ displayName: m.displayName, geo: m.geo, at: m.at, lost: !!m.lost, isLeader: m.userId === g.leaderId })),
});

function notifyGroup(g: YatraGroup, exceptUserId?: string) {
  for (const m of g.members) if (m.userId !== exceptUserId) void sendPush(storage.pushTokensForUser(m.userId), { kind: "announcement", id: g.id, ref: g.code });
}

/** Job body: flag silent members, delete expired groups (with all locations). */
export function runYatraHousekeeping(at = Date.now()): { expired: number; flagged: number } {
  let flagged = 0;
  const before = storage.s.yatraGroups.length;
  storage.s.yatraGroups = storage.s.yatraGroups.filter(g => new Date(g.expiresAt).getTime() > at);
  for (const g of storage.s.yatraGroups) for (const m of g.members) {
    if (m.at && !m.lost && at - new Date(m.at).getTime() > SILENT_MS) { m.lost = true; m.lostAlertedAt = new Date(at).toISOString(); flagged++; notifyGroup(g, m.userId); }
  }
  const expired = before - storage.s.yatraGroups.length;
  if (expired || flagged) storage.touch();
  return { expired, flagged };
}

export function registerYatraRoutes(app: Express) {
  const mine = (id: string, userId: string) => {
    const g = storage.s.yatraGroups.find(x => x.id === id);
    if (!g || new Date(g.expiresAt).getTime() < Date.now()) throw notFound("Group not found or expired");
    const m = g.members.find(x => x.userId === userId);
    if (!m) throw forbidden("You are not a member of this group");
    return { g, m };
  };

  route(app, {
    method: "post", path: "/api/yatra/groups", auth: "user", permission: "yatra.use",
    middleware: [writeLimiter],
    params: none, query: none, body: z.object({ name: text(60), hours: z.number().int().min(1).max(240), displayName: text(40) }),
    handler: ({ body, user, res }) => {
      requireYatra();
      let code = newCode();
      while (storage.s.yatraGroups.some(g => g.code === code)) code = newCode();
      const now = Date.now();
      const g: YatraGroup = { id: randomUUID(), code, name: body.name, leaderId: user.id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + body.hours * 3600_000).toISOString(),
        members: [{ userId: user.id, displayName: body.displayName, joinedAt: new Date(now).toISOString() }] };
      storage.s.yatraGroups.push(g);
      storage.touch();
      res.status(201);
      return memberView(g);
    },
  });

  route(app, {
    method: "post", path: "/api/yatra/join", auth: "user", permission: "yatra.use",
    middleware: [writeLimiter],
    params: none, query: none, body: z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/), displayName: text(40) }),
    handler: ({ body, user }) => {
      requireYatra();
      const g = storage.s.yatraGroups.find(x => x.code === body.code && new Date(x.expiresAt).getTime() > Date.now());
      if (!g) throw notFound("No active group with this code");
      if (g.members.length >= 60) throw new AppError(409, "GROUP_FULL", "This group is full");
      if (!g.members.some(m => m.userId === user.id)) g.members.push({ userId: user.id, displayName: body.displayName, joinedAt: new Date().toISOString() });
      storage.touch();
      return memberView(g);
    },
  });

  route(app, {
    method: "get", path: "/api/yatra/groups/:id", auth: "user", permission: "yatra.use",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => memberView(mine(params.id, user.id).g),
  });

  route(app, {
    method: "put", path: "/api/yatra/groups/:id/location", auth: "user", permission: "yatra.use",
    params: idParams, query: none, body: z.object({ geo }),
    handler: ({ params, body, user }) => {
      const { m } = mine(params.id, user.id);
      m.geo = body.geo; m.at = new Date().toISOString();
      if (m.lost && !m.lostAlertedAt) m.lost = false;
      storage.touch();
      return { ok: true };
    },
  });

  route(app, {
    method: "post", path: "/api/yatra/groups/:id/lost", auth: "user", permission: "yatra.use",
    params: idParams, query: none, body: z.object({ lost: z.boolean(), geo: geo.optional() }),
    handler: ({ params, body, user }) => {
      const { g, m } = mine(params.id, user.id);
      m.lost = body.lost; m.lostAlertedAt = body.lost ? new Date().toISOString() : undefined;
      if (body.geo) { m.geo = body.geo; m.at = new Date().toISOString(); }
      if (body.lost) notifyGroup(g, user.id);
      storage.touch();
      return memberView(g);
    },
  });

  route(app, {
    method: "delete", path: "/api/yatra/groups/:id/members/me", auth: "user", permission: "yatra.use",
    params: idParams, query: none, body: none,
    handler: ({ params, user }) => {
      const { g } = mine(params.id, user.id);
      g.members = g.members.filter(x => x.userId !== user.id); // your location goes with you
      if (!g.members.length || g.leaderId === user.id) storage.s.yatraGroups = storage.s.yatraGroups.filter(x => x.id !== g.id);
      storage.touch();
      return { left: true };
    },
  });

  route(app, {
    method: "get", path: "/api/yatra/nearest-medical", auth: "public", permission: "yatra.read_public",
    params: none, query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), body: none,
    handler: ({ query }) => tenant().emergencyServices
      .filter(s => s.type === "hospital" || s.type === "ambulance")
      .map(s => ({ name: s.name, district: s.district, phone: s.phone, address: s.address, geo: s.geo, distanceKm: Math.round(haversineM(query, s.geo) / 100) / 10 }))
      .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5),
  });

  route(app, {
    method: "get", path: "/api/yatra/helplines", auth: "public", permission: "yatra.read_public",
    params: none, query: none, body: none,
    handler: () => ({
      emergency: [{ name: "All emergencies", phone: "112" }, { name: "Ambulance", phone: "108" }, { name: "Disaster (SDRF)", phone: "1070" }, { name: "Women helpline", phone: "1090" }, { name: "Tourist helpline (India)", phone: "1363" }],
      services: tenant().emergencyServices.filter(s => s.type === "disaster" || s.type === "police").slice(0, 10).map(s => ({ name: s.name, district: s.district, phone: s.phone })),
    }),
  });
}
