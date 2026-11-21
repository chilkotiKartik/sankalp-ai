/**
 * P7.3 local load test (npm run loadtest). In-process: the server and the load generator share one machine, so
 * numbers are conservative. For staging use loadtest/k6.js. Writes docs/LOADTEST.md.
 * Profile (peak hour of a 50,000-complaints/day state): 6 complaints/s, 500 officers polling every 30 s
 * (≈17 req/s), 20 public reads/s, 200 live SSE officer streams receiving every new complaint.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import type { AddressInfo } from "node:net";
import bcrypt from "bcrypt";
import * as http from "node:http";

process.env.JWT_SECRET ||= "loadtest-secret-aaaaaaaaaaaaaaaaaaaaaaaa";
process.env.DEPT_JWT_SECRET ||= "loadtest-dept-bbbbbbbbbbbbbbbbbbbbbbbbbb";
process.env.DATA_DIR ||= fs.mkdtempSync(`${os.tmpdir()}/sankalp-load-`);
process.env.NODE_ENV = "test";

const DURATION_S = Number(process.env.LOAD_SECONDS || 60);
const SEED = Number(process.env.LOAD_SEED || 20000);

async function main() {
  const { loadTenants, tenant } = await import("../server/tenancy");
  loadTenants();
  const { createApp } = await import("../server/app");
  const { storage } = await import("../server/storage");
  const built = createApp();
  await new Promise<void>(r => built.server.listen(0, r));
  const base = `http://127.0.0.1:${(built.server.address() as AddressInfo).port}`;
  const pin = await bcrypt.hash("135792", 4);

  // seed
  const citizens = await Promise.all(Array.from({ length: 50 }, async (_, i) => {
    const u = await storage.createUser({ name: `Load citizen ${i}`, phone: `9100${String(100000 + i).slice(-6)}`, pin, role: "citizen", district: "Dehradun", points: 0, badges: [], level: 1 });
    storage.recordConsent(u.id, tenant().privacy.noticeVersion, "en");
    return storage.createToken(u.id);
  }));
  const officerTokens = await Promise.all(Array.from({ length: 500 }, async (_, i) => {
    const u = await storage.createUser({ name: `Load officer ${i}`, phone: `9200${String(100000 + i).slice(-6)}`, pin, role: "officer", departmentId: "pwd", district: "Dehradun", points: 0, badges: [], level: 1 });
    return storage.createToken(u.id);
  }));
  const owner = storage.getUserById(storage.validateToken(citizens[0])!.id)!;
  for (let i = 0; i < SEED; i++) {
    storage.createComplaint({ category: i % 3 ? "pothole" : "garbage", description: `Seed complaint ${i}`, location: "Seed road", geo: { lat: 30.2 + (i % 300) / 1000, lng: 78 + (i % 290) / 1000 }, ward: "w", wardNumber: 1, district: "Dehradun", priority: "P3" }, owner);
  }

  // SSE listeners
  const sseDelays: number[] = [];
  const created = new Map<string, number>();
  const pendingSeen = new Map<string, number>();
  let sseOpen = 0;
  // Raw http (not fetch): delivery time is measured on 'data' events as they arrive.
  const reqs: http.ClientRequest[] = [];
  const port = (built.server.address() as AddressInfo).port;
  for (let client = 0; client < 200; client++) {
    const i = client;
    const rq = http.get({ host: "127.0.0.1", port, path: `/api/dept/pwd/stream?token=${officerTokens[i]}`, headers: { "X-Forwarded-For": `10.9.${i >> 8}.${i & 255}` }, agent: false }, res => {
      if (res.statusCode !== 200) { res.resume(); return; }
      sseOpen++;
      res.setEncoding("utf8");
      let buf = "";
      const seen = new Set<string>();
      res.on("data", (t: string) => {
        buf += t;
        let cut: number;
        while ((cut = buf.indexOf("\n\n")) >= 0) {
          const ev = buf.slice(0, cut); buf = buf.slice(cut + 2);
          const line = ev.split("\n").find(l => l.startsWith("data: "));
          if (!line) continue;
          try {
            const d = JSON.parse(line.slice(6)) as { type?: string; complaint?: { ticketId?: string } };
            const tk = d.complaint?.ticketId;
            // only the first "complaint_new" per ticket (updates of a parent ticket are not deliveries)
            if (d.type === "complaint_new" && tk && !seen.has(tk)) { seen.add(tk); const at = created.get(tk); if (at) sseDelays.push(Date.now() - at); else pendingSeen.set(`${client}:${tk}`, Date.now()); }
          } catch { /* partial */ }
        }
      });
    });
    rq.on("error", () => undefined);
    reqs.push(rq);
  }
  await new Promise(r => setTimeout(r, 1500));

  const lat: Record<string, number[]> = { create: [], officerList: [], publicRate: [] };
  let errors = 0, sent = 0;
  const timed = async (kind: string, p: () => Promise<Response>) => {
    const t0 = performance.now();
    try { const r = await p(); await r.arrayBuffer(); if (!r.ok) errors++; } catch { errors++; }
    lat[kind].push(performance.now() - t0); sent++;
  };
  // Each simulated person has their own address (through the trusted proxy), as in a real state.
  const ip = (i: number) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
  const every = (perSecond: number, fn: () => void) => setInterval(fn, 1000 / perSecond);
  let n = 0;
  const timers = [
    every(6, () => { const i = n++; void timed("create", async () => {
      const sentAt = Date.now();
      const r = await fetch(`${base}/api/complaints`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${citizens[i % citizens.length]}`, "X-Forwarded-For": ip(i) },
        body: JSON.stringify({ category: "pothole", description: `Load pothole number ${i}`, location: "Load road", geo: { lat: 29.5 + (i % 200) * 0.01, lng: 77.6 + Math.floor(i / 200) * 0.01 } }) });
      const c = r.clone(); void c.json().then((j: { ticketId?: string }) => {
        if (!j.ticketId) return;
        created.set(j.ticketId, sentAt);
        for (const [k, at] of pendingSeen) if (k.endsWith(`:${j.ticketId}`)) { sseDelays.push(Math.max(0, at - sentAt)); pendingSeen.delete(k); }
      }).catch(() => undefined);
      return r;
    }); }),
    every(17, () => { const tok = officerTokens[Math.floor(Math.random() * 500)]; void timed("officerList", () => fetch(`${base}/api/dept/pwd/complaints?open=1&limit=100`, { headers: { Authorization: `Bearer ${tok}`, "X-Forwarded-For": ip(1000 + Math.floor(Math.random() * 500)) } })); }),
    every(20, () => { void timed("publicRate", () => fetch(`${base}/api/public/resolution-rate`, { headers: { "X-Forwarded-For": ip(5000 + Math.floor(Math.random() * 2000)) } })); }),
  ];
  await new Promise(r => setTimeout(r, DURATION_S * 1000));
  timers.forEach(clearInterval);
  await new Promise(r => setTimeout(r, 3000));
  reqs.forEach(r => r.destroy());

  const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]) : null; };
  const rows = Object.entries(lat).map(([k, v]) => `| ${k} | ${v.length} | ${pct(v, 0.5)} ms | ${pct(v, 0.95)} ms | ${pct(v, 0.99)} ms |`);
  const md = [
    "# Load test report (P7.3)", "",
    `Generated by \`npm run loadtest\` on ${new Date().toISOString().slice(0, 10)}: ${DURATION_S} s, ${os.cpus().length} vCPU (${os.cpus()[0]?.model ?? "?"}), server and load generator in ONE process (conservative).`,
    `Seeded ${SEED.toLocaleString("en-IN")} complaints; 500 officer accounts; ${sseOpen} SSE officer streams open. Rate: 6 complaints/s (peak hour of 50k/day ×10), 17 officer list reads/s, 20 public reads/s.`, "",
    "| Request | n | p50 | p95 | p99 |", "|---|---|---|---|---|", ...rows,
    `| SSE fan-out (create → event at an officer) | ${sseDelays.length} | ${pct(sseDelays, 0.5)} ms | ${pct(sseDelays, 0.95)} ms | ${pct(sseDelays, 0.99)} ms |`, "",
    `Errors: ${errors} of ${sent} requests.`, "",
    "Target: p95 < 300 ms for API requests. For staging/production run `loadtest/k6.js` from a separate machine.",
  ].join("\n");
  fs.writeFileSync("docs/LOADTEST.md", md + "\n");
  console.log(md);
  built.server.close();
  process.exit(0);
}
void main();
