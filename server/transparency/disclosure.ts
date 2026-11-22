import { WARDS_DATA } from "../data/reference";
import { wilson } from "../verification/engine";

/**
 * Statistical disclosure control for every PUBLIC aggregate (review P8-1..4, 7).
 *  - primary suppression: counts 1..K-1 are published as "<5"
 *  - complementary suppression: a count is also suppressed when its difference from its parent count is 1..K-1
 *    (e.g. filed 5, verified 4 → "1 not verified" would be revealed)
 *  - totals are rounded to base K, so totals minus visible cells cannot recover a suppressed cell
 *  - a rate is published only if numerator, denominator and complement are all 0 or ≥ K
 *  - only ward names from the tenant reference list are published; anything else becomes "Other"
 */
export const K = 5;
export type Cell = number | "<5";

const small = (n: number) => n > 0 && n < K;
export const sup = (n: number, parent?: number): Cell => (small(n) || (parent !== undefined && small(parent - n)) ? "<5" : n);
export const roundTotal = (n: number) => (n === 0 ? 0 : Math.max(K, Math.round(n / K) * K));
export const safeRate = (x: number, n: number) => (n >= K && !small(x) && !small(n - x) ? wilson(x, n) : null);

export function publicWard(ward: string, district: string): string {
  const known = WARDS_DATA.some(w => w.district === district && w.name === ward);
  return known ? ward : "Other";
}

/** CSV cell: quoted when needed, and spreadsheet formulas neutralised (= + - @ tab CR). */
export function csvCell(v: unknown): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
