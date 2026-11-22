import type { ProofVerification, VerificationSignal } from "../types";

/**
 * P3.7 decision engine — pure and deterministic.
 *  score    = Σ wᵢ·sᵢ / Σ wᵢ over KNOWN signals (unknown = not measurable, excluded, never a pass)
 *  coverage = Σ wᵢ(known) / Σ wᵢ(all)
 * Decisions (D-036):
 *  - citizen said "no"                                       → REJECTED (reopen)
 *  - any hard flag (reused photo, far from site, …)          → NEEDS_REVIEW
 *  - citizen said "yes" and score ≥ verifiedThreshold        → VERIFIED (may close)
 *  - citizen has not answered yet                            → PENDING_CITIZEN
 *  - anything else                                           → NEEDS_REVIEW
 * Machine signals alone never close and never reject a case (rule 4; fail closed to a human).
 */
export const ENGINE_VERSION = "proof-engine@2026-11-21.1";

export type Weights = Record<VerificationSignal["name"], number>;

export interface Thresholds { verifiedThreshold: number; rejectThreshold: number }

export function decide(signals: VerificationSignal[], flags: string[], weights: Weights, t: Thresholds, at = new Date().toISOString()): ProofVerification {
  const total = signals.reduce((a, s) => a + (weights[s.name] ?? 0), 0);
  const known = signals.filter(s => s.score !== null && (weights[s.name] ?? 0) > 0);
  const kw = known.reduce((a, s) => a + weights[s.name], 0);
  const score = kw > 0 ? round(known.reduce((a, s) => a + weights[s.name] * (s.score as number), 0) / kw) : null;
  const coverage = total > 0 ? round(kw / total) : 0;
  const citizen = signals.find(s => s.name === "citizen")?.score ?? null;
  let decision: ProofVerification["decision"];
  if (citizen === 0) decision = "REJECTED";
  else if (flags.length) decision = "NEEDS_REVIEW";
  else if (citizen === 1) decision = score !== null && score >= t.verifiedThreshold ? "VERIFIED" : "NEEDS_REVIEW";
  else decision = score !== null && score < t.rejectThreshold ? "NEEDS_REVIEW" : "PENDING_CITIZEN";
  return { engineVersion: ENGINE_VERSION, signals, flags, score, coverage, decision, at };
}

const round = (x: number) => Math.round(x * 1000) / 1000;

/** P3.8 Wilson score interval (95% by default). Returns null for n = 0. */
export function wilson(successes: number, n: number, z = 1.96): { p: number; low: number; high: number; n: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p: round(p), low: round(Math.max(0, centre - half)), high: round(Math.min(1, centre + half)), n };
}
