import { config } from "../config";
import type { Express } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { storage } from "../storage";
import { route, none, idParams } from "../lib/route";
import { forbidden, notFound, AppError } from "../lib/errors";
import { runInTenant, hasTenant, tenant } from "../tenancy";
import { applyDeliveryReceipt, readShareToken, newContactId, MAX_CONTACTS, maskPhone } from "../safety/sos";
import { sendSms } from "../notify/sms";
import { checkSecret } from "./channels";
import { phone10, text, geo } from "./common";
import { startCheckIn } from "../safety/checkin";
import { readPayload } from "../safety/sign";
import { writeLimiter, sosCancelLimiter } from "./limits";

/** P6.1 trusted contacts, PIN-protected cancel, delivery receipts and the public live-location page. */
export function registerSafetyRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/me/trusted-contacts", auth: "user", permission: "safety.contacts",
    params: none, query: none, body: none,
    handler: ({ user }) => (user.trustedContacts ?? []).map(c => ({ id: c.id, label: c.label, phone: c.phone })),
  });

  route(app, {
    method: "put", path: "/api/me/trusted-contacts", auth: "user", permission: "safety.contacts",
    middleware: [writeLimiter],
    params: none, query: none,
    body: z.object({ contacts: z.array(z.object({ label: text(40), phone: phone10 })).max(MAX_CONTACTS) }),
    handler: ({ body, user }) => {
      if (body.contacts.some(c => c.phone === user.phone)) throw new AppError(422, "OWN_NUMBER", "Add someone else's number, not your own");
      if (new Set(body.contacts.map(c => c.phone)).size !== body.contacts.length) throw new AppError(422, "DUPLICATE", "Each contact must have a different number");
      user.trustedContacts = body.contacts.map(c => ({ id: newContactId(), label: c.label, phone: c.phone, addedAt: new Date().toISOString() }));
      storage.addAuditLog("trusted_contacts_updated", user.id, "citizen", `${body.contacts.length} trusted contact(s) saved`);
      storage.touch();
      return { count: user.trustedContacts.length };
    },
  });

  // Cancelling needs the PIN, so someone who grabs the phone cannot silence a real alert.
  route(app, {
    method: "put", path: "/api/sos/:id/cancel", auth: "sos", permission: "sos.cancel",
    middleware: [sosCancelLimiter],
    // Review P6-6: legacy 4–6 digit PINs, or a one-time SMS code (for accounts created by OTP that never set a PIN).
    params: idParams, query: none,
    body: z.object({ pin: z.string().regex(/^\d{4,6}$/).optional(), otp: z.string().regex(/^\d{6}$/).optional(), reason: text(200).optional() })
      .refine(b => !!b.pin !== !!b.otp, { message: "Send either pin or otp" }),
    handler: async ({ params, body, user }) => {
      const a = storage.getSOSAlert(params.id);
      if (!a) throw notFound();
      if (a.userId !== user.id) throw forbidden("Only the sender can cancel this SOS");
      if (a.status === "resolved" || a.status === "cancelled") return { status: a.status };
      if ((a.cancelPinAttempts ?? 0) >= 5) throw new AppError(423, "LOCKED", "Too many wrong PINs — the alert stays active. Call 112 if you are safe now.");
      // Review P6-2: reserve the attempt BEFORE the slow comparison, so parallel guesses cannot get past the lock.
      a.cancelPinAttempts = (a.cancelPinAttempts ?? 0) + 1;
      const ok = body.otp ? storage.verifyOtp(user.phone, body.otp) : await bcrypt.compare(body.pin!, user.pin);
      if (!ok) {
        storage.addAuditLog("sos_cancel_wrong_pin", user.id, "citizen", `Wrong PIN while cancelling SOS ${a.id} (${a.cancelPinAttempts}/5)`);
        storage.touch();
        throw new AppError(401, "WRONG_PIN", "Wrong PIN — the alert is still active");
      }
      a.cancelPinAttempts = 0;
      a.status = "cancelled";
      a.cancelledAt = new Date().toISOString();
      storage.addAuditLog("sos_cancelled", user.id, "citizen", `SOS ${a.id} cancelled by the sender${body.reason ? ` — ${body.reason}` : ""}`);
      // The police incident follows: marked safe (PIN-verified), patrol van released, every map updated live.
      if (a.cprRequestId) storage.updateIncidentStatus(a.cprRequestId, "safe", "The person cancelled the SOS with their PIN and says they are safe", "CITIZEN");
      storage.touch();
      const owner = storage.getUserById(user.id);
      for (const d of a.contactDeliveries ?? []) {
        if (d.status === "pending") { d.status = "failed"; d.error = "cancelled before sending"; continue; }
        if (d.status !== "sent" && d.status !== "delivered") continue; // never alerted → nothing to cancel
        const c = owner?.trustedContacts?.find(x => x.id === d.contactId);
        if (c) await sendSms(c.phone, "sos_cancelled", []);
      }
      return { status: "cancelled" };
    },
  });

  route(app, {
    method: "post", path: "/api/sos/delivery-receipt", auth: "public", permission: "safety.delivery_receipt",
    middleware: [writeLimiter],
    params: none, query: none, body: z.object({ messageId: z.string().min(1).max(100), status: z.enum(["delivered", "failed"]) }).passthrough(),
    handler: ({ req, body }) => {
      checkSecret(req, "SMS_DLR_SECRET");
      return { matched: applyDeliveryReceipt(body.messageId, body.status) };
    },
  });

  // Public, signed, expiring: location + status only. No name, phone or description.
  const shared = (token: string) => {
    const t = readShareToken(token);
    if (!t || !hasTenant(t.tenantId)) return null;
    return runInTenant(t.tenantId, () => {
      const a = storage.getSOSAlert(t.alertId);
      if (!a) return null;
      const closedAt = a.cancelledAt ?? a.resolvedAt;
      if (closedAt && Date.now() - new Date(closedAt).getTime() > 3600_000) return null;
      const g = a.liveGeo ?? a.geo;
      return { status: a.status, lat: Math.round(g.lat * 1e5) / 1e5, lng: Math.round(g.lng * 1e5) / 1e5, updatedAt: a.liveUpdatedAt ?? a.triggeredAt,
        nearestPoliceStation: a.nearestPoliceStation ?? null, nearestPolicePhone: a.nearestPolicePhone ?? null, state: tenant().stateLabel };
    });
  };

  route(app, {
    method: "get", path: "/api/sos/shared/:token", auth: "public", permission: "safety.shared_location",
    params: z.object({ token: z.string().min(20).max(300) }), query: none, body: none,
    handler: ({ params, res }) => {
      const s = shared(params.token);
      res.setHeader("Cache-Control", "no-store");
      if (!s) throw new AppError(410, "LINK_EXPIRED", "This link has expired");
      return s;
    },
  });

  route(app, {
    method: "get", path: "/s/:token", auth: "public", permission: "safety.shared_location",
    params: z.object({ token: z.string().min(20).max(300) }), query: none, body: none,
    handler: ({ params, res }) => {
      const s = shared(params.token);
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      res.type("html").send(sharePage(params.token, !!s));
      return undefined;
    },
  });
}

export function registerCheckInRoutes(app: Express) {
  route(app, {
    method: "post", path: "/api/safety/checkins", auth: "sos", permission: "safety.checkin",
    params: none, query: none,
    body: z.object({ minutes: z.number().int().min(5).max(720), note: text(200).optional(), geo: geo.optional() }),
    handler: ({ body, user, res }) => {
      if (!user.trustedContacts?.length) throw new AppError(422, "NO_CONTACTS", "Add at least one trusted contact first");
      const c = startCheckIn(user.id, body.minutes, body.note, body.geo);
      res.status(201);
      return { id: c.id, dueAt: c.dueAt, status: c.status };
    },
  });
  route(app, {
    method: "put", path: "/api/safety/checkins/:id/done", auth: "sos", permission: "safety.checkin",
    params: idParams, query: none, body: z.object({}).passthrough(),
    handler: async ({ params, user }) => {
      const c = storage.s.checkins.find(x => x.id === params.id && x.userId === user.id);
      if (!c) throw notFound();
      // Review P6-5: "I'm safe" also works after contacts were alerted — they get an all-clear (no personal data).
      if (c.status === "alerted") {
        for (const contact of user.trustedContacts ?? []) await sendSms(contact.phone, "checkin_safe", []);
      }
      if (c.status === "active" || c.status === "alerted") { c.status = "done"; c.doneAt = new Date().toISOString(); storage.touch(); }
      return { status: c.status };
    },
  });
  route(app, {
    method: "get", path: "/c/:token", auth: "public", permission: "safety.shared_location",
    params: z.object({ token: z.string().min(20).max(300) }), query: none, body: none,
    handler: ({ params, res }) => {
      const p = readPayload("checkin", params.token);
      const [tid, id] = (p ?? "").split(".");
      const info = p && hasTenant(tid) ? runInTenant(tid, () => {
        const c = storage.s.checkins.find(x => x.id === id);
        const u = c && storage.getUserById(c.userId);
        return c && u ? { name: u.name.split(" ")[0], due: c.dueAt, geo: c.lastGeo, done: c.status === "done" } : null;
      }) : null;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Referrer-Policy", "no-referrer");
      const esc = (v: string) => v.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
      res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>SANKALP check-in</title>
<style>body{font:16px system-ui,sans-serif;padding:16px;color:#111}a{display:block;text-align:center;padding:14px;margin:10px 0;border-radius:10px;font-weight:700;text-decoration:none;background:#B91C1C;color:#fff}</style></head><body>
${info ? `<h1>⏰ ${esc(info.name)} did not check in</h1><p>They were due to confirm they were safe by ${esc(new Date(info.due).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST.${info.done ? " They have since confirmed they are safe." : ""}</p>
${info.geo ? `<p>Last shared location: <a style="background:#1D4ED8" href="geo:${info.geo.lat},${info.geo.lng}?q=${info.geo.lat},${info.geo.lng}">${info.geo.lat.toFixed(5)}, ${info.geo.lng.toFixed(5)}</a></p>` : "<p>No location was shared.</p>"}` : "<h1>This link has expired.</h1>"}
<p>Try calling them first.</p><a href="tel:112">Call 112 (emergency)</a></body></html>`);
      return undefined;
    },
  });
}

/** ~2 KB page for any phone browser (works on 2G): refreshes the location every 20 s. */
function sharePage(token: string, ok: boolean): string {
  const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const tiles = config().mapTileUrl ?? "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>SANKALP SOS — live location</title>${ok ? `<link rel="stylesheet" href="/leaflet/leaflet.css">` : ""}
<style>body{font:16px system-ui,sans-serif;margin:0;background:#fff;color:#111}main{max-width:560px;margin:0 auto;padding:16px}h1{font-size:21px;color:#991B1B;margin:4px 0 8px}
#map{height:46vh;min-height:260px;border-radius:12px;border:1px solid #E5E7EB;background:#EEF2F7}#st{font-weight:600;margin:10px 0 2px}#age{color:#374151;font-size:14px;margin:0 0 6px}
a.b{display:block;text-align:center;padding:14px;margin:10px 0;border-radius:10px;font-weight:700;text-decoration:none}.r{background:#B91C1C;color:#fff}.g{background:#1D4ED8;color:#fff}.k{background:#F3F4F6;color:#111}small{color:#374151}.closed{color:#047857}</style></head>
<body${ok ? ` data-token="${esc(token)}" data-tiles="${esc(tiles)}"` : ""}><main><h1>🆘 SOS — someone needs help</h1>
${ok ? `<div id="map" role="img" aria-label="Live location on a map"></div><p id="st" aria-live="polite">Loading the latest location…</p><p id="age"></p>
<a class="b r" href="tel:112">Call 112 (emergency)</a><a class="b g" id="dir" href="#" rel="noopener">Open in my maps app</a><a class="b k" id="ps" href="#" hidden></a>`
    : `<p>This link has expired or the alert was closed.</p><a class="b r" href="tel:112">Call 112 (emergency)</a>`}
<small>Shared through SANKALP. The position updates automatically every 10 seconds. The link stops working 24 hours after it was sent, or one hour after the alert is closed.</small></main>
${ok ? `<script src="/leaflet/leaflet.js"></script><script src="/web/vendor/sos-share.js"></script>` : ""}</body></html>`;
}

export { maskPhone };
