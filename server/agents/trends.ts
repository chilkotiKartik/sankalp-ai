import { storage } from "../storage";
import { config } from "../config";
import { istWeekOfYear } from "../lib/time";

/**
 * P4.5 real trend signals — seasonal week-of-year baselines. No invented forecasts:
 *  - baseline = mean count for the same IST week (±1) in each previous year that has data for that window
 *  - needs ≥ 2 prior years AND ≥ 10 complaints in the baseline window, otherwise "insufficient_data"
 *  - "rising" only if this week's count exceeds the upper 95% Poisson bound of the baseline (mean + 1.96·√mean + 1)
 * Every row reports n, the expected range and the observed count.
 */
export const MIN_YEARS = 2, MIN_BASELINE_N = 10;

export interface TrendRow {
  category: string; status: "rising" | "normal" | "insufficient_data";
  observed: number; expected: number | null; upper95: number | null; yearsOfHistory: number; baselineN: number; week: number;
}

export function seasonalTrends(district?: string, at = Date.now()): TrendRow[] {
  const list = storage.getComplaints(district).filter(c => !c.isDemo || config().DEMO_MODE);
  const week = istWeekOfYear(at);
  const year = new Date(at + 5.5 * 3600000).getUTCFullYear();
  const yearOf = (iso: string) => new Date(new Date(iso).getTime() + 5.5 * 3600000).getUTCFullYear();
  const near = (w: number) => Math.min(Math.abs(w - week), 53 - Math.abs(w - week)) <= 1;
  const weekStart = at - 7 * 86400000;
  const categories = [...new Set(list.map(c => c.category))].sort();
  return categories.map(category => {
    const cs = list.filter(c => c.category === category);
    const observed = cs.filter(c => new Date(c.submittedAt).getTime() > weekStart && new Date(c.submittedAt).getTime() <= at).length;
    const perYear = new Map<number, number>();
    for (const c of cs) {
      const y = yearOf(c.submittedAt);
      if (y >= year || !near(istWeekOfYear(c.submittedAt))) continue;
      perYear.set(y, (perYear.get(y) ?? 0) + 1);
    }
    const years = perYear.size;
    const baselineN = [...perYear.values()].reduce((a, b) => a + b, 0);
    if (years < MIN_YEARS || baselineN < MIN_BASELINE_N) {
      return { category, status: "insufficient_data" as const, observed, expected: null, upper95: null, yearsOfHistory: years, baselineN, week };
    }
    const expected = baselineN / years / 3; // a 3-week window per year → per-week mean
    const upper95 = expected + 1.96 * Math.sqrt(expected) + 1;
    return { category, status: observed > upper95 ? "rising" as const : "normal" as const, observed, expected: Math.round(expected * 10) / 10, upper95: Math.round(upper95 * 10) / 10, yearsOfHistory: years, baselineN, week };
  });
}
