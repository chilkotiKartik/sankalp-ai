import * as fs from "node:fs";

/** P5.4: every locale has exactly the keys of en.json, no empty strings, placeholders preserved. Exit 1 otherwise. */
const en = JSON.parse(fs.readFileSync("locales/en.json", "utf8")) as Record<string, string>;
const meta = JSON.parse(fs.readFileSync("locales/meta.json", "utf8")) as { complete: string[]; needs_review: Record<string, string> };
let bad = 0;
for (const f of fs.readdirSync("locales").filter(f => f.endsWith(".json") && f !== "meta.json" && f !== "en.json")) {
  const code = f.replace(".json", "");
  const loc = JSON.parse(fs.readFileSync(`locales/${f}`, "utf8")) as Record<string, string>;
  const missing = Object.keys(en).filter(k => !loc[k]);
  const extra = Object.keys(loc).filter(k => !(k in en));
  const ph = Object.keys(en).filter(k => loc[k] && (en[k].match(/\{\w+\}/g) ?? []).some(p => !loc[k].includes(p)));
  const status = meta.complete.includes(code) ? "complete" : meta.needs_review[code] ? "needs_review" : "unlisted";
  if (status === "unlisted") { console.error(`✗ ${code}: not listed in locales/meta.json`); bad++; }
  if (missing.length || extra.length || ph.length) {
    console.error(`✗ ${code}: ${missing.length} missing, ${extra.length} unknown, ${ph.length} broken placeholders`, [...missing, ...extra, ...ph].slice(0, 8));
    bad++;
  } else console.log(`✓ ${code} (${status}): ${Object.keys(en).length} keys`);
}
process.exit(bad ? 1 : 0);
