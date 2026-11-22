import pino from "pino";
/**
 * Minimal structured JSON logger with PII redaction (m6 groundwork; pino in Phase 1).
 * Never pass raw request bodies; known PII keys are masked recursively.
 */
const REDACT_KEYS = /^(phone|mobile|name|citizenName|triggeredBy|submittedBy|submittedByPhone|address|location|geo|lat|lng|liveGeo|pin|token|authorization|password|accessCode|audio|image|imageBase64)$/i;
const PHONE_RE = /(?<!\d)(?:\+?91[-\s]?)?[6-9]\d{9}(?!\d)/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (value instanceof Error) return { name: value.name, message: redactString(value.message), stack: value.stack?.split("\n").slice(0, 4).join("\n") };
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = REDACT_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

function redactString(s: string): string {
  return s.replace(PHONE_RE, "[phone]").slice(0, 2000);
}

type Level = "debug" | "info" | "warn" | "error";

/**
 * pino structured logger (m6, P1.10). Every field passes through redact() first (keys AND phone numbers inside
 * strings), then pino's own path redaction as a second net. No foreign log shipping: stdout/stderr only.
 */
const level = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "test" ? "warn" : "info");
const base = pino({
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "msg",
  formatters: { level: (label: string) => ({ level: label }) },
  redact: { paths: ["*.phone", "*.pin", "*.token", "*.authorization", "*.password", "*.geo", "req.headers.authorization"], censor: "[redacted]" },
});

function write(lvl: Level, msg: string, fields?: Record<string, unknown>) {
  base[lvl]((fields ? (redact(fields) as object) : {}), msg);
}

export const logger = {
  debug: (m: string, f?: Record<string, unknown>) => write("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => write("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => write("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => write("error", m, f),
};
