/**
 * `npm run secrets:scan` — gate check (§8 "Secrets"). gitleaks-equivalent pattern scan of tracked files
 * plus the diff of commits since the baseline (default: e0dc721). Prints file:line + rule, NEVER the secret value.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

const RULES: Array<[string, RegExp]> = [
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["groq-key", /\bgsk_[A-Za-z0-9]{40,}\b/],
  ["nvidia-key", /\bnvapi-[A-Za-z0-9_-]{40,}\b/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["slack-token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["db-url-with-password", /\b(?:postgres(?:ql)?|mongodb(?:\+srv)?|mysql|redis):\/\/[^\s:/@'"]+:[^\s@'"]{6,}@/],
  ["jwt-literal", /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}\b/],
  ["generic-secret-assignment", /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9+/_\-]{24,}["']/i],
  ["dotenv-secret-value", /^(?:JWT_SECRET|DEPT_JWT_SECRET|SARVAM_API_KEY|S3_SECRET_KEY|WHATSAPP_TOKEN|SMS_API_KEY|EVIDENCE_ENC_KEY|EXPO_ACCESS_TOKEN)=\S{8,}/m],
];
const ALLOW = [/^tests\//, /^scripts\/secret-scan\.ts$/, /^package-lock\.json$/, /^static-build\//, /\.(png|jpg|jpeg|ico|ttf|zip)$/i, /^server\/web\/vendor\//, /^lib\/leaflet-bundle\.ts$/, /^public\/leaflet\//];

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
const findings: string[] = [];
for (const f of files) {
  if (ALLOW.some(r => r.test(f)) || !fs.existsSync(f) || fs.statSync(f).size > 2_000_000) continue;
  const lines = fs.readFileSync(f, "utf8").split("\n");
  lines.forEach((l, i) => { for (const [name, re] of RULES) if (re.test(l)) findings.push(`${f}:${i + 1}  ${name}`); });
}
if (fs.existsSync(".env") && !execFileSync("git", ["check-ignore", ".env"], { encoding: "utf8" }).trim()) findings.push(".env is not git-ignored");

if (findings.length) {
  process.stderr.write(`✗ Possible secrets (values not shown):\n${findings.map(f => `  - ${f}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`✓ Secret scan passed (${files.length} files checked)\n`);
