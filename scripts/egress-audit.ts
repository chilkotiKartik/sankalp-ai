/**
 * `npm run egress:audit` (rule 1, M10, Phase 2.7 groundwork)
 *  1. Lists every literal external host in source and fails on any host missing from config/egress-allowlist.json.
 *  2. Fails if server code performs network I/O outside server/lib/safeFetch.ts (global fetch, http(s).request to non-localhost,
 *     child_process curl, or a foreign AI SDK import).
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOTS = ["server", "app", "components", "lib", "context", "constants", "scripts", "shared"];
const SKIP = /node_modules|[\\/]vendor[\\/]|\.test\.ts$/;
const allow = JSON.parse(fs.readFileSync("config/egress-allowlist.json", "utf8"));
const allowed = new Map<string, string>();
for (const group of ["outbound", "optInForeign", "userInitiatedLinks", "nonNetwork"]) for (const h of Object.keys(allow[group] ?? {})) allowed.set(h, group);

const files: string[] = [];
const walk = (d: string) => {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|html)$/.test(e.name)) files.push(p);
  }
};
ROOTS.forEach(walk);

const hosts = new Map<string, string[]>();
const violations: string[] = [];
const HOST_RE = /\b(?:https?|wss?):\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?=[/:'"`)\s?#]|$)/gi;

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(HOST_RE)) {
      const h = m[1].toLowerCase();
      if (h === "localhost" || h.endsWith(".w3.org") || h === "www.w3.org") continue;
      hosts.set(h, [...(hosts.get(h) || []), `${f}:${i + 1}`]);
    }
  });
  if (f.startsWith("server") && f.endsWith(".ts") && !f.endsWith(path.join("lib", "safeFetch.ts"))) {
    const rules: Array<[RegExp, string]> = [
      [/(^|[^.\w])fetch\(/m, "global fetch() — use safeFetch()"],
      [/from\s+["'](openai|groq-sdk|@google\/generative-ai|@anthropic-ai\/sdk|cohere-ai)["']/m, "foreign AI SDK import"],
      [/execFile\(\s*["']curl["']|spawn\(\s*["']curl["']/m, "curl child process"],
      [/https?\.request\(\s*\{[^}]*hostname:\s*["'](?!127\.0\.0\.1|localhost)/m, "raw http(s).request to a non-local host"],
    ];
    for (const [re, why] of rules) if (re.test(src)) violations.push(`${f}: ${why}`);
    if (/expo-server-sdk/.test(src) && !f.endsWith(path.join("notify", "push.ts"))) violations.push(`${f}: push SDK used outside server/notify/push.ts`);
  }
}

const unknown = [...hosts.keys()].filter(h => !allowed.has(h)).sort();
process.stdout.write("Egress audit — hosts found in source:\n");
for (const [h, locs] of [...hosts.entries()].sort()) {
  process.stdout.write(`  ${allowed.has(h) ? `[${allowed.get(h)}]`.padEnd(22) : "[NOT ALLOWED]".padEnd(22)} ${h}  (${locs.length}× e.g. ${locs[0]})\n`);
}
if (unknown.length || violations.length) {
  if (unknown.length) process.stderr.write(`\n✗ Hosts not in config/egress-allowlist.json:\n${unknown.map(h => `  - ${h}: ${hosts.get(h)!.slice(0, 3).join(", ")}`).join("\n")}\n`);
  if (violations.length) process.stderr.write(`\n✗ Server egress violations:\n${violations.map(v => `  - ${v}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`\n✓ Egress audit passed: ${files.length} files, ${hosts.size} hosts, all reviewed. Outbound data hosts: ${Object.keys(allow.outbound).join(", ")}\n`);
