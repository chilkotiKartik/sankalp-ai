import Expo, { type ExpoPushMessage } from "expo-server-sdk";
import { config } from "../config";
import { isAllowedHost } from "../lib/safeFetch";
import { logger } from "../lib/logger";

/**
 * Push notifications (M17). Payloads carry NO personal data — only a reference the app
 * resolves against the API with the user's own permissions.
 * Drivers: "none" | "console" (dev) | "expo" (requires exp.host in EGRESS_ALLOWLIST — foreign service, opt-in).
 */
export interface PushRef { kind: "complaint" | "sos" | "announcement"; id: string; ref: string }

export function buildPayload(r: PushRef) {
  return { title: "Sankalp", body: `Update on #${r.ref}`, data: { kind: r.kind, id: r.id } };
}

let expo: Expo | null = null;

export async function sendPush(tokens: string[], r: PushRef, opts: { urgent?: boolean } = {}): Promise<number> {
  const c = config();
  if (!tokens.length || c.PUSH_DRIVER === "none") return 0;
  const payload = buildPayload(r);
  if (c.PUSH_DRIVER === "console") {
    logger.info("push_console", { count: tokens.length, kind: r.kind, ref: r.ref });
    return tokens.length;
  }
  if (!isAllowedHost("exp.host")) {
    logger.warn("push_blocked_by_egress", { count: tokens.length });
    return 0;
  }
  expo ??= new Expo({ accessToken: c.EXPO_ACCESS_TOKEN });
  const messages: ExpoPushMessage[] = tokens.filter(t => Expo.isExpoPushToken(t)).map(to => ({
    to, ...payload, sound: "default", priority: opts.urgent ? "high" : "normal",
    channelId: opts.urgent ? "sos-alerts" : "complaint-updates",
  }));
  let sent = 0;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try { await expo.sendPushNotificationsAsync(chunk); sent += chunk.length; }
    catch (err) { logger.warn("push_failed", { err: (err as Error).message }); }
  }
  return sent;
}
