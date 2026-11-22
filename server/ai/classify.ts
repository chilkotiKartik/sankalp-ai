import { runPrompt } from "./gateway";
import { classify as classifyPrompt } from "./prompts";
import { classifyText } from "./rules";
import { inputHash } from "./gateway";
import { maskPII } from "./pii";

/**
 * Complaint classification with explainability (P2.4, P2.6). Model output is used only if it validates;
 * otherwise the deterministic rules engine decides. Every decision records model, prompt version,
 * input hash, output and confidence so officers can see WHY a case was routed.
 */
export interface AIDecision {
  task: "classify";
  method: "model" | "rules";
  provider: string;
  model: string;
  promptVersion: string;
  inputHash: string;
  output: { category: string; priority?: string };
  confidence: number;
  reason: string;
  at: string;
}

export const RULES_VERSION = "rules@2026-11-21.1";

export async function classifyComplaint(text: string): Promise<AIDecision> {
  const at = new Date().toISOString();
  // Review P2-3: complaint creation never waits more than ~4 s for a model.
  const ai = await runPrompt(classifyPrompt, { text }, {}, { deadlineMs: 4000 });
  const r = classifyText(text);
  if (ai) {
    // Review P2-8: the model's free text is untrusted. Mask it, keep it short and label it as a suggestion.
    const reason = `AI suggestion: ${maskPII(ai.data.reason).replace(/[<>\n\r]/g, " ").slice(0, 200)}`;
    // A low-confidence model answer that contradicts a definite keyword match loses to the rules.
    if (ai.data.confidence < 0.8 && r.category !== "other" && r.category !== ai.data.category) {
      return { task: "classify", method: "rules", provider: "rules", model: "keyword-rules", promptVersion: RULES_VERSION, inputHash: inputHash(maskPII(text)),
        output: { category: r.category }, confidence: r.confidence, reason: `${r.reason} (model suggested "${ai.data.category}" with low confidence)`, at };
    }
    return { task: "classify", method: "model", provider: ai.provider, model: ai.model, promptVersion: ai.promptVersion, inputHash: ai.inputHash,
      output: { category: ai.data.category, priority: ai.data.priority }, confidence: ai.data.confidence, reason, at };
  }
  return { task: "classify", method: "rules", provider: "rules", model: "keyword-rules", promptVersion: RULES_VERSION, inputHash: inputHash(maskPII(text)),
    output: { category: r.category }, confidence: r.confidence, reason: r.reason, at };
}
