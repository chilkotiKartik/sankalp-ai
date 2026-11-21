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
  const rows = fs.readFileSync("eval/complaints.jsonl", "utf8").trim().split("\n").map(l => JSON.parse(l) as { text: string; category: string; lang: string });
  const labels = [...new Set(rows.map(r => r.category))].sort();
  const confusion: Record<string, Record<string, number>> = Object.fromEntries(labels.map(l => [l, Object.fromEntries(labels.map(m => [m, 0]))]));
  const byLang: Record<string, { n: number; ok: number }> = {};
  const latencies: number[] = [];
  let ok = 0;
  let method = "rules";
  for (const r of rows) {
    const t0 = performance.now();
    const d = await classifyComplaint(r.text);
    latencies.push(performance.now() - t0);
    method = d.method === "model" ? `model:${d.model}` : "rules";
    const pred = labels.includes(d.output.category) ? d.output.category : "other";
    confusion[r.category][pred]++;
    byLang[r.lang] ??= { n: 0, ok: 0 };
    byLang[r.lang].n++;
    if (pred === r.category) { ok++; byLang[r.lang].ok++; }
  }
  const acc = +(100 * ok / rows.length).toFixed(1);
  latencies.sort((a, b) => a - b);
  const p95 = +latencies[Math.floor(0.95 * (latencies.length - 1))].toFixed(2);

  const out: string[] = [];
  out.push(`Eval: ${rows.length} examples · method ${method} · AI status ${JSON.stringify(aiStatus())}`);
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
  fs.writeFileSync("eval/report.txt", out.join("\n") + "\n");

  const basePath = "eval/baseline.json";
  const baseline = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, "utf8")) as Record<string, { accuracy: number; n: number; date: string }> : {};
  if (process.argv.includes("--update-baseline")) {
    baseline[method] = { accuracy: acc, n: rows.length, date: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(basePath, JSON.stringify(baseline, null, 2) + "\n");
    process.stdout.write(`Baseline for ${method} set to ${acc}%\n`);
    return;
  }
  const b = baseline[method];
  if (b && acc < b.accuracy - 2) {
    process.stderr.write(`✗ Accuracy ${acc}% dropped more than 2 points below baseline ${b.accuracy}% (${method})\n`);
    process.exit(1);
  }
  process.stdout.write(b ? `✓ Within 2 points of baseline ${b.accuracy}% (${method})\n` : `(no baseline for ${method} yet — run with --update-baseline)\n`);
}

void main();
