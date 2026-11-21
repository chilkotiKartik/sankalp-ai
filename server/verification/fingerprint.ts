import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import * as path from "node:path";
import { logger } from "../lib/logger";
import { unref } from "../lib/errors";
import { imageDims, pHashFromGrid, peripheryFromGrid, FINGERPRINT_MAX_PIXELS, MIN_SIDE } from "./image";
import type { MediaRecord } from "../types";

/**
 * Review P3-2: image decoding never runs on the request thread.
 *  - dimensions are read from the header first; anything above FINGERPRINT_MAX_PIXELS is skipped (signal "unknown")
 *  - one worker thread decodes once and returns two tiny grey grids (32×32 and 16×16); hashing happens here
 *  - each job has a 20 s limit; the worker is recycled on timeout or crash (memory is released with it)
 * Uploads return immediately; verifyProof awaits the pending fingerprint of the files it needs.
 */
const JOB_TIMEOUT_MS = 20_000;

// Resolve the decoder packages from this project so the eval'd worker finds them in dev (tsx) and in the build.
const req = createRequire(path.join(process.cwd(), "package.json"));
const JPEG = req.resolve("jpeg-js");
const PNGJS = req.resolve("pngjs");

const WORKER_SRC = `
const { parentPort } = require("node:worker_threads");
const jpeg = require(${JSON.stringify(JPEG)});
const { PNG } = require(${JSON.stringify(PNGJS)});
function grid(g, n) {
  const out = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const y0 = Math.floor((y * g.h) / n), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * g.h) / n));
    for (let x = 0; x < n; x++) {
      const x0 = Math.floor((x * g.w) / n), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * g.w) / n));
      let s = 0, k = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * g.w + xx) * 4; s += 0.299 * g.d[i] + 0.587 * g.d[i + 1] + 0.114 * g.d[i + 2]; k++; }
      out[y * n + x] = s / k;
    }
  }
  return out;
}
parentPort.on("message", ({ id, buf, maxMP }) => {
  try {
    const b = Buffer.from(buf);
    let img;
    if (b[0] === 0xff && b[1] === 0xd8) img = jpeg.decode(b, { useTArray: true, maxResolutionInMP: maxMP, maxMemoryUsageInMB: 256 });
    else img = PNG.sync.read(b);
    const g = { w: img.width, h: img.height, d: img.data };
    parentPort.postMessage({ id, w: g.w, h: g.h, g32: grid(g, 32), g16: grid(g, 16) });
  } catch (e) { parentPort.postMessage({ id, error: String(e && e.message || e) }); }
});
`;

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, (r: { w?: number; h?: number; g32?: Float64Array; g16?: Float64Array; error?: string } | null) => void>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(WORKER_SRC, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 512 } });
  w.unref();
  w.on("message", (m: { id: number }) => { waiting.get(m.id)?.(m as never); waiting.delete(m.id); });
  const fail = () => { waiting.forEach(r => r(null)); waiting.clear(); if (worker === w) worker = null; };
  w.on("error", (err: Error) => { logger.warn("fingerprint_worker_error", { err: err.message }); fail(); });
  w.on("exit", fail);
  worker = w;
  return w;
}

export async function fingerprint(buf: Buffer): Promise<{ phash?: string; sceneHash?: string }> {
  const d = imageDims(buf);
  const isJpegOrPng = buf[0] === 0xff || buf[0] === 0x89;
  if (!d || !isJpegOrPng || d.w < MIN_SIDE || d.h < MIN_SIDE || d.w * d.h > FINGERPRINT_MAX_PIXELS) return {};
  const id = ++seq;
  const w = getWorker();
  const r = await new Promise<Parameters<typeof waiting extends Map<number, infer F> ? F : never>[0]>(resolve => {
    const t = setTimeout(() => { waiting.delete(id); resolve(null); void w.terminate(); }, JOB_TIMEOUT_MS);
    unref(t);
    waiting.set(id, res => { clearTimeout(t); resolve(res); });
    w.postMessage({ id, buf, maxMP: FINGERPRINT_MAX_PIXELS / 1e6 });
  });
  if (!r || r.error || !r.g32 || !r.g16) return {};
  return { phash: pHashFromGrid(r.g32) ?? undefined, sceneHash: peripheryFromGrid(r.g16) ?? undefined };
}

/** Pending fingerprint jobs by file name, so verification can wait for them. */
const pending = new Map<string, Promise<void>>();

export function fingerprintLater(rec: MediaRecord, buf: Buffer, onDone: () => void): void {
  if (rec.kind !== "image") return;
  const p = fingerprint(buf).then(f => {
    if (f.phash) rec.phash = f.phash;
    if (f.sceneHash) rec.sceneHash = f.sceneHash;
    if (f.phash || f.sceneHash) onDone();
  }).catch(err => logger.warn("fingerprint_failed", { err: (err as Error).message }))
    .finally(() => pending.delete(rec.fileName));
  pending.set(rec.fileName, p);
}

export async function awaitFingerprint(fileName?: string): Promise<void> {
  if (fileName) await pending.get(fileName);
}

export function stopFingerprintWorker() {
  void worker?.terminate();
  worker = null;
}
