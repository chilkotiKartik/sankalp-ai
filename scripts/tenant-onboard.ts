import * as fs from "node:fs";
import * as path from "node:path";
import { buildTenantConfig, OnboardError } from "../server/onboarding";

/** P7.1: npm run tenant:onboard -- --dir <csv folder> --id <id> --name … (see config/tenants/templates/README.md) */
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const need = (k: string) => { const v = args.get(k); if (!v) { console.error(`missing --${k}`); process.exit(2); } return v; };
try {
  const id = need("id");
  const cfg = buildTenantConfig(need("dir"), {
    id, name: need("name"), stateLabel: args.get("state-label") || need("name"), prefix: need("prefix"), defaultDistrict: need("default-district"),
    languages: (args.get("languages") || "hi,en").split(","), nameLocal: args.get("name-local"), hosts: args.get("hosts")?.split(",").filter(Boolean),
    grievance: { name: need("grievance-name"), email: need("grievance-email"), phone: need("grievance-phone"), address: need("grievance-address") },
  });
  const out = args.get("out") || path.join("config", "tenants", `${id}.json`);
  if (fs.existsSync(out) && args.get("force") !== "yes") { console.error(`${out} exists — pass --force yes to overwrite`); process.exit(1); }
  fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + "\n");
  console.log(`✓ ${out}: ${Object.keys(cfg.departments).length} departments, ${cfg.districts.length} districts, ${cfg.wards.length} wards, ${cfg.policeStations.length} police stations`);
  console.log("Next: review retention periods (needsLegalConfirmation), add hosts, restart the server. Department codes are created at boot.");
} catch (err) {
  if (err instanceof OnboardError) { console.error("✗ Not written. Fix these problems:"); for (const p of err.problems) console.error(`  - ${p}`); process.exit(1); }
  throw err;
}
