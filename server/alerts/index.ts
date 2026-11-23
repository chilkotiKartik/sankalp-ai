import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";
import { decode, stateTerms, matchesState } from "../news";

/**
 * Official disaster and weather alerts (D-060) from SACHET, NDMA's Common Alerting Protocol system — the same alerts
 * IMD centres, CWC and State Disaster Management Authorities send to phones. Public data; only read, never sent to.
 * An alert belongs to a state when its issuer (e.g. "IMD Chennai", "Andhra Pradesh SDMA") or its text names the
 * state, its capital or one of its districts; to a district when the text names that district. Shown for 36 hours.
 */
export const SACHET_FEED = "https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml";
const TTL_MS = 10 * 60 * 1000;
const WINDOW_MS = 36 * 3600 * 1000;

export interface OfficialAlert { id: string; title: string; category: string; issuer: string; link: string; publishedAt: string }
export interface AlertsResult { status: "ok" | "stale" | "unavailable"; scope: "district" | "state"; items: OfficialAlert[]; fetchedAt: string | null; source: { name: string; url: string } }
const SOURCE = { name: "SACHET — National Disaster Management Authority (IMD, CWC, SDMAs)", url: "https://sachet.ndma.gov.in" };

const tag = (it: string, n: string) => it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, "i"))?.[1] ?? "";
export function parseSachet(xml: string): OfficialAlert[] {
  const out: OfficialAlert[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = decode(tag(it, "title")).replace(/\s+/g, " ").trim();
    const link = decode(tag(it, "link")).trim();
    if (!title || !/^https:\/\/sachet\.ndma\.gov\.in\//.test(link)) continue; // official links only
    const t = Date.parse(tag(it, "pubDate").trim());
    const issuer = (decode(tag(it, "author")).match(/\(([^)]+)\)/)?.[1] ?? "NDMA").trim();
    out.push({ id: decode(tag(it, "guid")).trim() || link, title, category: decode(tag(it, "category")).trim() || "Alert", issuer, link, publishedAt: Number.isFinite(t) ? new Date(t).toISOString() : new Date(0).toISOString() });
  }
  return out;
}

/** Alerts for a state (and, when given, its district first), newest first, within the 36-hour window. */
export function selectAlerts(all: OfficialAlert[], stateId: string, district: string | undefined, now = Date.now()): { scope: "district" | "state"; items: OfficialAlert[] } {
  const terms = stateTerms(stateId);
  const recent = all.filter(a => now - Date.parse(a.publishedAt) <= WINDOW_MS);
  const inState = recent.filter(a => matchesState({ id: a.id, title: `${a.issuer}. ${a.title}`, summary: "", link: a.link, publishedAt: a.publishedAt, source: "" }, terms) > 0);
  const byDate = (x: OfficialAlert, y: OfficialAlert) => Date.parse(y.publishedAt) - Date.parse(x.publishedAt);
  if (district) {
    const rx = new RegExp(`(^|[^A-Za-z])${district.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z])`);
    const mine = inState.filter(a => rx.test(a.title));
    if (mine.length) return { scope: "district", items: mine.sort(byDate).slice(0, 10) };
  }
  return { scope: "state", items: inState.sort(byDate).slice(0, 10) };
}

let feed: { at: number; items: OfficialAlert[]; loading?: Promise<OfficialAlert[]> } | null = null;
async function loadFeed(): Promise<OfficialAlert[]> {
  if (feed && Date.now() - feed.at < TTL_MS) return feed.items;
  if (feed?.loading) return feed.loading;
  const loading = (async () => {
    const r = await safeFetch(SACHET_FEED, { headers: { Accept: "application/rss+xml, application/xml", "User-Agent": "SANKALP-AI/1.0 (civic app; official alerts reader)" }, timeoutMs: 12_000 });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = parseSachet(await r.text());
    feed = { at: Date.now(), items };
    return items;
  })();
  feed = { at: feed?.at ?? 0, items: feed?.items ?? [], loading };
  try { return await loading; } finally { if (feed) feed.loading = undefined; }
}

export async function officialAlerts(stateId: string, district?: string): Promise<AlertsResult> {
  try {
    const all = await loadFeed();
    const sel = selectAlerts(all, stateId, district);
    return { status: "ok", ...sel, fetchedAt: new Date(feed?.at ?? Date.now()).toISOString(), source: SOURCE };
  } catch (e) {
    logger.warn("alerts_fetch_failed", { error: (e as Error).message });
    if (feed?.items.length) return { status: "stale", ...selectAlerts(feed.items, stateId, district), fetchedAt: new Date(feed.at).toISOString(), source: SOURCE };
    return { status: "unavailable", scope: "state", items: [], fetchedAt: null, source: SOURCE };
  }
}

export const _resetAlertsCache = () => { feed = null; };
