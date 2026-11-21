import type { Request, Response } from "express";
import { AppError } from "./errors";
import type { Actor } from "./route";

/**
 * m11: Server-Sent Events helper — per-principal connection limits, 25 s heartbeat comments,
 * proxy-safe headers. Browsers' EventSource reconnects automatically with backoff.
 */
const open = new Map<string, number>();
export const SSE_MAX_PER_PRINCIPAL = 3;

export function sseKey(actor: Actor): string {
  return actor.user ? `u:${actor.user.id}` : actor.deptId ? `d:${actor.deptId}` : "anon";
}

export function openSse(req: Request, res: Response, key: string, max = SSE_MAX_PER_PRINCIPAL): (data: unknown) => void {
  const n = open.get(key) ?? 0;
  if (n >= max) throw new AppError(429, "TOO_MANY_STREAMS", `At most ${max} live streams per account — close another tab`);
  open.set(key, n + 1);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  const hb = setInterval(() => res.write(`: ping\n\n`), 25_000);
  req.on("close", () => {
    clearInterval(hb);
    const m = (open.get(key) ?? 1) - 1;
    if (m <= 0) open.delete(key); else open.set(key, m);
  });
  return (data: unknown) => { res.write(`data: ${JSON.stringify(data)}\n\n`); };
}

export function openStreamCount(key: string): number {
  return open.get(key) ?? 0;
}
