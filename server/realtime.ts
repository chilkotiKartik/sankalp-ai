import type { Server, IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { storage, bus, type AppUser, type Complaint, type SOSAlert, type Announcement } from "./storage";
import { toStaffComplaint } from "./routes/dto";

/**
 * Scoped real-time fan-out (fixes audit C1). Every socket is bound to an authenticated user;
 * events are delivered only to the people allowed to see them:
 *  - SOS / complaint detail → admins of that district, super admins, and the owner.
 *  - announcements → users in the target district.
 *  - emergency broadcast → users in the sender's district (all districts for super admin).
 */
interface Client { ws: WebSocket; user: AppUser; alive: boolean }

const MAX_SOCKETS_PER_USER = 5;
let clients: Client[] = [];
let wss: WebSocketServer | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
const unsubscribers: Array<() => void> = [];

const isStaffFor = (u: AppUser, district?: string) =>
  u.role === "super_admin" || (u.role === "admin" && (!district || u.district === district));

function send(c: Client, payload: unknown) {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(payload));
}

function deliver(pred: (u: AppUser) => boolean, payload: unknown) {
  for (const c of clients) if (pred(c.user)) send(c, payload);
}

export function publishEmergencyBroadcast(sender: AppUser, message: string, severity: string) {
  const district = sender.role === "super_admin" ? null : sender.district;
  deliver(u => !district || u.district === district || u.role === "super_admin",
    { type: "emergency_broadcast", message, severity, district: district ?? "all", timestamp: new Date().toISOString() });
}

export function publishToStaff(district: string | undefined, payload: unknown) {
  deliver(u => isStaffFor(u, district), payload);
}

function onComplaint(ev: { type: string; complaint: Complaint }) {
  const c = ev.complaint;
  const ts = new Date().toISOString();
  deliver(u => isStaffFor(u, c.district), { type: ev.type, complaint: toStaffComplaint(c), timestamp: ts });
  // Owner gets a minimal pointer; the app re-fetches with its own permissions.
  deliver(u => u.id === c.userId && !isStaffFor(u, c.district), { type: "complaint_updated", complaintId: c.id, status: c.status, state: c.state, timestamp: ts });
}

function onSos(ev: { type: string; alert: SOSAlert }) {
  const a = ev.alert;
  const ts = new Date().toISOString();
  const payload = { type: ev.type, id: a.id, alert: a, geo: a.liveGeo ?? a.geo, liveUpdatedAt: a.liveUpdatedAt, timestamp: ts };
  deliver(u => isStaffFor(u, a.district) || u.id === a.userId, payload);
}

function onAnnouncement(ev: { announcement: Announcement }) {
  const a = ev.announcement;
  deliver(u => !a.targetDistrict || a.targetDistrict === "all" || a.targetDistrict === u.district || u.role === "super_admin",
    { type: "announcement", announcement: a, timestamp: new Date().toISOString() });
}

function onChat(ev: { complaintId: string; message: unknown }) {
  const c = storage.getComplaint(ev.complaintId);
  if (!c) return;
  deliver(u => u.id === c.userId || isStaffFor(u, c.district), { type: "chat_message", complaintId: c.id, message: ev.message });
}

function onWorker(ev: { updates: Array<{ id: string }> }) {
  // Worker positions are operational data: staff only.
  deliver(u => isStaffFor(u), ev);
}

export function attachRealtime(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "/", "http://localhost");
    const user = storage.validateToken(url.searchParams.get("token"));
    if (!user) {
      ws.close(4001, "Unauthorized");
      return;
    }
    const mine = clients.filter(c => c.user.id === user.id);
    if (mine.length >= MAX_SOCKETS_PER_USER) mine[0].ws.close(4008, "Too many connections");
    const client: Client = { ws, user, alive: true };
    clients.push(client);
    ws.on("pong", () => { client.alive = true; });
    ws.on("message", () => { /* server → client only */ });
    ws.on("close", () => { clients = clients.filter(c => c !== client); });
    ws.on("error", () => { /* closed by heartbeat */ });
    send(client, { type: "connected", district: user.district });
  });

  heartbeat = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) { c.ws.terminate(); continue; }
      c.alive = false;
      try { c.ws.ping(); } catch { c.ws.terminate(); }
    }
  }, 25_000);

  const subs: Array<[string, (e: never) => void]> = [
    ["complaint", onComplaint], ["sos", onSos], ["announcement", onAnnouncement], ["chat", onChat], ["worker", onWorker],
  ];
  for (const [name, fn] of subs) {
    bus.on(name, fn as (...a: unknown[]) => void);
    unsubscribers.push(() => bus.off(name, fn as (...a: unknown[]) => void));
  }
}

export function closeRealtime() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  unsubscribers.splice(0).forEach(f => f());
  clients.forEach(c => c.ws.terminate());
  clients = [];
  wss?.close();
  wss = null;
}
