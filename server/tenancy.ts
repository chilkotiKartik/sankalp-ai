import { AsyncLocalStorage } from "node:async_hooks";
import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

/**
 * Multi-tenancy (P1.3) + tenant configuration (P1.8).
 * Each Indian state (or ULB) is a tenant described by config/tenants/<id>.json.
 * Isolation is structural: every tenant has its OWN store instance, so a request bound to tenant A
 * physically cannot read tenant B's rows. The active tenant travels with the request via AsyncLocalStorage.
 */
const geo = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export const TenantConfigSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  /** P9: "full" = districts/wards/stations imported; "state_level" = national defaults from config/states.json. */
  coverage: z.enum(["full", "state_level"]).default("full"),
  name: z.string().min(2),
  nameLocal: z.string().optional(),
  ticketPrefix: z.string().regex(/^[A-Z]{2,4}$/),
  hosts: z.array(z.string()).default([]),
  languages: z.array(z.string().min(2).max(5)).min(1),
  defaultDistrict: z.string(),
  stateLabel: z.string(),
  slaHours: z.record(z.string(), z.number().positive()),
  mapBounds: z.object({ center: geo, zoom: z.number(), south: z.number(), west: z.number(), north: z.number(), east: z.number() }),
  helplines: z.record(z.string(), z.string()),
  grievanceOfficer: z.object({ name: z.string(), email: z.string(), phone: z.string(), address: z.string() }),
  retention: z.object({ complaintsDays: z.number().int().positive(), mediaDaysAfterClosure: z.number().int().positive(), sosEvidenceDays: z.number().int().positive(), needsLegalConfirmation: z.boolean(),
    /** SOS voice clips are deleted this many days after recording unless under legal hold. */
    sosAudioDays: z.number().int().min(1).max(3650).default(5) }),
  departments: z.record(z.string(), z.object({
    id: z.string(), name: z.string(), nameHindi: z.string(), icon: z.string(), color: z.string(), helpline: z.string(),
    slaHours: z.number(), categories: z.array(z.string()),
  })),
  categoryDepartment: z.record(z.string(), z.string()),
  categoryDepartmentLabel: z.record(z.string(), z.string()),
  fallbackDepartment: z.string(),
  districts: z.array(z.object({ district: z.string(), center: geo })).min(1),
  wards: z.array(z.object({ name: z.string(), number: z.number().int(), area: z.string(), district: z.string(), center: geo, pop: z.number() })),
  policeStations: z.array(z.object({ id: z.string(), name: z.string(), address: z.string(), phone: z.string(), geo, ward: z.string(), district: z.string() })),
  emergencyServices: z.array(z.object({
    id: z.string(), type: z.enum(["police", "hospital", "fire", "ambulance", "disaster"]), name: z.string(), district: z.string(), address: z.string(),
    phone: z.string(), phone2: z.string().optional(), beds: z.number().optional(), available: z.boolean().optional(), geo,
  })),
  features: z.object({
    autoCloseUnverifiedDays: z.number().int().positive().nullable().default(null),
    neighbourConfirmation: z.boolean().default(false),
    disasterMode: z.boolean().default(false),
    yatraMode: z.boolean().default(false),
  }).default({ autoCloseUnverifiedDays: null, neighbourConfirmation: false, disasterMode: false, yatraMode: false }),
  privacy: z.object({
    noticeVersion: z.string().min(3),
    controller: z.string().min(3),
    processor: z.string().min(3),
    purposes: z.array(z.object({ id: z.string(), en: z.string(), hi: z.string() })).min(1),
  }).default({
    noticeVersion: "2026-11-v1",
    controller: "State Government (Data Fiduciary)",
    processor: "SANKALP AI platform operator (Data Processor)",
    purposes: [
      { id: "grievance", en: "Register, route and resolve your civic complaints", hi: "आपकी नागरिक शिकायतें दर्ज करना, सही विभाग को भेजना और हल करना" },
      { id: "safety", en: "Respond to SOS emergencies with your live location", hi: "आपकी लाइव लोकेशन के साथ SOS आपातकाल में मदद पहुँचाना" },
      { id: "updates", en: "Send you status updates about your complaints", hi: "आपकी शिकायतों की स्थिति की जानकारी भेजना" },
    ],
  }),
  verification: z.object({
    proofRadiusM: z.number().positive().default(50),
    weights: z.object({ geo: z.number(), reuse: z.number(), scene: z.number(), change: z.number(), citizen: z.number(), neighbour: z.number().default(0.1) })
      .default({ geo: 0.25, reuse: 0.2, scene: 0.15, change: 0.15, citizen: 0.25, neighbour: 0.1 }),
    verifiedThreshold: z.number().default(0.7),
    rejectThreshold: z.number().default(0.35),
    /** P3.5/P3.6 confirmation channels. */
    smsReminderAfterHours: z.number().nonnegative().default(2),
    voiceCallbackAfterHours: z.number().nonnegative().default(24),
    neighbourRadiusM: z.number().positive().default(200),
    neighbourMax: z.number().int().min(0).max(5).default(3),
  }).default({ proofRadiusM: 50, weights: { geo: 0.25, reuse: 0.2, scene: 0.15, change: 0.15, citizen: 0.25, neighbour: 0.1 }, verifiedThreshold: 0.7, rejectThreshold: 0.35,
    smsReminderAfterHours: 2, voiceCallbackAfterHours: 24, neighbourRadiusM: 200, neighbourMax: 3 }),
}).superRefine((t, ctx) => {
  const names = new Set(t.districts.map(d => d.district));
  if (!names.has(t.defaultDistrict)) ctx.addIssue({ code: "custom", message: `defaultDistrict ${t.defaultDistrict} is not in districts`, path: ["defaultDistrict"] });
  for (const [cat, dep] of Object.entries(t.categoryDepartment)) {
    if (!t.departments[dep]) ctx.addIssue({ code: "custom", message: `category ${cat} maps to unknown department ${dep}`, path: ["categoryDepartment", cat] });
  }
  if (!t.departments[t.fallbackDepartment]) ctx.addIssue({ code: "custom", message: "fallbackDepartment is not a department", path: ["fallbackDepartment"] });
  t.wards.forEach((w, i) => { if (!names.has(w.district)) ctx.addIssue({ code: "custom", message: `ward ${w.name} has unknown district ${w.district}`, path: ["wards", i] }); });
});

export type TenantConfig = z.infer<typeof TenantConfigSchema>;

const configs = new Map<string, TenantConfig>();
const als = new AsyncLocalStorage<string>();
let defaultTenantId = "uttarakhand";

export function parseTenantConfig(raw: unknown): TenantConfig {
  const r = TenantConfigSchema.safeParse(raw);
  if (!r.success) throw new Error(`Invalid tenant config: ${r.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  return r.data;
}

/** Load every config/tenants/*.json (validated). Called once at boot and by tests. */
export function loadTenants(dir = path.resolve(process.cwd(), "config", "tenants"), defaultId = process.env.DEFAULT_TENANT || "uttarakhand") {
  configs.clear();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
    const t = parseTenantConfig(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    if (`${t.id}.json` !== f) throw new Error(`Tenant file ${f} must be named ${t.id}.json`);
    configs.set(t.id, parseTenantConfig(withPlaces(t, loadPlaces(dir, t.id))));
  }
  // P9: every Indian state/UT is available. States without a full config run at state level from the registry.
  if (process.env.STATE_REGISTRY !== "off") {
    for (const r of loadRegistry(path.resolve(dir, "..", "states.json"))) {
      if (!configs.has(r.id)) configs.set(r.id, parseTenantConfig(withPlaces(stateLevelConfig(r) as TenantConfig, loadPlaces(dir, r.id))));
    }
  }
  if (!configs.has(defaultId)) throw new Error(`DEFAULT_TENANT ${defaultId} has no config file`);
  defaultTenantId = defaultId;
}

// ── P9.14 police stations, hospitals, fire stations (config/places/<id>.json, built by scripts/build-places.py) ──
type Places = Pick<TenantConfig, "policeStations" | "emergencyServices">;
function loadPlaces(dir: string, id: string): Places | null {
  const f = path.resolve(dir, "..", "places", `${id}.json`);
  if (!fs.existsSync(f)) return null;
  const p = JSON.parse(fs.readFileSync(f, "utf8")) as Partial<Places>;
  return { policeStations: p.policeStations ?? [], emergencyServices: p.emergencyServices ?? [] };
}
/** Keep a state's own hand-entered entries (they carry direct phone numbers) and add mapped ones that are not duplicates (>150 m away). */
function withPlaces<T extends Places>(t: T, p: Places | null): T {
  if (!p) return t;
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.abs(a.lat - b.lat) < 0.00135 && Math.abs(a.lng - b.lng) < 0.0015;
  const districts = new Set((t as unknown as TenantConfig).districts?.map(d => d.district) ?? []);
  const ok = (d: string) => !districts.size || districts.has(d);
  const police = [...t.policeStations, ...p.policeStations.filter(x => ok(x.district) && !t.policeStations.some(o => near(o.geo, x.geo)))];
  const services = [...t.emergencyServices, ...p.emergencyServices.filter(x => ok(x.district) && !t.emergencyServices.some(o => o.type === x.type && near(o.geo, x.geo)))];
  return { ...t, policeStations: police, emergencyServices: services };
}

/** Register (or replace) a tenant at runtime — used by the onboarding wizard (P7.1) and tests. */
export function registerTenant(t: TenantConfig) {
  configs.set(t.id, parseTenantConfig(t));
}

export function tenantIds(): string[] {
  ensureLoaded();
  return [...configs.keys()];
}

function ensureLoaded() {
  if (!configs.size) loadTenants();
}

export function defaultTenant(): string {
  ensureLoaded();
  return defaultTenantId;
}

export function currentTenantId(): string {
  ensureLoaded();
  return als.getStore() ?? defaultTenantId;
}

export function tenant(id = currentTenantId()): TenantConfig {
  ensureLoaded();
  const t = configs.get(id);
  if (!t) throw new Error(`Unknown tenant ${id}`);
  return t;
}

export function hasTenant(id: string): boolean {
  ensureLoaded();
  return configs.has(id);
}

export function runInTenant<T>(id: string, fn: () => T): T {
  if (!hasTenant(id)) throw new Error(`Unknown tenant ${id}`);
  return als.run(id, fn);
}

/** Resolve tenant from X-Tenant header, then Host, then the default. Unknown explicit tenants → null (404). */
export function resolveTenantFromRequest(headerValue: string | undefined, host: string | undefined): string | null {
  ensureLoaded();
  if (headerValue) return configs.has(headerValue) ? headerValue : null;
  const h = (host || "").split(":")[0].toLowerCase();
  for (const t of configs.values()) if (t.hosts.includes(h)) return t.id;
  return defaultTenantId;
}

// ── P9 national state registry ─────────────────────────────────────────────────────────────────────────────
export interface RegistryState {
  id: string; name: string; nameLocal: string; type: "state" | "ut"; capital: string; capitalGeo: { lat: number; lng: number };
  ticketPrefix: string; languages: string[]; bounds: { south: number; west: number; north: number; east: number };
  /** Every district with its centre (config/states.json, built by scripts/build-geo.py). */
  districts?: { name: string; center: { lat: number; lng: number } }[];
}
let registry: RegistryState[] = [];
export function loadRegistry(file: string): RegistryState[] {
  registry = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as { states: RegistryState[] }).states : [];
  return registry;
}
export const stateRegistry = () => registry;

/** National default departments: every complaint category has an owner in every state. */
const NATIONAL_DEPARTMENTS = {
  pwd: { id: "pwd", name: "Public Works Department", nameHindi: "लोक निर्माण विभाग", icon: "🏗️", color: "#F59E0B", helpline: "", slaHours: 48, categories: ["pothole", "road_damage", "other"] },
  ulb: { id: "ulb", name: "Municipal Corporation / Urban Local Body", nameHindi: "नगर निकाय", icon: "🏙️", color: "#10B981", helpline: "", slaHours: 24, categories: ["garbage", "drain", "sewage"] },
  water: { id: "water", name: "Water Supply Department", nameHindi: "जल आपूर्ति विभाग", icon: "💧", color: "#3B82F6", helpline: "", slaHours: 24, categories: ["water"] },
  power: { id: "power", name: "Electricity Distribution Company", nameHindi: "विद्युत वितरण", icon: "⚡", color: "#8B5CF6", helpline: "1912", slaHours: 12, categories: ["electricity", "streetlight", "transformer"] },
  forest: { id: "forest", name: "Forest Department", nameHindi: "वन विभाग", icon: "🌳", color: "#16A34A", helpline: "", slaHours: 72, categories: ["tree"] },
  health: { id: "health", name: "Health Department", nameHindi: "स्वास्थ्य विभाग", icon: "🏥", color: "#EF4444", helpline: "104", slaHours: 24, categories: ["health_hazard"] },
  usdma: { id: "usdma", name: "State Disaster Management Authority", nameHindi: "राज्य आपदा प्रबंधन प्राधिकरण", icon: "🆘", color: "#DC2626", helpline: "1070", slaHours: 6, categories: ["disaster"] },
  police: { id: "police", name: "Police", nameHindi: "पुलिस", icon: "🚔", color: "#1D4ED8", helpline: "112", slaHours: 24, categories: ["noise"] },
};

export const OTHER_DISTRICTS = "Other districts";

/** State-level config for a registry state: real national facts only; districts/wards/stations await an import. */
export function stateLevelConfig(r: RegistryState): unknown {
  const categoryDepartment: Record<string, string> = {};
  for (const d of Object.values(NATIONAL_DEPARTMENTS)) for (const c of d.categories) categoryDepartment[c] = d.id;
  const centre = { lat: (r.bounds.south + r.bounds.north) / 2, lng: (r.bounds.west + r.bounds.east) / 2 };
  const span = Math.max(r.bounds.north - r.bounds.south, r.bounds.east - r.bounds.west);
  // P9.2: the state's real districts; a registry entry without them falls back to capital + "Other districts".
  const dists = r.districts?.length ? r.districts.map(d => ({ district: d.name, center: d.center }))
    : [{ district: r.capital, center: r.capitalGeo }, { district: OTHER_DISTRICTS, center: centre }];
  const d2 = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
  const home = dists.find(d => d.district.toLowerCase() === r.capital.toLowerCase())
    ?? [...dists].sort((a, b) => d2(a.center, r.capitalGeo) - d2(b.center, r.capitalGeo))[0];
  return {
    id: r.id, name: r.name, nameLocal: r.nameLocal, ticketPrefix: r.ticketPrefix, hosts: [], languages: r.languages.includes("hi") || r.languages.includes("en") ? r.languages : [...r.languages, "en"],
    defaultDistrict: home.district, stateLabel: r.name, coverage: "state_level",
    slaHours: { P1: 4, P2: 24, P3: 72, P4: 168 },
    mapBounds: { center: centre, zoom: span > 6 ? 6 : span > 3 ? 7 : span > 1 ? 8 : 10, ...r.bounds },
    helplines: { emergency: "112", ambulance: "108", women: "181", disaster: "1070", child: "1098", electricity: "1912" },
    grievanceOfficer: { name: "To be designated by the State", email: "", phone: "", address: r.capital },
    retention: { complaintsDays: 1095, mediaDaysAfterClosure: 365, sosEvidenceDays: 365, needsLegalConfirmation: true, sosAudioDays: 5 },
    departments: NATIONAL_DEPARTMENTS, categoryDepartment,
    categoryDepartmentLabel: Object.fromEntries(Object.entries(categoryDepartment).map(([c, d]) => [c, NATIONAL_DEPARTMENTS[d as keyof typeof NATIONAL_DEPARTMENTS].name])),
    fallbackDepartment: "pwd",
    districts: dists,
    // One service area per district until ward/ULB boundaries are imported for the state.
    wards: dists.map((d, i) => ({ name: `${d.district} (district)`, number: i + 1, area: d.district, district: d.district, center: d.center, pop: 0 })),
    policeStations: [], emergencyServices: [],
    features: { autoCloseUnverifiedDays: null, neighbourConfirmation: false, disasterMode: true, yatraMode: false },
  };
}
