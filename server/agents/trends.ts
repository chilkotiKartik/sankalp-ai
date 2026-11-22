import { storage } from "../storage";
import { config } from "../config";
import { istWeekOfYear } from "../lib/time";

/**
 * P4.5 real trend signals — seasonal week-of-year baselines. No invented forecasts:
 *  - baseline = mean weekly count in the 3-week window centred on this week, 52·k weeks ago, for each previous year
 *    inside the data coverage (years with no complaints in the window count as 0 — review P4-5)
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
  const DAY = 86400000, YEAR = 364 * DAY; // 52 weeks: keeps the weekday alignment, avoids ISO week-year edge cases
  const weekStart = at - 7 * DAY;
  // Review P4-5: data coverage starts with the first complaint of this state; earlier years are "no data", not zero.
  const coverageStart = Math.min(...storage.getComplaints().map(c => new Date(c.submittedAt).getTime()), at);
  const categories = [...new Set(list.map(c => c.category))].sort();
  return categories.map(category => {
    const ts = list.filter(c => c.category === category).map(c => new Date(c.submittedAt).getTime());
    const observed = ts.filter(t => t > weekStart && t <= at).length;
    // Year k window: the 3 weeks centred on this week, k×52 weeks ago. Counted only if fully inside coverage,
    // and never overlapping the observed week. Years with zero complaints in the window count as 0.
    let years = 0, baselineN = 0;
    for (let k = 1; k <= 10; k++) {
      const from = at - k * YEAR - 14 * DAY, to = at - k * YEAR + 7 * DAY;
      if (from < coverageStart || to > weekStart) continue;
      years++;
      baselineN += ts.filter(t => t > from && t <= to).length;
    }
    if (years < MIN_YEARS || baselineN < MIN_BASELINE_N) {
      return { category, status: "insufficient_data" as const, observed, expected: null, upper95: null, yearsOfHistory: years, baselineN, week };
    }
    const expected = baselineN / years / 3; // 3-week window per year → per-week mean
    const upper95 = expected + 1.96 * Math.sqrt(expected) + 1;
    return { category, status: observed > upper95 ? "rising" as const : "normal" as const, observed, expected: Math.round(expected * 10) / 10, upper95: Math.round(upper95 * 10) / 10, yearsOfHistory: years, baselineN, week };
  });
}
