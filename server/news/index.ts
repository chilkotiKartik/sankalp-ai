import { safeFetch } from "../lib/safeFetch";
import { tenant, stateRegistry } from "../tenancy";
import { logger } from "../lib/logger";

/**
 * Official news for the selected state (no invented items — rule 3).
 *  - Local:    Akashvani / All India Radio "newsonair.gov.in" (Prasar Bharati, Government of India).
 *              Its search feed for the state name, plus the national "Regional News" feed, filtered to
 *              stories that actually name the state, an alias, its capital or one of its districts.
 *  - National: Press Information Bureau (pib.gov.in) press releases.
 *  - District: All India Radio's search for the district + PIB regional-office releases that name the district.
 *  - Policy:   PIB releases (national + regional offices) about schemes, policies, Cabinet decisions and launches,
 *              for the selected state or the whole country.
 *  PIB regional offices: every regional feed is read and a story is kept only if it names the state/district —
 *  no hand-made office→state mapping to go stale.
 * Only the state's name is sent (no personal data). Hosts must be in EGRESS_ALLOWLIST (safeFetch).
 * Stale-while-revalidate cache per state; on failure the last good copy (or nothing) is served.
 */
export interface NewsItem { id: string; title: string; summary: string; link: string; publishedAt: string | null; source: string }
export type NewsScope = "state" | "national" | "district" | "policy";
export interface NewsResult { scope: NewsScope; district?: string; items: NewsItem[]; fetchedAt: string | null; status: "ok" | "stale" | "unavailable"; sources: { name: string; url: string }[] }

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

/** PIB regional offices that publish an English feed (Regid=N&reg=N); 3 is the national desk. */
export const PIB_REGIONS = [1, 5, 6, 17, 20, 21, 22, 23, 24, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44];
let regionalPool: { at: number; items: NewsItem[]; loading?: Promise<NewsItem[]> } | null = null;
/** All PIB regional releases, fetched together and shared by every state for 30 minutes. */
async function pibRegional(): Promise<NewsItem[]> {
  if (regionalPool && Date.now() - regionalPool.at < TTL_MS) return regionalPool.items;
  if (regionalPool?.loading) return regionalPool.loading;
  const loading = (async () => {
    const settled = await Promise.allSettled(PIB_REGIONS.map(r => getXml(`https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=${r}&reg=${r}`)));
    const seen = new Set<string>();
    const items = settled.flatMap(x => (x.status === "fulfilled" ? parseRss(x.value, PIB.name) : [])).filter(it => !seen.has(it.id) && seen.add(it.id));
    if (!items.length && settled.every(x => x.status === "rejected")) throw new Error("PIB regional feeds failed");
    regionalPool = { at: Date.now(), items };
    return items;
  })();
  regionalPool = { at: regionalPool?.at ?? 0, items: regionalPool?.items ?? [], loading };
  try { return await loading; } finally { if (regionalPool) regionalPool.loading = undefined; }
}

/** AIR station bulletins come titled just "Lucknow": label them, and keep only the newest per station. */
export function tidyBulletins(items: NewsItem[]): NewsItem[] {
  const seenStation = new Set<string>();
  const out: NewsItem[] = [];
  for (const it of [...items].sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0))) {
    const m = it.link.match(/newsonair\.gov\.in\/bulletins\/([a-z-]+?)-\d+\/?$/);
    if (!m) { out.push(it); continue; }
    if (seenStation.has(m[1])) continue;
    seenStation.add(m[1]);
    out.push({ ...it, title: `Akashvani ${it.title} — latest regional news bulletin`, summary: it.summary || `Listen to the latest news bulletin from All India Radio ${it.title}.` });
  }
  return out;
}

const byDate = (a: NewsItem, b: NewsItem) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0);

async function loadStateFull(id: string): Promise<NewsItem[]> {
  const terms = stateTerms(id);
  const [air, pib] = await Promise.allSettled([loadState(id), pibRegional()]);
  if (air.status === "rejected" && pib.status === "rejected") throw new Error("all news sources failed");
  const seen = new Set<string>();
  const regional = (pib.status === "fulfilled" ? pib.value : []).filter(it => matchesState(it, terms) > 0);
  return tidyBulletins([...(air.status === "fulfilled" ? air.value : []), ...regional].filter(it => !seen.has(it.id) && seen.add(it.id))).slice(0, 25);
}

/** A district's own news: the district name must appear as a whole word (and the state too, if the name exists in two states). */
async function loadDistrict(id: string, district: string): Promise<NewsItem[]> {
  const ambiguous = (owners().get(district)?.size ?? 1) > 1;
  const stateT = stateTerms(id).filter(t => t !== district);
  const named = (it: NewsItem) => matchesState(it, [district]) > 0 && (!ambiguous || matchesState(it, stateT) > 0);
  const [air, pib] = await Promise.allSettled([getXml(`https://newsonair.gov.in/?s=${encodeURIComponent(district)}&feed=rss2`), pibRegional()]);
  if (air.status === "rejected" && pib.status === "rejected") throw new Error("all news sources failed");
  const seen = new Set<string>();
  const merged = [...(air.status === "fulfilled" ? parseRss(air.value, AIR.name) : []), ...(pib.status === "fulfilled" ? pib.value : [])]
    .filter(it => named(it) && !seen.has(it.id) && seen.add(it.id)).sort(byDate).slice(0, 40);
  return tidyBulletins(merged).slice(0, 20);
}

/** Schemes, policies, Cabinet decisions, launches and official notifications — for this state, or all-India. */
export const POLICY_RX = /\b(scheme|yojana|yojna|abhiyan|mission|policy|policies|cabinet|approve[sd]?|approval|launch(es|ed)?|notif(y|ies|ied|ication)|guidelines?|subsid(y|ies)|welfare|beneficiar(y|ies)|entitlement|portal|programme|initiative|reform|allocat(es|ed|ion)|sanction(ed|s)?|budget)\b/i;
async function loadPolicy(id: string): Promise<NewsItem[]> {
  const terms = stateTerms(id);
  const [nat, reg] = await Promise.allSettled([loadNational(), pibRegional()]);
  if (nat.status === "rejected" && reg.status === "rejected") throw new Error("all news sources failed");
  const isPolicy = (it: NewsItem) => POLICY_RX.test(it.title) || POLICY_RX.test(it.summary);
  const seen = new Set<string>();
  const local = (reg.status === "fulfilled" ? reg.value : []).filter(it => isPolicy(it) && matchesState(it, terms) > 0);
  const national = (nat.status === "fulfilled" ? nat.value : []).filter(isPolicy);
  return [...local, ...national].filter(it => !seen.has(it.id) && seen.add(it.id)).slice(0, 25);
}

export async function getNews(scope: NewsScope, id: string, opts: { wait?: boolean; district?: string } = {}): Promise<NewsResult> {
  const district = scope === "district" ? opts.district : undefined;
  if (scope === "district" && !district) return { scope, items: [], fetchedAt: null, status: "unavailable", sources: [AIR, PIB] };
  const key = scope === "national" ? "_national" : `${scope}:${id}${district ? `:${district}` : ""}`;
  const sources = scope === "national" || scope === "policy" ? [PIB] : [AIR, PIB];
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < TTL_MS;
  if (fresh) return hit.result;
  const refresh = async () => {
    try {
      const items = scope === "national" ? await loadNational() : scope === "district" ? await loadDistrict(id, district!)
        : scope === "policy" ? await loadPolicy(id) : await loadStateFull(id);
      cache.set(key, { at: Date.now(), result: { scope, district, items, fetchedAt: new Date().toISOString(), status: "ok", sources } });
    } catch (e) {
      logger.warn("news_fetch_failed", { scope, state: scope === "national" ? undefined : id, error: (e as Error).message });
      const prev = cache.get(key);
      // Retry no sooner than 5 minutes; keep the last good copy, marked stale.
      cache.set(key, { at: Date.now() - TTL_MS + 5 * 60 * 1000, result: prev ? { ...prev.result, status: "stale" } : { scope, district, items: [], fetchedAt: null, status: "unavailable", sources } });
    }
  };
  if (hit && !opts.wait) {
    if (!hit.refreshing) hit.refreshing = refresh().finally(() => { const e = cache.get(key); if (e) e.refreshing = undefined; });
    return { ...hit.result, status: hit.result.status === "ok" ? "stale" : hit.result.status };
  }
  await refresh();
  return cache.get(key)!.result;
}

export const _resetNewsCache = () => { cache.clear(); districtOwners = null; regionalPool = null; };
