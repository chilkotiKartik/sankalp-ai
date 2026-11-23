#!/usr/bin/env node
// Build SANKALP's AI training dataset from real, consented, officer- and citizen-confirmed complaints (D-057).
//   SANKALP_URL=https://sankalpai.app SANKALP_TENANT=kerala SANKALP_TOKEN=<state-admin access token> \
//     node scripts/export-training.mjs ./dataset
// Writes ./dataset/images/<task>/<label>/<file> and ./dataset/labels.jsonl ({file, task, label, district}).
// Only EXIF-stripped photos (no GPS) of people who switched on "Help improve SANKALP's AI". Run it on a machine
// in India and keep the dataset there; it is personal data under the DPDP Act.
import fs from "node:fs";
import path from "node:path";

const base = (process.env.SANKALP_URL || "").replace(/\/+$/, "");
const tenant = process.env.SANKALP_TENANT || "";
const token = process.env.SANKALP_TOKEN || "";
const out = process.argv[2];
if (!base || !token || !out) {
  console.error("usage: SANKALP_URL=… SANKALP_TENANT=… SANKALP_TOKEN=… node scripts/export-training.mjs <out-dir>");
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, ...(tenant ? { "X-Tenant": tenant } : {}) };
const r = await fetch(`${base}/api/admin/training-export`, { headers });
if (!r.ok) { console.error(`export refused: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
const m = await r.json();
console.log(`${m.counts.scene} "what is this problem" photos and ${m.counts.fixed} "is it fixed" photos from ${m.contributors} consenting people`);

fs.mkdirSync(out, { recursive: true });
const lines = [];
let ok = 0, failed = 0;
for (const it of m.items) {
  // Only our own /uploads/ paths (the server checks this too); never follow other hosts.
  if (!/^\/uploads\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/.test(it.url)) { failed++; continue; }
  const name = path.basename(it.url);
  const dir = path.join(out, "images", it.task, it.label.replace(/[^a-z0-9_-]/gi, "_"));
  fs.mkdirSync(dir, { recursive: true });
  const res = await fetch(`${base}${it.url}`, { headers });
  if (!res.ok) { failed++; continue; }
  fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
  lines.push(JSON.stringify({ file: path.join("images", it.task, path.basename(dir), name), task: it.task, label: it.label, district: it.district }));
  ok++;
}
fs.writeFileSync(path.join(out, "labels.jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));
console.log(`saved ${ok} photos${failed ? `, ${failed} skipped` : ""} → ${path.join(out, "labels.jsonl")}`);
