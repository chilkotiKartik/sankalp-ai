import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

/**
 * P9 multi-state client. The selected state (tenant id) is saved on the device and sent as `X-Tenant` with
 * every API request — installed once as a fetch wrapper, so no screen has to remember it. Nothing state-specific
 * is hard-coded in the app: names, districts, map area, departments and helplines come from /api/public/config.
 */
const KEY = "sankalp_state_v1";
let current: string | null = null;
const listeners = new Set<(id: string | null) => void>();

export const getTenantId = () => current;

export async function loadTenantId(): Promise<string | null> {
  try { current = (await AsyncStorage.getItem(KEY)) || null; } catch { current = null; }
  listeners.forEach(f => f(current));
  return current;
}

export async function setTenantId(id: string | null) {
  current = id;
  try { if (id) await AsyncStorage.setItem(KEY, id); else await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
  listeners.forEach(f => f(current));
}

export function onTenantChange(fn: (id: string | null) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** Query string fragment for WebSocket / EventSource URLs (they cannot send headers). */
export const tenantQuery = () => (current ? `tenant=${encodeURIComponent(current)}` : "");

let installed = false;
export function installTenantFetch() {
  if (installed) return;
  installed = true;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const api = getApiUrl();
    const ours = url.startsWith(api) || url.startsWith("/api/") || url.startsWith("api/");
    if (!ours || !current) return orig(input as RequestInfo, init);
    const headers = new Headers(init?.headers ?? (typeof input === "object" && "headers" in (input as Request) ? (input as Request).headers : undefined));
    if (!headers.has("X-Tenant")) headers.set("X-Tenant", current);
    return orig(input as RequestInfo, { ...init, headers });
  }) as typeof fetch;
}
