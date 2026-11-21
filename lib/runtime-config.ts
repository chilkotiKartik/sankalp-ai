import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/query-client";

/** Server-provided runtime configuration (demo badge, map tiles, AI mode). Fetched once and cached. */
export interface RuntimeConfig {
  demoMode: boolean;
  mapTileUrl: string | null;
  ai?: { text: string; vision: string };
}

let cached: RuntimeConfig | null = null;
let inflight: Promise<RuntimeConfig> | null = null;

export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return Promise.resolve(cached);
  inflight ??= fetch(`${getApiUrl()}api/public/config`)
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((c: RuntimeConfig) => (cached = { demoMode: !!c.demoMode, mapTileUrl: c.mapTileUrl ?? null, ai: c.ai }))
    .catch(() => { inflight = null; return { demoMode: false, mapTileUrl: null }; });
  return inflight;
}

export function useRuntimeConfig(): RuntimeConfig | null {
  const [cfg, setCfg] = useState<RuntimeConfig | null>(cached);
  useEffect(() => {
    let alive = true;
    loadRuntimeConfig().then(c => { if (alive) setCfg(c); });
    return () => { alive = false; };
  }, []);
  return cfg;
}
