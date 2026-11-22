import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcrypt";
import { config } from "./config";
import { storeFor } from "./storage";
import { createApp } from "./app";
import { startPersistence, stopPersistence } from "./persistence-driver";
import { startJobs, stopJobs } from "./jobs";
import { closeRealtime } from "./realtime";
import { logger } from "./lib/logger";
import { unref } from "./lib/errors";
import { loadTenants, tenantIds, defaultTenant, runInTenant, tenant } from "./tenancy";

async function main() {
  let c;
  try {
    c = config();
    loadTenants();
  } catch (err) {
    // m13/M5/P1.8: fail fast with a clear message (never print secret values).
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  const restored = await startPersistence();
  logger.info("persistence", { driver: c.STORAGE_DRIVER, tenants: tenantIds(), restored });

  for (const id of tenantIds()) {
    await runInTenant(id, async () => {
      const s = storeFor(id);
      if (!c.DEMO_MODE && s.hasDemoData()) {
        const removed = s.purgeDemo();
        logger.warn("demo_data_purged", { tenant: id, removed, reason: "DEMO_MODE is off" });
      }
      // M5: random department codes on first boot, written once to a 0600 file (never logged).
      const created = await s.ensureDeptCodes();
      if (Object.keys(created).length) {
        const root = path.resolve(c.DATA_DIR);
        const file = id === defaultTenant() ? path.join(root, "dept-codes.initial.txt") : path.join(root, "tenants", id, "dept-codes.initial.txt");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Object.entries(created).map(([d, code]) => `${d}\t${code}`).join("\n") + "\n", { mode: 0o600 });
        logger.warn("dept_codes_created", { tenant: id, departments: Object.keys(created), file, action: "Distribute securely, then delete this file" });
      }
    });
  }

  if (c.BOOTSTRAP_SUPER_ADMIN_PHONE && c.BOOTSTRAP_SUPER_ADMIN_PIN) {
    await runInTenant(defaultTenant(), async () => {
      const s = storeFor(defaultTenant());
      if (await s.findUserByPhone(c.BOOTSTRAP_SUPER_ADMIN_PHONE!)) return;
      await s.createUser({ name: "State Administrator", phone: c.BOOTSTRAP_SUPER_ADMIN_PHONE!, pin: await bcrypt.hash(c.BOOTSTRAP_SUPER_ADMIN_PIN!, 12),
        role: "super_admin", district: tenant().stateLabel, points: 0, badges: ["super_admin"], level: 1 });
      logger.warn("bootstrap_super_admin_created", { tenant: defaultTenant(), action: "Unset BOOTSTRAP_SUPER_ADMIN_PIN now" });
    });
  }

  const { server } = createApp();
  // Review P7-8: JOBS=off for restore drills (no SMS retries/reminders from a copy of production).
  if (process.env.JOBS !== "off") startJobs();

  // Review P7-6: on a VM behind nginx set HOST=127.0.0.1 so the app is never reachable directly (no spoofed X-Forwarded-For).
  server.listen({ port: c.PORT, host: process.env.HOST || "0.0.0.0" }, () => {
    logger.info("listening", { port: c.PORT, demoMode: c.DEMO_MODE, textAI: c.textProvider, visionAI: c.visionProvider, env: c.NODE_ENV });
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("shutdown", { signal });
    stopJobs();
    closeRealtime();
    void stopPersistence().finally(() => server.close(() => process.exit(0)));
    unref(setTimeout(() => process.exit(0), 8000));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main();
