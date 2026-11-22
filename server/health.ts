import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "./config";
import { tenantIds } from "./tenancy";

/** Readiness (P1.10): tenants loaded + storage reachable/writable. Liveness is /healthz. */
export async function readiness(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
  const checks: Record<string, boolean> = {};
  checks.tenants = tenantIds().length > 0;
  if (config().STORAGE_DRIVER === "postgres") {
    const { pingPostgres } = await import("./db/pg-driver");
    checks.database = await pingPostgres();
  } else {
    try {
      const dir = path.resolve(config().DATA_DIR);
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      checks.dataDir = true;
    } catch { checks.dataDir = false; }
  }
  return { ready: Object.values(checks).every(Boolean), checks };
}
