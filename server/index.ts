import * as fs from "node:fs";
import * as path from "node:path";
import bcrypt from "bcrypt";
import { config } from "./config";
import { storage } from "./storage";
import { createApp } from "./app";
import { loadSnapshot, startSnapshots, stopSnapshots } from "./persistence";
import { startJobs, stopJobs } from "./jobs";
import { closeRealtime } from "./realtime";
import { logger } from "./lib/logger";
import { unref } from "./lib/errors";

async function main() {
  let c;
  try {
    c = config();
  } catch (err) {
    // m13/M5: fail fast with a clear message (never print secret values).
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  const restored = loadSnapshot();
  logger.info("snapshot", { restored });
  if (!c.DEMO_MODE && storage.hasDemoData()) {
    const removed = storage.purgeDemo();
    logger.warn("demo_data_purged", { removed, reason: "DEMO_MODE is off" });
  }

  // M5: random department codes on first boot, written once to a 0600 file (never logged).
  const created = await storage.ensureDeptCodes();
  if (Object.keys(created).length) {
    const file = path.join(path.resolve(c.DATA_DIR), "dept-codes.initial.txt");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Object.entries(created).map(([d, code]) => `${d}\t${code}`).join("\n") + "\n", { mode: 0o600 });
    logger.warn("dept_codes_created", { departments: Object.keys(created), file, action: "Distribute securely, then delete this file" });
  }

  if (c.BOOTSTRAP_SUPER_ADMIN_PHONE && c.BOOTSTRAP_SUPER_ADMIN_PIN && !(await storage.findUserByPhone(c.BOOTSTRAP_SUPER_ADMIN_PHONE))) {
    await storage.createUser({ name: "State Administrator", phone: c.BOOTSTRAP_SUPER_ADMIN_PHONE, pin: await bcrypt.hash(c.BOOTSTRAP_SUPER_ADMIN_PIN, 12),
      role: "super_admin", district: "Uttarakhand", points: 0, badges: ["super_admin"], level: 1 });
    logger.warn("bootstrap_super_admin_created", { action: "Unset BOOTSTRAP_SUPER_ADMIN_PIN now" });
  }

  const { server } = createApp();
  startSnapshots();
  startJobs();

  server.listen({ port: c.PORT, host: "0.0.0.0" }, () => {
    logger.info("listening", { port: c.PORT, demoMode: c.DEMO_MODE, textAI: c.textProvider, visionAI: c.visionProvider, env: c.NODE_ENV });
  });

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info("shutdown", { signal });
    stopJobs();
    closeRealtime();
    stopSnapshots();
    server.close(() => process.exit(0));
    unref(setTimeout(() => process.exit(0), 5000));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

void main();
