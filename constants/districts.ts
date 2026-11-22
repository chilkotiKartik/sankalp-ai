/**
 * P9: district geography of the SELECTED state, filled at runtime from /api/public/config by TenantContext.
 * No state is hard-coded: until a state is chosen these are empty and callers fall back to the state centre.
 */
export interface DistrictCenter { lat: number; lng: number; zoom: number }

let centers: Record<string, DistrictCenter> = {};
let stateCenter: DistrictCenter = { lat: 22.9734, lng: 78.6569, zoom: 5 }; // centre of India until a state is selected
let stateLabel = "";

export function setStateGeography(g: { stateLabel: string; center: { lat: number; lng: number }; zoom: number; districts: Array<{ name: string; center: { lat: number; lng: number } }> }) {
  stateLabel = g.stateLabel;
  stateCenter = { lat: g.center.lat, lng: g.center.lng, zoom: g.zoom };
  centers = Object.fromEntries(g.districts.map(d => [d.name, { lat: d.center.lat, lng: d.center.lng, zoom: 11 }]));
}

export const getStateCenter = (): DistrictCenter => stateCenter;
export const getStateLabel = () => stateLabel;
export const allDistricts = (): string[] => Object.keys(centers);
export const districtCenters = (): Record<string, DistrictCenter> => centers;

export function getDistrictCenter(district?: string | null): { lat: number; lng: number } {
  const d = (district && centers[district]) || stateCenter;
  return { lat: d.lat, lng: d.lng };
}

export function getDistrictCenterFull(district?: string | null): DistrictCenter {
  return (district && centers[district]) || stateCenter;
}

/** Display name of the selected state for UI text ("your state" before one is chosen). */
export const stateName = () => stateLabel || "your state";
/** "13 districts" style phrase from live data; empty when unknown. */
export const districtPhrase = () => { const n = Object.keys(centers).filter(d => d !== "Other districts").length; return n > 1 ? `${n} districts` : "every district"; };

// ── Departments of the selected state (from /api/public/config) ──
export interface StateDept { id: string; name: string; categories: string[]; helpline?: string; color?: string; icon?: string }
let depts: StateDept[] = [];
export const setStateDepartments = (d: StateDept[]) => { depts = d; };
export const stateDepartments = () => depts;
/** Owner department for a complaint category: short label ("PWD") and full name, from the state's own config. */
export function deptForCategory(category: string): { id: string; short: string; name: string } {
  const d = depts.find(x => x.categories.includes(category)) ?? depts.find(x => x.categories.includes("other"));
  if (!d) return { id: "", short: "Dept", name: "Concerned department" };
  const [head, tail] = d.name.split(" — ");
  return { id: d.id, short: tail ? head : d.id.toUpperCase(), name: tail ?? d.name };
}

// ── Name in the local script and languages of the selected state ──
let meta: { nameLocal: string; languages: string[] } = { nameLocal: "", languages: [] };
export const setStateMeta = (m: { nameLocal?: string; languages?: string[] }) => { meta = { nameLocal: m.nameLocal ?? "", languages: m.languages ?? [] }; };
/** Local-script name for Indic UI text; falls back to the English name. */
export const stateNameLocal = () => meta.nameLocal || stateName();
export const stateLanguages = () => meta.languages;
