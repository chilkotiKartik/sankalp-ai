import { tenant } from "../tenancy";
import type { DeptConfig } from "../types";

/**
 * Tenant-aware reference data (P1.8). Values come from config/tenants/<id>.json for the tenant bound to
 * the current request. The exported names are live views, so existing code keeps working:
 * `DEPARTMENTS.pwd`, `WARDS_DATA.filter(...)`, `DISTRICT_NAMES.includes(...)` all read the active tenant.
 */
function liveArray<T>(get: () => T[]): T[] {
  return new Proxy([] as T[], {
    get(_t, p) { const a = get(); const v = Reflect.get(a, p); return typeof v === "function" ? v.bind(a) : v; },
    has(_t, p) { return p in get(); },
    ownKeys() { return Reflect.ownKeys(get()); },
    getOwnPropertyDescriptor(_t, p) { const d = Reflect.getOwnPropertyDescriptor(get(), p); if (d && p !== "length") d.configurable = true; return d; },
  });
}

function liveObject<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_t, p) { return Reflect.get(get(), p); },
    has(_t, p) { return p in get(); },
    ownKeys() { return Reflect.ownKeys(get()); },
    getOwnPropertyDescriptor(_t, p) { const d = Reflect.getOwnPropertyDescriptor(get(), p); if (d) d.configurable = true; return d; },
  });
}

export const DEPARTMENTS: Record<string, DeptConfig> = liveObject(() => tenant().departments);
export const DISTRICTS_DATA = liveArray(() => tenant().districts);
export const WARDS_DATA = liveArray(() => tenant().wards);
export const POLICE_STATIONS = liveArray(() => tenant().policeStations);
export const EMERGENCY_SERVICES = liveArray(() => tenant().emergencyServices);
export const DISTRICT_NAMES: string[] = liveArray(() => tenant().districts.map(d => d.district));
export const SLA_HOURS: Record<string, number> = liveObject(() => tenant().slaHours);

export function getDeptIdForCategory(category: string): string {
  const t = tenant();
  return t.categoryDepartment[category] ?? t.fallbackDepartment;
}

/** Human-readable department label used on complaint records. */
export function assignDepartment(category: string): string {
  const t = tenant();
  return t.categoryDepartmentLabel[category] ?? t.departments[getDeptIdForCategory(category)]?.name ?? t.fallbackDepartment;
}

/** The state-wide pseudo-district ("Uttarakhand") meaning "all districts" for state-level users. */
export function stateLabel(): string {
  return tenant().stateLabel;
}

export function isStateWide(district: string | undefined): boolean {
  return !district || district === tenant().stateLabel || district === "all";
}

export function defaultDistrict(): string {
  return tenant().defaultDistrict;
}

export function isKnownDistrict(d: string): boolean {
  return tenant().districts.some(x => x.district === d);
}
