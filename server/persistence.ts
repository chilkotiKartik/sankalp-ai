import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config";
import { allStores, storeFor, type AppStorage } from "./storage";
import { defaultTenant, tenantIds } from "./tenancy";
import { logger } from "./lib/logger";
import { unref } from "./lib/errors";

/**
 * Snapshot persistence (M8), one file per tenant (P1.3). Atomic: temp file → fsync → rename.
 * The default tenant keeps the historical location DATA_DIR/snapshot.json for backwards compatibility.
 * When STORAGE_DRIVER=postgres the Postgres driver (server/db) is used instead — see persistDriver().
 */
export function snapshotPath(tenantId = defaultTenant()): string {
  const root = path.resolve(config().DATA_DIR);
  return tenantId === defaultTenant() ? path.join(root, "snapshot.json") : path.join(root, "tenants", tenantId, "snapshot.json");
}

export function saveSnapshot(s: AppStorage = storeFor(defaultTenant()), file = snapshotPath(s.tenantId)): void {
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

export function loadSnapshot(s: AppStorage = storeFor(defaultTenant()), file = snapshotPath(s.tenantId)): boolean {
  if (!fs.existsSync(file)) return false;
  s.loadSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
  return true;
}

/** Load every configured tenant's snapshot. Returns tenant ids that were restored. */
export function loadAllSnapshots(): string[] {
  return tenantIds().filter(id => loadSnapshot(storeFor(id)));
}

let timer: ReturnType<typeof setInterval> | null = null;
const saved = new Map<string, number>();

function flushAll() {
  for (const s of allStores()) {
    if (saved.get(s.tenantId) === s.revision) continue;
    try { saveSnapshot(s); saved.set(s.tenantId, s.revision); }
    catch (err) { logger.error("snapshot_failed", { tenant: s.tenantId, err }); }
  }
}

export function startSnapshots() {
  for (const s of allStores()) saved.set(s.tenantId, s.revision);
  timer = setInterval(flushAll, config().SNAPSHOT_INTERVAL_MS);
  unref(timer);
}

export function stopSnapshots() {
  if (timer) clearInterval(timer);
  timer = null;
  flushAll();
}
