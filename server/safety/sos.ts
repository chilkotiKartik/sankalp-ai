import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { storage } from "../storage";
import { config } from "../config";
import { currentTenantId } from "../tenancy";
import { sendSms } from "../notify/sms";
import { logger } from "../lib/logger";
import type { SOSAlert, AppUser } from "../types";

/**
 * P6.1 SOS to trusted contacts.
 *  - SMS text has no personal data: it carries a signed, expiring link to a minimal live-location page.
 *  - Each contact has its own delivery record: retried with backoff (0 s, 30 s, 2 min, 10 min; 4 attempts),
 *    marked sent/failed, and "delivered" when the SMS gateway posts a delivery receipt.
 *  - The link stops working 1 hour after the SOS is resolved or cancelled, and after 24 hours at most.
 */
export const MAX_CONTACTS = 5;
export const BACKOFF_MS = [0, 30_000, 120_000, 600_000];
const LINK_TTL_S = 24 * 3600;

const sig = (p: string) => createHmac("sha256", config().JWT_SECRET).update(`sos-share:${p}`).digest("base64url");

export function shareToken(alert: SOSAlert, tenantId = currentTenantId()): string {
  const p = `${tenantId}.${alert.id}.${Math.floor(Date.now() / 1000) + LINK_TTL_S}`;
  return `${Buffer.from(p).toString("base64url")}.${sig(p)}`;
}

export function readShareToken(t: string): { tenantId: string; alertId: string } | null {
  const [b, s] = t.split(".");
  if (!b || !s) return null;
  const p = Buffer.from(b, "base64url").toString();
  const e = Buffer.from(sig(p)), g = Buffer.from(s);
  if (e.length !== g.length || !timingSafeEqual(e, g)) return null;
  const [tenantId, alertId, exp] = p.split(".");
  if (Number(exp) < Date.now() / 1000) return null;
  return { tenantId, alertId };
}

export const shareLink = (a: SOSAlert) => `${config().PUBLIC_BASE_URL || ""}/s/${shareToken(a)}`;

export const maskPhone = (p: string) => `******${p.slice(-4)}`;

/** Called once when a new (non-duplicate) SOS is created. */
export function startContactDeliveries(alert: SOSAlert, user: AppUser): number {
  const contacts = (user.trustedContacts ?? []).slice(0, MAX_CONTACTS);
  alert.contactDeliveries = contacts.map(c => ({ contactId: c.id, phoneMasked: maskPhone(c.phone), attempts: 0, status: "pending" as const, nextAttemptAt: Date.now() }));
  storage.touch();
  void runSosDeliveries();
  return contacts.length;
}

/** Job body (every 15 s): sends due deliveries for open SOS alerts. */
export async function runSosDeliveries(at = Date.now()): Promise<number> {
  let sent = 0;
  for (const a of storage.getSosAlerts()) {
    if (!a.contactDeliveries?.length || a.status === "resolved" || a.status === "cancelled") continue;
    const owner = a.userId ? storage.getUserById(a.userId) : undefined;
    for (const d of a.contactDeliveries) {
      if (d.status !== "pending" || d.nextAttemptAt > at) continue;
      const contact = owner?.trustedContacts?.find(c => c.id === d.contactId);
      if (!contact) { d.status = "failed"; d.error = "contact removed"; continue; }
      d.attempts++;
      d.lastAttemptAt = new Date(at).toISOString();
      const r = await sendSms(contact.phone, "sos_contact", [shareLink(a)]);
      if (r.ok) { d.status = "sent"; d.messageId = r.messageId; sent++; }
      else if (d.attempts >= BACKOFF_MS.length) { d.status = "failed"; d.error = r.error; logger.warn("sos_contact_failed", { sos: a.id, attempts: d.attempts }); }
      else d.nextAttemptAt = at + BACKOFF_MS[d.attempts];
    }
  }
  if (sent) storage.touch();
  return sent;
}

/** Provider delivery receipt (DLR). */
export function applyDeliveryReceipt(messageId: string, status: "delivered" | "failed"): boolean {
  for (const a of storage.getSosAlerts()) for (const d of a.contactDeliveries ?? []) {
    if (d.messageId === messageId) { d.status = status === "delivered" ? "delivered" : "failed"; storage.touch(); return true; }
  }
  return false;
}

export function newContactId() { return randomUUID(); }
