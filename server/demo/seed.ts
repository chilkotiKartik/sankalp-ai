import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { config } from "../config";
import { tenant } from "../tenancy";
import { getDeptIdForCategory, type AppStorage, type ComplaintCategory, type AppUser, type Priority } from "../storage";
import { randomUUID as genId } from "node:crypto";
import {
  WORKER_NAMES, COMPLAINT_DESCS, LOCATIONS_PREFIX, PATROL_VANS_SEED, demoAnnouncements, demoPolls, demoPetitions, demoEvents,
  DEMO_BUDGET, DEMO_BUDGET_SCALE, demoRTIs,
} from "./content";

/**
 * D-062: demo data ADDED to a running state's store (nothing real is touched or removed). DEMO_MODE only.
 * Every record is flagged isDemo, so turning DEMO_MODE off removes exactly this (server/index.ts purge).
 * Uttarakhand uses the hand-written demo content; every other state gets neutral text built from its own districts.
 */
const UK_PLACES = /Uttarakhand|Dehradun|Haridwar|Rishikesh|Nainital|Naini|Mussoorie|Ganga|Kedarnath|Badrinath|Char Dham|Rajpur|Sahastradhara|Garhwal|Kumaon|Almora|Uttarkashi|Rudraprayag|Agastmuni|Chamoli|Pithoragarh|Tehri|Har Ki Pauri|Jwalapur|Doon/i;

export async function addDemoData(store: AppStorage, pin: string): Promise<{ accounts: Record<string, string> }> {
  if (!config().DEMO_MODE) throw new Error("demo data is only allowed when DEMO_MODE=true");
  const t = tenant();
  const isUK = t.id === "uttarakhand";
  const pick = <T,>(a: readonly T[]) => a[randomInt(a.length)];
  const wards = t.wards.length ? t.wards : t.districts.map((d, i) => ({ name: `${d.district} (district)`, number: i + 1, area: d.district, district: d.district, center: d.center, pop: 0 }));
  const home = t.defaultDistrict && t.districts.some(d => d.district === t.defaultDistrict) ? t.defaultDistrict : t.districts[0].district;
  const homeWards = wards.filter(w => w.district === home);
  const dists = t.districts.map(d => d.district);
  const d = (i: number) => dists[i % dists.length];
  const hash = await bcrypt.hash(pin, 10);
  const phoneTaken = async (p: string) => !!(await store.findUserByPhone(p));

  const mkUser = async (name: string, phone: string, role: AppUser["role"], district: string, points = 0) => {
    const existing = await store.findUserByPhone(phone);
    if (existing) return existing;
    return store.createUser({ name, phone, pin: hash, role, district, points, badges: role === "citizen" ? ["first_report"] : [], level: 1, isDemo: true });
  };
  const citizen = await mkUser("Asha (Demo Citizen)", "9000000001", "citizen", home, 120);
  const admin = await mkUser(`${home} Admin (Demo)`, "9000000002", "admin", home);
  await mkUser("State Admin (Demo)", "9000000003", "super_admin", t.stateLabel);
  const worker = await mkUser("Ramesh (Demo Worker)", "9000000004", "worker", home);
  const others: AppUser[] = [];
  for (let i = 0; i < 12; i++) others.push(await mkUser(`Demo Citizen ${i + 1}`, `90000001${String(i).padStart(2, "0")}`, "citizen", wards[i % wards.length].district));

  // Complaints moved through the real state machine; about 60% closed with citizen confirmation.
  const cats = Object.keys(COMPLAINT_DESCS) as ComplaintCategory[];
  const descFor = (c: ComplaintCategory) => {
    const ok = isUK ? COMPLAINT_DESCS[c] : COMPLAINT_DESCS[c].filter(x => !UK_PLACES.test(x));
    return ok.length ? pick(ok) : `Residents report a ${c.replace(/_/g, " ")} problem that needs attention`;
  };
  // Demo proof photos are placeholders: record the photo check as passed (the real check runs only for real uploads).
  const passProof = (id: string) => {
    const c = store.s.complaints.find(x => x.id === id);
    if (!c) return;
    c.verificationPending = false;
    c.verification = { engineVersion: "demo", signals: [], flags: [], score: 1, coverage: 1, decision: "VERIFIED", at: new Date().toISOString() };
  };
  const n = isUK ? 140 : 90;
  for (let i = 0; i < n; i++) {
    const ward = i < 6 && homeWards.length ? homeWards[i % homeWards.length] : pick(wards);
    const owner = i < 6 ? citizen : pick(others);
    const category = pick(cats);
    const geo = { lat: +(ward.center.lat + (Math.random() - 0.5) * 0.04).toFixed(5), lng: +(ward.center.lng + (Math.random() - 0.5) * 0.04).toFixed(5) };
    const priority: Priority = pick(["P1", "P2", "P2", "P3", "P3", "P3", "P3", "P4", "P4", "P4"] as const);
    const cmp = store.createComplaint({ category, description: descFor(category), location: `${pick(LOCATIONS_PREFIX.filter(l => isUK || !/NH-58|Forest Range/.test(l)))}, ${ward.name}`,
      geo, ward: ward.name, wardNumber: ward.number, district: ward.district, priority, isDemo: true,
      aiRouting: { method: "rules:category→department", department: getDeptIdForCategory(category), confidence: 0.6, reason: "demo data" }, photoReview: "not_required" }, owner);
    cmp.submittedAt = new Date(Date.now() - randomInt(1, 24 * 40) * 3600000).toISOString();
    const roll = Math.random();
    if (roll > 0.12) store.startWork(cmp.id, "officer", admin.id);
    if (roll > 0.25) { store.submitProof(cmp.id, { photoUrl: "/assets/images/icon.png", note: "Demo proof" }, "officer", admin.id); passProof(cmp.id); }
    if (roll > 0.38) store.citizenConfirm(cmp.id, cmp.userId!, randomInt(3, 6), "Demo confirmation");
    else if (roll > 0.33) store.citizenReject(cmp.id, cmp.userId!, "Demo rejection");
    if (cmp.resolvedAt) cmp.resolvedAt = new Date(new Date(cmp.submittedAt).getTime() + randomInt(4, 96) * 3600000).toISOString();
    cmp.upvotes = randomInt(0, 40);
  }

  // The demo citizen's own area: mostly fixed and confirmed, like a working city (feeds the home health score).
  for (let i = 0; i < 14; i++) {
    const ward = homeWards.length ? homeWards[i % homeWards.length] : wards[0];
    const category = pick(cats);
    const cmp = store.createComplaint({ category, description: descFor(category), location: `${pick(LOCATIONS_PREFIX)}, ${ward.name}`,
      geo: { lat: +(ward.center.lat + (Math.random() - 0.5) * 0.03).toFixed(5), lng: +(ward.center.lng + (Math.random() - 0.5) * 0.03).toFixed(5) },
      ward: ward.name, wardNumber: ward.number, district: ward.district, priority: pick(["P2", "P3", "P3", "P4"] as const), isDemo: true,
      aiRouting: { method: "rules:category→department", department: getDeptIdForCategory(category), confidence: 0.6, reason: "demo data" }, photoReview: "not_required" }, pick(others));
    cmp.submittedAt = new Date(Date.now() - randomInt(24, 24 * 30) * 3600000).toISOString();
    store.startWork(cmp.id, "officer", admin.id);
    store.submitProof(cmp.id, { photoUrl: "/assets/images/icon.png", note: "Demo proof" }, "officer", admin.id);
    passProof(cmp.id);
    if (i < 12) store.citizenConfirm(cmp.id, cmp.userId!, randomInt(4, 6), "Demo confirmation");
    if (cmp.resolvedAt) cmp.resolvedAt = new Date(new Date(cmp.submittedAt).getTime() + randomInt(6, 72) * 3600000).toISOString();
  }

  // Field workers (names only, demo) and one live worker position.
  WORKER_NAMES.slice(0, 18).forEach((name, i) => {
    const ward = wards[i % wards.length];
    store.s.workers.push({ id: `demo-w-${t.id}-${i}`, isDemo: true, name: `${name} (Demo)`, phone: `90000002${String(i).padStart(2, "0")}`, ward: ward.name, wardNumber: ward.number,
      district: ward.district, score: randomInt(55, 98), resolvedToday: randomInt(0, 6), totalResolved: randomInt(20, 300), avgRating: +(3 + Math.random() * 2).toFixed(1),
      status: i % 5 === 4 ? "idle" : "active", currentTask: i % 3 ? "Road repair" : undefined,
      geo: { lat: ward.center.lat + (Math.random() - 0.5) * 0.02, lng: ward.center.lng + (Math.random() - 0.5) * 0.02 } } as (typeof store.s.workers)[number]);
  });
  const hc = (homeWards[0] ?? wards[0]).center;
  store.reportWorkerLocation(worker, { lat: hc.lat + 0.004, lng: hc.lng + 0.004 }, "active", "Pothole repair (demo)");

  // Police patrol vans.
  if (isUK) store.s.patrolVans.push(...PATROL_VANS_SEED.map(v => ({ ...v, id: `demo-${v.id}` })));
  else PATROL_VANS_SEED.slice(0, 4).forEach((v, i) => {
    const w = wards[i % wards.length];
    store.s.patrolVans.push({ ...v, id: `demo-pv-${t.id}-${i}`, vanNumber: `${t.ticketPrefix}-PCR-00${i + 1} (Demo)`, officerInCharge: `SI Demo Officer ${i + 1}`,
      district: w.district, zone: `${w.district} patrol zone`, geo: { lat: w.center.lat + 0.01 * i, lng: w.center.lng - 0.01 * i } });
  });

  // Community: announcements, polls, petitions, events (state-neutral text outside Uttarakhand).
  const ann = demoAnnouncements();
  if (isUK) ann.forEach(a => store.createAnnouncement({ ...a, postedBy: `${a.postedBy} (Demo)`, isDemo: true }));
  else {
    const generic: [string, string, string, string][] = [
      ["Water supply maintenance — " + d(0), `Water supply in parts of ${d(0)} will be reduced on Saturday from 10 AM to 4 PM for pipeline maintenance. Store water in advance.`, "maintenance", "important"],
      ["Pothole repair drive across " + t.name, `Road teams are repairing reported potholes across ${t.name}. Report new ones in the app with a photo; you can track each repair.`, "scheme", "normal"],
      ["Heavy traffic diversion — " + d(1), `Traffic will be diverted near the main market in ${d(1)} for drain cleaning this week. Use alternate routes.`, "emergency", "urgent"],
      ["Free health camp — " + d(2), `Free BP, sugar and eye check-up at the district hospital, ${d(2)}, this Sunday 9 AM – 2 PM.`, "welfare", "normal"],
      ["Streetlight survey — report dark spots", `Help make ${t.name} safer: mark dark streets in the app. Teams fix reported lights within 72 hours.`, "scheme", "important"],
      ["Garbage collection timing change — " + d(0), `Door-to-door collection in ${d(0)} now starts at 7 AM. Keep wet and dry waste separate.`, "general", "normal"],
    ];
    generic.forEach(([title, body, type, priority], i) => store.createAnnouncement({ ...ann[i % ann.length], title, body, department: `${t.name} Civic Administration (Demo)`,
      postedBy: "Administrator (Demo)", targetDistrict: "all", type: type as never, priority: priority as never, isDemo: true }));
  }
  const polls = demoPolls();
  (isUK ? polls : [polls[1], polls[3], { ...polls[2], district: d(1) }, { ...polls[0], question: `Which area needs urgent road repair in ${d(0)}?`, options: ["Main Market Road", "Station Road", "Ring Road", "Hospital Road"], district: d(0) }])
    .forEach(p => store.createPoll({ ...p, isDemo: true }));
  const pets = demoPetitions();
  (isUK ? pets : [
    { ...pets[0], title: `Install speed breakers near the government school, ${home}`, description: `Children's safety is at risk from speeding vehicles near the government school in ${home}. We ask for speed breakers and zebra crossings.`, district: home },
    { ...pets[1], title: `Fix broken street lights on the main road, ${d(1)}`, description: `Many street lights on the main road in ${d(1)} have not worked for months, making it unsafe at night.`, district: undefined },
    { ...pets[3], title: `Ban single-use plastic in ${d(2)} market`, description: `Plastic waste is choking drains in ${d(2)} market. We urge strict enforcement of the plastic ban.`, district: undefined },
  ]).forEach(p => store.createPetition({ ...p, isDemo: true }));
  const evs = demoEvents();
  (isUK ? evs : [
    { ...evs[0], title: `Free Health Camp — ${d(2)}`, location: `District Hospital, ${d(2)}`, district: d(2), organizer: `${t.name} Health Department (Demo)` },
    { ...evs[1], title: `Ward Committee Meeting — ${d(0)}`, location: `Ward Office, ${d(0)}`, district: d(0), organizer: `${d(0)} Administration (Demo)` },
    { ...evs[2], title: `Cleanliness Drive — ${d(1)}`, description: "Join neighbours to clean streets, parks and drains. Gloves and bags provided. All age groups welcome.", location: `Central Park, ${d(1)}`, district: d(1), organizer: "Municipal Corporation (Demo)" },
    { ...evs[5], organizer: `${t.name} Administration (Demo)` },
  ]).forEach(e => { const { rsvpIds, createdAt, ...rest } = e as typeof e & { rsvpIds?: string[]; createdAt?: string }; void createdAt; const ev = store.createEvent({ ...rest, isDemo: true } as never); if (rsvpIds) ev.rsvpIds = rsvpIds; });

  // Ward budget (demo figures) and one RTI for the demo citizen.
  const scales = isUK ? DEMO_BUDGET_SCALE : Object.fromEntries(dists.map((x, i) => [x, { alloc: 1.4 - (i % 8) * 0.1, spent: 1.25 - (i % 8) * 0.1 }]));
  for (const b of DEMO_BUDGET) for (const [district, scale] of Object.entries(scales)) {
    store.s.budgetItems.push({ id: `demo-b-${t.id}-${b.department}-${district}`.replace(/\s/g, "_"), ...b, district, year: 2025, isDemo: true,
      allocated: Math.round(b.allocated * scale.alloc), spent: Math.round(b.spent * scale.spent) } as (typeof store.s.budgetItems)[number]);
  }
  demoRTIs().forEach(r => store.s.rtis.push({ ...r, ...(isUK ? {} : { ticketId: `RTI-${t.ticketPrefix}-${randomInt(10000, 99999)}`, subject: `Status of road repair work in ${home}`,
    description: `I request information on the status, budget and contractor of road repair work sanctioned in ${home} this financial year.` }), id: `demo-rti-${genId()}`, filedByPhone: citizen.phone, filedBy: citizen.name, isDemo: true } as (typeof store.s.rtis)[number]));

  // Police control room: SOS cases at different stages (active, police responding, safe).
  const sosWards = (homeWards.length ? homeWards : wards).slice(0, 6);
  for (let i = 0; i < 6; i++) {
    const ward = sosWards[i % sosWards.length];
    const who = others[i % others.length];
    const women = i % 2 === 0;
    const g = { lat: +(ward.center.lat + i * 0.003).toFixed(5), lng: +(ward.center.lng - i * 0.003).toFixed(5) };
    const { alert } = store.createSos({
      category: women ? "women_safety" : (["medical", "accident", "fire"] as const)[i % 3],
      description: women ? "PANIC SOS — Women Safety Emergency (demo)" : "Emergency reported via SANKALP AI (demo)",
      location: `${pick(LOCATIONS_PREFIX)}, ${ward.name}`, geo: g, ward: ward.name, wardNumber: ward.number, district: ward.district,
      status: "active", triggeredBy: who.name, triggeredByPhone: who.phone, isWomenSafety: women, isDemo: true,
    } as Parameters<typeof store.createSos>[0], who.id);
    alert.triggeredAt = new Date(Date.now() - (i * 17 + 3) * 60000).toISOString();
    const inc = store.createSafetyIncident({ citizenName: who.name, citizenId: who.id, district: ward.district, location: alert.location, lat: g.lat, lng: g.lng, sosId: alert.id });
    (inc as { isDemo?: boolean }).isDemo = true;
    alert.cprRequestId = inc.id;
    if (i >= 4) store.updateIncidentStatus(inc.id, "safe", "Officer confirmed the person is safe (demo)", "PCR");
    else if (i >= 2) store.updateIncidentStatus(inc.id, "police_responding", "Patrol on the way (demo)", "PCR");
  }
  store.touch();
  void phoneTaken;
  return { accounts: { "Citizen": "9000000001", [`District admin (${home})`]: "9000000002", "Super admin": "9000000003", "Worker": "9000000004" } };
}
