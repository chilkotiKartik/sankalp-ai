import { safeFetch } from "../lib/safeFetch";
import { tenant, stateRegistry } from "../tenancy";
import { logger } from "../lib/logger";

/**
 * Official news for the selected state (no invented items — rule 3).
 *  - Local:    Akashvani / All India Radio "newsonair.gov.in" (Prasar Bharati, Government of India).
 *              Its search feed for the state name, plus the national "Regional News" feed, filtered to
 *              stories that actually name the state, an alias, its capital or one of its districts.
 *  - National: Press Information Bureau (pib.gov.in) press releases.
 * Only the state's name is sent (no personal data). Hosts must be in EGRESS_ALLOWLIST (safeFetch).
 * Stale-while-revalidate cache per state; on failure the last good copy (or nothing) is served.
 */
export interface NewsItem { id: string; title: string; summary: string; link: string; publishedAt: string | null; source: string }
export interface NewsResult { scope: "state" | "national"; items: NewsItem[]; fetchedAt: string | null; status: "ok" | "stale" | "unavailable"; sources: { name: string; url: string }[] }

const AIR = { name: "Akashvani News (All India Radio)", url: "https://newsonair.gov.in" };
const PIB = { name: "Press Information Bureau, Government of India", url: "https://www.pib.gov.in" };
const TTL_MS = 30 * 60 * 1000;
const UA = "SANKALP-AI/1.0 (civic app; official news reader)";

/** Other names used in news copy. */
const ALIASES: Record<string, string[]> = {
  kerala: ["Keralam"], "jammu-kashmir": ["J&K", "Jammu", "Kashmir", "Srinagar"], delhi: ["New Delhi", "NCR"],
  odisha: ["Orissa"], puducherry: ["Pondicherry", "Karaikal"], "andaman-nicobar": ["Andaman", "Nicobar", "Port Blair", "Sri Vijaya Puram"],
  "dnh-daman-diu": ["Daman", "Diu", "Dadra", "Silvassa"], ladakh: ["Leh", "Kargil"], lakshadweep: ["Kavaratti"],
  "tamil-nadu": ["Chennai"], "west-bengal": ["Kolkata", "Bengal"], telangana: ["Hyderabad"], karnataka: ["Bengaluru", "Bangalore"],
  maharashtra: ["Mumbai"], "uttar-pradesh": ["U.P.", "Lucknow"], "himachal-pradesh": ["Shimla"], uttarakhand: ["Dehradun"],
  "andhra-pradesh": ["Amaravati", "Visakhapatnam"], "madhya-pradesh": ["Bhopal"], gujarat: ["Gandhinagar", "Ahmedabad"],
};

// ── tiny RSS reader (RSS 2.0 only; no external XML dependency) ──
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function decode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
const text = (s: string) => decode(s).replace(/<[^>]*>/g, " ").replace(/\[…\]|\[&#8230;\]|\[\.\.\.\]/g, "…").replace(/\s+/g, " ").trim();
const tag = (item: string, name: string) => item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";

export function parseRss(xml: string, source: string): NewsItem[] {
  const out: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = text(tag(it, "title"));
    const link = decode(tag(it, "link")).trim();
    if (!title || !/^https:\/\/(www\.)?(newsonair\.gov\.in|pib\.gov\.in)\//.test(link)) continue; // only official links
    const date = tag(it, "pubDate").trim();
    const t = date ? Date.parse(date) : NaN;
    let summary = text(tag(it, "description"));
    if (summary.length > 320) summary = `${summary.slice(0, 317).replace(/\s+\S*$/, "")}…`;
    out.push({ id: link, title, summary, link, publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : null, source });
  }
  return out;
}

// ── which stories belong to a state ──
let districtOwners: Map<string, Set<string>> | null = null;
function owners(): Map<string, Set<string>> {
  if (districtOwners) return districtOwners;
  districtOwners = new Map();
  for (const r of stateRegistry()) for (const d of r.districts ?? []) {
    const s = districtOwners.get(d.name) ?? new Set<string>(); s.add(r.id); districtOwners.set(d.name, s);
  }
  return districtOwners;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Terms that identify a state in news copy: its name, aliases, capital and every district name unique to it. */
export function stateTerms(id: string): string[] {
  const r = stateRegistry().find(x => x.id === id);
  const t = tenant(id);
  const terms = new Set<string>([t.name, t.stateLabel, ...(ALIASES[id] ?? [])]);
  if (r?.capital) terms.add(r.capital);
  const own = owners();
  for (const d of t.districts) {
    const n = d.district;
    if (n === "Other districts" || n.length < 4) continue;
    if ((own.get(n)?.size ?? 1) > 1) continue; // same district name in two states (Aurangabad, Bilaspur…) → ambiguous
    if (/^(North|South|East|West|Central|Upper|Lower|New)\b/.test(n) && n.split(" ").length === 1) continue;
    terms.add(n);
  }
  return [...terms].filter(Boolean);
}

export function matchesState(item: NewsItem, terms: string[]): number {
  // Case-sensitive, whole words: "Erode" (district) ≠ "erode" (verb).
  const rx = (w: string) => new RegExp(`(^|[^A-Za-z])${esc(w)}($|[^A-Za-z])`);
  let score = 0;
  for (const w of terms) {
    if (rx(w).test(item.title)) score += 3;
    else if (rx(w).test(item.summary)) score += 1;
  }
  return score;
}

// ── fetch + cache ──
interface Entry { at: number; result: NewsResult; refreshing?: Promise<void> }
const cache = new Map<string, Entry>();

async function getXml(url: string): Promise<string> {
  const r = await safeFetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" }, timeoutMs: 10_000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function loadState(id: string): Promise<NewsItem[]> {
  const t = tenant(id);
  const terms = stateTerms(id);
  const urls = [
    `https://newsonair.gov.in/?s=${encodeURIComponent(t.name)}&feed=rss2`,
    "https://newsonair.gov.in/category/regional-news/feed/",
    "https://newsonair.gov.in/category/regional-news/feed/?paged=2",
  ];
  const settled = await Promise.allSettled(urls.map(getXml));
  const all = settled.flatMap(s => (s.status === "fulfilled" ? parseRss(s.value, AIR.name) : []));
  if (settled.every(s => s.status === "rejected")) throw new Error("all news sources failed");
  const seen = new Set<string>();
  return all
    .map(it => ({ it, score: matchesState(it, terms) }))
    .filter(x => x.score > 0 && !seen.has(x.it.id) && seen.add(x.it.id))
    .sort((a, b) => (Date.parse(b.it.publishedAt ?? "") || 0) - (Date.parse(a.it.publishedAt ?? "") || 0) || b.score - a.score)
    .slice(0, 20)
    .map(x => x.it);
}

async function loadNational(): Promise<NewsItem[]> {
  return parseRss(await getXml("https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3&reg=3"), PIB.name).slice(0, 20);
}

export async function getNews(scope: "state" | "national", id: string, opts: { wait?: boolean } = {}): Promise<NewsResult> {
  const key = scope === "national" ? "_national" : id;
  const sources = scope === "national" ? [PIB] : [AIR];
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < TTL_MS;
  if (fresh) return hit.result;
  const refresh = async () => {
    try {
      const items = scope === "national" ? await loadNational() : await loadState(id);
      cache.set(key, { at: Date.now(), result: { scope, items, fetchedAt: new Date().toISOString(), status: "ok", sources } });
    } catch (e) {
      logger.warn("news_fetch_failed", { scope, state: scope === "state" ? id : undefined, error: (e as Error).message });
      const prev = cache.get(key);
      // Retry no sooner than 5 minutes; keep the last good copy, marked stale.
      cache.set(key, { at: Date.now() - TTL_MS + 5 * 60 * 1000, result: prev ? { ...prev.result, status: "stale" } : { scope, items: [], fetchedAt: null, status: "unavailable", sources } });
    }
  };
  if (hit && !opts.wait) {
    if (!hit.refreshing) hit.refreshing = refresh().finally(() => { const e = cache.get(key); if (e) e.refreshing = undefined; });
    return { ...hit.result, status: hit.result.status === "ok" ? "stale" : hit.result.status };
  }
  await refresh();
  return cache.get(key)!.result;
}

export const _resetNewsCache = () => { cache.clear(); districtOwners = null; };
