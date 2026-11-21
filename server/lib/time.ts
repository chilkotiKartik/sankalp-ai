/**
 * m9: timestamps are stored in UTC (ISO-8601 with Z). Calendar business rules ("today", "this week",
 * weekly briefings) use Asia/Kolkata (IST, UTC+05:30, no DST). Elapsed-time rules (SLA hours) are
 * timezone-independent and use plain millisecond differences.
 */
export const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** IST calendar day key, e.g. "2026-11-21". */
export function istDayKey(at: Date | number | string): string {
  const t = new Date(at).getTime() + IST_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** UTC instant of 00:00 IST on the IST day containing `at`. */
export function startOfIstDay(at: Date | number | string = Date.now()): number {
  const t = new Date(at).getTime() + IST_OFFSET_MS;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - IST_OFFSET_MS;
}

export function isSameIstDay(a: Date | number | string, b: Date | number | string): boolean {
  return istDayKey(a) === istDayKey(b);
}

/** ISO week-of-year in IST (used by seasonal baselines, Phase 4). */
export function istWeekOfYear(at: Date | number | string): number {
  const t = new Date(new Date(at).getTime() + IST_OFFSET_MS);
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function formatIst(at: Date | number | string): string {
  return new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

/** Elapsed hours between two instants (SLA rules). */
export function hoursBetween(from: Date | number | string, to: Date | number | string = Date.now()): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / 3600000;
}
