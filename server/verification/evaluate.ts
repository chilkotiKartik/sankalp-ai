import type { Complaint, ProofVerification, VerificationSignal } from "../types";
import { tenant } from "../tenancy";
import { decide, type Weights } from "./engine";

/** Synchronous re-evaluation (no storage access) — safe to call from storage on every citizen/neighbour answer. */
export function humanSignals(c: Complaint): VerificationSignal[] {
  const citizen: VerificationSignal = c.citizenAnswer
    ? { name: "citizen", score: c.citizenAnswer === "yes" ? 1 : 0, method: c.citizenAnswerChannel ?? "app", detail: `Citizen answered "${c.citizenAnswer}" via ${c.citizenAnswerChannel ?? "app"}` }
    : { name: "citizen", score: null, method: "pending", detail: "Waiting for the citizen" };
  const answers = c.neighbourAnswers ?? [];
  const yes = answers.filter(a => a.fixed).length;
  const neighbour: VerificationSignal = answers.length
    ? { name: "neighbour", score: round(yes / answers.length), method: "neighbour", detail: `${yes} of ${answers.length} neighbours say it is fixed` }
    : { name: "neighbour", score: null, method: "neighbour", detail: c.neighbourInvites?.length ? "Neighbours asked, no answers yet" : "No neighbours asked" };
  return [citizen, neighbour];
}

/** Re-evaluate with stored machine signals + current human answers (synchronous, used on every answer). */
export function evaluate(c: Complaint): ProofVerification {
  const v = tenant().verification;
  const machine = c.verification?.signals.filter(s => s.name !== "citizen" && s.name !== "neighbour") ?? [];
  const machineFlags = c.verification?.flags ?? [];
  const neighbourNo = (c.neighbourAnswers ?? []).length >= 2 && (c.neighbourAnswers ?? []).every(a => !a.fixed) ? ["neighbours_say_not_fixed"] : [];
  const changeNo = machine.some(s => s.name === "change" && s.score !== null && s.score < 0.3) ? ["vision_says_not_fixed"] : [];
  const flags = [...new Set([...machineFlags, ...neighbourNo, ...changeNo])];
  return decide([...machine, ...humanSignals(c)], flags, v.weights as Weights, v);
}


const round = (x: number) => Math.round(x * 1000) / 1000;
