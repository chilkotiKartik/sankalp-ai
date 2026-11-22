import { storage, storeFor } from "../storage";
import { config } from "../config";
import { getDeptIdForCategory, DEPARTMENTS } from "../data/reference";
import { wilson } from "./engine";
import type { Complaint } from "../types";

/** P3.8 Real Resolution Rate (D-038). Shared by the public endpoint and the weekly briefing. */
export const RRR_DEFINITION = "Real Resolution Rate = cases the citizen confirmed fixed ÷ cases the department marked resolved (proof submitted). 95% Wilson interval; n shown. Small n means wide intervals.";

/** Public aggregate: cached per tenant/query (it changes slowly; heavy public traffic must not load the server). */
const cache = new Map<string, { at: number; rev: number; store: object; rows: ReturnType<typeof compute> }>();
export function resolutionRates(by: "department" | "ward", district?: string, since?: number) {
  const key = `${storage.tenantId}|${by}|${district ?? ""}|${since ?? ""}`;
  const hit = cache.get(key);
  // Exact when idle (same revision); at most 5 s old under write load.
  // keyed on the store object too (review P7 low): a recreated store restarts its revision counter at 0
  const store = storeFor(storage.tenantId);
  if (hit && hit.store === store && (hit.rev === storage.revision || Date.now() - hit.at < 5_000)) return hit.rows;
  const rows = compute(by, district, since);
  cache.set(key, { at: Date.now(), rev: storage.revision, store, rows });
  if (cache.size > 500) cache.clear();
  return rows;
}

function compute(by: "department" | "ward", district?: string, since?: number) {
  const list = storage.getComplaints(district).filter(c => (!c.isDemo || config().DEMO_MODE) && (!since || new Date(c.submittedAt).getTime() >= since));
  // P7.3: linear grouping (was quadratic: 290 ms at 20k complaints).
  const groups = new Map<string, Complaint[]>();
  for (const c of list) {
    const key = by === "department" ? getDeptIdForCategory(c.category) : `${c.district} · ${c.ward}`;
    const g = groups.get(key);
    if (g) g.push(c); else groups.set(key, [c]);
  }
  return [...groups.entries()].map(([key, cs]) => {
    const claimed = cs.filter(c => !!c.proofSubmittedAt);
    const verified = claimed.filter(c => c.state === "CLOSED").length;
    return {
      key, label: by === "department" ? DEPARTMENTS[key]?.name ?? key : key,
      filed: cs.length, officialResolved: claimed.length, officialRate: wilson(claimed.length, cs.length),
      citizenVerified: verified, realResolutionRate: wilson(verified, claimed.length),
    };
  }).sort((a, b) => b.filed - a.filed);
}
