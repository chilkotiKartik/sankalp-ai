/**
 * P1.7 — `npm run audit:verify` : recomputes every tenant's audit hash chain from durable storage.
 * Exit 1 if any chain is broken (entry edited, deleted or reordered). Prints only counts and sequence numbers.
 */
import { config } from "../server/config";
import { loadTenants, tenantIds, runInTenant } from "../server/tenancy";
import { storeFor } from "../server/storage";
import { loadSnapshot } from "../server/persistence";

async function main() {
  loadTenants();
  let bad = 0;
  if (config().STORAGE_DRIVER === "postgres") {
    const { openDb, PgPersistence } = await import("../server/db/pg-driver");
    const p = new PgPersistence(await openDb(config().DATABASE_URL!));
    for (const id of tenantIds()) await p.load(id);
    await p.close();
  } else {
    for (const id of tenantIds()) loadSnapshot(storeFor(id));
  }
  for (const id of tenantIds()) {
    const r = runInTenant(id, () => storeFor(id).verifyAuditChain());
    process.stdout.write(`${id}: ${r.ok ? "OK" : `BROKEN at seq ${r.brokenAt} (${r.reason})`} — ${r.checked} entries verified\n`);
    if (!r.ok) bad++;
  }
  process.exit(bad ? 1 : 0);
}

void main();
