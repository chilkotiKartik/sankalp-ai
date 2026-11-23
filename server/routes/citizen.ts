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
import { createHmac, timingSafeEqual } from "node:crypto";
import { POINT_RULES, LEVELS } from "../domain/points";
import { runInTenant, tenant } from "../tenancy";

/** Citizen-facing reference + misc routes, worker location (M1), push registration, demo-only bills. */
export function registerCitizenRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/wards", auth: "user", permission: "wards.read",
    params: none, query: none, body: none,
    handler: ({ actor }) => storage.getWards(scopeDistrict(actor)),
  });

  route(app, {
    method: "get", path: "/api/police-stations", auth: "user", permission: "reference.read",
    // Large states have thousands of stations: the caller's district by default, or the nearest to a point; always capped.
    params: none,
    query: z.object({ district: z.string().max(60).optional(), lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }),
    body: none,
    handler: ({ query, actor }) => {
      if (query.lat !== undefined && query.lng !== undefined) return storage.getNearestPoliceStations({ lat: query.lat, lng: query.lng }, query.limit);
      const d = query.district ?? scopeDistrict(actor) ?? actor.user?.district;
      return storage.getPoliceStations(d).slice(0, query.limit);
    },
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

  // ── Sankalp Points (D-059): my points, level, badges and history (with the rules, so nothing is hidden) ──
  route(app, {
    method: "get", path: "/api/me/points", auth: "user", permission: "points.read",
    params: none, query: none, body: none,
    handler: ({ user }) => ({
      ...storage.pointsSummary(user.id)!,
      rules: Object.entries(POINT_RULES).map(([id, r]) => ({ id, points: r.points, dailyCap: r.dailyCap ?? null, en: r.en, hi: r.hi })),
      levels: LEVELS.map(l => ({ n: l.n, name: l.name, en: l.en, min: l.min })),
    }),
  });

  // A certificate anyone can verify: the link is signed, and the page shows the live record (first name + initial only).
  route(app, {
    method: "get", path: "/api/me/certificate", auth: "user", permission: "points.read",
    params: none, query: none, body: none,
    handler: ({ user }) => ({ path: `/cert/${certificateCode(user.id)}` }),
  });
  route(app, {
    method: "get", path: "/cert/:code", auth: "public", permission: "points.certificate_verify",
    params: z.object({ code: z.string().min(20).max(200) }), query: none, body: none,
    handler: ({ params, res }) => {
      const id = readCertificateCode(params.code);
      const t = id ? runInTenant(id.tenantId, () => { const u = storage.getUserById(id.userId); const p = u ? storage.pointsSummary(u.id) : null; return u && p ? { u, p, state: tenant().stateLabel } : null; }) : null;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.type("html").send(certificatePage(t ? { name: displayName(t.u.name), district: t.u.district, state: t.state, points: t.p.points, level: `${t.p.level.name} (${t.p.level.en})`, fixes: t.p.verifiedFixes, badges: t.p.badges.filter(b => b.earned).map(b => b.name) } : null));
      return undefined;
    },
  });

  route(app, {
    method: "get", path: "/api/leaderboard", auth: "user", permission: "leaderboard.read",
    params: none, query: none, body: none,
    handler: () => storage.getLeaderboard(),
  });

  route(app, {
    method: "get", path: "/api/emergency-services", auth: "user", permission: "reference.read",
    params: none,
    query: z.object({ type: z.string().max(20).optional(), district: z.string().max(60).optional(), lat: z.coerce.number().min(-90).max(90).optional(), lng: z.coerce.number().min(-180).max(180).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }),
    body: none,
    handler: ({ query, actor }) => {
      const d = query.district ?? (query.lat === undefined ? actor.user?.district : undefined);
      let list = storage.getEmergencyServices()
        .filter(s => !query.type || s.type === query.type)
        .filter(s => !d || isStateWide(d) || s.district === d);
      if (query.lat !== undefined && query.lng !== undefined) {
        const here = { lat: query.lat, lng: query.lng };
        list = list.map(s => ({ s, k: (s.geo.lat - here.lat) ** 2 + (s.geo.lng - here.lng) ** 2 })).sort((a, b) => a.k - b.k).map(x => x.s);
      }
      return list.slice(0, query.limit);
    },
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
    { id: "b2", type: "water", title: "Water Bill (DEMO)", subtitle: "Water supply", accountNo: "DEMO-WAT-0002", amount: 1240, dueDate: due(0, 20), status: "unpaid", period: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), icon: "water-outline", color: "#3B82F6", gradient: ["#1E3A5F", "#1D4ED8", "#2563EB"], usage: { label: "Water Used", value: "8,400", unit: "Litres", history: [6200, 7100, 7800, 8100, 8400] }, breakdown: [{ label: "Usage charges", amount: 960 }, { label: "Fixed charges", amount: 180 }, { label: "Treatment levy", amount: 100 }], transactions: [] },
    { id: "b3", type: "electricity", title: "Electricity (DEMO)", subtitle: "Power distribution", accountNo: "DEMO-PWR-0003", amount: 2180, dueDate: due(1, 5), status: "unpaid", period: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }), icon: "flash-outline", color: "#EF4444", gradient: ["#450A0A", "#7F1D1D", "#B91C1C"], usage: { label: "Units Consumed", value: "218", unit: "kWh", history: [180, 195, 210, 205, 218] }, breakdown: [{ label: "Energy charges", amount: 1635 }, { label: "Fixed demand", amount: 300 }, { label: "Fuel surcharge", amount: 156 }, { label: "Govt. duty", amount: 89 }], transactions: [] },
  ];
  bills.forEach(b => { if (new Date(b.dueDate) < d) b.status = "overdue"; });
  return bills;
}

// ── certificate helpers ──
const certSig = (p: string) => createHmac("sha256", config().JWT_SECRET).update(`sankalp-cert:${p}`).digest("base64url").slice(0, 32);
function certificateCode(userId: string): string {
  const p = `${currentTenantId()}.${userId}`;
  return `${Buffer.from(p).toString("base64url")}.${certSig(p)}`;
}
function readCertificateCode(code: string): { tenantId: string; userId: string } | null {
  const [b, sig] = code.split(".");
  if (!b || !sig) return null;
  const p = Buffer.from(b, "base64url").toString();
  const e = Buffer.from(certSig(p)), g = Buffer.from(sig);
  if (e.length !== g.length || !timingSafeEqual(e, g)) return null;
  const [tenantId, userId] = p.split(".");
  return tenantId && userId ? { tenantId, userId } : null;
}
/** "Ravi Kumar Sharma" → "Ravi S." — enough to recognise, not enough to identify a stranger. */
const displayName = (n: string) => { const w = n.trim().split(/\s+/); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0]; };
function certificatePage(c: { name: string; district: string; state: string; points: number; level: string; fixes: number; badges: string[] } | null): string {
  const esc = (v: string) => v.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  const body = c ? `<p class="k">This is to recognise</p><h1>${esc(c.name)}</h1><p class="k">${esc(c.district)}, ${esc(c.state)}</p>
<p class="lead">for helping fix public problems through SANKALP, with every fix checked and confirmed.</p>
<div class="g"><div><b>${c.fixes}</b><span>verified fixes</span></div><div><b>${c.points}</b><span>Sankalp Points</span></div><div><b>${esc(c.level)}</b><span>level</span></div></div>
${c.badges.length ? `<p class="k">Badges: ${c.badges.map(esc).join(" · ")}</p>` : ""}
<p class="v">✓ Checked against SANKALP records on ${today}. Points are earned only for real, verified outcomes.</p>`
    : `<h1>Certificate not found</h1><p>This link is not valid, or the account no longer exists.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SANKALP civic contribution certificate</title>
<style>body{margin:0;background:#F5F3EF;font:16px system-ui,sans-serif;color:#1F2937}main{max-width:720px;margin:24px auto;background:#fff;border:6px double #C2410C;border-radius:14px;padding:32px 28px;text-align:center}
.t{color:#9A3412;letter-spacing:.08em;font-weight:800;font-size:14px;text-transform:uppercase}h1{font-size:34px;margin:6px 0;color:#111827}.k{color:#4B5563;margin:4px 0}.lead{font-size:17px;margin:14px 0}
.g{display:flex;gap:12px;justify-content:center;margin:18px 0;flex-wrap:wrap}.g div{border:1px solid #E5E7EB;border-radius:10px;padding:10px 16px;min-width:120px}.g b{display:block;font-size:22px;color:#9A3412}.g span{font-size:12px;color:#4B5563}
.v{font-size:13px;color:#047857;margin-top:16px}.bar{height:6px;display:flex;margin:-32px -28px 24px}.bar i{flex:1}@media print{body{background:#fff}}</style></head>
<body><main><div class="bar"><i style="background:#FF9933"></i><i style="background:#fff"></i><i style="background:#138808"></i></div><div class="t">SANKALP · Civic contribution certificate</div>${body}
<p class="k" style="font-size:12px;margin-top:14px">To keep a copy, use your browser's Print → Save as PDF.</p></main></body></html>`;
}
