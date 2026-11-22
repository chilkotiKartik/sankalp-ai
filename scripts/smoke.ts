/**
 * P0.c — `npm run smoke` : runs the whole demo path against a RUNNING server through the public API.
 * Exits non-zero on the first failure.
 *
 *   SMOKE_BASE_URL   default http://localhost:5000
 *   DATA_DIR         where the server keeps dept-codes.initial.txt / demo-credentials.txt (default ./data)
 *   SMOKE_PWD_CODE / SMOKE_POLICE_CODE   override department codes if the files are not readable
 *
 * Uses placeholder phone numbers only (90000xxxxx).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomInt } from "node:crypto";

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const DATA = path.resolve(process.env.DATA_DIR || "./data");
/** P9: run the same end-to-end flow in any state (`SMOKE_TENANT=kerala`); default = the server's default state. */
const TENANT = process.env.SMOKE_TENANT || "";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
let step = 0;

function fail(msg: string): never {
  process.stderr.write(`\n✗ SMOKE FAILED at step ${step}: ${msg}\n`);
  process.exit(1);
}
function ok(msg: string) { process.stdout.write(`✓ ${String(step).padStart(2, "0")} ${msg}\n`); }

async function call(method: string, p: string, body?: unknown, token?: string, expect = 200) {
  step++;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { "Content-Type": "application/json", ...(TENANT ? { "X-Tenant": TENANT } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(e => fail(`${method} ${p}: ${(e as Error).message}`));
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (res.status !== expect) fail(`${method} ${p} → ${res.status} (expected ${expect}) ${text.slice(0, 200)}`);
  return json;
}

function deptCode(dept: string): string {
  const env = process.env[`SMOKE_${dept.toUpperCase()}_CODE`];
  if (env) return env;
  const files = TENANT ? [path.join("tenants", TENANT, "dept-codes.initial.txt"), "demo-credentials.txt", "dept-codes.initial.txt"] : ["demo-credentials.txt", "dept-codes.initial.txt"];
  for (const f of files) {
    const p = path.join(DATA, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(new RegExp(`^\\s*${dept}\\s+(\\S+)`, "m"));
    if (m) return m[1];
  }
  fail(`no access code for ${dept}: set SMOKE_${dept.toUpperCase()}_CODE or DATA_DIR`);
}

async function main() {
  process.stdout.write(`Smoke test against ${BASE}\n`);
  const h = await call("GET", "/healthz");
  if (h.status !== "ok") fail("healthz not ok");
  ok("server healthy");
  const cfg = await call("GET", "/api/public/config");
  ok(`config: state=${cfg.tenant?.name} demoMode=${cfg.demoMode} textAI=${cfg.ai.text} vision=${cfg.ai.vision}`);
  // A real district of this state and its centre (no state is assumed).
  const home = (cfg.tenant?.districts ?? []).find((d: { name: string }) => d.name === cfg.tenant.defaultDistrict) ?? cfg.tenant?.districts?.[0] ?? { name: "Dehradun", center: { lat: 30.3165, lng: 78.0322 } };
  const near = (dLat: number, dLng: number) => ({ lat: +(home.center.lat + dLat).toFixed(5), lng: +(home.center.lng + dLng).toFixed(5) });

  // Security guard-rails that must hold before anything else.
  await call("GET", "/api/cpr/stream", undefined, undefined, 401); ok("CPR stream rejects anonymous access");
  await call("POST", "/api/dept/login", { departmentId: "pwd", accessCode: "pwd_2026" }, undefined, 401); ok("guessable dept code rejected");

  // 1. Citizen registers and files a complaint with a photo.
  const phone = `90000${randomInt(10000, 99999)}`;
  const reg = await call("POST", "/api/auth/register", { name: "Smoke Citizen", phone, pin: "246813", district: home.name });
  const citizen = reg.token as string;
  ok("citizen registered");
  await call("POST", "/api/complaints", { category: "pothole", description: "Consent check", location: "Somewhere" }, citizen, 428);
  ok("complaint refused until privacy notice accepted (DPDP)");
  const notice = await call("GET", "/api/public/privacy-notice?lang=hi");
  await call("POST", "/api/privacy/consent", { version: notice.version, lang: "hi", accepted: true }, citizen, 201);
  ok(`privacy notice ${notice.version} accepted`);
  const up = await call("POST", "/api/upload", { image: PNG }, citizen);
  if (!/^\/uploads\/[0-9a-f-]{36}\.png$/.test(up.url)) fail(`unexpected upload url ${up.url}`);
  ok("photo uploaded");
  const c = await call("POST", "/api/complaints", { category: "pothole", description: "Deep pothole near the school gate", location: `Main road, ${home.name}`, geo: near(0.02, 0.03), beforePhoto: up.url }, citizen, 201);
  if (c.state !== "NEW" || c.aiRouting?.department !== "pwd") fail(`routing wrong: ${JSON.stringify(c.aiRouting)}`);
  ok(`complaint ${c.ticketId} routed to PWD (${c.aiRouting.method})`);

  // 2. Department portal sees it, assigns a worker.
  const pwd = (await call("POST", "/api/dept/login", { departmentId: "pwd", accessCode: deptCode("pwd") })).token as string;
  ok("PWD department signed in");
  const list = await call("GET", "/api/dept/pwd/complaints", undefined, pwd);
  if (!list.complaints.some((x: { id: string }) => x.id === c.id)) fail("complaint missing from PWD queue");
  ok("complaint visible in PWD queue");
  const assign = await call("PUT", `/api/dept/complaints/${c.id}/assign-worker`, { workerName: "Smoke Worker", workerPhone: "9000012345" }, pwd);
  ok("worker assigned (one-time PIN issued)");

  // 3. Worker submits proof; it cannot close the case.
  const proof = await call("PUT", `/api/complaints/${c.id}/proof`, { phone: "9000012345", pin: assign.pin, proofPhoto: PNG, proofNote: "Filled and compacted" });
  if (proof.state !== "VERIFYING") fail(`after proof state=${proof.state}`);
  ok("proof photo accepted → awaiting citizen confirmation");

  // 4. Citizen confirms → CLOSED.
  const closed = await call("PUT", `/api/complaints/${c.id}/confirm`, { rating: 5, feedback: "Fixed" }, citizen);
  if (closed.state !== "CLOSED") fail(`state=${closed.state}`);
  ok("citizen confirmed → CLOSED");

  // 5. Public dashboard reflects it (aggregates only).
  const report = await call("GET", "/api/public/department-report");
  const pwdRow = report.find((r: { id: string }) => r.id === "pwd");
  if (!pwdRow || pwdRow.resolved < 1) fail("public report did not count the closure");
  if (JSON.stringify(report).includes(phone)) fail("public report leaked a phone number");
  ok(`public dashboard: PWD resolved=${pwdRow.resolved}, n=${pwdRow.n}`);

  // 6. SOS → police CPR console.
  const sos = await call("POST", "/api/sos/women-safety", { geo: near(0, 0) }, citizen, 201);
  ok(`women-safety SOS raised (${sos.alert.id.slice(0, 8)})`);
  const police = (await call("POST", "/api/dept/login", { departmentId: "police", accessCode: deptCode("police") })).token as string;
  const incidents = await call("GET", "/api/cpr/incidents", undefined, police);
  if (!incidents.some((i: { id: string }) => i.id === sos.cprIncident?.id)) fail("SOS not visible in CPR incidents");
  ok("SOS visible in police CPR console");
  const again = await call("POST", "/api/sos/women-safety", { geo: near(0, 0) }, citizen, 200);
  if (!again.deduplicated) fail("repeat SOS not de-duplicated");
  ok("repeat SOS de-duplicated (never rate-limited)");
  await call("GET", "/api/cpr/incidents", undefined, citizen, 403); ok("citizen cannot read the CPR console");

  process.stdout.write(`\nSMOKE PASSED (${step} requests)\n`);
}

void main().catch(e => fail((e as Error).message));
