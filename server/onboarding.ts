import * as fs from "node:fs";
import * as path from "node:path";
import { parseTenantConfig, type TenantConfig } from "./tenancy";
import { CATEGORIES } from "./ai/prompts";

/** Department ids the SOS, police and disaster code paths depend on (review P7-2). */
export const REQUIRED_DEPARTMENTS = ["police", "usdma"] as const;
const fold = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * P7.1 tenant onboarding: CSV files → a complete, validated tenant config. Every problem is reported with its file
 * and row; nothing is written unless the config passes the same zod schema the server enforces at boot.
 */
export interface OnboardOptions {
  id: string; name: string; stateLabel: string; prefix: string; defaultDistrict: string; languages: string[];
  grievance: { name: string; email: string; phone: string; address: string }; nameLocal?: string; hosts?: string[]; fallbackDepartment?: string;
}

/** RFC 4180-ish CSV: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(field); field = ""; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else field += c;
  }
  row.push(field);
  if (row.some(x => x.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map(h => h.trim());
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

export class OnboardError extends Error { constructor(public problems: string[]) { super(problems.join("\n")); } }

export function buildTenantConfig(dir: string, o: OnboardOptions): TenantConfig {
  const problems: string[] = [];
  const read = (f: string, required = true) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) { if (required) problems.push(`${f}: file missing`); return []; }
    return parseCsv(fs.readFileSync(p, "utf8"));
  };
  const num = (f: string, i: number, k: string, v: string) => { const n = Number(v); if (v === "" || !Number.isFinite(n)) problems.push(`${f} row ${i + 2}: ${k} must be a number (got "${v}")`); return n; };

  const deps = read("departments.csv");
  const departments: TenantConfig["departments"] = {};
  const categoryDepartment: Record<string, string> = {};
  deps.forEach((d, i) => {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(d.id ?? "")) problems.push(`departments.csv row ${i + 2}: id must be lowercase letters/digits`);
    if (departments[d.id]) problems.push(`departments.csv row ${i + 2}: duplicate department id "${d.id}"`);
    const categories = (d.categories ?? "").split("|").map(c => c.trim()).filter(Boolean);
    for (const c of categories) if (!(CATEGORIES as readonly string[]).includes(c)) problems.push(`departments.csv row ${i + 2}: unknown category "${c}" (allowed: ${CATEGORIES.join(", ")})`);
    if (!(Number(d.slaHours) > 0)) problems.push(`departments.csv row ${i + 2}: slaHours must be greater than 0`);
    departments[d.id] = { id: d.id, name: d.name, nameHindi: d.nameLocal || d.name, icon: d.icon || "🏛️", color: d.color || "#64748B", helpline: d.helpline || "112", slaHours: num("departments.csv", i, "slaHours", d.slaHours), categories };
    for (const c of categories) {
      if (categoryDepartment[c]) problems.push(`departments.csv row ${i + 2}: category "${c}" already belongs to ${categoryDepartment[c]}`);
      categoryDepartment[c] = d.id;
    }
  });
  for (const r of REQUIRED_DEPARTMENTS) if (deps.length && !departments[r]) problems.push(`departments.csv: a department with id "${r}" is required (SOS and emergency routing use it)`);
  const districts = read("districts.csv").map((d, i) => ({ district: d.district.trim().replace(/\s+/g, " "), center: { lat: num("districts.csv", i, "lat", d.lat), lng: num("districts.csv", i, "lng", d.lng) } }));
  const seenD = new Map<string, number>();
  districts.forEach((d, i) => { const k = fold(d.district); if (seenD.has(k)) problems.push(`districts.csv row ${i + 2}: duplicate district "${d.district}" (row ${seenD.get(k)! + 2})`); else seenD.set(k, i); });
  const names = new Set(districts.map(d => d.district));
  if (!names.has(o.defaultDistrict)) problems.push(`--default-district "${o.defaultDistrict}" is not in districts.csv`);
  const wards = read("wards.csv").map((w, i) => {
    if (!names.has(w.district)) problems.push(`wards.csv row ${i + 2}: unknown district "${w.district}"`);
    return { name: w.name, number: num("wards.csv", i, "number", w.number), area: w.area, district: w.district, center: { lat: num("wards.csv", i, "lat", w.lat), lng: num("wards.csv", i, "lng", w.lng) }, pop: num("wards.csv", i, "pop", w.pop) };
  });
  const wardNums = new Map<string, number>();
  wards.forEach((w, i) => { const k = `${fold(w.district)}#${w.number}`; if (wardNums.has(k)) problems.push(`wards.csv row ${i + 2}: ward number ${w.number} repeats in ${w.district} (row ${wardNums.get(k)! + 2})`); else wardNums.set(k, i); });
  const wardNames = new Set(wards.map(w => fold(w.name)));
  const stationIds = new Set<string>();
  const policeStations = read("police_stations.csv").map((p, i) => {
    if (!names.has(p.district)) problems.push(`police_stations.csv row ${i + 2}: unknown district "${p.district}"`);
    if (stationIds.has(p.id)) problems.push(`police_stations.csv row ${i + 2}: duplicate id "${p.id}"`);
    stationIds.add(p.id);
    if (p.ward && !wardNames.has(fold(p.ward))) problems.push(`police_stations.csv row ${i + 2}: unknown ward "${p.ward}"`);
    return { id: p.id, name: p.name, address: p.address, phone: p.phone, geo: { lat: num("police_stations.csv", i, "lat", p.lat), lng: num("police_stations.csv", i, "lng", p.lng) }, ward: p.ward, district: p.district };
  });
  const emergencyServices = read("emergency_services.csv", false).map((e, i) => {
    if (!names.has(e.district)) problems.push(`emergency_services.csv row ${i + 2}: unknown district "${e.district}"`);
    return { id: e.id, type: e.type as "hospital", name: e.name, district: e.district, address: e.address, phone: e.phone, geo: { lat: num("emergency_services.csv", i, "lat", e.lat), lng: num("emergency_services.csv", i, "lng", e.lng) } };
  });
  if (!deps.length) problems.push("departments.csv: at least one department is required");
  if (!categoryDepartment.other) problems.push('departments.csv: some department must handle the "other" category');
  if (problems.length) throw new OnboardError(problems);

  const lats = districts.map(d => d.center.lat), lngs = districts.map(d => d.center.lng);
  const raw = {
    id: o.id, name: o.name, nameLocal: o.nameLocal, ticketPrefix: o.prefix, hosts: o.hosts ?? [], languages: o.languages,
    defaultDistrict: o.defaultDistrict, stateLabel: o.stateLabel,
    slaHours: { P1: 4, P2: 24, P3: 72, P4: 168 },
    mapBounds: { center: { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 }, zoom: 7,
      south: Math.min(...lats) - 0.5, west: Math.min(...lngs) - 0.5, north: Math.max(...lats) + 0.5, east: Math.max(...lngs) + 0.5 },
    helplines: { emergency: "112", ambulance: "108", women: "1090", disaster: "1070" },
    grievanceOfficer: o.grievance,
    retention: { complaintsDays: 1095, mediaDaysAfterClosure: 365, sosEvidenceDays: 365, needsLegalConfirmation: true, sosAudioDays: 5 },
    departments, categoryDepartment,
    categoryDepartmentLabel: Object.fromEntries(Object.entries(categoryDepartment).map(([c, d]) => [c, departments[d].name])),
    fallbackDepartment: o.fallbackDepartment ?? categoryDepartment.other,
    districts, wards, policeStations, emergencyServices,
    features: { autoCloseUnverifiedDays: null, neighbourConfirmation: false, disasterMode: false, yatraMode: false },
  };
  try { return parseTenantConfig(raw); } catch (err) { throw new OnboardError([(err as Error).message]); }
}
