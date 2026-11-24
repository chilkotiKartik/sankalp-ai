import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { getTenantId, loadTenantId, setTenantId, onTenantChange, installTenantFetch } from "@/lib/tenant";
import { setStateGeography, setStateDepartments, setStateMeta } from "@/constants/districts";

/**
 * P9 tenant context. Everything state-specific shown by the app (state name, districts, map area, departments,
 * helplines, police stations) comes from GET /api/public/config of the selected state. Nothing is hard-coded.
 */
installTenantFetch();

export interface TenantSummary {
  id: string; name: string; nameLocal: string; type: "state" | "ut"; coverage: "full" | "state_level";
  capital: string; center: { lat: number; lng: number }; bounds?: { south: number; west: number; north: number; east: number }; languages: string[]; ticketPrefix: string; districtCount?: number;
}
export interface Geo { lat: number; lng: number }
export interface TenantDept { id: string; name: string; nameLocal?: string; icon: string; color: string; helpline: string; categories: string[] }
export interface TenantInfo {
  id: string; name: string; nameLocal: string; stateLabel: string; coverage: "full" | "state_level"; ticketPrefix: string;
  languages: string[]; helplines: Record<string, string>;
  mapBounds: { center: Geo; zoom: number; south?: number; west?: number; north?: number; east?: number };
  grievanceOfficer?: { name: string; email?: string; phone?: string };
  features?: Record<string, boolean>;
  defaultDistrict: string;
  districts: Array<{ name: string; center: Geo }>;
  departments: TenantDept[];
  /** How many stations/services the state has; screens fetch the nearest or their district's from the API. */
  counts?: { policeStations: number; hospitals: number; fireStations: number };
}

interface Ctx {
  ready: boolean;
  tenantId: string | null;
  tenant: TenantInfo | null;
  tenants: TenantSummary[];
  loadingTenants: boolean;
  error: string | null;
  selectState: (id: string) => Promise<boolean>;
  refreshTenants: () => Promise<void>;
  /** Display label, e.g. "Uttarakhand". Falls back to "your state" until loaded. */
  stateName: string;
  districtNames: string[];
}

const TenantContext = createContext<Ctx | null>(null);

const CFG_KEY = "sankalp_state_cfg_";

async function getJson<T>(path: string, tenantId?: string | null): Promise<T> {
  const url = new URL(path, getApiUrl()).toString();
  const res = await fetchWithTimeout(url, { headers: tenantId ? { "X-Tenant": tenantId } : {} });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

function applyGeography(t: TenantInfo) {
  setStateGeography({
    stateLabel: t.stateLabel || t.name,
    center: t.mapBounds?.center ?? t.districts[0]?.center,
    zoom: t.mapBounds?.zoom ?? 7,
    districts: t.districts,
  });
  setStateDepartments(t.departments);
  setStateMeta({ nameLocal: t.nameLocal, languages: t.languages });
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [tenantId, setId] = useState<string | null>(getTenantId());
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((t: TenantInfo) => { setTenant(t); applyGeography(t); }, []);

  /** Loads the state's config; the last good copy is cached so an offline launch still has districts and departments. */
  const loadConfig = useCallback(async (id: string): Promise<boolean> => {
    try {
      const cfg = await getJson<{ tenant: TenantInfo }>("/api/public/config", id);
      if (!cfg?.tenant) throw new Error("no tenant");
      apply(cfg.tenant); setError(null);
      AsyncStorage.setItem(`${CFG_KEY}${id}`, JSON.stringify(cfg.tenant)).catch(() => {});
      return true;
    } catch (e) {
      if ((e as Error).message === "404") { await setTenantId(null); setTenant(null); return false; } // state removed → pick again
      try {
        const cached = await AsyncStorage.getItem(`${CFG_KEY}${id}`);
        if (cached) { apply(JSON.parse(cached) as TenantInfo); return true; }
      } catch { /* fall through */ }
      setError("Could not load the state's settings. Check your connection.");
      return false;
    }
  }, [apply]);

  const refreshTenants = useCallback(async () => {
    setLoadingTenants(true);
    try { setTenants(await getJson<TenantSummary[]>("/api/public/tenants")); setError(null); }
    catch (e) {
      setError((e as Error).message === "404"
        ? "This server has not been updated for all-India state selection yet. Please try again after the update."
        : "Could not load the list of states. Check your connection.");
    }
    finally { setLoadingTenants(false); }
  }, []);

  useEffect(() => {
    const off = onTenantChange(id => setId(id));
    loadTenantId().then(async id => {
      // Migration: an install signed in before state selection existed belongs to the server's default state.
      if (!id && (await AsyncStorage.getItem("@sankalp_user").catch(() => null))) {
        try {
          const cfg = await getJson<{ tenant?: { id: string } }>("/api/public/config");
          if (cfg.tenant?.id) { await setTenantId(cfg.tenant.id); id = cfg.tenant.id; }
        } catch { /* offline: the picker will ask */ }
      }
      if (id) await loadConfig(id);
      setReady(true);
    });
    return off;
  }, [loadConfig]);

  // Retry when the app comes back to the foreground if the config is still missing (e.g. launched offline).
  useEffect(() => {
    const sub = AppState.addEventListener("change", st => {
      const id = getTenantId();
      if (st === "active" && id && (!tenant || tenant.id !== id)) loadConfig(id);
    });
    return () => sub.remove();
  }, [tenant, loadConfig]);

  const selectState = useCallback(async (id: string): Promise<boolean> => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await setTenantId(id);
    const ok = await loadConfig(id);
    queryClient.clear(); // anything that resolved during the switch belonged to the previous state
    return ok;
  }, [loadConfig]);

  const value = useMemo<Ctx>(() => ({
    ready, tenantId, tenant, tenants, loadingTenants, error, selectState, refreshTenants,
    stateName: tenant?.stateLabel || tenant?.name || "your state",
    districtNames: tenant?.districts.map(d => d.name) ?? [],
  }), [ready, tenantId, tenant, tenants, loadingTenants, error, selectState, refreshTenants]);

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): Ctx {
  const c = useContext(TenantContext);
  if (!c) throw new Error("useTenant must be used inside TenantProvider");
  return c;
}

/** Helpline lookup with national fallbacks (112 is the national emergency number in every state). */
export function useHelpline(kind: string): string {
  const { tenant } = useTenant();
  const national: Record<string, string> = { emergency: "112", police: "112", ambulance: "108", women: "181", fire: "101", disaster: "1070", child: "1098", electricity: "1912" };
  return tenant?.helplines?.[kind] || national[kind] || "112";
}
