import type { Express } from "express";
import { z } from "zod";
import { storage, DEPARTMENTS } from "../storage";
import { DISTRICT_NAMES, SLA_HOURS } from "../data/reference";
import { TERMINAL } from "../domain/complaintState";
import { config } from "../config";
import { tenant } from "../tenancy";
import { aiStatus } from "../ai/gateway";
import { route, none } from "../lib/route";
import { readiness } from "../health";

/**
 * Explicitly public routes. They return AGGREGATES ONLY — no names, phones or exact citizen coordinates.
 * Every number is computed from stored records; `n` and the method are included where meaningful (rule 3).
 */
export function registerPublicRoutes(app: Express) {
  const health = () => ({ status: "ok", timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()), service: "SANKALP AI", version: "1.1.0" });
  route(app, { method: "get", path: "/api/health", auth: "public", permission: "public.health", params: none, query: none, body: none, handler: health });
  route(app, { method: "get", path: "/healthz", auth: "public", permission: "public.health", params: none, query: none, body: none, handler: health });
  route(app, {
    method: "get", path: "/readyz", auth: "public", permission: "public.health", params: none, query: none, body: none,
    handler: async ({ res }) => { const r = await readiness(); res.status(r.ready ? 200 : 503); return r; },
  });

  route(app, {
    method: "get", path: "/api/public/config", auth: "public", permission: "public.config",
    params: none, query: none, body: none,
    handler: () => {
      const t = tenant();
      return { demoMode: config().DEMO_MODE, mapTileUrl: config().mapTileUrl, ai: aiStatus(), districts: [...DISTRICT_NAMES], slaHours: { ...SLA_HOURS },
        tenant: { id: t.id, name: t.name, nameLocal: t.nameLocal, languages: t.languages, helplines: t.helplines, mapBounds: t.mapBounds, grievanceOfficer: t.grievanceOfficer, features: t.features } };
    },
  });

  route(app, {
    method: "get", path: "/api/public/district-stats", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => DISTRICT_NAMES.map(district => {
      const dc = storage.getComplaints(district);
      const sos = storage.getSosAlerts(district);
      const pending = dc.filter(c => c.status === "pending").length;
      const inProgress = dc.filter(c => c.status === "in_progress").length;
      const resolved = dc.filter(c => c.state === "CLOSED").length;
      const activeSos = sos.filter(s => s.status === "active").length;
      const p1Count = dc.filter(c => c.priority === "P1" && !TERMINAL.has(c.state)).length;
      return { district, total: dc.length, pending, inProgress, resolved, activeSos, p1Count,
        riskScore: Math.min(100, pending * 3 + inProgress + activeSos * 15 + p1Count * 5),
        riskMethod: "min(100, 3×pending + in_progress + 15×active SOS + 5×open P1)" };
    }),
  });

  route(app, {
    method: "get", path: "/api/public/department-report", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => {
      const all = storage.getComplaints();
      return Object.entries(DEPARTMENTS).map(([id, dept]) => {
        const list = all.filter(c => dept.categories.includes(c.category));
        const closed = list.filter(c => c.state === "CLOSED").length;
        const total = list.length;
        const rate = total ? Math.round((closed / total) * 100) : 0;
        return { ...dept, id, total, resolved: closed, pending: list.filter(c => c.status === "pending").length,
          awaitingCitizen: list.filter(c => c.status === "resolved").length,
          p1Pending: list.filter(c => c.priority === "P1" && !TERMINAL.has(c.state)).length,
          resolutionRate: rate, n: total, grade: total < 10 ? "insufficient data" : rate >= 80 ? "A" : rate >= 65 ? "B" : rate >= 50 ? "C" : "D",
          method: "resolutionRate = citizen-confirmed closed ÷ total; grade needs n ≥ 10" };
      });
    },
  });

  route(app, {
    method: "get", path: "/api/public/ward-health", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => storage.getWards(),
  });

  route(app, {
    method: "get", path: "/api/public/stats", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => storage.getAdminStats(),
  });

  route(app, {
    method: "get", path: "/api/public/announcements", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => storage.getAnnouncements().filter(a => a.priority === "urgent" || a.priority === "important").slice(0, 10)
      .map(a => ({ id: a.id, title: a.title, body: a.body, type: a.type, department: a.department, priority: a.priority, postedAt: a.postedAt, targetDistrict: a.targetDistrict })),
  });

  route(app, {
    method: "get", path: "/api/public/budget", auth: "public", permission: "public.dashboard",
    params: none, query: z.object({ district: z.string().max(60).optional() }), body: none,
    handler: ({ query }) => storage.getBudgetItems(query.district),
  });

  // Anomaly rules preserved (cluster / spike / sla_breach / hotspot) — computed from stored data only.
  route(app, {
    method: "get", path: "/api/public/anomalies", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => {
      const complaints = storage.getComplaints();
      const t = Date.now();
      const out: Array<Record<string, unknown> & { severity: string }> = [];
      const age = (iso: string) => t - new Date(iso).getTime();
      const group = <T,>(xs: T[], key: (x: T) => string) => xs.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) || []), x]), new Map<string, T[]>());

      group(complaints.filter(c => age(c.submittedAt) < 72 * 3600000), c => `${c.ward}::${c.category}`).forEach((items, key) => {
        if (items.length < 3) return;
        const [ward, category] = key.split("::");
        out.push({ id: `cluster_${ward}_${category}`.replace(/\s/g, "_"), type: "cluster", severity: items.length >= 6 ? "critical" : items.length >= 4 ? "high" : "medium",
          title: "Complaint Cluster Detected", description: `${items.length} ${category} complaints in ${ward} within 72h`, ward, category, count: items.length, district: items[0].district, detectedAt: new Date().toISOString() });
      });
      group(complaints.filter(c => age(c.submittedAt) < 24 * 3600000), c => c.district).forEach((items, district) => {
        if (items.length < 10) return;
        out.push({ id: `spike_${district}`.replace(/\s/g, "_"), type: "spike", severity: items.length >= 20 ? "critical" : "high",
          title: "Unusual Activity Spike", description: `${items.length} complaints in ${district} in the last 24h`, district, count: items.length, detectedAt: new Date().toISOString() });
      });
      const breached = complaints.filter(c => storage.slaBreached(c, t));
      if (breached.length >= 5) {
        const p1 = breached.filter(c => c.priority === "P1").length;
        out.push({ id: "sla_breach_mass", type: "sla_breach", severity: p1 > 0 ? "critical" : breached.length >= 15 ? "high" : "medium",
          title: "Mass SLA Breach Alert", description: `${breached.length} complaints have exceeded their SLA${p1 ? `, including ${p1} P1` : ""}`, count: breached.length, p1Count: p1, detectedAt: new Date().toISOString() });
      }
      group(complaints.filter(c => !TERMINAL.has(c.state)), c => `${Math.round(c.geo.lat * 20) / 20},${Math.round(c.geo.lng * 20) / 20}`).forEach(items => {
        if (items.length < 4) return;
        out.push({ id: `hotspot_${items[0].ward}`.replace(/\s/g, "_"), type: "hotspot", severity: items.length >= 7 ? "critical" : "high",
          title: "Civic Hotspot Identified", description: `${items.length} unresolved complaints (${[...new Set(items.map(c => c.category))].join(", ")}) in ${items[0].ward}`,
          ward: items[0].ward, count: items.length, detectedAt: new Date().toISOString() });
      });
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return out.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)).slice(0, 8);
    },
  });
}
