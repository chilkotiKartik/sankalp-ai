import { describe, it, expect } from "vitest";
import {
  STATES, canTransition, assertTransition, applyPath, pathToInProgress, pathToVerifying, citizenReject, citizenConfirm,
  legacyStatus, TERMINAL, TransitionError, type ComplaintState, type ActorKind,
} from "../server/domain/complaintState";

const mk = (state: ComplaintState, rejectionCount = 0) => ({ state, rejectionCount });

describe("complaint state machine (M7)", () => {
  const legal: Array<[ComplaintState, ComplaintState, ActorKind]> = [
    ["NEW", "ASSIGNED", "officer"], ["NEW", "CANCELLED_BY_CITIZEN", "citizen_owner"],
    ["ASSIGNED", "IN_PROGRESS", "worker"], ["IN_PROGRESS", "PROOF_SUBMITTED", "officer"],
    ["PROOF_SUBMITTED", "VERIFYING", "system"], ["VERIFYING", "CITIZEN_VERIFIED", "citizen_owner"],
    ["VERIFYING", "NEEDS_REVIEW", "system"], ["VERIFYING", "REJECTED_BY_CITIZEN", "citizen_owner"],
    ["NEEDS_REVIEW", "CITIZEN_VERIFIED", "reviewer"], ["NEEDS_REVIEW", "REOPENED", "reviewer"],
    ["CITIZEN_VERIFIED", "CLOSED", "system"], ["REJECTED_BY_CITIZEN", "REOPENED", "system"],
    ["REJECTED_BY_CITIZEN", "ESCALATED", "system"], ["REOPENED", "IN_PROGRESS", "officer"], ["ESCALATED", "ASSIGNED", "officer"],
    ["PROOF_SUBMITTED", "AUTO_CLOSED_UNVERIFIED", "system"],
  ];
  it.each(legal)("%s → %s by %s is allowed", (from, to, actor) => {
    expect(canTransition(from, to, actor)).toBe(true);
  });

  it("rejects every transition not in the table (exhaustive)", () => {
    const allowed = new Set(legal.map(([f, t, a]) => `${f}|${t}|${a}`));
    const actors: ActorKind[] = ["citizen_owner", "officer", "reviewer", "worker", "system"];
    let checked = 0;
    for (const f of STATES) for (const t of STATES) for (const a of actors) {
      const key = `${f}|${t}|${a}`;
      // Extra legal pairs that are intentionally broader than the list above:
      const extra = (f === "NEW" && t === "ASSIGNED" && a === "system") || (f === "ASSIGNED" && t === "IN_PROGRESS" && (a === "officer" || a === "system"))
        || (f === "IN_PROGRESS" && t === "PROOF_SUBMITTED" && a === "worker") || (f === "REOPENED" && (t === "ASSIGNED" && (a === "officer" || a === "system") || t === "IN_PROGRESS" && a === "worker"))
        || (f === "ESCALATED" && (t === "ASSIGNED" && a === "system" || t === "IN_PROGRESS" && (a === "officer" || a === "worker")));
      if (allowed.has(key) || extra) continue;
      expect(canTransition(f, t, a), key).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThan(800);
  });

  it("officers can never close a case", () => {
    for (const s of STATES) expect(canTransition(s, "CLOSED", "officer")).toBe(false);
    for (const s of STATES) expect(canTransition(s, "CITIZEN_VERIFIED", "officer")).toBe(false);
  });

  it("cancellation is only possible before assignment", () => {
    expect(canTransition("NEW", "CANCELLED_BY_CITIZEN", "citizen_owner")).toBe(true);
    expect(canTransition("ASSIGNED", "CANCELLED_BY_CITIZEN", "citizen_owner")).toBe(false);
  });

  it("terminal states have no exits", () => {
    for (const t of TERMINAL) for (const s of STATES) for (const a of ["citizen_owner", "officer", "reviewer", "worker", "system"] as ActorKind[]) {
      expect(canTransition(t, s, a)).toBe(false);
    }
  });

  it("full happy path NEW → CLOSED", () => {
    const c = mk("NEW");
    applyPath(c, pathToVerifying(c.state, "officer"));
    expect(c.state).toBe("VERIFYING");
    citizenConfirm(c);
    expect(c.state).toBe("CLOSED");
  });

  it("each rejection reopens; the third escalates", () => {
    const c = mk("VERIFYING");
    citizenReject(c);
    expect(c).toMatchObject({ state: "REOPENED", rejectionCount: 1 });
    applyPath(c, pathToVerifying(c.state, "officer"));
    citizenReject(c);
    expect(c).toMatchObject({ state: "REOPENED", rejectionCount: 2 });
    applyPath(c, pathToVerifying(c.state, "officer"));
    citizenReject(c);
    expect(c).toMatchObject({ state: "ESCALATED", rejectionCount: 3 });
    applyPath(c, pathToInProgress(c.state, "officer"));
    expect(c.state).toBe("IN_PROGRESS");
  });

  it("applyPath is atomic — an illegal hop leaves the state unchanged", () => {
    const c = mk("NEW");
    expect(() => applyPath(c, [["ASSIGNED", "officer"], ["CLOSED", "officer"]])).toThrow(TransitionError);
    expect(c.state).toBe("NEW");
    expect(() => assertTransition("CLOSED", "REOPENED", "system")).toThrow();
  });

  it("legacy status mapping keeps old clients working", () => {
    expect(legacyStatus("NEW")).toBe("pending");
    expect(legacyStatus("IN_PROGRESS")).toBe("in_progress");
    expect(legacyStatus("VERIFYING")).toBe("resolved");
    expect(legacyStatus("CLOSED")).toBe("closed");
    expect(legacyStatus("ESCALATED")).toBe("in_progress");
  });
});
