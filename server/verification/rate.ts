import { storage } from "../storage";
import { config } from "../config";
import { getDeptIdForCategory, DEPARTMENTS } from "../data/reference";
import { wilson } from "./engine";
import type { Complaint } from "../types";

/** P3.8 Real Resolution Rate (D-038). Shared by the public endpoint and the weekly briefing. */
export const RRR_DEFINITION = "Real Resolution Rate = cases the citizen confirmed fixed ÷ cases the department marked resolved (proof submitted). 95% Wilson interval; n shown. Small n means wide intervals.";

export function resolutionRates(by: "department" | "ward", district?: string, since?: number) {
  const list = storage.getComplaints(district).filter(c => (!c.isDemo || config().DEMO_MODE) && (!since || new Date(c.submittedAt).getTime() >= since));
  const groups = new Map<string, Complaint[]>();
  for (const c of list) {
    const key = by === "department" ? getDeptIdForCategory(c.category) : `${c.district} · ${c.ward}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
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
