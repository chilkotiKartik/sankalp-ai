import { config } from "../config";

/**
 * The ONLY way the server may make outbound HTTP calls (rule 1: data stays in India).
 * Any host not in EGRESS_ALLOWLIST throws before a socket is opened.
 */
export class EgressBlockedError extends Error {
  constructor(public host: string) {
    super(`Egress to ${host} is not allow-listed`);
    this.name = "EgressBlockedError";
  }
}

export function isAllowedHost(host: string, allowlist = config().EGRESS_ALLOWLIST): boolean {
  const h = host.toLowerCase();
  return allowlist.some((a) => {
    const entry = a.toLowerCase();
    return h === entry || (entry.startsWith(".") && h.endsWith(entry));
  });
}

export async function safeFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const u = new URL(url);
  if (u.protocol !== "https:" && !(config().NODE_ENV !== "production" && u.protocol === "http:")) {
    throw new EgressBlockedError(`${u.protocol}//${u.host}`);
  }
  if (!isAllowedHost(u.hostname)) throw new EgressBlockedError(u.hostname);
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(u, { ...rest, signal: ctrl.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
}
