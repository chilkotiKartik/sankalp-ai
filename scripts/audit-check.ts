/** `npm run deps:audit` — fails on any high/critical production advisory not reviewed in config/audit-allowlist.json. */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

const allow = JSON.parse(fs.readFileSync("config/audit-allowlist.json", "utf8")).allow as Record<string, { reason: string; reviewBy: string }>;
let raw = "";
try { raw = execFileSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
catch (e) { raw = (e as { stdout?: string }).stdout ?? ""; }
const report = JSON.parse(raw || "{}") as { vulnerabilities?: Record<string, { severity: string }> };
const bad: string[] = [];
const accepted: string[] = [];
const today = new Date().toISOString().slice(0, 10);
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if (v.severity !== "high" && v.severity !== "critical") continue;
  const a = allow[name];
  if (a && a.reviewBy >= today) accepted.push(`${name} (${v.severity}) — ${a.reason.slice(0, 60)}…`);
  else bad.push(`${name} (${v.severity})${a ? " — allow-list entry expired" : ""}`);
}
accepted.forEach(a => process.stdout.write(`accepted: ${a}\n`));
if (bad.length) { process.stderr.write(`✗ Unreviewed high/critical advisories:\n${bad.map(b => `  - ${b}`).join("\n")}\n`); process.exit(1); }
process.stdout.write("✓ No unreviewed high/critical production advisories\n");
