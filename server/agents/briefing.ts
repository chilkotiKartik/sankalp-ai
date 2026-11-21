import { storage } from "../storage";
import { tenant } from "../tenancy";
import { config } from "../config";
import { TERMINAL } from "../domain/complaintState";
import { formatIst } from "../lib/time";
import { resolutionRates, RRR_DEFINITION } from "../verification/rate";
import { seasonalTrends } from "./trends";
import { slaFraction } from "./sla";
import { renderPdf, type PdfLine } from "../lib/pdf";
import { coveredByParent } from "./duplicates";

/**
 * P4.4 weekly district briefing — every number is computed from stored records, and each item names its source
 * (the exact filter used), so an officer can check it. No model writes facts here; no personal data appears.
 */
export interface BriefingItem { label: string; value: string | number; source: string }

export function weeklyBriefing(district: string, at = Date.now()) {
  const since = at - 7 * 86400000;
  const all = storage.getComplaints(district).filter(c => !c.isDemo || config().DEMO_MODE);
  const week = all.filter(c => new Date(c.submittedAt).getTime() >= since && new Date(c.submittedAt).getTime() <= at);
  const closedThisWeek = all.filter(c => c.state === "CLOSED" && c.resolvedAt && new Date(c.resolvedAt).getTime() >= since);
  const open = all.filter(c => !TERMINAL.has(c.state) && !coveredByParent(c));
  const overdue = open.filter(c => slaFraction(c, at) >= 1);
  const review = all.filter(c => c.state === "NEEDS_REVIEW");
  const byCat = new Map<string, number>();
  for (const c of week) byCat.set(c.category, (byCat.get(c.category) ?? 0) + 1);
  const topCats = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const dupParents = open.filter(c => (c.affectedCount ?? 1) > 1).sort((a, b) => (b.affectedCount ?? 0) - (a.affectedCount ?? 0)).slice(0, 5);
  const sos = storage.getSosAlerts(district).filter(a => new Date(a.triggeredAt).getTime() >= since);

  const items: BriefingItem[] = [
    { label: "Complaints filed this week", value: week.length, source: "complaints where submittedAt in the last 7 days" },
    { label: "Closed with citizen confirmation this week", value: closedThisWeek.length, source: "state = CLOSED and resolvedAt in the last 7 days" },
    { label: "Open complaints", value: open.length, source: "state not terminal, excluding duplicates still covered by an open parent" },
    { label: "Open and past SLA", value: overdue.length, source: "open complaints with elapsed time ≥ SLA hours for their priority" },
    { label: "Proofs waiting for human review", value: review.length, source: "state = NEEDS_REVIEW" },
    { label: "SOS alerts this week", value: sos.length, source: "sosAlerts where triggeredAt in the last 7 days" },
  ];
  return {
    title: `Weekly briefing — ${district}, ${tenant().stateLabel ?? tenant().name}`,
    period: { from: formatIst(since), to: formatIst(at) },
    generatedAt: new Date(at).toISOString(),
    demo: config().DEMO_MODE,
    items,
    topCategories: topCats.map(([category, n]) => ({ category, n })),
    // Ward and category only — the free-text location can contain names (review P4 note).
    mostAffected: dupParents.map(c => ({ ticketId: c.ticketId, category: c.category, affected: c.affectedCount, ward: c.ward })),
    resolutionRates: resolutionRates("department", district),
    resolutionRateDefinition: RRR_DEFINITION,
    trends: seasonalTrends(district, at).filter(t => t.status !== "normal"),
    method: "Computed directly from stored records. Trend rows appear only with ≥ 2 prior years and ≥ 10 baseline complaints.",
  };
}

export function briefingPdf(b: ReturnType<typeof weeklyBriefing>): Buffer {
  const pct = (r: { p: number; low: number; high: number } | null) => (r ? `${Math.round(r.p * 100)}% (95% CI ${Math.round(r.low * 100)}–${Math.round(r.high * 100)}%)` : "n/a");
  const L: PdfLine[] = [
    { text: b.title, size: 16, bold: true, gap: 4 },
    { text: `Period: ${b.period.from} to ${b.period.to}${b.demo ? "   [DEMO DATA]" : ""}`, size: 9, gap: 10 },
    { text: "Key figures", size: 12, bold: true },
    ...b.items.map(i => ({ text: `${i.label}: ${i.value}   (source: ${i.source})`, size: 9 })),
    { text: "", gap: 6 },
    { text: "Top categories this week", size: 12, bold: true },
    ...(b.topCategories.length ? b.topCategories.map(t => ({ text: `${t.category}: ${t.n}`, size: 9 })) : [{ text: "No complaints this week", size: 9 }]),
    { text: "", gap: 6 },
    { text: "Real Resolution Rate by department", size: 12, bold: true },
    { text: b.resolutionRateDefinition, size: 8 },
    ...b.resolutionRates.map(r => ({ text: `${r.label}: real ${pct(r.realResolutionRate)} of ${r.officialResolved} marked resolved; official ${pct(r.officialRate)} of ${r.filed} filed`, size: 9 })),
    { text: "", gap: 6 },
    { text: "Trend signals", size: 12, bold: true },
    ...(b.trends.length ? b.trends.map(t => ({ text: t.status === "rising" ? `${t.category}: RISING — ${t.observed} this week vs expected ${t.expected} (upper 95% ${t.upper95}; ${t.yearsOfHistory} years)` : `${t.category}: not enough history (${t.yearsOfHistory} years, n=${t.baselineN})`, size: 9 })) : [{ text: "No unusual trends.", size: 9 }]),
    { text: "", gap: 6 },
    { text: b.method, size: 8 },
  ];
  return renderPdf(L);
}
