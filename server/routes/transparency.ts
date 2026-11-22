import type { Express, Response } from "express";
import { z } from "zod";
import { route, none } from "../lib/route";
import { tenant } from "../tenancy";
import { config } from "../config";
import { openDataRows, toCsv, departmentScorecard, DATA_DICTIONARY, K } from "../transparency/opendata";
import { publicResolutionRates, RRR_DEFINITION } from "../verification/rate";

/**
 * P8.1 public dashboard + open data, P8.3 embeddable widgets. No login, no personal data, aggregates only.
 */
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (r: { p: number; low: number; high: number; n: number } | null) =>
  (r ? `${Math.round(r.p * 100)}% <small>(95% CI ${Math.round(r.low * 100)}–${Math.round(r.high * 100)}%, n=${r.n})</small>` : `<small>not enough data (n&lt;${K})</small>`);

/** Widgets may be embedded on any government site; everything else keeps frame protection. */
function embeddable(res: Response) {
  res.removeHeader("X-Frame-Options");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors *; base-uri 'none'; form-action 'self'");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("Vary", "X-Tenant, Host");
}

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font:15px system-ui,sans-serif;margin:0 auto;max-width:960px;padding:16px;color:#111}h1{font-size:22px}h2{font-size:17px;margin-top:28px;border-bottom:2px solid #1D4ED8;padding-bottom:3px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;vertical-align:top}th{background:#F3F4F6}small{color:#374151}a{color:#1D4ED8}.note{background:#EFF6FF;border-left:4px solid #1D4ED8;padding:8px 12px}</style></head><body>${body}</body></html>`;

export function registerTransparencyRoutes(app: Express) {
  route(app, {
    method: "get", path: "/api/open-data/complaints.json", auth: "public", permission: "public.open_data",
    params: none, query: none, body: none,
    handler: ({ res }) => { res.setHeader("Cache-Control", "public, max-age=900"); res.setHeader("Vary", "X-Tenant, Host"); return { demo: config().DEMO_MODE, dictionary: { ...DATA_DICTIONARY, publisher: DATA_DICTIONARY.publisher() }, generatedAt: new Date().toISOString(), rows: openDataRows() }; },
  });

  route(app, {
    method: "get", path: "/api/open-data/complaints.csv", auth: "public", permission: "public.open_data",
    params: none, query: none, body: none,
    handler: ({ res }) => {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="sankalp-${tenant().id}-complaints-monthly${config().DEMO_MODE ? "-DEMO" : ""}.csv"`);
      res.setHeader("Cache-Control", "public, max-age=900");
      res.setHeader("Vary", "X-Tenant, Host");
      res.send(toCsv(openDataRows()));
      return undefined;
    },
  });

  route(app, {
    method: "get", path: "/api/public/scorecard", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: () => ({ demo: config().DEMO_MODE, definition: RRR_DEFINITION, k: K, departments: departmentScorecard() }),
  });

  // ── P8.1 public dashboard (server-rendered, no JS, works on 2G) ──
  route(app, {
    method: "get", path: "/web/transparency", auth: "public", permission: "public.dashboard",
    params: none, query: none, body: none,
    handler: ({ res }) => {
      const t = tenant();
      const depts = departmentScorecard();
      const wards = publicResolutionRates("ward").filter(r => r.filed !== "<5").slice(0, 60);
      res.setHeader("Cache-Control", "public, max-age=300");
      res.setHeader("Vary", "X-Tenant, Host");
      res.type("html").send(page(`${t.stateLabel} — public service performance`, `
<h1>${esc(t.stateLabel)}: how well are complaints really resolved?</h1>
${config().DEMO_MODE ? `<p class="note"><strong>DEMO DATA</strong> — this instance runs in demo mode; the figures are not real.</p>` : ""}
<p class="note"><strong>Real Resolution Rate</strong> counts only complaints the <em>citizen</em> confirmed fixed, out of those the department marked resolved. The official rate is what departments report. Ranges are 95% Wilson intervals; small n means wide ranges. Groups with fewer than ${K} complaints are not shown, to protect privacy.</p>
<h2>Departments</h2>
<table><thead><tr><th>Department</th><th>Filed</th><th>Official rate</th><th>Real Resolution Rate</th><th>Closed within SLA</th></tr></thead><tbody>
${depts.map(d => `<tr><td>${esc(d.name)}</td><td>${esc(d.filed)}</td><td>${pct(d.officialRate)}</td><td>${pct(d.realResolutionRate)}</td><td>${pct(d.slaCompliance)}</td></tr>`).join("") || `<tr><td colspan="5">No data yet.</td></tr>`}
</tbody></table>
<h2>Wards</h2>
<table><thead><tr><th>Ward</th><th>Filed</th><th>Real Resolution Rate</th></tr></thead><tbody>
${wards.map(w => `<tr><td>${esc(w.label)}</td><td>${esc(w.filed)}</td><td>${pct(w.realResolutionRate)}</td></tr>`).join("") || `<tr><td colspan="3">No ward has ${K} or more complaints yet.</td></tr>`}
</tbody></table>
<h2>Open data</h2>
<p>Monthly aggregates by district, ward, department and category under the Government Open Data License – India: <a href="/api/open-data/complaints.csv">CSV</a> · <a href="/api/open-data/complaints.json">JSON with data dictionary</a>. Counts between 1 and ${K - 1} appear as "&lt;5".</p>
<p><small>Generated ${esc(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))} IST · updated every 5 minutes · <a href="/web/privacy">Privacy notice</a></small></p>`));
      return undefined;
    },
  });

  // ── P8.3 widgets: <iframe src="https://host/widget/ward-score?ward=…"> or the "Report an issue" button ──
  route(app, {
    method: "get", path: "/widget/ward-score", auth: "public", permission: "public.dashboard",
    params: none, query: z.object({ ward: z.string().max(120).optional(), lang: z.enum(["en", "hi"]).default("en") }), body: none,
    handler: ({ query, res }) => {
      const rows = publicResolutionRates("ward");
      const r = query.ward ? rows.find(x => x.label.toLowerCase().endsWith(`· ${query.ward!.toLowerCase()}`) || x.label.toLowerCase() === query.ward!.toLowerCase()) : undefined;
      const hi = query.lang === "hi";
      const rrr = r?.realResolutionRate ?? null;
      embeddable(res);
      res.type("html").send(`<!doctype html><html lang="${query.lang}"><head><meta charset="utf-8"><title>Ward score</title><style>body{margin:0;font:14px system-ui,sans-serif;color:#111}.c{border:1px solid #D1D5DB;border-radius:10px;padding:12px;max-width:320px}.n{font-size:28px;font-weight:800;color:#1D4ED8}small{color:#374151}</style></head><body><div class="c">
<div><strong>${esc(r?.label ?? (query.ward || (hi ? "वार्ड" : "Ward")))}</strong></div>
<div class="n">${rrr ? `${Math.round(rrr.p * 100)}%` : "—"}</div>
<div>${hi ? "नागरिक-पुष्टि समाधान दर" : "Real Resolution Rate (citizen-confirmed)"}</div>
<small>${rrr ? `95% CI ${Math.round(rrr.low * 100)}–${Math.round(rrr.high * 100)}%, n=${rrr.n}` : hi ? `पर्याप्त डेटा नहीं (n<${K})` : `Not enough data yet (n<${K})`} · SANKALP ${esc(tenant().stateLabel)}</small>
</div></body></html>`);
      return undefined;
    },
  });

  route(app, {
    method: "get", path: "/widget/report", auth: "public", permission: "public.dashboard",
    params: none, query: z.object({ lang: z.enum(["en", "hi"]).default("en") }), body: none,
    handler: ({ query, res }) => {
      const hi = query.lang === "hi";
      const base = config().PUBLIC_BASE_URL || "";
      embeddable(res);
      res.type("html").send(`<!doctype html><html lang="${query.lang}"><head><meta charset="utf-8"><title>Report an issue</title><style>body{margin:0;font:15px system-ui,sans-serif}a{display:inline-block;background:#B45309;color:#fff;font-weight:700;padding:12px 18px;border-radius:10px;text-decoration:none}small{display:block;margin-top:6px;color:#374151}</style></head><body>
<a href="${esc(base)}/" target="_top" rel="noopener">${hi ? "समस्या दर्ज करें" : "Report a civic issue"}</a>
<small>${hi ? "बिना स्मार्टफोन: SMS भेजें" : "No smartphone? SMS"} "SANKALP ${hi ? "<समस्या>" : "&lt;problem&gt;"}" · ${hi ? "आपात" : "Emergency"} 112</small>
</body></html>`);
      return undefined;
    },
  });
}
