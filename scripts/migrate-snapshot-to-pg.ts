/**
 * P1.2 — `npm run db:migrate-snapshot`
 * Copies every tenant's JSON snapshot (DATA_DIR) into PostgreSQL (DATABASE_URL), then you can switch
 * STORAGE_DRIVER=postgres. Idempotent: re-running upserts the same rows. Prints counts only.
 */
import { config } from "../server/config";
import { loadTenants, tenantIds } from "../server/tenancy";
import { storeFor } from "../server/storage";
import { loadSnapshot } from "../server/persistence";
import { openDb, migrate, PgPersistence } from "../server/db/pg-driver";

async function main() {
  const url = config().DATABASE_URL;
  if (!url) { process.stderr.write("Set DATABASE_URL (postgres://… or pglite:<dir>)\n"); process.exit(1); }
  loadTenants();
  const db = await openDb(url);
  const applied = await migrate(db);
  const p = new PgPersistence(db);
  await p.syncReference();
  for (const id of tenantIds()) {
    const s = storeFor(id);
    const had = loadSnapshot(s);
    s.touch();
    process.stdout.write(`${id}: snapshot ${had ? "found" : "missing"} — users ${s.s.users.length}, complaints ${s.s.complaints.length}, sos ${s.s.sosAlerts.length}\n`);
  }
  await p.flush();
  await p.close();
  process.stdout.write(`Done. Migrations applied: ${applied.join(", ") || "none (up to date)"}. Now set STORAGE_DRIVER=postgres.\n`);
}

void main();
