import type { Express, Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import { route, none } from "../lib/route";
import { forbidden, AppError } from "../lib/errors";
import { currentTenantId, tenant } from "../tenancy";
import { handleCommand, citizenForPhone, StaffChannelError } from "../channels/commands";
import { sendSms } from "../notify/sms";
import { sendWhatsApp } from "../notify/whatsapp";
import { stt } from "../ai/gateway";
import { storeMedia } from "../lib/media";
import { classifyText } from "../ai/rules";
import { fileComplaintFor } from "./complaints";
import { CATEGORIES, normalizeIndianMobile } from "./common";
import { channelLimiter } from "./limits";

/**
 * P5.2/P5.3 basic-phone and WhatsApp channels. Webhooks are authenticated with a per-tenant shared secret
 * (<NAME>_<TENANT> falling back to <NAME>) compared in constant time, and rate-limited.
 */
export function checkSecret(req: Request, name: string) {
  const secret = process.env[`${name}_${currentTenantId().toUpperCase()}`] || process.env[name];
  if (!secret) throw new AppError(503, "CHANNEL_DISABLED", "This channel is not configured");
  const got = Buffer.from(String(req.headers["x-webhook-secret"] ?? "")), want = Buffer.from(secret);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw forbidden("Bad webhook secret");
}

/** Review P5-1: only Indian numbers (+91 / 91 / 0 / bare 10 digits). A foreign number is never cut down to 10 digits. */
export const senderPhone = (from: string): string | null => {
  const n = normalizeIndianMobile(from.replace(/[^\d+]/g, ""));
  return typeof n === "string" && /^[6-9]\d{9}$/.test(n) ? n : null;
};

export function registerChannelRoutes(app: Express) {
  route(app, {
    method: "post", path: "/api/channels/whatsapp/inbound", auth: "public", permission: "channels.whatsapp_inbound",
    middleware: [channelLimiter],
    params: none, query: none, body: z.object({ from: z.string().max(20), text: z.string().max(1000) }).passthrough(),
    handler: async ({ req, body }) => {
      checkSecret(req, "WHATSAPP_WEBHOOK_SECRET");
      const phone = senderPhone(body.from);
      if (!phone) return { accepted: false, reason: "not an Indian mobile number" };
      const reply = await handleCommand(phone, body.text, "whatsapp");
      await sendWhatsApp(phone, reply.template, reply.vars);
      return { accepted: true, reply: reply.template };
    },
  });

  // Missed call → the IVR calls back, plays the notice ("press 1 to agree"), records the complaint and posts it here.
  route(app, {
    method: "post", path: "/api/channels/ivr/recording", auth: "public", permission: "channels.ivr_recording",
    middleware: [channelLimiter],
    params: none, query: none,
    body: z.object({
      from: z.string().max(20), audioBase64: z.string().min(16).max(12 * 1024 * 1024),
      lang: z.enum(["hi-IN", "en-IN"]).default("hi-IN"), consent: z.boolean(),
    }),
    handler: async ({ req, body, res }) => {
      checkSecret(req, "IVR_WEBHOOK_SECRET");
      const phone = senderPhone(body.from);
      if (!phone) throw new AppError(400, "INVALID_PHONE", "Invalid caller number");
      if (!body.consent) throw new AppError(428, "CONSENT_REQUIRED", "The caller did not accept the privacy notice");
      let user;
      try { user = await citizenForPhone(phone); } catch (err) {
        if (err instanceof StaffChannelError) throw new AppError(409, "STAFF_NUMBER", "This number belongs to a staff account; use the app");
        throw err;
      }
      if (!storage.hasConsent(user.id)) storage.recordConsent(user.id, tenant().privacy.noticeVersion, "ivr");
      const audio = storeMedia(body.audioBase64, "audio");
      storage.addMedia({ ...audio, ownerId: user.id });
      // STT with the sovereign provider; without it (or on failure) a human listens — fail closed, never guessed.
      const tr = await stt(Buffer.from(body.audioBase64, "base64"), audio.mime, body.lang);
      const text = tr?.transcript?.trim();
      const guess = text ? classifyText(text).category : "other";
      const category = ((CATEGORIES as readonly string[]).includes(guess) ? guess : "other") as (typeof CATEGORIES)[number];
      const c = await fileComplaintFor(user, {
        category, channel: "ivr",
        description: text ? text.slice(0, 2000) : "Voice complaint — transcription pending (an officer will listen to the recording)",
        location: "Reported by phone — location to be confirmed",
      });
      storage.linkMedia(audio.id, { complaintId: c.id });
      if (!text) storage.createReviewTask({ kind: "transcription", complaintId: c.id, reason: "Voice complaint needs a human transcription" });
      await sendSms(phone, "voice_received", [c.ticketId]);
      res.status(201);
      return { accepted: true, ticketId: c.ticketId, transcribed: !!text };
    },
  });
}

/** SMS commands (called from the shared inbound SMS webhook when the text is not a 1/2 confirmation). */
export async function smsCommand(phone: string, text: string) {
  const reply = await handleCommand(phone, text, "sms");
  await sendSms(phone, reply.template, reply.vars);
  return reply.template;
}
