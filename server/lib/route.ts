import { isAdminUser, isStateUser, isDistrictAdmin } from "../auth/roles";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z, type ZodTypeAny } from "zod";
import { config } from "../config";
import { storage, type AppUser, DEPARTMENTS, SOS_SESSION_GRACE_MS } from "../storage";
import { unauthorized, forbidden, AppError } from "./errors";
import { permits, type Principal } from "../auth/permissions";
import { isJwtShape } from "../auth/tokens";

/**
 * Route registry (M14). Every API route MUST be declared through `route()` with:
 *  - auth level, a permission name, and zod schemas for params, query and body.
 * tests/routes.inventory.test.ts fails if any /api route bypasses this.
 */
export type AuthLevel =
  | "public"        // explicitly public (no PII may be returned)
  | "optional"      // user if a valid token is present
  | "user"          // any logged-in user
  | "sos"           // logged-in user; also accepts a session expired < 30 days ago (rule 9 — never block a genuine SOS)
  | "worker"        // role worker
  | "admin"         // admin or super_admin
  | "superAdmin"
  | "dept"          // department portal token
  | "police"        // dept token for police/usdma, or admin/super_admin user (CPR command)
  | "staff";        // admin/super_admin user OR any dept token

export interface Actor {
  user?: AppUser;
  /** Department this actor acts for: a department portal token, or an officer/dept_admin/police account. */
  deptId?: string;
  /** True when deptId comes from a department portal token (not a personal account). */
  deptToken?: boolean;
}

/** RBAC principals of an actor (P1.4). */
export function principals(a: Actor): Principal[] {
  const out: Principal[] = [];
  if (a.user) out.push(a.user.role as Principal);
  if (a.deptToken && a.deptId) out.push("dept_token", `dept_token:${a.deptId}`);
  return out;
}

export interface RouteMeta {
  method: "get" | "post" | "put" | "delete" | "patch";
  path: string;
  auth: AuthLevel;
  permission: string;
  hasParams: boolean;
  hasQuery: boolean;
  hasBody: boolean;
  /** zod schemas, kept for OpenAPI generation (m19). */
  schemas: { params: ZodTypeAny; query: ZodTypeAny; body: ZodTypeAny };
  paginated?: boolean;
}

export const registry: RouteMeta[] = [];

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : Record<string, never>;

export interface Ctx<P, Q, B> {
  req: Request;
  res: Response;
  params: P;
  query: Q;
  body: B;
  actor: Actor;
  /** convenience: the logged-in user (throws 401 if absent) */
  user: AppUser;
}

export interface RouteDef<P extends ZodTypeAny, Q extends ZodTypeAny, B extends ZodTypeAny> {
  method: RouteMeta["method"];
  path: string;
  auth: AuthLevel;
  permission: string;
  params: P;
  query: Q;
  body: B;
  /** allow `?token=` (EventSource / <audio src> cannot send headers) */
  allowQueryToken?: boolean;
  middleware?: RequestHandler[];
  /** m10: also expose /api/v2<path> returning { items, nextCursor } (default 50, max 200). */
  paginate?: boolean;
  handler: (ctx: Ctx<Infer<P>, Infer<Q>, Infer<B>>) => unknown | Promise<unknown>;
}

/** Use for routes with nothing to validate in that slot. Unknown keys are stripped. */
export const none = z.object({}).passthrough().transform(() => ({}) as Record<string, never>);
export const idParams = z.object({ id: z.string().min(1).max(100) });

// ── Department tokens (HMAC, timing-safe, revoked on code rotation) ──────────
export function signDeptToken(departmentId: string): string {
  const payload = { departmentId, type: "dept", v: storage.deptCredentialVersion(departmentId), exp: Date.now() + 12 * 3600 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", config().DEPT_JWT_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyDeptToken(token: string): { departmentId: string } | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig || token.length > 1000) return null;
  const expected = createHmac("sha256", config().DEPT_JWT_SECRET).update(encoded).digest("base64url");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (p.type !== "dept" || !DEPARTMENTS[p.departmentId] || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    if (p.v !== storage.deptCredentialVersion(p.departmentId)) return null;
    return { departmentId: p.departmentId };
  } catch {
    return null;
  }
}

function bearer(req: Request, allowQuery: boolean): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice(7).trim();
  if (allowQuery && typeof req.query.token === "string") return req.query.token;
  return null;
}

export function resolveActor(req: Request, allowQuery = false, graceMs = 0): Actor {
  const tok = bearer(req, allowQuery);
  if (!tok) return {};
  let user: AppUser | null = null;
  if (isJwtShape(tok)) user = storage.validateAccess(tok, graceMs);
  else if (tok.includes(".")) {
    const d = verifyDeptToken(tok);
    return d ? { deptId: d.departmentId, deptToken: true } : {};
  } else user = storage.validateToken(tok, graceMs);
  if (!user) return {};
  // Personal department accounts act for their department; police accounts act for the police unit.
  if ((user.role === "officer" || user.role === "dept_admin") && user.departmentId) return { user, deptId: user.departmentId };
  if (user.role === "police") return { user, deptId: "police" };
  return { user };
}

const isAdmin = (u?: AppUser) => isAdminUser(u);

export function authorize(level: AuthLevel, a: Actor): void {
  switch (level) {
    case "public":
    case "optional":
      return;
    case "user":
    case "sos":
      if (!a.user) throw unauthorized();
      return;
    case "worker":
      if (!a.user) throw unauthorized();
      if (a.user.role !== "worker") throw forbidden("Worker access required");
      return;
    case "admin":
      if (!a.user) throw unauthorized();
      if (!isAdmin(a.user)) throw forbidden("Admin access required");
      return;
    case "superAdmin":
      if (!a.user) throw unauthorized();
      if (a.user.role !== "super_admin") throw forbidden("Super admin access required");
      return;
    case "dept":
      if (!a.deptId) throw unauthorized("Invalid or expired department token");
      return;
    case "police":
      if (a.deptId === "police" || a.deptId === "usdma" || isAdmin(a.user)) return;
      if (!a.user && !a.deptId) throw unauthorized();
      throw forbidden("Police / CPR access required");
    case "staff":
      if (a.deptId || isAdmin(a.user)) return;
      if (!a.user) throw unauthorized();
      throw forbidden("Staff access required");
  }
}

const PAGE = { default: 50, max: 200 };
const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(PAGE.max).default(PAGE.default), cursor: z.string().max(40).optional() });

/** Opaque offset cursor. Lists are returned newest-first, so offsets are stable between consecutive pages. */
export function paginateList<T>(items: T[], q: { limit: number; cursor?: string }) {
  let offset = 0;
  if (q.cursor) {
    const m = Buffer.from(q.cursor, "base64url").toString("utf8").match(/^o:(\d{1,9})$/);
    if (!m) throw new AppError(400, "BAD_CURSOR", "Invalid cursor");
    offset = Number(m[1]);
  }
  const page = items.slice(offset, offset + q.limit);
  const next = offset + q.limit < items.length ? Buffer.from(`o:${offset + q.limit}`).toString("base64url") : null;
  return { items: page, nextCursor: next, total: items.length };
}

export function route<P extends ZodTypeAny, Q extends ZodTypeAny, B extends ZodTypeAny>(app: Express, def: RouteDef<P, Q, B>) {
  if (def.paginate) {
    const v2Path = def.path.replace(/^\/api\//, "/api/v2/");
    const inner = def.handler;
    route(app, {
      ...def, paginate: false, path: v2Path,
      query: def.query,
      handler: async (ctx: Ctx<Infer<P>, Infer<Q>, Infer<B>>) => {
        const q = pageQuery.parse({ limit: ctx.req.query.limit, cursor: ctx.req.query.cursor });
        const out = await inner(ctx);
        if (!Array.isArray(out)) return out;
        return paginateList(out, q);
      },
    } as RouteDef<P, Q, B>);
  }
  registry.push({
    method: def.method, path: def.path, auth: def.auth, permission: def.permission,
    hasParams: !!def.params, hasQuery: !!def.query, hasBody: !!def.body,
    schemas: { params: def.params, query: def.query, body: def.body }, paginated: def.path.startsWith("/api/v2/"),
  });
  const run = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = resolveActor(req, !!def.allowQueryToken, def.auth === "sos" ? SOS_SESSION_GRACE_MS : 0);
      authorize(def.auth, actor);
      if (def.auth !== "public" && def.auth !== "optional" && !permits(def.permission, principals(actor))) {
        throw forbidden("Your role is not allowed to do this");
      }
      const { token: _t, ...queryRest } = req.query as Record<string, unknown>;
      const params = def.params.parse(req.params);
      const query = def.query.parse(def.allowQueryToken ? queryRest : req.query);
      const body = def.body.parse(req.body ?? {});
      const ctx = {
        req, res, params, query, body, actor,
        get user(): AppUser { if (!actor.user) throw unauthorized(); return actor.user; },
      } as Ctx<Infer<P>, Infer<Q>, Infer<B>>;
      const out = await def.handler(ctx);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (err) {
      next(err);
    }
  };
  app[def.method](def.path, ...(def.middleware ?? []), run);
}

/** Tenant/district scope: super_admin sees all; others see their own district. */
export function scopeDistrict(actor: Actor): string | undefined {
  if (!actor.user) return undefined;
  return isStateUser(actor.user) ? undefined : actor.user.district;
}
