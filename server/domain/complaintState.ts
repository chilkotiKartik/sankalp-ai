/**
 * Complaint lifecycle (M7, MASTER_PROMPT §7.1). Pure functions — no I/O.
 *
 * NEW → ASSIGNED → IN_PROGRESS → PROOF_SUBMITTED → VERIFYING
 * VERIFYING → CITIZEN_VERIFIED → CLOSED
 * VERIFYING → NEEDS_REVIEW → (reviewer) CITIZEN_VERIFIED (citizen already said yes) | VERIFYING | REOPENED
 * VERIFYING → REJECTED_BY_CITIZEN → REOPENED (count++); count ≥ 3 → ESCALATED
 * PROOF_SUBMITTED + 7 days no response + checks pass → AUTO_CLOSED_UNVERIFIED (tenant opt-in; disabled by default)
 * NEW → CANCELLED_BY_CITIZEN (only before ASSIGNED)
 */
export const STATES = [
  "NEW", "ASSIGNED", "IN_PROGRESS", "PROOF_SUBMITTED", "VERIFYING", "NEEDS_REVIEW",
  "CITIZEN_VERIFIED", "CLOSED", "REJECTED_BY_CITIZEN", "REOPENED", "ESCALATED",
  "AUTO_CLOSED_UNVERIFIED", "CANCELLED_BY_CITIZEN",
] as const;
export type ComplaintState = (typeof STATES)[number];

export type ActorKind = "citizen_owner" | "officer" | "reviewer" | "worker" | "system";

/** to-state → which actor kinds may perform it from which from-states */
const TRANSITIONS: Record<ComplaintState, Partial<Record<ComplaintState, ActorKind[]>>> = {
  NEW: { ASSIGNED: ["officer", "system"], CANCELLED_BY_CITIZEN: ["citizen_owner"] },
  ASSIGNED: { IN_PROGRESS: ["officer", "worker", "system"] },
  IN_PROGRESS: { PROOF_SUBMITTED: ["officer", "worker"] },
  PROOF_SUBMITTED: { VERIFYING: ["system"], AUTO_CLOSED_UNVERIFIED: ["system"] },
  VERIFYING: { CITIZEN_VERIFIED: ["citizen_owner"], NEEDS_REVIEW: ["system"], REJECTED_BY_CITIZEN: ["citizen_owner"] },
  // P3.7: a reviewer may accept the proof (→ VERIFYING, still awaiting the citizen) or reopen. CITIZEN_VERIFIED by a
  // reviewer is allowed only when the citizen already said "yes" (enforced in storage.reviewDecision — rule 4).
  NEEDS_REVIEW: { CITIZEN_VERIFIED: ["reviewer"], VERIFYING: ["reviewer"], REOPENED: ["reviewer"], REJECTED_BY_CITIZEN: ["citizen_owner"] },
  CITIZEN_VERIFIED: { CLOSED: ["system"] },
  REJECTED_BY_CITIZEN: { REOPENED: ["system"], ESCALATED: ["system"] },
  REOPENED: { ASSIGNED: ["officer", "system"], IN_PROGRESS: ["officer", "worker"] },
  ESCALATED: { ASSIGNED: ["officer", "system"], IN_PROGRESS: ["officer", "worker"] },
  CLOSED: {},
  AUTO_CLOSED_UNVERIFIED: {},
  CANCELLED_BY_CITIZEN: {},
};

export const TERMINAL: ReadonlySet<ComplaintState> = new Set(["CLOSED", "AUTO_CLOSED_UNVERIFIED", "CANCELLED_BY_CITIZEN"]);
export const REJECTIONS_BEFORE_ESCALATION = 3;

export class TransitionError extends Error {
  constructor(public from: ComplaintState, public to: ComplaintState, public actor: ActorKind) {
    super(`Illegal transition ${from} → ${to} by ${actor}`);
    this.name = "TransitionError";
  }
}

export function canTransition(from: ComplaintState, to: ComplaintState, actor: ActorKind): boolean {
  return !!TRANSITIONS[from]?.[to]?.includes(actor);
}

export function assertTransition(from: ComplaintState, to: ComplaintState, actor: ActorKind): void {
  if (!canTransition(from, to, actor)) throw new TransitionError(from, to, actor);
}

/** Legacy 4-value status kept for API backwards compatibility (rule 11). */
export type LegacyStatus = "pending" | "in_progress" | "resolved" | "closed";
export function legacyStatus(s: ComplaintState): LegacyStatus {
  switch (s) {
    case "NEW": return "pending";
    case "ASSIGNED": case "IN_PROGRESS": case "REOPENED": case "ESCALATED": case "REJECTED_BY_CITIZEN": return "in_progress";
    case "PROOF_SUBMITTED": case "VERIFYING": case "NEEDS_REVIEW": return "resolved"; // = "awaiting citizen confirmation"
    default: return "closed";
  }
}

export interface Transitionable {
  state: ComplaintState;
  rejectionCount: number;
}

export interface TransitionStep { from: ComplaintState; to: ComplaintState; actor: ActorKind }

/** Apply a path of transitions atomically; validates every hop before mutating. */
export function applyPath<T extends Transitionable>(c: T, path: Array<[ComplaintState, ActorKind]>): TransitionStep[] {
  let cur = c.state;
  const steps: TransitionStep[] = [];
  for (const [to, actor] of path) {
    assertTransition(cur, to, actor);
    steps.push({ from: cur, to, actor });
    cur = to;
  }
  c.state = cur;
  return steps;
}

/** Officer wants work to be "in progress" from wherever it currently is. */
export function pathToInProgress(from: ComplaintState, actor: "officer" | "worker"): Array<[ComplaintState, ActorKind]> {
  if (from === "NEW") return [["ASSIGNED", "system"], ["IN_PROGRESS", actor]];
  if (from === "ASSIGNED" || from === "REOPENED" || from === "ESCALATED") return [["IN_PROGRESS", actor]];
  if (from === "IN_PROGRESS") return [];
  throw new TransitionError(from, "IN_PROGRESS", actor);
}

/** Proof submission: (auto-advance to IN_PROGRESS) → PROOF_SUBMITTED → VERIFYING. */
export function pathToVerifying(from: ComplaintState, actor: "officer" | "worker"): Array<[ComplaintState, ActorKind]> {
  return [...pathToInProgress(from, actor), ["PROOF_SUBMITTED", actor], ["VERIFYING", "system"]];
}

/** Citizen rejects the fix: REJECTED_BY_CITIZEN → REOPENED, or ESCALATED on the 3rd rejection. */
export function citizenReject<T extends Transitionable>(c: T): TransitionStep[] {
  const steps = applyPath(c, [["REJECTED_BY_CITIZEN", "citizen_owner"]]);
  c.rejectionCount += 1;
  const next: ComplaintState = c.rejectionCount >= REJECTIONS_BEFORE_ESCALATION ? "ESCALATED" : "REOPENED";
  return [...steps, ...applyPath(c, [[next, "system"]])];
}

/** Citizen confirms the fix: CITIZEN_VERIFIED → CLOSED. */
export function citizenConfirm<T extends Transitionable>(c: T): TransitionStep[] {
  return applyPath(c, [["CITIZEN_VERIFIED", "citizen_owner"], ["CLOSED", "system"]]);
}
