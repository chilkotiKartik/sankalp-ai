import { openSse, sseKey } from "../lib/sse";
import { currentTenantId } from "../tenancy";
import { isStateWide } from "../data/reference";
import type { Express } from "express";
import { z } from "zod";
import { storage, bus, storeFor } from "../storage";
import { config } from "../config";
import { route, none, scopeDistrict } from "../lib/route";
import { AppError } from "../lib/errors";
import { geo, text } from "./common";

/** Citizen-facing reference + misc routes, worker location (M1), push registration, demo-only bills. */
export function registerCitizenRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/wards", auth: "user", permission: "wards.read",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getWards(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/police-stations", auth: "user", permission: "reference.read",
    params: none, query: none, body: none,
    handler: () => storage.getPoliceStations(),
  });

  route(app, {
    method: "get", path: "/api/risk-zones", auth: "user", permission: "risk.read",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getRiskZones(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/nearest-police", auth: "user", permission: "reference.read",
    params: none, query: z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }), body: none,
    handler: ({ actor, query }) => storage.getNearestPoliceStations({ lat: query.lat, lng: query.lng }, 3, scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/leaderboard", auth: "user", permission: "leaderboard.read",
    params: none, query: none, body: none,
    handler: () => storage.getLeaderboard(),
  });

  route(app, {
    method: "get", path: "/api/emergency-services", auth: "user", permission: "reference.read",
    params: none, query: z.object({ type: z.string().max(20).optional(), district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => storage.getEmergencyServices()
      .filter(s => !query.type || s.type === query.type)
      .filter(s => !query.district || isStateWide(query.district) || s.district === query.district),
  });

  route(app, {
    method: "post", path: "/api/push-token", auth: "user", permission: "push.register",
    params: none, query: none,
    body: z.object({ token: z.string().min(10).max(300), platform: z.string().max(20).optional() }),
    handler: ({ body, user }) => {
      storage.storePushToken({ token: body.token, platform: body.platform || "unknown", userId: user.id, role: user.role, district: user.district });
      return { success: true, registered: true };
    },
  });

  // ── Workers: REAL location reports (M1). Simulation exists only in DEMO_MODE (server/jobs). ─
  route(app, {
    method: "post", path: "/api/worker/location", auth: "worker", permission: "workers.report_location",
    params: none, query: none,
    body: geo.extend({ status: z.enum(["active", "idle", "on_leave"]).optional(), currentTask: text(200).optional() }),
    handler: ({ body, user }) => {
      const w = storage.reportWorkerLocation(user, { lat: body.lat, lng: body.lng }, body.status, body.currentTask);
      return { success: true, worker: { id: w.id, geo: w.geo, status: w.status, lastLocationAt: w.lastLocationAt } };
    },
  });

  route(app, {
    method: "get", path: "/api/workers/stream", auth: "admin", permission: "workers.stream",
    allowQueryToken: true,
    params: none, query: none, body: none,
    handler: ({ actor, req, res }) => {
      const d = scopeDistrict(actor);
      const send = openSse(req, res, sseKey(actor));
      send({ type: "initial", workers: storage.getWorkers(d), demo: config().DEMO_MODE });
      const tid = currentTenantId();
      const listener = (ev: { updates: Array<{ id: string }>; tenantId?: string }) => {
        if (ev.tenantId !== tid) return;
        const updates = d ? ev.updates.filter(u => storeFor(tid).getWorkers(d).some(w => w.id === u.id)) : ev.updates;
        if (updates.length) send({ ...ev, updates });
      };
      bus.on("worker", listener);
      req.on("close", () => { bus.off("worker", listener); });
      return undefined;
    },
  });

  // ── Bills: no real billing integration exists. Mock data is served ONLY in DEMO_MODE (rule 3). ─
  route(app, {
    method: "get", path: "/api/bills", auth: "user", permission: "bills.read",
    params: none, query: none, body: none,
    handler: ({ user }) => {
      if (!config().DEMO_MODE) return { bills: [], integration: "not_connected", message: "Bill payment is not connected for your district yet.", user: { name: user.name, district: user.district } };
      return { demo: true, bills: demoBills(user.district), user: { name: user.name, district: user.district } };
    },
  });

  route(app, {
    method: "post", path: "/api/bills/:id/pay", auth: "user", permission: "bills.pay",
    params: z.object({ id: z.string().max(20) }), query: none, body: z.object({ method: z.string().max(20).optional() }).passthrough(),
    handler: ({ body }) => {
      if (!config().DEMO_MODE) throw new AppError(501, "NOT_CONNECTED", "Bill payment is not connected yet. No money was taken.");
      return { demo: true, success: true, ref: `DEMO-${Date.now().toString().slice(-8)}`, method: body.method || "UPI", paidAt: new Date().toISOString() };
    },
  });
}

function demoBills(district: string) {
  const d = new Date();
  const due = (m: number, day: number) => new Date(d.getFullYear(), d.getMonth() + m, day).toISOString().slice(0, 10);
  const bills = [
    { id: "b1", type: "property", title: "ULB Property Tax (DEMO)", subtitle: `Urban Local Body, ${district}`, accountNo: "DEMO-ULB-0001", amount: 4850, dueDate: due(1, 28), status: "unpaid", period: "Annual", icon: "business-outline", color: "#F59E0B", gradient: ["#78350F", "#92400E", "#B45309"], usage: { label: "Property Area", value: "182 sq m", unit: "Built-up", history: [4200, 4400, 4500, 4700, 4850] }, breakdown: [{ label: "Base tax", amount: 3800 }, { label: "Sewerage cess", amount: 580 }, { label: "Penalty (prev.)", amount: 470 }], transactions: [] },
    { id: "b2", type: "water", title: "Water Bill (DEMO)", subtitle: "Jal Sansthan", accountNo: "DEMO-JAL-0002", amount: 1240, dueDate: due(0, 20), status: "unpaid", period: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), icon: "water-outline", color: "#3B82F6", gradient: ["#1E3A5F", "#1D4ED8", "#2563EB"], usage: { label: "Water Used", value: "8,400", unit: "Litres", history: [6200, 7100, 7800, 8100, 8400] }, breakdown: [{ label: "Usage charges", amount: 960 }, { label: "Fixed charges", amount: 180 }, { label: "Treatment levy", amount: 100 }], transactions: [] },
    { id: "b3", type: "electricity", title: "Electricity (DEMO)", subtitle: "UPCL", accountNo: "DEMO-UPCL-0003", amount: 2180, dueDate: due(1, 5), status: "unpaid", period: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), icon: "flash-outline", color: "#EF4444", gradient: ["#450A0A", "#7F1D1D", "#B91C1C"], usage: { label: "Units Consumed", value: "218", unit: "kWh", history: [180, 195, 210, 205, 218] }, breakdown: [{ label: "Energy charges", amount: 1635 }, { label: "Fixed demand", amount: 300 }, { label: "Fuel surcharge", amount: 156 }, { label: "Govt. duty", amount: 89 }], transactions: [] },
  ];
  bills.forEach(b => { if (new Date(b.dueDate) < d) b.status = "overdue"; });
  return bills;
}
