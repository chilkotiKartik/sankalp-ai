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

  // One-time rotation of every department code in every state (deploy/rotate-dept-codes.sh places this marker).
  const rotateMarker = path.join(path.resolve(c.DATA_DIR), ".rotate-dept-codes");
  const rotateAll = fs.existsSync(rotateMarker);
  if (rotateAll) logger.warn("dept_codes_rotation_requested", { action: "Rotating all department codes in every state" });

  // Owner-run admin setup (deploy/make-admin.sh places this 0600 marker: "<state-id>\t<phone>\t<pin>" per line).
  const adminMarker = path.join(path.resolve(c.DATA_DIR), ".make-admin");
  const adminResult = adminMarker + ".result";
  const adminWanted = new Map<string, { phone: string; pin: string }>();
  if (fs.existsSync(adminMarker)) {
    for (const line of fs.readFileSync(adminMarker, "utf8").split("\n")) {
      const [id, phone, pin] = line.trim().split("\t");
      if (id && /^\d{10}$/.test(phone ?? "") && /^\d{6}$/.test(pin ?? "") && tenantIds().includes(id)) adminWanted.set(id, { phone, pin });
    }
    fs.writeFileSync(adminResult, "", { mode: 0o600 });
  }

  /** Per-tenant boot work: demo purge, department codes (bcrypt), optional first administrator. */
  const prepareTenant = (id: string) => runInTenant(id, async () => {
    const s = storeFor(id);
    if (!c.DEMO_MODE && s.hasDemoData()) {
      const removed = s.purgeDemo();
      logger.warn("demo_data_purged", { tenant: id, removed, reason: "DEMO_MODE is off" });
    }
    // M5: random department codes on first boot, written once to a 0600 file (never logged).
    const created = rotateAll ? await s.rotateAllDeptCodes() : await s.ensureDeptCodes();
    if (Object.keys(created).length) {
      const root = path.resolve(c.DATA_DIR);
      const file = id === defaultTenant() ? path.join(root, "dept-codes.initial.txt") : path.join(root, "tenants", id, "dept-codes.initial.txt");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Object.entries(created).map(([d, code]) => `${d}\t${code}`).join("\n") + "\n", { mode: 0o600 });
      logger.warn("dept_codes_created", { tenant: id, departments: Object.keys(created), file, action: "Distribute securely, then delete this file" });
    }
    // First administrator: BOOTSTRAP_SUPER_ADMIN_PHONE/PIN for the default state, …_PHONE_<STATE>/…_PIN_<STATE> for others.
    const sfx = id === defaultTenant() ? "" : `_${id.toUpperCase().replace(/-/g, "_")}`;
    const phone = process.env[`BOOTSTRAP_SUPER_ADMIN_PHONE${sfx}`], pin = process.env[`BOOTSTRAP_SUPER_ADMIN_PIN${sfx}`];
    if (phone && pin && !(await s.findUserByPhone(phone))) {
      await s.createUser({ name: "State Administrator", phone, pin: await bcrypt.hash(pin, 12), role: "super_admin", district: tenant().stateLabel, points: 0, badges: ["super_admin"], level: 1 });
      logger.warn("bootstrap_super_admin_created", { tenant: id, action: `Unset BOOTSTRAP_SUPER_ADMIN_PIN${sfx} now` });
    }
    const want = adminWanted.get(id);
    if (want) {
      const how = await s.makeAdmin(want.phone, want.pin);
      fs.appendFileSync(adminResult, `${id}\t${how}\n`);
      logger.warn("state_admin_ready", { tenant: id, how }); // never the phone or PIN
      adminWanted.delete(id);
    }
  });

  // P9: states with full data are ready before we listen; state-level states are prepared right after, in the background.
  const full = tenantIds().filter(id => tenant(id).coverage === "full");
  for (const id of full) await prepareTenant(id);
  const later = tenantIds().filter(id => !full.includes(id));

  const { server } = createApp();
  // Review P7-8: JOBS=off for restore drills (no SMS retries/reminders from a copy of production).
  if (process.env.JOBS !== "off") startJobs();

  // Review P7-6: on a VM behind nginx set HOST=127.0.0.1 so the app is never reachable directly (no spoofed X-Forwarded-For).
  server.listen({ port: c.PORT, host: process.env.HOST || "0.0.0.0" }, () => {
    void (async () => {
      for (const id of later) { try { await prepareTenant(id); } catch (err) { logger.error("tenant_prepare_failed", { tenant: id, err: (err as Error).message }); } }
      if (fs.existsSync(adminMarker)) { try { fs.unlinkSync(adminMarker); } catch { /* already gone */ } }
      if (rotateAll) { try { fs.unlinkSync(rotateMarker); } catch { /* already gone */ } logger.warn("dept_codes_rotation_done", { states: full.length + later.length }); }
    })();
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
