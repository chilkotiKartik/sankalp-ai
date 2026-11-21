import { z, type ZodTypeAny } from "zod";
import { registry, type RouteMeta } from "./lib/route";
import { PERMISSIONS } from "./auth/permissions";

/**
 * m19: OpenAPI 3.1 document generated from the SAME zod schemas that validate requests,
 * so the docs cannot drift from the implementation. `npm run openapi` writes docs/openapi.json.
 */
function jsonSchema(s: ZodTypeAny): Record<string, unknown> | null {
  try {
    const out = z.toJSONSchema(s, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    delete out.$schema;
    const props = (out.properties ?? {}) as Record<string, unknown>;
    if (out.type === "object" && Object.keys(props).length === 0 && !out.additionalProperties) return null;
    return out;
  } catch {
    return { type: "object" };
  }
}

const SECURITY: Record<string, Array<Record<string, string[]>>> = {
  public: [], optional: [{}, { bearer: [] }], user: [{ bearer: [] }], sos: [{ bearer: [] }], worker: [{ bearer: [] }], admin: [{ bearer: [] }],
  superAdmin: [{ bearer: [] }], dept: [{ deptToken: [] }], police: [{ bearer: [] }, { deptToken: [] }], staff: [{ bearer: [] }, { deptToken: [] }],
};

export function buildOpenApi(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of registry as RouteMeta[]) {
    const p = r.path.replace(/:(\w+)/g, "{$1}");
    const params: unknown[] = [];
    const ps = jsonSchema(r.schemas.params);
    for (const [name, sch] of Object.entries((ps?.properties ?? {}) as Record<string, unknown>)) params.push({ name, in: "path", required: true, schema: sch });
    const qs = jsonSchema(r.schemas.query);
    const required = new Set((qs?.required as string[] | undefined) ?? []);
    for (const [name, sch] of Object.entries((qs?.properties ?? {}) as Record<string, unknown>)) params.push({ name, in: "query", required: required.has(name), schema: sch });
    if (r.paginated) {
      params.push({ name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } });
      params.push({ name: "cursor", in: "query", required: false, schema: { type: "string" } });
    }
    const op: Record<string, unknown> = {
      operationId: `${r.method}_${r.path.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      summary: r.permission,
      "x-permission": r.permission,
      "x-allowed-principals": PERMISSIONS[r.permission] ?? [],
      security: SECURITY[r.auth] ?? [{ bearer: [] }],
      parameters: params,
      responses: {
        "200": { description: "Success" }, "400": { description: "Validation failed", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        "401": { description: "Unauthenticated" }, "403": { description: "Not permitted" }, "404": { description: "Not found" },
      },
    };
    if (r.method !== "get" && r.method !== "delete") {
      const bs = jsonSchema(r.schemas.body);
      if (bs) op.requestBody = { required: true, content: { "application/json": { schema: bs } } };
    }
    (paths[p] ??= {})[r.method] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: "SANKALP AI API", version: "1.1.0", description: "Civic grievance + women-safety SOS platform. Multi-tenant: send X-Tenant (or use the tenant host). All personal data stays in India." },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer", description: "Citizen/staff access token (15 min JWT) from /api/auth/login, /api/auth/otp/verify or /api/auth/refresh" },
        deptToken: { type: "http", scheme: "bearer", description: "Department portal token from /api/dept/login" },
      },
      schemas: { Error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} }, required: ["code", "message"] } },
    },
    paths,
  };
}
