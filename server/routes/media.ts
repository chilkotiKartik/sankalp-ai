import { getDeptIdForCategory } from "../data/reference";
import { isStateUser, isDistrictAdmin } from "../auth/roles";
import type { Express } from "express";
import { z } from "zod";
import { storage, type AppUser } from "../storage";
import { route, none, emergencyDistrict, type Actor } from "../lib/route";
import { storeMedia, privatePath, publicPathExists, originalPath, signMediaUrl, verifyMediaSignature, SIGNED_URL_TTL_S } from "../lib/media";
import { currentTenantId, hasTenant, runInTenant } from "../tenancy";
import { forbidden, notFound, unprocessable, unauthorized } from "../lib/errors";
import { uploadLimiter } from "./limits";

const b64 = z.string().min(16).max(22 * 1024 * 1024);

/** Accepts a fresh base64 image (validated + stored) or a previously uploaded `/uploads/<uuid>.<ext>` URL. */
export function resolveImage(input: string | undefined, owner: string, opts: { proofFor?: { beforePhoto?: string } } = {}): string | undefined {
  if (!input) return undefined;
  const m = input.match(/^\/uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/);
  if (m) {
    const rec = storage.getMediaByFile(m[1]);
    if (!publicPathExists(m[1]) || !rec) throw unprocessable("INVALID_MEDIA", "Unknown uploaded image");
    // Proof must be the actor's own upload and never the complaint's own "before" photo (review M1).
    if (opts.proofFor && (rec.ownerId !== owner || opts.proofFor.beforePhoto === input)) {
      throw unprocessable("INVALID_PROOF", "Proof must be a new photo taken by you after the work was done");
    }
    if (!opts.proofFor && rec.ownerId !== owner) throw unprocessable("INVALID_MEDIA", "You can only attach photos you uploaded");
    return input;
  }
  if (/^(file|content|blob|https?):/i.test(input)) throw unprocessable("INVALID_MEDIA", "Upload the photo first (POST /api/upload) and send its /uploads URL");
  const f = storeMedia(input, "image");
  storage.addMedia({ ...f, ownerId: owner });
  return `/uploads/${f.fileName}`;
}

/** M3: owner, district admin of the linked SOS, super admin, or police/USDMA department. */
export function canAccessEvidence(actor: Actor, rec: { ownerId: string; sosId?: string }): boolean {
  if (actor.deptId === "police" || actor.deptId === "usdma") {
    const d = emergencyDistrict(actor);
    if (!d) return true;
    return !!rec.sosId && storage.getSOSAlert(rec.sosId)?.district === d;
  }
  const u: AppUser | undefined = actor.user;
  if (!u) return false;
  if (u.id === rec.ownerId || isStateUser(u)) return true;
  if (isDistrictAdmin(u) && rec.sosId) return storage.getSOSAlert(rec.sosId)?.district === u.district;
  return false;
}

/** Originals (with EXIF/GPS): state staff; district admin of the case's district; the case's own department. */
export function canAccessOriginal(actor: Actor, rec: { sosId?: string; complaintId?: string }): boolean {
  const u = actor.user;
  if (u && isStateUser(u)) return true;
  if (rec.sosId) {
    if (actor.deptId === "police" || actor.deptId === "usdma") { const d = emergencyDistrict(actor); return !d || storage.getSOSAlert(rec.sosId)?.district === d; }
    return !!u && isDistrictAdmin(u) && storage.getSOSAlert(rec.sosId)?.district === u.district;
  }
  if (!rec.complaintId) return false;
  const c = storage.getComplaint(rec.complaintId);
  if (!c) return false;
  if (actor.deptId) return actor.deptId === getDeptIdForCategory(c.category);
  if (u && isDistrictAdmin(u)) return c.district === u.district;
  if (u && u.departmentId && (u.role === "officer" || u.role === "dept_admin")) return u.departmentId === getDeptIdForCategory(c.category);
  return false;
}

export function registerMediaRoutes(app: Express) {
  route(app, {
    method: "post", path: "/api/upload", auth: "user", permission: "media.upload_image",
    middleware: [uploadLimiter],
    params: none, query: none,
    body: z.object({ image: b64, filename: z.string().max(200).optional() }),
    handler: ({ body, user }) => {
      const f = storeMedia(body.image, "image");
      storage.addMedia({ ...f, ownerId: user.id });
      return { url: `/uploads/${f.fileName}`, filename: f.fileName, mediaId: f.id };
    },
  });

  route(app, {
    method: "post", path: "/api/upload/audio", auth: "sos", permission: "media.upload_audio",
    middleware: [uploadLimiter],
    params: none, query: none,
    body: z.object({ audio: b64, filename: z.string().max(200).optional(), sosId: z.string().max(100).optional() }),
    handler: ({ body, user }) => {
      if (body.sosId) {
        const a = storage.getSOSAlert(body.sosId);
        if (!a || a.userId !== user.id) throw forbidden("You can only attach evidence to your own SOS");
      }
      const f = storeMedia(body.audio, "audio");
      storage.addMedia({ ...f, ownerId: user.id, sosId: body.sosId });
      storage.addAuditLog("sos_audio_uploaded", user.id, "citizen", `SOS audio evidence stored (${f.id})`);
      return { url: `/api/media/audio/${f.fileName}`, filename: f.fileName, mediaId: f.id };
    },
  });

  // P1.6: short-lived signed links (for <audio>/<img> tags that cannot send headers). Issuance is audited.
  route(app, {
    method: "post", path: "/api/media/:file/sign", auth: "optional", permission: "media.read_evidence",
    params: z.object({ file: z.string().max(60) }), query: z.object({ variant: z.enum(["private", "original"]).optional() }), body: none,
    handler: ({ params, query, actor }) => {
      if (!actor.user && !actor.deptId) throw unauthorized();
      const rec = storage.getMediaByFile(params.file);
      if (!rec) throw notFound("Media not found");
      if (query.variant === "original") {
        // Originals keep EXIF/GPS: only staff responsible for the linked case (review P1-M2), never the public.
        if (!canAccessOriginal(actor, rec)) throw forbidden("Only staff responsible for this case can access the original photo");
        if (!originalPath(params.file)) throw notFound("Original not stored");
      } else if (!canAccessEvidence(actor, rec)) throw forbidden("You are not allowed to access this evidence");
      storage.addAuditLog("signed_url_issued", actor.user?.id ?? `dept:${actor.deptId}`, actor.user ? actor.user.role : `dept:${actor.deptId}`, `Signed link for ${rec.id} (${query.variant ?? "private"})`, rec.sosId);
      const url = signMediaUrl(params.file, currentTenantId(), SIGNED_URL_TTL_S, query.variant ?? "private");
      return { url, expiresInSeconds: SIGNED_URL_TTL_S };
    },
  });

  route(app, {
    method: "get", path: "/api/media/signed/:file", auth: "public", permission: "media.signed_read",
    params: z.object({ file: z.string().max(60) }),
    query: z.object({ t: z.string().max(60), exp: z.coerce.number().int(), sig: z.string().max(100), v: z.enum(["original"]).optional() }), body: none,
    handler: ({ params, query, res }) => {
      // The tenant is part of the signature, so the link works without an X-Tenant header (e.g. <audio src>).
      if (!hasTenant(query.t) || !verifyMediaSignature(params.file, query.t, query.exp, query.sig, query.v ?? "private")) throw forbidden("Link expired or invalid");
      const rec = runInTenant(query.t, () => {
        const r = storage.getMediaByFile(params.file);
        if (r) storage.addAuditLog("signed_url_used", "signed-link", "signed-link", `Signed link used for ${r.id}`, r.sosId);
        return r;
      });
      const p = query.v === "original" ? originalPath(params.file) : privatePath(params.file);
      if (!rec || !p) throw notFound("Media not found");
      res.setHeader("Content-Type", rec.mime);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.sendFile(p);
      return undefined;
    },
  });

  route(app, {
    method: "get", path: "/api/media/audio/:file", auth: "optional", permission: "media.read_evidence",
    allowQueryToken: true,
    params: z.object({ file: z.string().max(60) }), query: none, body: none,
    handler: ({ params, actor, res }) => {
      if (!actor.user && !actor.deptId) throw unauthorized();
      const rec = storage.getMediaByFile(params.file);
      const p = privatePath(params.file);
      if (!rec || !p) throw notFound("Evidence not found");
      if (!canAccessEvidence(actor, rec)) throw forbidden("You are not allowed to access this evidence");
      storage.addAuditLog("evidence_viewed", actor.user?.id ?? actor.deptId!, actor.user ? actor.user.role : `dept:${actor.deptId}`, `Viewed evidence ${rec.id}`, rec.sosId);
      res.setHeader("Content-Type", rec.mime);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Disposition", `attachment; filename="${rec.fileName}"`);
      res.sendFile(p);
      return undefined;
    },
  });
}
