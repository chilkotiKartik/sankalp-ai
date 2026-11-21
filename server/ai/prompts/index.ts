import { z } from "zod";

/**
 * Versioned prompts (P2.4). Each prompt has a version string stored with every AI decision (P2.6) and a zod
 * schema for its JSON output; anything that does not validate is discarded and the rules engine is used instead.
 */
export const CATEGORIES = ["pothole", "garbage", "streetlight", "water", "drain", "electricity", "tree", "other", "road_damage", "sewage", "transformer", "noise", "health_hazard", "disaster"] as const;

export interface PromptDef<T> {
  id: string;
  version: string;
  system: string;
  user: (input: Record<string, string>) => string;
  output: z.ZodType<T>;
  maxTokens: number;
}

export const classify: PromptDef<{ category: (typeof CATEGORIES)[number]; priority: "P1" | "P2" | "P3" | "P4"; reason: string; confidence: number }> = {
  id: "classify",
  version: "classify@2026-11-21.1",
  system:
    "You route civic complaints for an Indian state government. Classify the complaint. " +
    `category must be one of: ${CATEGORIES.join(", ")}. ` +
    "priority: P1 = danger to life/safety now, P2 = major public impact, P3 = moderate, P4 = minor. " +
    "reason: one short sentence in English explaining the choice (no personal data). confidence: 0 to 1. " +
    'Respond with ONLY JSON: {"category":"...","priority":"P1|P2|P3|P4","reason":"...","confidence":0.0}',
  user: (i) => `Complaint (may be Hindi, English, Hinglish, Garhwali or Kumaoni):\n${i.text}`,
  output: z.object({
    category: z.enum(CATEGORIES),
    priority: z.enum(["P1", "P2", "P3", "P4"]),
    reason: z.string().min(3).max(300),
    confidence: z.number().min(0).max(1),
  }),
  maxTokens: 150,
};

export const summarize: PromptDef<{ summary: string }> = {
  id: "summarize",
  version: "summarize@2026-11-21.1",
  system: "Summarise the civic complaint thread for an officer in at most 2 sentences, in English, without names or phone numbers. Respond with ONLY JSON: {\"summary\":\"...\"}",
  user: (i) => i.text,
  output: z.object({ summary: z.string().min(3).max(600) }),
  maxTokens: 160,
};

export const replyCitizen: PromptDef<{ reply: string }> = {
  id: "reply_citizen",
  version: "reply_citizen@2026-11-21.1",
  system:
    "You are Sankalp, a civic assistant for an Indian state government. Reply in the citizen's language ({lang}). " +
    "Be warm, concise (under 120 words) and accurate. Never invent statistics. For danger, give 112 first. " +
    'Respond with ONLY JSON: {"reply":"..."}',
  user: (i) => i.text,
  output: z.object({ reply: z.string().min(1).max(1500) }),
  maxTokens: 300,
};

export const officerBrief: PromptDef<{ brief: string; actions: string[] }> = {
  id: "officer_brief",
  version: "officer_brief@2026-11-21.1",
  system:
    "Write a factual brief for a district officer from the statistics given. Use only the numbers provided — never invent any. " +
    'Respond with ONLY JSON: {"brief":"3-5 sentences","actions":["up to 3 concrete next steps"]}',
  user: (i) => i.text,
  output: z.object({ brief: z.string().min(10).max(1500), actions: z.array(z.string().max(200)).max(3) }),
  maxTokens: 400,
};

export const PROMPTS = { classify, summarize, replyCitizen, officerBrief };
