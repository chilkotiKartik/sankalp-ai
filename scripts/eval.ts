/**
 * P2.5 — `npm run eval` : measures complaint classification on eval/complaints.jsonl.
 * Reports accuracy (overall + per language), per-class precision/recall, a confusion matrix and p95 latency.
 * Fails (exit 1) if accuracy drops more than 2 points below eval/baseline.json for the active method.
 * `npm run eval -- --update-baseline` records the current result as the new baseline.
 */
import * as fs from "node:fs";

async function main() {
  process.env.JWT_SECRET ||= "eval-only-secret-00000000000000000000000000";
  process.env.DEPT_JWT_SECRET ||= "eval-only-dept-secret-0000000000000000000000";
  process.env.LOG_LEVEL ||= "error";
  const { classifyComplaint } = await import("../server/ai/classify");
  const { aiStatus } = await import("../server/ai/gateway");
  const sets: Array<[string, string]> = [["dev", "eval/complaints.jsonl"], ["holdout", "eval/holdout.jsonl"]];
  let failed = false;
  const reports: string[] = [];
  for (const [setName, file] of sets) {
  const rows = fs.readFileSync(file, "utf8").trim().split("\n").map(l => JSON.parse(l) as { text: string; category: string; lang: string });
  const labels = [...new Set(rows.map(r => r.category))].sort();
  const confusion: Record<string, Record<string, number>> = Object.fromEntries(labels.map(l => [l, Object.fromEntries(labels.map(m => [m, 0]))]));
  const byLang: Record<string, { n: number; ok: number }> = {};
  const latencies: number[] = [];
  let ok = 0;
  const methods = new Set<string>();
  for (const r of rows) {
    const t0 = performance.now();
    const d = await classifyComplaint(r.text);
    latencies.push(performance.now() - t0);
    methods.add(d.method === "model" ? `model:${d.model}` : "rules");
    const pred = labels.includes(d.output.category) ? d.output.category : "other";
    confusion[r.category][pred]++;
    byLang[r.lang] ??= { n: 0, ok: 0 };
    byLang[r.lang].n++;
    if (pred === r.category) { ok++; byLang[r.lang].ok++; }
  }
  // Review P2-7: a run must be one method end to end — a breaker opening mid-run would silently mix in rules.
  if (methods.size > 1) { process.stderr.write(`✗ ${setName}: mixed methods in one run (${[...methods].join(", ")}) — provider unstable\n`); failed = true; continue; }
  const method = [...methods][0] ?? "rules";
  const key = `${method}${setName === "dev" ? "" : `:${setName}`}`;
  const acc = +(100 * ok / rows.length).toFixed(1);
  latencies.sort((a, b) => a - b);
  const p95 = +latencies[Math.floor(0.95 * (latencies.length - 1))].toFixed(2);

  const out: string[] = [];
  out.push(`Eval [${setName}]: ${rows.length} examples · method ${method} · AI status ${JSON.stringify(aiStatus())}`);
  out.push(`Accuracy: ${acc}% · p95 latency ${p95} ms`);
  out.push(`By language: ${Object.entries(byLang).map(([l, v]) => `${l} ${(100 * v.ok / v.n).toFixed(0)}% (n=${v.n})`).join(" · ")}`);
  out.push("Per class (precision / recall):");
  for (const l of labels) {
    const tp = confusion[l][l];
    const predicted = labels.reduce((a, m) => a + confusion[m][l], 0);
    const actual = labels.reduce((a, m) => a + confusion[l][m], 0);
    out.push(`  ${l.padEnd(14)} P ${predicted ? (100 * tp / predicted).toFixed(0).padStart(3) : "  -"}%  R ${(100 * tp / actual).toFixed(0).padStart(3)}%  (n=${actual})`);
  }
  out.push("Confusion matrix (rows = truth, cols = predicted):");
  const short = (s: string) => s.slice(0, 5).padStart(5);
  out.push(`${"".padEnd(14)}${labels.map(short).join(" ")}`);
  for (const l of labels) out.push(`${l.padEnd(14)}${labels.map(m => String(confusion[l][m]).padStart(5)).join(" ")}`);
  process.stdout.write(out.join("\n") + "\n");
  reports.push(out.join("\n"));

  const basePath = "eval/baseline.json";
  const baseline = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, "utf8")) as Record<string, { accuracy: number; n: number; date: string }> : {};
  if (process.argv.includes("--update-baseline")) {
    baseline[key] = { accuracy: acc, n: rows.length, date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(basePath, JSON.stringify(baseline, null, 2) + "\n");
    process.stdout.write(`Baseline for ${key} set to ${acc}%\n`);
    continue;
  }
  const b = baseline[key];
  if (!b) {
    // Review P2-7: a configured model without a recorded baseline cannot pass silently.
    process.stderr.write(`✗ No baseline for ${key} — run "npm run eval -- --update-baseline" and commit eval/baseline.json\n`);
    failed = true;
  } else if (acc < b.accuracy - 2) {
    process.stderr.write(`✗ ${setName}: accuracy ${acc}% dropped more than 2 points below baseline ${b.accuracy}% (${key})\n`);
    failed = true;
  } else process.stdout.write(`✓ ${setName}: within 2 points of baseline ${b.accuracy}% (${key})\n`);
  }
  fs.writeFileSync("eval/report.txt", reports.join("\n\n") + "\n");
  if (failed) process.exit(1);
}

void main();
