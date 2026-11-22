import { isAdminUser, isStateUser, isDistrictAdmin } from "../auth/roles";
import type { Express } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { storage, DEPARTMENTS, SOS_SESSION_GRACE_MS, type AppUser } from "../storage";
import { isJwtShape, verifyAccess } from "../auth/tokens";
import { sendSms } from "../notify/sms";
import { defaultDistrict, stateLabel } from "../data/reference";
import { route, none, signDeptToken } from "../lib/route";
import { AppError, unauthorized, badRequest, notFound } from "../lib/errors";
import { authLimiter, phoneLimiter, registerLimiter } from "./limits";
import { phone10, pin6, tenantDistrict, tenantDistrictOrState } from "./common";
import { toPublicUser } from "./dto";

const BCRYPT_ROUNDS = 12;
// Constant-cost dummy hash so unknown phones take as long as wrong PINs.
const DUMMY_HASH = bcrypt.hashSync("000000-dummy", 10);

/** Login response: short-lived access token (also as legacy `token`) + rotating refresh token. */
function sessionResponse(user: AppUser) {
  const s = storage.issueSession(user.id);
  return { user: toPublicUser(user), token: s.accessToken, accessToken: s.accessToken, refreshToken: s.refreshToken, expiresIn: s.expiresIn };
}

export function registerAuthRoutes(app: Express) {
  route(app, {
    method: "post", path: "/api/auth/register", auth: "public", permission: "auth.register",
    middleware: [registerLimiter],
    params: none, query: none,
    body: z.object({ name: z.string().trim().min(2).max(80), phone: phone10, pin: pin6, district: tenantDistrict.optional() }),
    handler: async ({ body }) => {
      if (await storage.findUserByPhone(body.phone)) throw new AppError(409, "PHONE_TAKEN", "Phone number already registered");
      const user = await storage.createUser({
        name: body.name, phone: body.phone, pin: await bcrypt.hash(body.pin, BCRYPT_ROUNDS), role: "citizen",
        district: body.district || defaultDistrict(), points: 0, badges: ["new_citizen"], level: 1,
      });
      return sessionResponse(user);
    },
  });

  route(app, {
    method: "post", path: "/api/auth/login", auth: "public", permission: "auth.login",
    middleware: [authLimiter, phoneLimiter],
    params: none, query: none,
    body: z.object({ phone: z.string().trim().min(10).max(15), pin: z.string().min(4).max(12) }),
    handler: async ({ body }) => {
      const user = await storage.findUserByPhone(body.phone);
      const isHash = !!user?.pin && /^\$2[aby]\$/.test(user.pin);
      let ok = false;
      if (!user) await bcrypt.compare(body.pin, DUMMY_HASH);
      else if (isHash) ok = await bcrypt.compare(body.pin, user.pin);
      else {
        // M15: legacy plaintext PIN — accept once, then re-hash immediately and drop the plaintext.
        await bcrypt.compare(body.pin, DUMMY_HASH);
        ok = user.pin === body.pin;
        if (ok) await storage.setPinHash(user.id, body.pin);
      }
      if (!user || !ok) throw unauthorized("Invalid phone or PIN");
      return sessionResponse(user);
    },
  });

  route(app, {
    method: "get", path: "/api/auth/me", auth: "user", permission: "auth.me",
    params: none, query: none, body: none,
    handler: ({ user }) => toPublicUser(user),
  });

  route(app, {
    // Public on purpose (review P1-H1): logout must work even when the access token has already expired.
    // It only ever revokes the session identified by a valid signed token or a known refresh token.
    method: "post", path: "/api/auth/logout", auth: "public", permission: "auth.logout",
    params: none, query: none, body: z.object({ refreshToken: z.string().max(200).optional() }).passthrough(),
    handler: ({ req, body }) => {
      if (body.refreshToken) storage.revokeByRefresh(body.refreshToken);
      const tok = req.headers.authorization?.slice(7);
      if (tok && isJwtShape(tok)) {
        const c = verifyAccess(tok, Math.floor(SOS_SESSION_GRACE_MS / 1000));
        if (c) storage.revokeSession(c.sid);
      } else if (tok) storage.revokeToken(tok);
      return { success: true };
    },
  });

  // ── Refresh-token rotation (P1.5) ──────────────────────────────────────────
  route(app, {
    method: "post", path: "/api/auth/refresh", auth: "public", permission: "auth.refresh",
    middleware: [authLimiter],
    params: none, query: none, body: z.object({ refreshToken: z.string().min(10).max(200) }),
    handler: ({ body }) => {
      const r = storage.rotateRefresh(body.refreshToken);
      if (!r) throw unauthorized("Session expired — please sign in again");
      return { user: toPublicUser(r.user), token: r.accessToken, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn };
    },
  });

  // ── Phone OTP (P1.5) — DLT SMS in production, console driver in development ─
  route(app, {
    method: "post", path: "/api/auth/otp/request", auth: "public", permission: "auth.otp_request",
    middleware: [authLimiter, phoneLimiter],
    params: none, query: none, body: z.object({ phone: phone10 }),
    handler: async ({ body }) => {
      const code = storage.createOtp(body.phone);
      if (!code) throw new AppError(429, "OTP_COOLDOWN", "Please wait before requesting another code");
      const sent = await sendSms(body.phone, "otp", [code]);
      if (!sent.ok) throw new AppError(503, "SMS_UNAVAILABLE", "Could not send the code right now. Sign in with your PIN or try again.");
      return { sent: true, expiresInSeconds: 300 };
    },
  });

  route(app, {
    method: "post", path: "/api/auth/otp/verify", auth: "public", permission: "auth.otp_verify",
    middleware: [authLimiter, phoneLimiter],
    params: none, query: none,
    body: z.object({ phone: phone10, code: z.string().regex(/^\d{6}$/), name: z.string().trim().min(2).max(80).optional(), district: tenantDistrict.optional() }),
    handler: async ({ body }) => {
      if (!storage.verifyOtp(body.phone, body.code)) throw unauthorized("Invalid or expired code");
      let user = await storage.findUserByPhone(body.phone);
      // Staff accounts must sign in with their PIN: an SMS code alone (SIM swap) never opens a staff session (review P1-M1).
      if (user && user.role !== "citizen") throw new AppError(403, "PIN_REQUIRED", "Staff accounts sign in with phone and PIN");
      if (!user) {
        if (!body.name) throw new AppError(422, "PROFILE_REQUIRED", "New number — request a new code and send it with your name and district to create an account");
        user = await storage.createUser({ name: body.name, phone: body.phone, pin: await bcrypt.hash(randomBytes(16).toString("hex"), 10),
          role: "citizen", district: body.district || defaultDistrict(), points: 0, badges: ["new_citizen"], level: 1 });
      }
      return sessionResponse(user);
    },
  });

  // ── Department portal login (M5): random bcrypt-hashed codes, rotatable ────
  route(app, {
    method: "post", path: "/api/dept/login", auth: "public", permission: "dept.login",
    middleware: [authLimiter],
    params: none, query: none,
    body: z.object({ departmentId: z.string().min(2).max(20), accessCode: z.string().min(6).max(100) }),
    handler: async ({ body, res }) => {
      const dept = DEPARTMENTS[body.departmentId];
      // A newly added state gets its access codes a few minutes after first boot: say so instead of "wrong code".
      if (storage.s.deptCredentials.length === 0) {
        res.setHeader("Retry-After", "60");
        throw new AppError(503, "STATE_SETTING_UP", "Department access for this state is still being set up. Please try again in a minute.");
      }
      const ok = await storage.verifyDeptCode(body.departmentId, body.accessCode);
      if (!dept || !ok) throw unauthorized("Invalid department or access code");
      storage.addAuditLog("dept_login", body.departmentId, dept.name, "Department portal login");
      return { token: signDeptToken(body.departmentId), department: dept };
    },
  });

  route(app, {
    method: "post", path: "/api/superadmin/departments/:id/rotate-code", auth: "superAdmin", permission: "dept.rotate_code",
    params: z.object({ id: z.string().min(2).max(20) }), query: none, body: none,
    handler: async ({ params, user }) => {
      if (!DEPARTMENTS[params.id]) throw notFound("Department not found");
      const code = await storage.rotateDeptCode(params.id);
      storage.addAuditLog("dept_code_rotated", user.id, user.name, `Access code rotated for ${params.id}`);
      // Returned exactly once; existing department sessions are revoked by the version bump.
      return { departmentId: params.id, accessCode: code };
    },
  });

  // ── Staff account management (super admin) — needed for admins/workers without seeded credentials ─
  route(app, {
    method: "post", path: "/api/superadmin/users", auth: "superAdmin", permission: "users.create_staff",
    params: none, query: none,
    body: z.object({
      name: z.string().trim().min(2).max(80), phone: phone10, pin: pin6,
      role: z.enum(["worker", "officer", "dept_admin", "district_admin", "admin", "police", "disaster_authority", "state_admin", "super_admin"]), district: tenantDistrictOrState,
      departmentId: z.string().max(20).optional(),
    }),
    handler: async ({ body, user }) => {
      if (await storage.findUserByPhone(body.phone)) throw new AppError(409, "PHONE_TAKEN", "Phone number already registered");
      if (!isStateUser(body) && body.district === stateLabel()) throw badRequest("Pick a district for this role");
      if ((body.role === "officer" || body.role === "dept_admin") && (!body.departmentId || !DEPARTMENTS[body.departmentId])) throw badRequest("officer / dept_admin accounts need a valid departmentId");
      const created = await storage.createUser({ name: body.name, phone: body.phone, pin: await bcrypt.hash(body.pin, BCRYPT_ROUNDS),
        role: body.role, district: body.district, departmentId: body.departmentId, points: 0, badges: [], level: 1 });
      storage.addAuditLog("staff_created", user.id, user.name, `Created ${body.role} account in ${body.district}`);
      return { user: toPublicUser(created) };
    },
  });
}
