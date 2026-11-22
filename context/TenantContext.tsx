import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
  emergencyServices: Array<{ id: string; name: string; type: string; phone: string; district?: string; geo?: Geo }>;
  policeStations: Array<{ id: string; name: string; district: string; phone: string; geo: Geo }>;
}

interface Ctx {
  ready: boolean;
  tenantId: string | null;
  tenant: TenantInfo | null;
  tenants: TenantSummary[];
  loadingTenants: boolean;
  error: string | null;
  selectState: (id: string) => Promise<void>;
  refreshTenants: () => Promise<void>;
  /** Display label, e.g. "Uttarakhand". Falls back to "your state" until loaded. */
  stateName: string;
  districtNames: string[];
}

const TenantContext = createContext<Ctx | null>(null);

async function getJson<T>(path: string, tenantId?: string | null): Promise<T> {
  const url = new URL(path, getApiUrl()).toString();
  const res = await fetch(url, { headers: tenantId ? { "X-Tenant": tenantId } : {} });
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

  const loadConfig = useCallback(async (id: string) => {
    try {
      const cfg = await getJson<{ tenant: TenantInfo }>("/api/public/config", id);
      if (cfg?.tenant) { setTenant(cfg.tenant); applyGeography(cfg.tenant); setError(null); }
    } catch (e) {
      setError("Could not load the state's settings. Check your connection.");
      if ((e as Error).message === "404") await setTenantId(null); // state removed on the server → pick again
    }
  }, []);

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
      if (id) await loadConfig(id);
      setReady(true);
    });
    return off;
  }, [loadConfig]);

  const selectState = useCallback(async (id: string) => {
    queryClient.clear();
    await setTenantId(id);
    await loadConfig(id);
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
