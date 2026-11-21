import { z } from "zod";

/**
 * Central, validated configuration (m13). Loaded once at boot; the server
 * refuses to start if a required value is missing or unsafe (M5).
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []));

const secret = (name: string) =>
  z
    .string({ error: `${name} is required (>= 32 random characters)` })
    .min(32, `${name} must be at least 32 characters`);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  PUBLIC_BASE_URL: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  CORS_ORIGINS: csv,
  DEMO_MODE: bool,
  DATA_DIR: z.string().default("./data"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),
  JWT_SECRET: secret("JWT_SECRET"),
  DEPT_JWT_SECRET: secret("DEPT_JWT_SECRET"),
  EGRESS_ALLOWLIST: csv,
  AI_TEXT_PROVIDER: z.enum(["sarvam", "selfhosted", "rules", ""]).optional(),
  SARVAM_API_KEY: z.string().optional(),
  SARVAM_MODEL: z.string().default("sarvam-105b"),
  AI_TEXT_BASE_URL: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  AI_TEXT_MODEL: z.string().optional(),
  AI_VISION_BASE_URL: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),
  AI_VISION_MODEL: z.string().optional(),
  MAP_TILE_URL: z.string().optional(),
  PUSH_DRIVER: z.enum(["none", "console", "expo"]).default("console"),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
  BOOTSTRAP_SUPER_ADMIN_PHONE: z.string().regex(/^\d{10}$/).optional(),
  BOOTSTRAP_SUPER_ADMIN_PIN: z.string().regex(/^\d{6}$/).optional(),
});

export type AppConfig = z.infer<typeof schema> & {
  textProvider: "sarvam" | "selfhosted" | "rules";
  visionProvider: "selfhosted" | "manual_review";
  mapTileUrl: string | null;
};

const OSM_DEV_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration — refusing to start:\n${lines.join("\n")}`);
  }
  const c = parsed.data;
  if (c.JWT_SECRET === c.DEPT_JWT_SECRET) {
    throw new Error("Invalid configuration — JWT_SECRET and DEPT_JWT_SECRET must differ");
  }
  // §11 safe defaults for AI providers
  let textProvider: AppConfig["textProvider"] = "rules";
  if (c.AI_TEXT_PROVIDER === "sarvam" || (!c.AI_TEXT_PROVIDER && c.SARVAM_API_KEY)) textProvider = "sarvam";
  else if (c.AI_TEXT_PROVIDER === "selfhosted" || (!c.AI_TEXT_PROVIDER && c.AI_TEXT_BASE_URL)) textProvider = "selfhosted";
  if (textProvider === "sarvam" && !c.SARVAM_API_KEY) textProvider = "rules";
  if (textProvider === "selfhosted" && !c.AI_TEXT_BASE_URL) textProvider = "rules";
  const visionProvider: AppConfig["visionProvider"] = c.AI_VISION_BASE_URL ? "selfhosted" : "manual_review";

  // Map tiles: explicit MAP_TILE_URL; OSM only in development (§11)
  const mapTileUrl = c.MAP_TILE_URL || (c.NODE_ENV === "development" ? OSM_DEV_TILES : null);

  // Egress allow-list always includes the configured AI hosts' explicit opt-in only.
  const allow = new Set(c.EGRESS_ALLOWLIST.length ? c.EGRESS_ALLOWLIST : ["api.sarvam.ai"]);
  return { ...c, EGRESS_ALLOWLIST: [...allow], textProvider, visionProvider, mapTileUrl };
}

let current: AppConfig | null = null;

export function config(): AppConfig {
  if (!current) current = loadConfig();
  return current;
}

/** Test helper: replace the active configuration. */
export function setConfig(c: AppConfig) {
  current = c;
}
