import type { Express } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { storage, DEPARTMENTS } from "../storage";
import { DISTRICT_NAMES } from "../data/reference";
import { route, none, signDeptToken } from "../lib/route";
import { AppError, unauthorized, badRequest, notFound } from "../lib/errors";
import { authLimiter, phoneLimiter, registerLimiter } from "./limits";
import { phone10, pin6 } from "./common";
import { toPublicUser } from "./dto";

const BCRYPT_ROUNDS = 12;
// Constant-cost dummy hash so unknown phones take as long as wrong PINs.
const DUMMY_HASH = bcrypt.hashSync("000000-dummy", 10);

export function registerAuthRoutes(app: Express) {
  route(app, {
    method: "post", path: "/api/auth/register", auth: "public", permission: "auth.register",
    middleware: [registerLimiter],
    params: none, query: none,
    body: z.object({ name: z.string().trim().min(2).max(80), phone: phone10, pin: pin6, district: z.enum(DISTRICT_NAMES as [string, ...string[]]).optional() }),
    handler: async ({ body }) => {
      if (await storage.findUserByPhone(body.phone)) throw new AppError(409, "PHONE_TAKEN", "Phone number already registered");
      const user = await storage.createUser({
        name: body.name, phone: body.phone, pin: await bcrypt.hash(body.pin, BCRYPT_ROUNDS), role: "citizen",
        district: body.district || "Dehradun", points: 0, badges: ["new_citizen"], level: 1,
      });
      return { user: toPublicUser(user), token: storage.createToken(user.id) };
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
      return { user: toPublicUser(user), token: storage.createToken(user.id) };
    },
  });

  route(app, {
    method: "get", path: "/api/auth/me", auth: "user", permission: "auth.me",
    params: none, query: none, body: none,
    handler: ({ user }) => toPublicUser(user),
  });

  route(app, {
    method: "post", path: "/api/auth/logout", auth: "user", permission: "auth.logout",
    params: none, query: none, body: none,
    handler: ({ req }) => {
      const tok = req.headers.authorization?.slice(7);
      if (tok) storage.revokeToken(tok);
      return { success: true };
    },
  });

  // ── Department portal login (M5): random bcrypt-hashed codes, rotatable ────
  route(app, {
    method: "post", path: "/api/dept/login", auth: "public", permission: "dept.login",
    middleware: [authLimiter],
    params: none, query: none,
    body: z.object({ departmentId: z.string().min(2).max(20), accessCode: z.string().min(6).max(100) }),
    handler: async ({ body }) => {
      const dept = DEPARTMENTS[body.departmentId];
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
      role: z.enum(["worker", "admin", "super_admin"]), district: z.enum(["Uttarakhand", ...DISTRICT_NAMES] as [string, ...string[]]),
    }),
    handler: async ({ body, user }) => {
      if (await storage.findUserByPhone(body.phone)) throw new AppError(409, "PHONE_TAKEN", "Phone number already registered");
      if (body.role !== "super_admin" && body.district === "Uttarakhand") throw badRequest("Pick a district for this role");
      const created = await storage.createUser({ name: body.name, phone: body.phone, pin: await bcrypt.hash(body.pin, BCRYPT_ROUNDS),
        role: body.role, district: body.district, points: 0, badges: [], level: 1 });
      storage.addAuditLog("staff_created", user.id, user.name, `Created ${body.role} account in ${body.district}`);
      return { user: toPublicUser(created) };
    },
  });
}
