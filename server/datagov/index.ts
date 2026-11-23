import { z } from "zod";
import { config } from "../config";
import { safeFetch } from "../lib/safeFetch";
import { logger } from "../lib/logger";

/**
 * Open Government Data (data.gov.in, Government of India) — D-058.
 * Today: daily mandi (market) prices from Agmarknet for the user's state and district.
 * Only the state and district names are sent. The API key goes in the query string (that is how data.gov.in works),
 * so it is never logged and is scrubbed from error messages. Without DATAGOV_API_KEY the feature reports
 * "not_configured" and the app hides it. data.gov.in answers only from Indian networks.
 */
export const MANDI_RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070";
const TTL_MS = 60 * 60 * 1000;
const SOURCE = { name: "Agmarknet via data.gov.in (Government of India)", url: "https://www.data.gov.in" };

const record = z.object({
  state: z.string(), district: z.string(), market: z.string(), commodity: z.string(),
  variety: z.string().optional().default(""), arrival_date: z.string(),
  min_price: z.union([z.string(), z.number()]), max_price: z.union([z.string(), z.number()]), modal_price: z.union([z.string(), z.number()]),
}).passthrough();
const response = z.object({ records: z.array(z.unknown()).default([]), total: z.union([z.number(), z.string()]).optional() }).passthrough();

export interface MandiPrice { commodity: string; variety: string; market: string; district: string; date: string; min: number; max: number; modal: number }
export interface MandiResult { status: "ok" | "not_configured" | "unavailable"; scope: "district" | "state" | null; items: MandiPrice[]; fetchedAt: string | null; source: typeof SOURCE }

const cache = new Map<string, { at: number; result: MandiResult }>();
const num = (v: string | number) => { const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };

async function query(filters: Record<string, string>): Promise<MandiPrice[]> {
  const key = config().DATAGOV_API_KEY!;
  const u = new URL(`https://api.data.gov.in/resource/${MANDI_RESOURCE}`);
  u.searchParams.set("api-key", key);
  u.searchParams.set("format", "json");
  u.searchParams.set("limit", "200");
  for (const [k, v] of Object.entries(filters)) u.searchParams.set(`filters[${k}]`, v);
  const r = await safeFetch(u.toString(), { headers: { Accept: "application/json", "User-Agent": "SANKALP-AI/1.0 (civic app)" }, timeoutMs: 12_000 });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const body = response.parse(await r.json());
  const out: MandiPrice[] = [];
  for (const raw of body.records) {
    const p = record.safeParse(raw);
    if (!p.success) continue;
    const x = p.data;
    out.push({ commodity: x.commodity.trim(), variety: (x.variety ?? "").trim(), market: x.market.trim(), district: x.district.trim(), date: x.arrival_date, min: num(x.min_price), max: num(x.max_price), modal: num(x.modal_price) });
  }
  // Newest first (dd/mm/yyyy), then by commodity.
  const t = (d: string) => { const [dd, mm, yy] = d.split("/").map(Number); return Date.UTC(yy || 0, (mm || 1) - 1, dd || 1); };
  return out.sort((a, b) => t(b.date) - t(a.date) || a.commodity.localeCompare(b.commodity));
}

export async function mandiPrices(state: string, district?: string): Promise<MandiResult> {
  if (!config().DATAGOV_API_KEY) return { status: "not_configured", scope: null, items: [], fetchedAt: null, source: SOURCE };
  const ck = `${state}|${district ?? ""}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;
  try {
    let scope: MandiResult["scope"] = "district";
    let items = district ? await query({ "state.keyword": state, "district": district }) : [];
    if (!items.length) { scope = "state"; items = await query({ "state.keyword": state }); }
    const result: MandiResult = { status: "ok", scope: items.length ? scope : null, items: items.slice(0, 60), fetchedAt: new Date().toISOString(), source: SOURCE };
    cache.set(ck, { at: Date.now(), result });
    return result;
  } catch (e) {
    const key = config().DATAGOV_API_KEY ?? "";
    logger.warn("datagov_fetch_failed", { dataset: "mandi", error: (e as Error).message.split(key).join("[key]") });
    const prev = cache.get(ck);
    if (prev) return { ...prev.result, status: "ok" };
    cache.set(ck, { at: Date.now() - TTL_MS + 5 * 60 * 1000, result: { status: "unavailable", scope: null, items: [], fetchedAt: null, source: SOURCE } });
    return { status: "unavailable", scope: null, items: [], fetchedAt: null, source: SOURCE };
  }
}

export const _resetDatagovCache = () => cache.clear();
