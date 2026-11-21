import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * P5.1 offline-first outbox. Writes that fail for lack of network are saved on the device and sent later.
 *  - Conflict-safe: every item carries a client-generated id (sent as `clientRequestId`), so a retry after a
 *    lost response never creates a second complaint (the server returns the first one).
 *  - Flushed on app start, when the app returns to the foreground, every 30 s while open, and after any success.
 *  - 4xx answers (except 408/429) are final: the item moves to `failed` with the server's message, so the user can
 *    see and fix it; network errors and 5xx keep the item with exponential backoff (max 30 min).
 * Never queued: SOS (sent immediately with its own SMS fallback) and anything needing a fresh answer.
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

const KEY = "sankalp_outbox_v1";
const FAILED_KEY = "sankalp_outbox_failed_v1";
const MAX_ITEMS = 50;

export function newClientId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function read(key: string): Promise<OutboxItem[]> {
  try { return JSON.parse((await AsyncStorage.getItem(key)) || "[]") as OutboxItem[]; } catch { return []; }
}
async function write(key: string, items: OutboxItem[]) {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export async function enqueue(item: Omit<OutboxItem, "createdAt" | "attempts" | "nextAttemptAt">): Promise<OutboxItem> {
  const items = await read(KEY);
  if (items.length >= MAX_ITEMS) throw new Error("Too many reports are waiting to be sent. Connect to the internet and try again.");
  const full: OutboxItem = { ...item, createdAt: Date.now(), attempts: 0, nextAttemptAt: Date.now() };
  await write(KEY, [...items.filter(i => i.id !== item.id), full]);
  return full;
}

export const pending = () => read(KEY);
export const failed = () => read(FAILED_KEY);
export async function dismissFailed(id: string) { await write(FAILED_KEY, (await read(FAILED_KEY)).filter(i => i.id !== id)); }

/** A fetch error with no HTTP status is a network problem → queue. */
export const isNetworkError = (err: unknown) => {
  const e = err as { status?: number; name?: string; message?: string };
  return e?.status === undefined && (e?.name === "TypeError" || /network|fetch|timeout|offline/i.test(e?.message ?? ""));
};

type Sender = (path: string, method: string, body: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let flushing: Promise<{ sent: number; failed: number }> | null = null;

export function flush(send: Sender, onSent?: (item: OutboxItem, result: unknown) => void): Promise<{ sent: number; failed: number }> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0, bad = 0;
    const now = Date.now();
    for (const item of await read(KEY)) {
      if (item.nextAttemptAt > now) continue;
      let keep = true;
      try {
        const res = await send(item.path, item.method, { ...item.body, clientRequestId: item.id });
        if (res.ok) { keep = false; sent++; onSent?.(item, await res.json().catch(() => null)); }
        else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          keep = false; bad++;
          const msg = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? `HTTP ${res.status}`;
          await write(FAILED_KEY, [...(await read(FAILED_KEY)), { ...item, error: msg }].slice(-MAX_ITEMS));
        }
      } catch { /* still offline */ }
      const items = await read(KEY);
      if (!keep) await write(KEY, items.filter(i => i.id !== item.id));
      else {
        const attempts = item.attempts + 1;
        const delay = Math.min(30 * 60_000, 15_000 * 2 ** Math.min(attempts, 7));
        await write(KEY, items.map(i => (i.id === item.id ? { ...i, attempts, nextAttemptAt: Date.now() + delay } : i)));
      }
    }
    return { sent, failed: bad };
  })().finally(() => { flushing = null; });
  return flushing;
}
