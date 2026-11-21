import { storage } from "../storage";
import { tenant, currentTenantId } from "../tenancy";
import { config } from "../config";
import { logger } from "../lib/logger";
import { sendSms } from "../notify/sms";
import { sendPush } from "../notify/push";
import { placeConfirmCall, confirmToken } from "../notify/voice";
import { haversineM } from "./image";
import type { Complaint } from "../types";

/**
 * P3.5 / P3.6 confirmation channels.
 *  - in-app Yes/No (existing confirm/reject routes) + push
 *  - SMS reminder after `smsReminderAfterHours` ("Reply 1 YES / 2 NO"), answered through the inbound-SMS webhook
 *  - voice callback after `voiceCallbackAfterHours` (press 1/2), answered through the signed IVR callback
 *  - up to `neighbourMax` opted-in neighbours within `neighbourRadiusM`, asked once per proof
 * Messages carry only the ticket number (rule 2).
 */
const hoursSince = (iso: string | undefined, at: number) => (iso ? (at - new Date(iso).getTime()) / 3600000 : 0);

export async function runConfirmationReminders(at = Date.now()): Promise<{ sms: number; voice: number }> {
  const v = tenant().verification;
  const out = { sms: 0, voice: 0 };
  for (const c of storage.getComplaints().filter(x => x.state === "VERIFYING" && x.userId && !x.citizenAnswer)) {
    const user = storage.getUserById(c.userId!);
    if (!user) continue;
    const sent = (ch: "sms" | "voice") => (c.confirmReminders ?? []).some(r => r.channel === ch);
    const h = hoursSince(c.proofSubmittedAt, at);
    if (!sent("sms") && h >= v.smsReminderAfterHours) {
      const r = await sendSms(user.phone, "verify_request", [c.ticketId]);
      (c.confirmReminders ??= []).push({ channel: "sms", at: new Date(at).toISOString(), ok: r.ok });
      out.sms++;
      storage.addAuditLog("confirm_reminder", "system", "SANKALP System", `${c.ticketId}: SMS reminder ${r.ok ? "sent" : "failed"}`, c.id);
    }
    if (!sent("voice") && h >= v.voiceCallbackAfterHours) {
      const base = config().PUBLIC_BASE_URL || "";
      const url = `${base}/api/verification/ivr/${confirmToken(currentTenantId(), c.id, "voice")}`;
      const r = await placeConfirmCall(user.phone, c.ticketId, url);
      (c.confirmReminders ??= []).push({ channel: "voice", at: new Date(at).toISOString(), ok: r.ok });
      out.voice++;
      storage.addAuditLog("confirm_reminder", "system", "SANKALP System", `${c.ticketId}: voice callback ${r.ok ? "placed" : "failed"}`, c.id);
    }
  }
  if (out.sms || out.voice) storage.touch();
  return out;
}

/** P3.6: opted-in users who filed a complaint within the radius in the last 180 days (they live or work nearby). */
export function inviteNeighbours(c: Complaint, at = Date.now()): string[] {
  const v = tenant().verification;
  if (!v.neighbourMax || !c.geo) return [];
  const since = at - 180 * 86400000;
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const o of storage.getComplaints()) {
    if (picked.length >= v.neighbourMax) break;
    if (!o.userId || o.userId === c.userId || seen.has(o.userId) || !o.geo) continue;
    if (new Date(o.submittedAt).getTime() < since || haversineM(c.geo, o.geo) > v.neighbourRadiusM) continue;
    seen.add(o.userId);
    if (storage.getUserById(o.userId)?.neighbourOptIn) picked.push(o.userId);
  }
  c.neighbourInvites = picked;
  for (const uid of picked) void sendPush(storage.pushTokensForUser(uid), { kind: "neighbour_check", id: c.id, ref: c.ticketId });
  if (picked.length) logger.info("neighbour_invites", { count: picked.length });
  storage.touch();
  return picked;
}

/** "1", "yes", "haan", "हाँ" → yes; "2", "no", "nahi", "नहीं" → no. */
export function parseReply(text: string): "yes" | "no" | null {
  const t = text.trim().toLowerCase();
  const end = "(?=$|[\\s.,!])";
  if (new RegExp(`^(?:1|yes|y|haan|han|ha|हाँ|हां|हा)${end}`, "u").test(t)) return "yes";
  if (new RegExp(`^(?:2|no|n|nahi|nahin|नहीं|नही|ना)${end}`, "u").test(t)) return "no";
  return null;
}
