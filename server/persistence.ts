import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config";
import { storage, type AppStorage } from "./storage";
import { logger } from "./lib/logger";
import { unref } from "./lib/errors";

/**
 * JSON snapshot persistence (M8, Phase 0). Atomic: write temp file → fsync → rename.
 * Saved every SNAPSHOT_INTERVAL_MS when data changed, and on shutdown.
 */
export function snapshotPath(): string {
  return path.join(path.resolve(config().DATA_DIR), "snapshot.json");
}

export function saveSnapshot(s: AppStorage = storage, file = snapshotPath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(s.toSnapshot()));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

export function loadSnapshot(s: AppStorage = storage, file = snapshotPath()): boolean {
  if (!fs.existsSync(file)) return false;
  s.loadSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
  return true;
}

let timer: ReturnType<typeof setInterval> | null = null;
let savedRevision = -1;

export function startSnapshots(s: AppStorage = storage) {
  savedRevision = s.revision;
  timer = setInterval(() => {
    if (s.revision === savedRevision) return;
    try { saveSnapshot(s); savedRevision = s.revision; }
    catch (err) { logger.error("snapshot_failed", { err }); }
  }, config().SNAPSHOT_INTERVAL_MS);
  unref(timer);
}

export function stopSnapshots(s: AppStorage = storage) {
  if (timer) clearInterval(timer);
  timer = null;
  try { saveSnapshot(s); savedRevision = s.revision; } catch (err) { logger.error("snapshot_failed", { err }); }
}
