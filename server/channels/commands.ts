import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { storage } from "../storage";
import { tenant } from "../tenancy";
import { config } from "../config";
import { DISTRICT_NAMES, defaultDistrict } from "../data/reference";
import { classifyText } from "../ai/rules";
import { legacyStatus } from "../domain/complaintState";
import { fileComplaintFor } from "../routes/complaints";
import { CATEGORIES } from "../routes/common";
import type { AppUser } from "../types";

/**
 * P5.2/P5.3 text commands shared by SMS and WhatsApp (citizen-initiated only):
 *   SANKALP [district] <problem text>   → files a complaint (category from keywords; district optional)
 *   STATUS <ticket>                     → current status
 *   AGREE                               → accepts the privacy notice (needed once before filing)
 *   HELP                                → format help
 * Replies are template ids + variables (ticket ids, states, URLs) — never names, places or phone numbers.
 */
export type Reply = { template: "complaint_received" | "consent_request" | "status_reply" | "channel_help"; vars: string[] };

const STATE_WORDS: Record<string, string> = { pending: "received", in_progress: "being worked on", resolved: "waiting for your confirmation", closed: "closed" };

function noticeUrl() {
  return `${config().PUBLIC_BASE_URL || ""}/web/privacy`;
}

/**
 * The account for a phone number in this tenant (review P5-6): any existing account is reused — never a second one
 * for the same number. Staff accounts cannot file by SMS (they use the app). A new citizen account is created only
 * when the person actually files (SANKALP … / IVR), never for a stray message.
 */
export function userForPhone(phone: string): AppUser | undefined {
  return storage.s.users.find(u => u.phone === phone);
}

export class StaffChannelError extends Error {}

export async function citizenForPhone(phone: string): Promise<AppUser> {
  const existing = userForPhone(phone);
  if (existing) {
    if (existing.role !== "citizen") throw new StaffChannelError("staff accounts use the app");
    return existing;
  }
  return storage.createUser({
    name: "Citizen", phone, pin: await bcrypt.hash(randomBytes(16).toString("hex"), 10), role: "citizen",
    district: defaultDistrict(), points: 0, badges: [], level: 1,
  });
}

export async function handleCommand(phone: string, text: string, channel: "sms" | "whatsapp"): Promise<Reply> {
  const t = text.trim().replace(/\s+/g, " ");
  const [head, ...rest] = t.split(" ");
  const cmd = head.toUpperCase();
  if (cmd === "HELP" || !t) return { template: "channel_help", vars: [] };

  if (cmd === "STATUS") {
    const ticket = (rest[0] ?? "").toUpperCase();
    const ids = new Set(storage.s.users.filter(u => u.phone === phone).map(u => u.id));
    const c = storage.getComplaints().find(x => !!x.userId && ids.has(x.userId) && x.ticketId.toUpperCase() === ticket);
    if (!c) return { template: "channel_help", vars: [] };
    return { template: "status_reply", vars: [c.ticketId, STATE_WORDS[legacyStatus(c.state)] ?? c.state.toLowerCase()] };
  }

  const isFile = cmd === "SANKALP" || cmd === "संकल्प";
  const isAgree = cmd === "AGREE" || cmd === "HAAN" || cmd === "सहमत";
  if (!isFile && !isAgree) return { template: "channel_help", vars: [] };
  const existing = userForPhone(phone);
  if (existing && existing.role !== "citizen") return { template: "channel_help", vars: [] };
  if (isAgree && !existing) return { template: "channel_help", vars: [] }; // nothing pending for an unknown number
  const user = existing ?? await citizenForPhone(phone);
  if (isAgree) {
    if (!storage.hasConsent(user.id)) storage.recordConsent(user.id, tenant().privacy.noticeVersion, channel === "sms" ? "sms" : "whatsapp");
    // Pending text expires after 24 h (review P5-6 low).
    const pendingText = user.pendingChannelAt && Date.now() - new Date(user.pendingChannelAt).getTime() < 86400000 ? user.pendingChannelText : undefined;
    user.pendingChannelText = undefined; user.pendingChannelAt = undefined;
    storage.touch();
    if (pendingText) return fileFromText(user, pendingText, channel);
    return { template: "channel_help", vars: [] };
  }

  if (cmd === "SANKALP" || cmd === "संकल्प") {
    const body = rest.join(" ");
    if (body.length < 3) return { template: "channel_help", vars: [] };
    // DPDP: consent first (D-031). The text is kept until the citizen replies AGREE, then filed.
    if (!storage.hasConsent(user.id)) {
      user.pendingChannelText = body.slice(0, 1000);
      user.pendingChannelAt = new Date().toISOString();
      storage.touch();
      return { template: "consent_request", vars: [noticeUrl()] };
    }
    return fileFromText(user, body, channel);
  }
  return { template: "channel_help", vars: [] };
}

async function fileFromText(user: AppUser, body: string, channel: "sms" | "whatsapp"): Promise<Reply> {
  const words = body.split(" ");
  const district = DISTRICT_NAMES.find(d => d.toLowerCase() === words[0]?.toLowerCase());
  const description = (district ? words.slice(1).join(" ") : body).trim();
  if (district && user.district !== district) { user.district = district; storage.touch(); }
  const guess = classifyText(description).category;
  const category = ((CATEGORIES as readonly string[]).includes(guess) ? guess : "other") as (typeof CATEGORIES)[number];
  const c = await fileComplaintFor(user, {
    category, description: description.slice(0, 2000), location: `Reported by ${channel.toUpperCase()} — location to be confirmed`, channel,
  });
  return { template: "complaint_received", vars: [c.ticketId, c.ticketId] };
}
