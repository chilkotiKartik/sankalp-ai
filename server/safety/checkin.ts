import { randomUUID } from "node:crypto";
import { storage } from "../storage";
import { currentTenantId } from "../tenancy";
import { sendSms } from "../notify/sms";
import { config } from "../config";
import { signPayload } from "./sign";
import type { CheckIn, GeoPoint } from "../types";

/**
 * P6.3 check-in timer ("I'm walking home — check on me in 30 min").
 * If the user does not tap "I'm safe" by dueAt + 5 min, every trusted contact gets one SMS with a signed link
 * (first name, last shared location, due time — never in the SMS text). One active check-in per user.
 */
export const GRACE_MS = 5 * 60_000;

export function startCheckIn(userId: string, minutes: number, note?: string, geo?: GeoPoint): CheckIn {
  for (const c of storage.s.checkins) if (c.userId === userId && c.status === "active") c.status = "cancelled";
  const now = Date.now();
  const c: CheckIn = { id: randomUUID(), userId, startedAt: new Date(now).toISOString(), dueAt: new Date(now + minutes * 60_000).toISOString(), note, lastGeo: geo, status: "active" };
  storage.s.checkins.push(c);
  storage.s.checkins = storage.s.checkins.slice(-5000);
  storage.touch();
  return c;
}

export const checkInLink = (c: CheckIn) => `${config().PUBLIC_BASE_URL || ""}/c/${signPayload("checkin", `${currentTenantId()}.${c.id}`, 48 * 3600)}`;

export async function runCheckInAlerts(at = Date.now()): Promise<number> {
  let n = 0;
  for (const c of storage.s.checkins) {
    if (c.status !== "active" || new Date(c.dueAt).getTime() + GRACE_MS > at) continue;
    c.status = "alerted";
    c.alertedAt = new Date(at).toISOString();
    const u = storage.getUserById(c.userId);
    for (const contact of u?.trustedContacts ?? []) await sendSms(contact.phone, "checkin_alert", [checkInLink(c)]);
    storage.addAuditLog("checkin_missed", "system", "SANKALP System", `Check-in missed; ${u?.trustedContacts?.length ?? 0} trusted contact(s) alerted`);
    n++;
  }
  if (n) storage.touch();
  return n;
}
