/**
 * P5.7 accessibility audit (npm run a11y): axe-core WCAG 2.1 A/AA rules on every portal page.
 * Point A11Y_BASE_URL at a running server. Exits 1 on any serious/critical violation.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.A11Y_BASE_URL || "http://localhost:5000";
const PAGES = ["/web/portal", "/web/dept", "/web/rti", "/web/public", "/web/privacy", "/web/cpr", "/web/pcr", "/web/disaster"];
const axe = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  const report = [];
  for (const u of PAGES) {
    const p = await b.newPage();
    await p.goto(BASE + u, { waitUntil: "load" });
    await p.waitForTimeout(1200);
    await p.addScriptTag({ content: axe });
    const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations
      .map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0]?.target?.join(" ") })));
    const serious = r.filter(v => v.impact === "serious" || v.impact === "critical");
    bad += serious.length;
    report.push(`${u}: ${r.length ? r.map(v => `${v.impact}:${v.id}×${v.n}`).join(", ") : "no violations"}`);
    for (const v of r) console.log(`${u}\t${v.impact}\t${v.id}\t×${v.n}\t${v.help}\t${v.sample}`);
    await p.close();
  }
  await b.close();
  console.log("\n" + report.join("\n"));
  process.exit(bad ? 1 : 0);
})();
