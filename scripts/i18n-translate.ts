import * as fs from "node:fs";
import { safeFetch } from "../server/lib/safeFetch";
import { loadConfig, setConfig } from "../server/config";

/**
 * P5.4 scaffold for the 22 scheduled languages via Sarvam Translate (an Indian provider; through safeFetch).
 *   SARVAM_API_KEY=… npm run i18n:translate -- ta
 * Writes locales/<code>.json and lists it under needs_review in locales/meta.json. Machine output is never
 * marked complete: a native speaker must review it.
 */
async function main() {
  const code = process.argv[2];
  if (!code) { console.error("usage: npm run i18n:translate -- <language code, e.g. ta>"); process.exit(2); }
  const key = process.env.SARVAM_API_KEY;
  if (!key) { console.error("SARVAM_API_KEY is not set — nothing translated (no other provider is allowed)."); process.exit(1); }
  setConfig(loadConfig({ ...process.env, JWT_SECRET: process.env.JWT_SECRET || "x".repeat(32), DEPT_JWT_SECRET: process.env.DEPT_JWT_SECRET || "y".repeat(32) }));
  const en = JSON.parse(fs.readFileSync("locales/en.json", "utf8")) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(en)) {
    const res = await safeFetch("https://api.sarvam.ai/translate", {
      method: "POST", headers: { "Content-Type": "application/json", "api-subscription-key": key },
      body: JSON.stringify({ input: v, source_language_code: "en-IN", target_language_code: `${code}-IN`, mode: "formal" }),
    });
    if (!res.ok) { console.error(`✗ ${k}: HTTP ${res.status}`); process.exit(1); }
    out[k] = ((await res.json()) as { translated_text: string }).translated_text;
  }
  fs.writeFileSync(`locales/${code}.json`, JSON.stringify(out, null, 2) + "\n");
  const meta = JSON.parse(fs.readFileSync("locales/meta.json", "utf8"));
  meta.needs_review[code] = `Machine translation (Sarvam) ${new Date().toISOString().slice(0, 10)} — needs native-speaker review`;
  for (const l of meta.scheduled_languages) if (l.code === code) l.status = "needs_review";
  fs.writeFileSync("locales/meta.json", JSON.stringify(meta, null, 2) + "\n");
  console.log(`✓ locales/${code}.json written (${Object.keys(out).length} keys, needs_review)`);
}
void main();
