import { config } from "../config";
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { tenant } from "../tenancy";
import { route, none, idParams } from "../lib/route";
import { notFound, AppError } from "../lib/errors";
import { mediaDriver } from "../lib/media";

/**
 * DPDP Act 2023 features (P1.9). The state government is the Data Fiduciary; SANKALP is the Processor.
 * Consent is required before non-emergency processing. SOS is never blocked by consent (rule 9).
 */
export function noticeFor(lang: "en" | "hi" = "en") {
  const t = tenant();
  const p = t.privacy;
  const days = t.retention;
  return {
    version: p.noticeVersion,
    controller: `${p.controller} — ${t.name}`,
    processor: p.processor,
    purposes: p.purposes.map(x => ({ id: x.id, text: lang === "hi" ? x.hi : x.en })),
    dataCollected: lang === "hi"
      ? ["नाम और मोबाइल नंबर", "शिकायत का विवरण, फोटो और स्थान", "SOS के समय लाइव लोकेशन और ऑडियो"]
      : ["Name and mobile number", "Complaint details, photos and location", "Live location and audio during an SOS"],
    retention: { complaintsDays: days.complaintsDays, mediaDaysAfterClosure: days.mediaDaysAfterClosure, sosEvidenceDays: days.sosEvidenceDays, needsLegalConfirmation: days.needsLegalConfirmation, sosAudioDays: days.sosAudioDays },
    rights: lang === "hi"
      ? ["अपना डेटा देखने/डाउनलोड करने का अधिकार", "सुधार और मिटाने का अधिकार (पुलिस मामलों में कानूनी रोक लागू)", "शिकायत अधिकारी से शिकायत करने का अधिकार"]
      : ["Access and download your data", "Correction and erasure (police cases may be under legal hold)", "Complain to the grievance officer"],
    sharing: lang === "hi" ? "आपका डेटा बेचा नहीं जाता। डेटा भारत में ही रहता है।" : "Your data is never sold. It stays in India.",
    // Processors that see complaint content (named so consent is informed). Text is PII-masked before it is sent.
    aiProcessing: aiProcessors(lang),
    grievanceOfficer: t.grievanceOfficer,
    sosNote: lang === "hi" ? "SOS हमेशा काम करता है, सहमति के बिना भी।" : "SOS always works, even without consent.",
  };
}

function aiProcessors(lang: "en" | "hi"): string | null {
  const c = config();
  const uses: string[] = [];
  if (c.textProvider === "sarvam") uses.push(lang === "hi" ? "शिकायत का पाठ (नाम/नंबर हटाकर)" : "complaint text (names and numbers removed)");
  if (c.visionProvider === "sarvam") uses.push(lang === "hi" ? "शिकायत और सुधार की फोटो" : "complaint and repair photos");
  if (!uses.length) return null;
  return lang === "hi"
    ? `सही विभाग चुनने और फोटो जाँचने के लिए ${uses.join(" और ")} Sarvam AI (भारत) को भेजे जाते हैं। वे भारत में ही प्रोसेस होते हैं।`
    : `To route your complaint and check photos, ${uses.join(" and ")} are processed by Sarvam AI, an Indian company, in India.`;
}

/** Throws 428 if the signed-in citizen has not accepted the current notice. Staff accounts are exempt. */
export function requireConsent(user: { id: string; role: string }) {
  if (user.role !== "citizen") return;
  if (!storage.hasConsent(user.id)) {
    throw new AppError(428, "CONSENT_REQUIRED", "Please review and accept the privacy notice first", { version: tenant().privacy.noticeVersion });
  }
}

/** Real labels only: officer-worked categories for "before" photos, the citizen's own yes/no for "proof" photos. */
const WORKED: ReadonlySet<string> = new Set(["ASSIGNED", "IN_PROGRESS", "PROOF_SUBMITTED", "VERIFYING", "NEEDS_REVIEW", "CITIZEN_VERIFIED", "CLOSED", "REJECTED_BY_CITIZEN", "REOPENED", "ESCALATED"]);
const publicPhoto = (u?: string) => (u && /^\/uploads\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(u) ? u : null);
export function trainingManifest() {
  const optedIn = new Set(storage.s.users.filter(u => u.trainingOptIn).map(u => u.id));
  const items: Array<{ task: "scene" | "fixed"; url: string; complaintRef: string; label: string; district: string }> = [];
  for (const c of storage.s.complaints) {
    if (!c.userId || !optedIn.has(c.userId) || c.isDemo) continue;
    const ref = c.id.slice(0, 8);
    const before = publicPhoto(c.beforePhoto);
    if (before && WORKED.has(c.state)) items.push({ task: "scene", url: before, complaintRef: ref, label: c.category, district: c.district });
    const proof = publicPhoto(c.proofPhoto ?? c.afterPhoto);
    if (proof && (c.citizenAnswer === "yes" || c.citizenAnswer === "no")) items.push({ task: "fixed", url: proof, complaintRef: ref, label: c.citizenAnswer === "yes" ? "fixed" : "not_fixed", district: c.district });
  }
  const count = (t: string) => items.filter(i => i.task === t).length;
  return { generatedAt: new Date().toISOString(), contributors: optedIn.size, counts: { scene: count("scene"), fixed: count("fixed") }, items };
}

export function registerPrivacyRoutes(app: Express) {
  // Optional, separate consent to let this person's complaint photos train SANKALP's own AI (off by default).
  route(app, {
    method: "get", path: "/api/privacy/training-consent", auth: "user", permission: "privacy.training_consent",
    params: none, query: none, body: none,
    handler: ({ user }) => ({ allow: !!user.trainingOptIn, since: user.trainingOptInAt ?? null }),
  });
  route(app, {
    method: "put", path: "/api/privacy/training-consent", auth: "user", permission: "privacy.training_consent",
    params: none, query: none, body: z.object({ allow: z.boolean() }),
    handler: ({ user, body }) => {
      user.trainingOptIn = body.allow;
      user.trainingOptInAt = body.allow ? new Date().toISOString() : undefined;
      storage.touch();
      storage.addAuditLog(body.allow ? "training_consent_given" : "training_consent_withdrawn", user.id, user.role, body.allow ? "Allowed complaint photos to train SANKALP AI" : "Withdrew consent for AI training");
      return { allow: body.allow };
    },
  });
  // State admins export the labelled, EXIF-stripped photos of people who opted in (for training on Indian infrastructure).
  route(app, {
    method: "get", path: "/api/admin/training-export", auth: "admin", permission: "ai.training_export",
    params: none, query: none, body: none,
    handler: ({ user, res }) => {
      res.setHeader("Cache-Control", "no-store");
      const m = trainingManifest();
      storage.addAuditLog("training_export", user.id, user.role, `AI training manifest: ${m.counts.scene} scene + ${m.counts.fixed} fix photos from ${m.contributors} consenting people`);
      return m;
    },
  });

  route(app, {
    method: "get", path: "/api/public/privacy-notice", auth: "public", permission: "public.reference",
    params: none, query: z.object({ lang: z.enum(["en", "hi"]).optional() }), body: none,
    handler: ({ query }) => noticeFor(query.lang),
  });

  route(app, {
    method: "get", path: "/api/privacy/consent", auth: "user", permission: "privacy.consent",
    params: none, query: none, body: none,
    handler: ({ user }) => ({ version: tenant().privacy.noticeVersion, accepted: user.role !== "citizen" || storage.hasConsent(user.id) }),
  });

  route(app, {
    method: "post", path: "/api/privacy/consent", auth: "user", permission: "privacy.consent",
    params: none, query: none, body: z.object({ version: z.string().max(40), lang: z.enum(["en", "hi"]).default("en"), accepted: z.literal(true) }),
    handler: ({ user, body, res }) => {
      if (body.version !== tenant().privacy.noticeVersion) throw new AppError(409, "NOTICE_CHANGED", "The privacy notice has changed — please review the latest version");
      if (!storage.hasConsent(user.id)) storage.recordConsent(user.id, body.version, body.lang);
      res.status(201);
      return { accepted: true, version: body.version };
    },
  });

  route(app, {
    method: "get", path: "/api/privacy/my-data", auth: "user", permission: "privacy.export",
    params: none, query: none, body: none,
    handler: ({ user, res }) => {
      const data = storage.exportUserData(user.id);
      if (!data) throw notFound();
      storage.addAuditLog("data_exported", user.id, "citizen", "Personal data export downloaded");
      res.setHeader("Content-Disposition", `attachment; filename="sankalp-my-data.json"`);
      return data;
    },
  });

  route(app, {
    method: "post", path: "/api/privacy/erasure", auth: "user", permission: "privacy.erasure_request",
    params: none, query: none, body: z.object({ confirm: z.literal("DELETE MY ACCOUNT") }),
    handler: ({ user, res }) => {
      const r = storage.requestErasure(user.id);
      res.status(r.status === "completed" ? 200 : 202);
      return r.status === "completed"
        ? { status: "completed", requestId: r.id, message: "Your account and personal data have been erased." }
        : { status: "legal_hold", requestId: r.id, message: `${r.reason}. The state data officer will review your request.` };
    },
  });

  route(app, {
    method: "get", path: "/api/privacy/erasure-requests", auth: "admin", permission: "privacy.erasure_review", paginate: true,
    params: none, query: none, body: none,
    handler: () => storage.s.erasureRequests.slice().reverse(),
  });

  route(app, {
    method: "put", path: "/api/privacy/erasure-requests/:id", auth: "admin", permission: "privacy.erasure_review",
    params: idParams, query: none, body: z.object({ decision: z.enum(["keep_hold", "reject"]), note: z.string().max(500).optional() }),
    handler: ({ params, body, user }) => {
      const r = storage.s.erasureRequests.find(x => x.id === params.id);
      if (!r) throw notFound();
      // Erasing a held record needs the person to re-request once the hold lifts; staff can only keep or reject here.
      r.status = body.decision === "reject" ? "rejected" : "legal_hold";
      r.decidedAt = new Date().toISOString();
      r.decidedBy = user.id;
      storage.addAuditLog("erasure_reviewed", user.id, user.name, `Erasure request ${r.id}: ${body.decision}${body.note ? ` — ${body.note}` : ""}`);
      storage.touch();
      return r;
    },
  });
}

/** Retention job helper: purge expired records and delete their files. */
/** Hourly: SOS voice clips older than sosAudioDays (default 5), unless under legal hold. */
export function runAudioRetention(at = Date.now()): number {
  const files = storage.purgeSosAudio(at);
  const drv = mediaDriver();
  for (const f of files) drv.remove("private", f);
  return files.length;
}

export function runRetention(at = Date.now()) {
  const audio = storage.purgeSosAudio(at);
  const r = storage.purgeExpired(at);
  const drv = mediaDriver();
  for (const f of r.media) { drv.remove("public", f); drv.remove("originals", f); }
  const sosFiles = [...new Set([...audio, ...r.sosEvidence])];
  for (const f of sosFiles) drv.remove("private", f);
  return { ...r, sosEvidence: sosFiles };
}
