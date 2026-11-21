import { decodeBase64Payload, sniff } from "../lib/media";
import { maskPII } from "../ai/pii";
import { stateLabel } from "../data/reference";
import type { Express } from "express";
import { z } from "zod";
import { storage, assignDepartment } from "../storage";
import { route, none } from "../lib/route";
import { chat, vision, stt, extractJson, type Msg } from "../ai/gateway";
import { AppError } from "../lib/errors";
import { rulesReply } from "../ai/rules";
import { aiLimiter } from "./limits";
import { CATEGORIES, text } from "./common";

/**
 * AI routes — every model call goes through server/ai/gateway.ts (M10).
 * Fail closed (rule 5): when no sovereign vision model is configured or it fails,
 * the answer is `manual_review`, never "looks real".
 */
function liveStats(district?: string) {
  const complaints = storage.getComplaints(district);
  const wards = storage.getWards(district).filter(w => w.n > 0);
  return {
    total: complaints.length,
    resolved: complaints.filter(c => c.state === "CLOSED").length,
    pending: complaints.filter(c => c.status === "pending").length,
    activeSos: storage.getSosAlerts(district).filter(s => s.status === "active").length,
    avgHealth: wards.length ? Math.round(wards.reduce((a, w) => a + w.healthScore, 0) / wards.length) : 0,
  };
}

// Review P2-6: no personal data (not even the first name) goes into a model prompt.
function systemPrompt(district?: string): string {
  const s = liveStats(district);
  return `You are Sankalp, a warm civic assistant for the Government of ${stateLabel()}'s SANKALP AI platform.
Reply in the user's language (Hindi or English), concisely (under 200 words), kindly and accurately.
Never invent statistics. If someone is in danger, give the emergency number first: Police/All emergencies 112, Women helpline 1090, Ambulance 108, Disaster 1070.
Recorded data for ${district || stateLabel()}: ${s.total} complaints, ${s.resolved} closed with citizen confirmation, ${s.pending} pending, ${s.activeSos} active SOS.`;
}

const imageAnalysis = z.object({
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  issueType: z.string().max(40),
  description: z.string().max(400).transform(v => maskPII(v)),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
}).strip();

export function registerAiRoutes(app: Express) {
  // P5.5 voice-first complaint: speech → editable text. Sarvam STT (India) only; audio is not stored.
  route(app, {
    method: "post", path: "/api/ai/transcribe", auth: "user", permission: "ai.transcribe",
    middleware: [aiLimiter],
    params: none, query: none,
    body: z.object({ audioBase64: z.string().min(16).max(8 * 1024 * 1024), lang: z.enum(["hi-IN", "en-IN"]).default("hi-IN") }),
    handler: async ({ body }) => {
      const buf = decodeBase64Payload(body.audioBase64, 6 * 1024 * 1024);
      const kind = sniff(buf);
      if (!kind || kind.kind !== "audio") throw new AppError(422, "UNSUPPORTED_MEDIA", "Only M4A, AAC, WebM, Ogg or WAV audio is accepted");
      const r = await stt(buf, kind.mime, body.lang);
      return r ? { status: "transcribed", transcript: r.transcript, provider: r.provider } : { status: "unavailable", transcript: null };
    },
  });

  route(app, {
    method: "post", path: "/api/ai/chat", auth: "user", permission: "ai.chat",
    middleware: [aiLimiter],
    params: none, query: none,
    body: z.object({
      message: z.string().trim().min(1).max(2000),
      // Client-supplied roles are restricted to user/assistant — a client can never inject a system prompt (audit H11).
      history: z.array(z.object({ role: z.enum(["user", "assistant", "ai"]), content: z.string().max(2000) })).max(20).optional(),
    }),
    handler: async ({ body, user }) => {
      const history: Msg[] = (body.history || []).slice(-6).map(h => ({ role: h.role === "user" ? "user" : "assistant", content: h.content }));
      const result = await chat([{ role: "system", content: systemPrompt(user.district) }, ...history, { role: "user", content: body.message }]);
      if (result) return { reply: result.text, timestamp: new Date().toISOString(), powered_by: result.provider };
      const reply = rulesReply(body.message, body.history || [], user.name, user.district, liveStats(user.district));
      return { reply, timestamp: new Date().toISOString(), powered_by: "rules" };
    },
  });

  route(app, {
    method: "post", path: "/api/ai/analyze-image", auth: "user", permission: "ai.vision",
    middleware: [aiLimiter],
    params: none, query: none,
    body: z.object({ imageBase64: z.string().min(16).max(22 * 1024 * 1024), category: z.enum(CATEGORIES).optional() }),
    handler: async ({ body }) => {
      const prompt = `Identify the civic issue in this photo from Uttarakhand, India. Respond ONLY with JSON:
{"severity":"Low|Medium|High|Critical","issueType":"pothole|garbage|streetlight|water|drain|electricity|tree|other","description":"1-2 sentences","priority":"P1|P2|P3|P4"}`;
      const result = await vision(body.imageBase64, prompt);
      // Review P2-10: model output is validated against a strict schema; nothing else is passed through.
      const parsed = result ? imageAnalysis.safeParse(extractJson(result.text)) : null;
      if (result && parsed?.success) {
        const a = parsed.data;
        const issue = (CATEGORIES as readonly string[]).includes(a.issueType) ? a.issueType : "other";
        return { analysis: { severity: a.severity, issueType: issue, description: a.description, priority: a.priority, department: assignDepartment(issue) }, status: "analyzed", powered_by: result.provider };
      }
      const cat = body.category || "other";
      return {
        status: "manual_review",
        analysis: { severity: null, issueType: cat, priority: null, department: assignDepartment(cat),
          description: "Automatic photo analysis is not available. An officer will review the photo.", estimatedFixTime: null },
        powered_by: "manual_review",
      };
    },
  });

  route(app, {
    method: "post", path: "/api/ai/detect-image", auth: "user", permission: "ai.vision",
    middleware: [aiLimiter],
    params: none, query: none,
    body: z.object({ imageBase64: z.string().min(16).max(22 * 1024 * 1024) }),
    handler: async ({ body }) => {
      const result = await vision(body.imageBase64, `Is this a real camera photograph or AI-generated/edited? Reply ONLY as JSON: {"isReal":true|false,"confidence":0-100,"reason":"brief"}`);
      const parsed = result ? extractJson<{ isReal?: unknown; confidence?: unknown; reason?: unknown }>(result.text) : null;
      // Review P2-9: only a confident answer counts; anything below 80% goes to a human.
      if (result && parsed && typeof parsed.isReal === "boolean" && typeof parsed.confidence === "number" && parsed.confidence >= 80) {
        return { status: "analyzed", isReal: parsed.isReal, confidence: Math.max(0, Math.min(100, parsed.confidence)), reason: String(parsed.reason ?? "").slice(0, 300), powered_by: result.provider };
      }
      // M4 — fail closed.
      return { status: "manual_review", isReal: null, confidence: null, reason: "Authenticity could not be checked automatically — an officer will review this photo.", powered_by: "manual_review" };
    },
  });

  route(app, {
    method: "post", path: "/api/rti/ai-draft", auth: "user", permission: "ai.rti_draft",
    middleware: [aiLimiter],
    params: none, query: none,
    body: z.object({ topic: z.string().trim().min(3).max(1000), targetDepartment: text(200).optional(), district: text(60).optional() }),
    handler: async ({ body }) => {
      const result = await chat([
        { role: "system", content: "You draft formal RTI applications under the RTI Act 2005 (India). Output only the application text." },
        { role: "user", content: `Topic: ${body.topic}\nDepartment: ${body.targetDepartment || "Concerned Department"}\nDistrict: ${body.district || stateLabel()}` },
      ], { maxTokens: 600 });
      if (result) return { text: result.text, powered_by: result.provider };
      const dept = body.targetDepartment || "Concerned Department";
      return { powered_by: "template", text: `To,\nThe Public Information Officer,\n${dept},\n${body.district || stateLabel()}\n\nSub: Application for Information under the Right to Information Act, 2005\n\nRespected Sir/Madam,\n\nI request the following information under Section 6 of the RTI Act, 2005:\n\n${body.topic}\n\n1. Complete details regarding the above\n2. Copies of relevant documents, records and files\n3. Names and designations of responsible officials\n4. Status of any pending action or decision\n5. Copies of orders, circulars or notices issued in this regard\n\nThe prescribed fee of ₹10 is enclosed (BPL applicants are exempt). Please provide the information within 30 days as required by Section 7(1). If it is held by another public authority, please transfer this application under Section 6(3) within 5 days.\n\nThank you,\n[Your Name]\n[Address]\n[Phone/Email]\n[Date]` };
    },
  });
}
