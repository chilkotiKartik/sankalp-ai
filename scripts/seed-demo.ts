/**
 * P0.a — `npm run seed:demo`
 * Builds a realistic DEMO dataset (every record flagged isDemo) and writes it as the snapshot.
 * Refuses to run unless DEMO_MODE=true. Running it again is the one-command reset.
 * Accounts use placeholder numbers (+91 90000 0000x). Credentials go to DATA_DIR/demo-credentials.txt.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { config } from "../server/config";
import { storage, getDeptIdForCategory, type ComplaintCategory, type AppUser, type Priority } from "../server/storage";
import { saveSnapshot, snapshotPath } from "../server/persistence";
import { WARDS_DATA } from "../server/data/reference";
import {
  WORKER_NAMES, COMPLAINT_DESCS, LOCATIONS_PREFIX, PATROL_VANS_SEED, demoAnnouncements, demoPolls, demoPetitions, demoEvents,
  DEMO_BUDGET, DEMO_BUDGET_SCALE, demoRTIs,
} from "../server/demo/content";

const pick = <T,>(a: readonly T[]) => a[randomInt(a.length)];

async function main() {
  const c = config();
  if (!c.DEMO_MODE) {
    process.stderr.write("Refusing to seed: set DEMO_MODE=true (demo data is only allowed in demo mode).\n");
    process.exit(1);
  }
  storage.reset();
  const pin = process.env.DEMO_PIN && /^\d{6}$/.test(process.env.DEMO_PIN) ? process.env.DEMO_PIN : String(randomInt(100000, 999999));
  const hash = await bcrypt.hash(pin, 10);
  const mkUser = (name: string, phone: string, role: AppUser["role"], district: string, points = 0) =>
    storage.createUser({ name, phone, pin: hash, role, district, points, badges: role === "citizen" ? ["first_report"] : [], level: 1, isDemo: true });

  const citizen = await mkUser("Asha (Demo Citizen)", "9000000001", "citizen", "Dehradun", 120);
  const admin = await mkUser("Dehradun Admin (Demo)", "9000000002", "admin", "Dehradun");
  const superAdmin = await mkUser("State Admin (Demo)", "9000000003", "super_admin", "Uttarakhand");
  const worker = await mkUser("Ramesh (Demo Worker)", "9000000004", "worker", "Dehradun");
  const others: AppUser[] = [];
  for (let i = 0; i < 12; i++) others.push(await mkUser(`Demo Citizen ${i + 1}`, `90000001${String(i).padStart(2, "0")}`, "citizen", WARDS_DATA[i % WARDS_DATA.length].district, randomInt(10, 600)));

  // Complaints moved through the REAL state machine, so every state is reachable and consistent.
  const cats = Object.keys(COMPLAINT_DESCS) as ComplaintCategory[];
  for (let i = 0; i < 140; i++) {
    const ward = pick(WARDS_DATA);
    const owner = i < 6 ? citizen : pick(others);
    const category = pick(cats);
    const geo = { lat: +(ward.center.lat + (Math.random() - 0.5) * 0.04).toFixed(5), lng: +(ward.center.lng + (Math.random() - 0.5) * 0.04).toFixed(5) };
    const priority: Priority = pick(["P1", "P2", "P2", "P3", "P3", "P3", "P4"] as const);
    const cmp = storage.createComplaint({ category, description: pick(COMPLAINT_DESCS[category]), location: `${pick(LOCATIONS_PREFIX)}, ${ward.name}`,
      geo, ward: ward.name, wardNumber: ward.number, district: ward.district, priority, isDemo: true,
      aiRouting: { method: "rules:category→department", department: getDeptIdForCategory(category), confidence: 0.6, reason: "demo seed" }, photoReview: "not_required" }, owner);
    const hoursBack = randomInt(1, 24 * 40);
    cmp.submittedAt = new Date(Date.now() - hoursBack * 3600000).toISOString();
    const roll = Math.random();
    if (roll > 0.25) storage.startWork(cmp.id, "officer", admin.id);
    if (roll > 0.5) storage.submitProof(cmp.id, { photoUrl: "/assets/images/icon.png", note: "Demo proof" }, "officer", admin.id);
    if (roll > 0.65) storage.citizenConfirm(cmp.id, cmp.userId!, randomInt(3, 6), "Demo confirmation");
    else if (roll > 0.6) storage.citizenReject(cmp.id, cmp.userId!, "Demo rejection");
    if (cmp.resolvedAt) cmp.resolvedAt = new Date(new Date(cmp.submittedAt).getTime() + randomInt(4, 96) * 3600000).toISOString();
    cmp.upvotes = randomInt(0, 40);
  }
  // Six fresh complaints in the last week for the demo citizen's district so the cluster/spike rules have something to show.
  for (let i = 0; i < 4; i++) {
    const ward = WARDS_DATA.find(w => w.district === "Dehradun")!;
    storage.createComplaint({ category: "garbage", description: pick(COMPLAINT_DESCS.garbage), location: `Market Road, ${ward.name}`,
      geo: { lat: ward.center.lat + i * 0.001, lng: ward.center.lng }, ward: ward.name, wardNumber: ward.number, district: "Dehradun", priority: "P2", isDemo: true }, others[0]);
  }

  WORKER_NAMES.slice(0, 18).forEach((name, i) => {
    const ward = WARDS_DATA[i % WARDS_DATA.length];
    storage.s.workers.push({ id: `demo-w${i}`, isDemo: true, name: `${name} (Demo)`, phone: `90000002${String(i).padStart(2, "0")}`, ward: ward.name, wardNumber: ward.number,
      district: ward.district, score: randomInt(55, 98), resolvedToday: randomInt(0, 6), totalResolved: randomInt(20, 300), avgRating: +(3 + Math.random() * 2).toFixed(1),
      status: i % 5 === 4 ? "idle" : "active", currentTask: i % 3 ? "Road repair" : undefined,
      geo: { lat: ward.center.lat + (Math.random() - 0.5) * 0.02, lng: ward.center.lng + (Math.random() - 0.5) * 0.02 } });
  });
  storage.reportWorkerLocation(worker, { lat: 30.3255, lng: 78.0437 }, "active", "Pothole repair, Rajpur Road");

  storage.s.patrolVans = PATROL_VANS_SEED.map(v => ({ ...v }));
  demoAnnouncements().forEach(a => storage.createAnnouncement({ ...a, title: `${a.title}`, postedBy: `${a.postedBy} (Demo)` }));
  demoPolls().forEach(p => storage.createPoll(p));
  demoPetitions().forEach(p => storage.createPetition(p));
  demoEvents().forEach(e => storage.createEvent(e));
  for (const b of DEMO_BUDGET) for (const [district, scale] of Object.entries(DEMO_BUDGET_SCALE)) {
    storage.s.budgetItems.push({ id: `demo-b-${b.department}-${district}`.replace(/\s/g, "_"), ...b, district, year: 2025,
      allocated: Math.round(b.allocated * scale.alloc), spent: Math.round(b.spent * scale.spent) });
  }
  demoRTIs().forEach(r => storage.s.rtis.push({ ...r, id: `demo-rti-${r.ticketId}`, filedByPhone: citizen.phone, filedBy: citizen.name }));

  const codes = await storage.ensureDeptCodes();
  storage.touch();
  saveSnapshot(storage);

  const lines = [
    "SANKALP AI — DEMO credentials (DEMO_MODE only; placeholder numbers). Regenerated on every seed.",
    `PIN for all demo accounts: ${pin}`,
    `Citizen      ${citizen.phone}`,
    `District admin (Dehradun) ${admin.phone}`,
    `Super admin  ${superAdmin.phone}`,
    `Worker       ${worker.phone}`,
    "",
    "Department portal codes (/web/dept, /web/cpr uses 'police'):",
    ...Object.entries(codes).map(([d, code]) => `  ${d.padEnd(7)} ${code}`),
  ];
  const credFile = path.join(path.resolve(c.DATA_DIR), "demo-credentials.txt");
  fs.writeFileSync(credFile, lines.join("\n") + "\n", { mode: 0o600 });
  process.stdout.write(`Demo data written to ${snapshotPath()}\n${lines.join("\n")}\n`);
}

void main();
