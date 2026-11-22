import { storage } from "../storage";
import { config } from "../config";
import { tenant } from "../tenancy";
import { SLA_HOURS, getDeptIdForCategory, DEPARTMENTS } from "../data/reference";
import { sup, roundTotal, safeRate, publicWard, csvCell } from "./disclosure";
import type { Complaint } from "../types";

/**
 * P8.1 open data. Only aggregates leave the system, never rows:
 *  - grouped by district, ward, department, category and IST month
 *  - k-anonymity: any count below K (5) is suppressed ("<5") together with the rates derived from it,
 *    so a single complaint or a single citizen can never be singled out
 *  - no free text, no locations finer than the ward, no ids
 */
import { K } from "./disclosure";
export { K };
const DAY = 86400000;
const istMonth = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600000).toISOString().slice(0, 7);
const visible = (c: Complaint) => !c.isDemo || config().DEMO_MODE;

/** Closed with citizen confirmation within the SLA hours of its priority (measured from filing). */
export function withinSla(c: Complaint): boolean | null {
  if (c.state !== "CLOSED" || !c.resolvedAt) return null;
  return new Date(c.resolvedAt).getTime() - new Date(c.submittedAt).getTime() <= (SLA_HOURS[c.priority] ?? 72) * 3600000;
}

export interface OpenRow {
  district: string; ward: string; department: string; category: string; month: string;
  filed: number | "<5"; markedResolved: number | "<5"; citizenVerified: number | "<5"; closedWithinSla: number | "<5";
}


export function openDataRows(since = Date.now() - 365 * DAY): OpenRow[] {
  const groups = new Map<string, Complaint[]>();
  for (const c of storage.getComplaints()) {
    if (!visible(c) || new Date(c.submittedAt).getTime() < since) continue;
    const key = [c.district, publicWard(c.ward, c.district), getDeptIdForCategory(c.category), c.category, istMonth(c.submittedAt)].join("\u0000");
    const g = groups.get(key);
    if (g) g.push(c); else groups.set(key, [c]);
  }
  return [...groups.entries()].map(([key, cs]) => {
    const [district, ward, department, category, month] = key.split("\u0000");
    const verified = cs.filter(c => c.state === "CLOSED").length;
    const claimed = cs.filter(c => !!c.proofSubmittedAt).length;
    const inSla = cs.filter(c => withinSla(c)).length;
    return {
      district, ward, department, category, month,
      filed: sup(cs.length),
      markedResolved: sup(claimed, cs.length),
      citizenVerified: sup(verified, claimed),
      closedWithinSla: sup(inSla, verified),
    };
  }).sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.district.localeCompare(b.district)));
}

export function toCsv(rows: OpenRow[]): string {
  const cols: Array<keyof OpenRow> = ["month", "district", "ward", "department", "category", "filed", "markedResolved", "citizenVerified", "closedWithinSla"];
  const demo = config().DEMO_MODE;
  return [[...cols, "dataStatus"].join(","), ...rows.map(r => [...cols.map(c => csvCell(r[c])), demo ? "DEMO" : "real"].join(","))].join("\n") + "\n";
}

/** Department scorecard for the public dashboard (suppressed below K). */
/** Same 365-day window as the open data; totals rounded to base 5; rates only when every part is safe. */
export function departmentScorecard(since = Date.now() - 365 * DAY) {
  const by = new Map<string, Complaint[]>();
  for (const c of storage.getComplaints()) {
    if (!visible(c) || new Date(c.submittedAt).getTime() < since) continue;
    const d = getDeptIdForCategory(c.category);
    const g = by.get(d);
    if (g) g.push(c); else by.set(d, [c]);
  }
  return [...by.entries()].map(([id, cs]) => {
    const claimed = cs.filter(c => !!c.proofSubmittedAt).length;
    const verified = cs.filter(c => c.state === "CLOSED").length;
    const sla = cs.filter(c => withinSla(c)).length;
    return {
      department: id, name: DEPARTMENTS[id]?.name ?? id, filed: cs.length < K ? "<5" as const : roundTotal(cs.length),
      realResolutionRate: safeRate(verified, claimed),
      officialRate: safeRate(claimed, cs.length),
      slaCompliance: safeRate(sla, verified),
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export const DATA_DICTIONARY = {
  dataset: "SANKALP civic complaints — monthly aggregates",
  publisher: () => tenant().stateLabel,
  licence: "Government Open Data License – India (GODL-India)",
  anonymity: "Counts 1–4 are published as \"<5\", and so is any count whose difference from its parent count is 1–4. Totals are rounded to multiples of 5. Rates are published only when numerator, denominator and their difference are all 0 or ≥ 5. Wards not in the official list are grouped as \"Other\".",
  fields: {
    month: "IST calendar month the complaint was filed (YYYY-MM)",
    district: "District", ward: "Ward/block as recorded", department: "Department the category is routed to", category: "Complaint category",
    filed: "Complaints filed", markedResolved: "Complaints where the department submitted proof of a fix",
    citizenVerified: "Complaints the citizen confirmed fixed (closed)", closedWithinSla: "Citizen-confirmed within the SLA hours for its priority",
  },
};
