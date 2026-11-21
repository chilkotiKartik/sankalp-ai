import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * P5.1 offline-first outbox. Writes that fail for lack of network are saved on the device and sent later.
 *  - Per user (review P5-3): every queue is keyed by the signed-in user's id. After logout another person on the same
 *    phone neither sees nor sends someone else's reports; they are sent when that user signs in again.
 *  - One storage key per item (review P5-5): a single large photo cannot break the whole queue (Android limits
 *    each AsyncStorage row to ≈2 MB), and items larger than MAX_ITEM_BYTES are refused up front, never half-saved.
 *  - Conflict-safe: every item carries a client id (sent as `clientRequestId`); the server returns the first
 *    complaint for a repeated id, so a retry after a lost response never duplicates.
 *  - Final failures are only real validation errors (400/404/409/413/422). 401/403/408/428/429/5xx and network
 *    errors keep the item for later (review P5-4); failed items can be moved back with `retryFailed`.
 * Never queued: SOS (sent immediately with its own SMS fallback).
 */
export interface OutboxItem {
  id: string;
  path: string;
  method: "POST" | "PUT";
  body: Record<string, unknown>;
  label: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  error?: string;
}

const PREFIX = "sankalp_outbox_v2";
const MAX_ITEMS = 50;
export const MAX_ITEM_BYTES = 1_500_000;
const FINAL = new Set([400, 404, 409, 413, 422]);

const indexKey = (uid: string, list: "pending" | "failed") => `${PREFIX}:${uid}:${list}`;
const itemKey = (uid: string, id: string) => `${PREFIX}:${uid}:item:${id}`;

export function newClientId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** Index read: a corrupt index is an error, never silently "empty" (which would overwrite the queue). */
async function readIndex(uid: string, list: "pending" | "failed"): Promise<string[]> {
  const raw = await AsyncStorage.getItem(indexKey(uid, list));
  if (!raw) return [];
  const v = JSON.parse(raw) as unknown;
  if (!Array.isArray(v)) throw new Error("outbox index is corrupt");
  return v.map(String);
}
const writeIndex = (uid: string, list: "pending" | "failed", ids: string[]) => AsyncStorage.setItem(indexKey(uid, list), JSON.stringify(ids));

async function readItem(uid: string, id: string): Promise<OutboxItem | null> {
  try { const raw = await AsyncStorage.getItem(itemKey(uid, id)); return raw ? (JSON.parse(raw) as OutboxItem) : null; } catch { return null; }
}
const writeItem = (uid: string, it: OutboxItem) => AsyncStorage.setItem(itemKey(uid, it.id), JSON.stringify(it));

async function list(uid: string, which: "pending" | "failed"): Promise<OutboxItem[]> {
  const ids = await readIndex(uid, which).catch(() => [] as string[]);
  const items = await Promise.all(ids.map(id => readItem(uid, id)));
  return items.filter((x): x is OutboxItem => !!x);
}

export async function enqueue(uid: string, item: Omit<OutboxItem, "createdAt" | "attempts" | "nextAttemptAt">): Promise<OutboxItem> {
  const ids = await readIndex(uid, "pending"); // throws on a corrupt index → the caller shows an error instead of losing data
  if (ids.length >= MAX_ITEMS) throw new Error("Too many reports are waiting to be sent. Connect to the internet and try again.");
  const full: OutboxItem = { ...item, createdAt: Date.now(), attempts: 0, nextAttemptAt: Date.now() };
  const size = JSON.stringify(full).length;
  if (size > MAX_ITEM_BYTES) throw new Error("This report is too large to save offline (photo). Remove the photo or try again with a connection.");
  await writeItem(uid, full);
  await writeIndex(uid, "pending", [...ids.filter(i => i !== item.id), item.id]);
  return full;
}

export const pending = (uid: string) => list(uid, "pending");
export const failed = (uid: string) => list(uid, "failed");

export async function dismissFailed(uid: string, id: string) {
  await writeIndex(uid, "failed", (await readIndex(uid, "failed").catch(() => [])).filter(i => i !== id));
  await AsyncStorage.removeItem(itemKey(uid, id));
}

/** Move a failed item back to the queue (after the user fixed the cause, e.g. accepted the privacy notice). */
export async function retryFailed(uid: string, id: string) {
  const it = await readItem(uid, id);
  if (!it) return;
  await writeItem(uid, { ...it, error: undefined, attempts: 0, nextAttemptAt: Date.now() });
  await writeIndex(uid, "failed", (await readIndex(uid, "failed").catch(() => [])).filter(i => i !== id));
  await writeIndex(uid, "pending", [...(await readIndex(uid, "pending")).filter(i => i !== id), id]);
}

/** A fetch error with no HTTP status is a network problem → queue. */
export const isNetworkError = (err: unknown) => {
  const e = err as { status?: number; name?: string; message?: string };
  return e?.status === undefined && (e?.name === "TypeError" || /network|fetch|timeout|offline/i.test(e?.message ?? ""));
};

type Sender = (path: string, method: string, body: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const flushing = new Map<string, Promise<{ sent: number; failed: number }>>();

export function flush(uid: string, send: Sender, onSent?: (item: OutboxItem, result: unknown) => void, force = false): Promise<{ sent: number; failed: number }> {
  const running = flushing.get(uid);
  if (running) return running;
  const p = (async () => {
    let sent = 0, bad = 0;
    const startedAt = Date.now();
    for (const item of await list(uid, "pending")) {
      if (!force && item.nextAttemptAt > startedAt) continue;
      let outcome: "sent" | "final" | "keep" = "keep";
      let error: string | undefined;
      try {
        const res = await send(item.path, item.method, { ...item.body, clientRequestId: item.id });
        if (res.ok) { outcome = "sent"; onSent?.(item, await res.json().catch(() => null)); }
        else if (FINAL.has(res.status)) {
          outcome = "final";
          error = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? `HTTP ${res.status}`;
        }
      } catch { /* still offline */ }
      const ids = await readIndex(uid, "pending");
      if (outcome === "sent") {
        sent++;
        await writeIndex(uid, "pending", ids.filter(i => i !== item.id));
        await AsyncStorage.removeItem(itemKey(uid, item.id));
      } else if (outcome === "final") {
        bad++;
        await writeItem(uid, { ...item, error });
        await writeIndex(uid, "pending", ids.filter(i => i !== item.id));
        await writeIndex(uid, "failed", [...(await readIndex(uid, "failed").catch(() => [])).filter(i => i !== item.id), item.id].slice(-MAX_ITEMS));
      } else {
        const attempts = item.attempts + 1;
        await writeItem(uid, { ...item, attempts, nextAttemptAt: Date.now() + Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7)) });
      }
    }
    return { sent, failed: bad };
  })().finally(() => flushing.delete(uid));
  flushing.set(uid, p);
  return p;
}

/** Sender with one token refresh on 401 (access tokens live 15 min; the device may have been offline longer). */
export function makeSender(baseUrl: string, getToken: () => string | null, refresh: () => Promise<string | null>): Sender {
  return async (path, method, body) => {
    const go = (tok: string | null) => fetch(`${baseUrl}${path.slice(1)}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok ?? ""}` }, body: JSON.stringify(body) });
    let r = await go(getToken());
    if (r.status === 401) { const fresh = await refresh().catch(() => null); if (fresh) r = await go(fresh); }
    return { ok: r.ok, status: r.status, json: () => r.json() };
  };
}
