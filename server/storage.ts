import { randomUUID, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { EventEmitter } from "node:events";
import bcrypt from "bcrypt";
import { config } from "./config";
import {
  DEPARTMENTS, getDeptIdForCategory, assignDepartment, DISTRICTS_DATA, WARDS_DATA, POLICE_STATIONS,
  EMERGENCY_SERVICES, SLA_HOURS, isStateWide,
} from "./data/reference";
import { tenant, currentTenantId, defaultTenant } from "./tenancy";
import {
  type ComplaintState, legacyStatus, applyPath, pathToInProgress, pathToVerifying,
  citizenConfirm as smConfirm, citizenReject as smReject, TERMINAL, type TransitionStep, type ActorKind,
} from "./domain/complaintState";
import type {
  AppUser, AuthToken, Complaint, ComplaintCategory, SOSAlert, Ward, Worker, PoliceStation, GeoPoint, RiskZone,
  Announcement, Poll, Petition, RTIRequest, NightSafetyZone, PatrolVan, SafetyIncident, CivicEvent, ChatMessage,
  BudgetItem, AuditLog, EmergencyService, PredictiveAlert, MediaRecord, ComplaintEvent, ReviewTask, DeptCredential,
} from "./types";

export * from "./types";
export { DEPARTMENTS, getDeptIdForCategory, assignDepartment };

// Event buses consumed by realtime fan-out (server/realtime.ts) and portal SSE streams.
export const deptEmitter = new EventEmitter();
deptEmitter.setMaxListeners(500);
export const cprEmitter = new EventEmitter();
cprEmitter.setMaxListeners(500);
/** Domain events: ("complaint" | "sos" | "announcement" | "chat" | "worker", payload) */
export const bus = new EventEmitter();
bus.setMaxListeners(500);

/** Every event carries the tenant it belongs to; listeners (WS/SSE) deliver only within that tenant (P1.3). */
for (const em of [deptEmitter, cprEmitter, bus]) {
  const orig = em.emit.bind(em);
  em.emit = ((name: string | symbol, payload?: unknown, ...rest: unknown[]) => {
    if (payload && typeof payload === "object" && !("tenantId" in (payload as object))) (payload as Record<string, unknown>).tenantId = currentTenantId();
    return orig(name, payload, ...rest);
  }) as typeof em.emit;
}

const SNAPSHOT_VERSION = 1;
const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000;
const WORKER_PIN_TTL_MS = 48 * 3600 * 1000;
const WORKER_PIN_MAX_ATTEMPTS = 5;
const SOS_DEDUP_WINDOW_MS = 2 * 60 * 1000;
export const SOS_SESSION_GRACE_MS = 30 * 24 * 3600 * 1000;

const genId = () => randomUUID();
/** M2 (review): everything created while DEMO_MODE is on is demo data and is purged when it is off. */
const demoFlag = (): { isDemo?: true } => (config().DEMO_MODE ? { isDemo: true } : {});
const now = () => new Date().toISOString();

/** "Asha Rawat" → "Asha R." — enough for a public leaderboard, not enough to identify (review L6). */
function shortName(n: string): string {
  const [first, ...rest] = n.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
}

export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex"), bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export class StateError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "StateError"; }
}

export interface ProofInput { photoUrl: string; note?: string }
export type PushEntry = { token: string; platform: string; userId: string; role: string; district: string };

/** Everything that is persisted in the snapshot (M8). Reference data is not persisted. */
interface State {
  users: AppUser[];
  tokens: AuthToken[];
  workerPins: Array<{ key: string; complaintId: string; phone: string; pinHash: string; expiresAt: number; attempts: number }>;
  deptCredentials: DeptCredential[];
  complaints: Complaint[];
  complaintEvents: ComplaintEvent[];
  sosAlerts: SOSAlert[];
  workers: Worker[];
  patrolVans: PatrolVan[];
  safetyIncidents: SafetyIncident[];
  nightSafetyZones: NightSafetyZone[];
  announcements: Announcement[];
  polls: Poll[];
  petitions: Petition[];
  rtis: RTIRequest[];
  civicEvents: CivicEvent[];
  chatMessages: ChatMessage[];
  budgetItems: BudgetItem[];
  auditLogs: AuditLog[];
  media: MediaRecord[];
  reviewTasks: ReviewTask[];
  pushTokens: PushEntry[];
  demoRiskZones: RiskZone[];
}

const emptyState = (): State => ({
  users: [], tokens: [], workerPins: [], deptCredentials: [], complaints: [], complaintEvents: [], sosAlerts: [],
  workers: [], patrolVans: [], safetyIncidents: [], nightSafetyZones: [], announcements: [], polls: [], petitions: [],
  rtis: [], civicEvents: [], chatMessages: [], budgetItems: [], auditLogs: [], media: [], reviewTasks: [], pushTokens: [],
  demoRiskZones: [],
});

export class AppStorage {
  s: State = emptyState();
  constructor(public readonly tenantId: string = defaultTenant()) {}
  private policeStations: PoliceStation[] = POLICE_STATIONS;
  private emergencyServices: EmergencyService[] = EMERGENCY_SERVICES;
  /** bumped on every mutation so the snapshot job only writes when needed */
  revision = 0;

  touch() { this.revision++; }

  // ── SNAPSHOT (M8) ───────────────────────────────────────────────────────────
  toSnapshot() {
    return { version: SNAPSHOT_VERSION, savedAt: now(), state: this.s };
  }

  loadSnapshot(snap: unknown) {
    const o = snap as { version?: number; state?: Partial<State> };
    if (!o || o.version !== SNAPSHOT_VERSION || !o.state) throw new Error("Unsupported snapshot format");
    this.s = { ...emptyState(), ...o.state };
    this.touch();
  }

  reset() { this.s = emptyState(); this.touch(); }

  /** Remove all demo-flagged records (used when DEMO_MODE is off but the snapshot holds demo data). */
  purgeDemo(): number {
    const before = this.s.users.length + this.s.complaints.length + this.s.sosAlerts.length + this.s.workers.length;
    const demoUserIds = new Set(this.s.users.filter(u => u.isDemo).map(u => u.id));
    this.s.users = this.s.users.filter(u => !u.isDemo);
    this.s.tokens = this.s.tokens.filter(t => !demoUserIds.has(t.userId));
    this.s.complaints = this.s.complaints.filter(c => !c.isDemo);
    const ids = new Set(this.s.complaints.map(c => c.id));
    this.s.complaintEvents = this.s.complaintEvents.filter(e => ids.has(e.complaintId));
    this.s.sosAlerts = this.s.sosAlerts.filter(a => !a.isDemo);
    this.s.workers = this.s.workers.filter(w => !w.isDemo && !(w.userId && demoUserIds.has(w.userId)));
    this.s.pushTokens = this.s.pushTokens.filter(t => !demoUserIds.has(t.userId));
    this.s.media = this.s.media.filter(m => !demoUserIds.has(m.ownerId));
    this.s.patrolVans = [];
    this.s.budgetItems = [];
    this.s.demoRiskZones = [];
    const drop = <T extends { isDemo?: boolean }>(xs: T[]) => xs.filter(x => !x.isDemo);
    this.s.announcements = drop(this.s.announcements);
    this.s.polls = drop(this.s.polls);
    this.s.petitions = drop(this.s.petitions);
    this.s.civicEvents = drop(this.s.civicEvents);
    this.s.rtis = drop(this.s.rtis);
    this.s.safetyIncidents = drop(this.s.safetyIncidents);
    this.s.nightSafetyZones = drop(this.s.nightSafetyZones);
    this.s.chatMessages = drop(this.s.chatMessages).filter(m => ids.has(m.complaintId));
    this.s.reviewTasks = this.s.reviewTasks.filter(t => !t.complaintId || ids.has(t.complaintId));
    this.s.auditLogs = this.s.auditLogs.filter(l => !l.complaintId || ids.has(l.complaintId));
    this.s.workerPins = this.s.workerPins.filter(w => ids.has(w.complaintId));
    this.touch();
    return before - (this.s.users.length + this.s.complaints.length + this.s.sosAlerts.length + this.s.workers.length);
  }

  hasDemoData(): boolean {
    const s = this.s;
    return [s.users, s.complaints, s.sosAlerts, s.workers, s.announcements, s.polls, s.petitions, s.civicEvents, s.rtis, s.safetyIncidents, s.nightSafetyZones]
      .some((xs: Array<{ isDemo?: boolean }>) => xs.some(x => x.isDemo)) || s.patrolVans.length > 0 || s.budgetItems.length > 0;
  }

  // ── USERS ───────────────────────────────────────────────────────────────────
  async findUserByPhone(phone: string): Promise<AppUser | undefined> {
    return this.s.users.find(u => u.phone === phone);
  }

  async createUser(data: Omit<AppUser, "id" | "createdAt">): Promise<AppUser> {
    const user: AppUser = { ...demoFlag(), ...data, id: genId(), createdAt: now() };
    this.s.users.push(user);
    this.touch();
    return user;
  }

  getUserById(id: string): AppUser | undefined { return this.s.users.find(u => u.id === id); }

  /** M15: replace a legacy/plaintext PIN with a bcrypt hash. */
  async setPinHash(userId: string, pin: string) {
    const u = this.getUserById(userId);
    if (!u) return;
    u.pin = await bcrypt.hash(pin, 12);
    this.touch();
  }

  // ── SESSION TOKENS (hashed at rest) ─────────────────────────────────────────
  createToken(userId: string): string {
    const raw = randomBytes(32).toString("base64url");
    this.s.tokens.push({ tokenHash: hmac(config().JWT_SECRET, raw), userId, expiresAt: Date.now() + TOKEN_TTL_MS });
    this.pruneTokens();
    this.touch();
    return raw;
  }

  /**
   * Sliding expiry (review M5): active sessions are renewed when less than half the TTL remains.
   * `graceMs` lets SOS routes accept a recently expired genuine session (rule 9 — never block a real SOS).
   */
  validateToken(raw: string | null | undefined, graceMs = 0): AppUser | null {
    if (!raw || raw.length > 200) return null;
    const h = hmac(config().JWT_SECRET, raw);
    const t = this.s.tokens.find(x => safeEqualHex(x.tokenHash, h));
    const at = Date.now();
    if (!t || t.expiresAt + graceMs < at) return null;
    if (t.expiresAt >= at && t.expiresAt - at < TOKEN_TTL_MS / 2) { t.expiresAt = at + TOKEN_TTL_MS; this.touch(); }
    return this.getUserById(t.userId) || null;
  }

  revokeToken(raw: string) {
    const h = hmac(config().JWT_SECRET, raw);
    this.s.tokens = this.s.tokens.filter(t => t.tokenHash !== h);
    this.touch();
  }

  /** Revocation must also defeat the SOS grace window: revoked tokens are deleted, not expired. */

  private pruneTokens() {
    const t = Date.now() - SOS_SESSION_GRACE_MS;
    if (this.s.tokens.length > 1000) this.s.tokens = this.s.tokens.filter(x => x.expiresAt > t);
  }

  // ── DEPARTMENT CREDENTIALS (M5) ─────────────────────────────────────────────
  /** Creates random codes for departments that have none. Returns the new plain codes (shown once). */
  async ensureDeptCodes(): Promise<Record<string, string>> {
    const created: Record<string, string> = {};
    for (const id of Object.keys(DEPARTMENTS)) {
      if (this.s.deptCredentials.some(d => d.departmentId === id)) continue;
      created[id] = await this.rotateDeptCode(id);
    }
    return created;
  }

  async rotateDeptCode(departmentId: string): Promise<string> {
    if (!DEPARTMENTS[departmentId]) throw new StateError("NOT_FOUND", "Unknown department");
    const code = `${departmentId}-${randomBytes(9).toString("base64url")}`;
    const codeHash = await bcrypt.hash(code, 12);
    const existing = this.s.deptCredentials.find(d => d.departmentId === departmentId);
    if (existing) { existing.codeHash = codeHash; existing.version += 1; existing.rotatedAt = now(); }
    else this.s.deptCredentials.push({ departmentId, codeHash, version: 1, rotatedAt: now() });
    this.touch();
    return code;
  }

  async verifyDeptCode(departmentId: string, code: string): Promise<boolean> {
    const cred = this.s.deptCredentials.find(d => d.departmentId === departmentId);
    if (!cred) { await bcrypt.compare(code, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvali"); return false; }
    return bcrypt.compare(code, cred.codeHash);
  }

  deptCredentialVersion(departmentId: string): number {
    return this.s.deptCredentials.find(d => d.departmentId === departmentId)?.version ?? 0;
  }

  // ── COMPLAINTS ──────────────────────────────────────────────────────────────
  getComplaints(district?: string): Complaint[] {
    if (district && !isStateWide(district)) return this.s.complaints.filter(c => c.district === district);
    return [...this.s.complaints];
  }

  getComplaint(id: string): Complaint | undefined { return this.s.complaints.find(c => c.id === id); }

  private newTicketId(): string {
    for (;;) {
      const t = `${tenant().ticketPrefix}-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
      if (!this.s.complaints.some(c => c.ticketId === t)) return t;
    }
  }

  createComplaint(
    data: Pick<Complaint, "category" | "description" | "location" | "geo" | "ward" | "wardNumber" | "district" | "priority"> &
      Partial<Pick<Complaint, "beforePhoto" | "submittedBy" | "submittedByPhone" | "aiRouting" | "photoReview" | "isDemo" | "hasProof">>,
    user: Pick<AppUser, "id" | "name" | "phone">,
  ): Complaint {
    const state: ComplaintState = "NEW";
    const complaint: Complaint = {
      ...demoFlag(),
      ...data,
      id: genId(),
      userId: user.id,
      ticketId: this.newTicketId(),
      state,
      status: legacyStatus(state),
      rejectionCount: 0,
      submittedAt: now(),
      submittedBy: user.name,
      submittedByPhone: user.phone,
      upvotes: 0,
      upvotedBy: [],
      isCluster: false,
      aiScore: null,
      aiConfidence: null,
      hasProof: false,
      department: assignDepartment(data.category),
    };
    this.s.complaints.unshift(complaint);
    this.recordEvent(complaint.id, null, "NEW", "citizen_owner", user.id);
    const u = this.getUserById(user.id);
    if (u) u.points += 10;
    this.touch();
    bus.emit("complaint", { type: "complaint_new", complaint });
    return complaint;
  }

  private recordEvent(complaintId: string, from: ComplaintState | null, to: ComplaintState, actorKind: string, actorId: string, note?: string) {
    this.s.complaintEvents.push({ id: genId(), complaintId, from, to, actorKind, actorId, note, at: now() });
  }

  getComplaintEvents(complaintId: string): ComplaintEvent[] {
    return this.s.complaintEvents.filter(e => e.complaintId === complaintId);
  }

  private commit(c: Complaint, steps: TransitionStep[], actorId: string, note?: string) {
    for (const st of steps) this.recordEvent(c.id, st.from, st.to, st.actor, actorId, note);
    c.status = legacyStatus(c.state);
    if (c.state === "CLOSED" || c.state === "AUTO_CLOSED_UNVERIFIED") c.resolvedAt = now();
    if (c.state === "REOPENED" || c.state === "ESCALATED") { c.reopened = true; c.resolvedAt = undefined; }
    this.touch();
    bus.emit("complaint", { type: "complaint_state", complaint: c, steps });
  }

  private mustGet(id: string): Complaint {
    const c = this.getComplaint(id);
    if (!c) throw new StateError("NOT_FOUND", "Complaint not found");
    return c;
  }

  /** Officer/worker starts work (auto-assigns from NEW). */
  startWork(id: string, actor: "officer" | "worker", actorId: string, note?: string): Complaint {
    const c = this.mustGet(id);
    const steps = applyPath(c, pathToInProgress(c.state, actor));
    if (note !== undefined) c.adminNote = note;
    this.commit(c, steps, actorId, note);
    return c;
  }

  /** Proof before closure (rule 4): a stored image is mandatory; moves to VERIFYING awaiting the citizen. */
  submitProof(id: string, proof: ProofInput, actor: "officer" | "worker", actorId: string): Complaint {
    const c = this.mustGet(id);
    if (!proof.photoUrl) throw new StateError("PROOF_REQUIRED", "A proof photo is required");
    const steps = applyPath(c, pathToVerifying(c.state, actor));
    c.proofPhoto = proof.photoUrl;
    c.afterPhoto = proof.photoUrl;
    c.proofNote = proof.note;
    c.proofSubmittedAt = now();
    c.hasProof = true;
    this.commit(c, steps, actorId, proof.note);
    return c;
  }

  /** Only the complaint owner may confirm; awards +5 once. */
  citizenConfirm(id: string, userId: string, rating?: number, feedback?: string): Complaint {
    const c = this.mustGet(id);
    if (c.userId !== userId) throw new StateError("FORBIDDEN", "Only the citizen who filed this complaint can confirm the fix");
    const steps = smConfirm(c);
    if (rating !== undefined) c.rating = rating;
    if (feedback) c.feedback = feedback;
    const u = this.getUserById(userId);
    if (u) u.points += 5;
    this.commit(c, steps, userId, feedback);
    return c;
  }

  citizenReject(id: string, userId: string, reason?: string): Complaint {
    const c = this.mustGet(id);
    if (c.userId !== userId) throw new StateError("FORBIDDEN", "Only the citizen who filed this complaint can reject the fix");
    const steps = smReject(c);
    c.rejectedBy = [...(c.rejectedBy || []), userId];
    this.commit(c, steps, userId, reason);
    return c;
  }

  citizenCancel(id: string, userId: string): Complaint {
    const c = this.mustGet(id);
    if (c.userId !== userId) throw new StateError("FORBIDDEN", "Only the citizen who filed this complaint can cancel it");
    const steps = applyPath(c, [["CANCELLED_BY_CITIZEN", "citizen_owner"]]);
    this.commit(c, steps, userId);
    return c;
  }

  /** Reviewer decision for NEEDS_REVIEW (manual-review queue). */
  reviewDecision(id: string, decision: "verify" | "reopen", reviewerId: string, note?: string): Complaint {
    const c = this.mustGet(id);
    const steps = applyPath(c, [[decision === "verify" ? "CITIZEN_VERIFIED" : "REOPENED", "reviewer" as ActorKind]]);
    const extra = decision === "verify" ? applyPath(c, [["CLOSED", "system"]]) : [];
    this.commit(c, [...steps, ...extra], reviewerId, note);
    return c;
  }

  setAdminNote(id: string, note: string) {
    const c = this.mustGet(id);
    c.adminNote = note;
    this.touch();
  }

  upvoteComplaint(id: string, userId: string): Complaint | null {
    const c = this.getComplaint(id);
    if (!c) return null;
    if (!c.upvotedBy.includes(userId)) {
      c.upvotes++;
      c.upvotedBy.push(userId);
      const u = this.getUserById(userId);
      if (u) u.points += 1;
      this.touch();
      bus.emit("complaint", { type: "upvote", complaint: c });
    }
    return c;
  }

  // ── WORKER TEMP CREDENTIALS ─────────────────────────────────────────────────
  /** Returns the plain PIN exactly once (to the assigning department); only a hash is stored. */
  assignWorkerToComplaint(complaintId: string, workerName: string, workerPhone: string, actorId: string): string {
    const c = this.mustGet(complaintId);
    if (TERMINAL.has(c.state)) throw new StateError("INVALID_STATE", "Complaint is already closed");
    const pin = String(100000 + (randomBytes(4).readUInt32BE() % 900000));
    const key = `${workerPhone}_${complaintId}`;
    this.s.workerPins = this.s.workerPins.filter(w => w.key !== key);
    this.s.workerPins.push({ key, complaintId, phone: workerPhone, pinHash: hmac(config().JWT_SECRET, pin), expiresAt: Date.now() + WORKER_PIN_TTL_MS, attempts: 0 });
    c.assignedWorkerName = workerName;
    c.assignedWorkerPhone = workerPhone;
    if (c.state === "NEW" || c.state === "REOPENED" || c.state === "ESCALATED") {
      const steps = applyPath(c, [["ASSIGNED", "officer"]]);
      this.commit(c, steps, actorId, `worker assigned`);
    } else this.touch();
    return pin;
  }

  verifyWorkerPin(phone: string, pin: string, complaintId: string): boolean {
    const entry = this.s.workerPins.find(w => w.key === `${phone}_${complaintId}`);
    if (!entry) return false;
    if (entry.expiresAt < Date.now() || entry.attempts >= WORKER_PIN_MAX_ATTEMPTS) return false;
    const ok = safeEqualHex(entry.pinHash, hmac(config().JWT_SECRET, pin));
    if (!ok) { entry.attempts++; this.touch(); }
    return ok;
  }

  // ── SOS ─────────────────────────────────────────────────────────────────────
  getSosAlerts(district?: string): SOSAlert[] {
    if (district && !isStateWide(district)) return this.s.sosAlerts.filter(a => a.district === district);
    return [...this.s.sosAlerts];
  }

  getSOSAlert(id: string): SOSAlert | undefined { return this.s.sosAlerts.find(a => a.id === id); }

  /** Rule 9: never blocked — duplicates within 2 min (same user + category, still active) return the existing alert. */
  createSos(data: Omit<SOSAlert, "id" | "triggeredAt" | "userId">, userId: string): { alert: SOSAlert; deduplicated: boolean } {
    const t = Date.now();
    const dup = this.s.sosAlerts.find(a => a.userId === userId && a.category === data.category && a.status !== "resolved"
      && t - new Date(a.triggeredAt).getTime() < SOS_DEDUP_WINDOW_MS);
    if (dup) { dup.liveGeo = data.geo; dup.liveUpdatedAt = now(); this.touch(); return { alert: dup, deduplicated: true }; }
    const alert: SOSAlert = { ...demoFlag(), ...data, id: genId(), userId, triggeredAt: now() };
    this.s.sosAlerts.unshift(alert);
    this.touch();
    bus.emit("sos", { type: "sos_new", alert });
    return { alert, deduplicated: false };
  }

  updateSosLocation(id: string, geo: GeoPoint): SOSAlert | null {
    const a = this.getSOSAlert(id);
    if (!a) return null;
    a.liveGeo = geo;
    a.liveUpdatedAt = now();
    this.touch();
    bus.emit("sos", { type: "sos_location_update", alert: a });
    return a;
  }

  resolveSos(id: string): SOSAlert | null {
    const a = this.getSOSAlert(id);
    if (!a) return null;
    a.status = "resolved";
    a.resolvedAt = now();
    this.touch();
    bus.emit("sos", { type: "sos_resolved", alert: a });
    return a;
  }

  addSOSAudioChunk(id: string, chunk: { url: string; chunkIndex: number; duration: number }): SOSAlert | null {
    const a = this.getSOSAlert(id);
    if (!a) return null;
    if (!a.audioChunks) a.audioChunks = [];
    if (a.audioChunks.length >= 500) return a;
    a.audioChunks.push({ ...chunk, timestamp: now() });
    this.touch();
    return a;
  }

  setSosAudioUrl(id: string, url: string): SOSAlert | null {
    const a = this.getSOSAlert(id);
    if (!a) return null;
    a.audioRecordingUrl = url;
    this.touch();
    return a;
  }

  // ── MEDIA ───────────────────────────────────────────────────────────────────
  addMedia(m: Omit<MediaRecord, "createdAt">): MediaRecord {
    const rec = { ...m, createdAt: now() };
    this.s.media.push(rec);
    this.touch();
    return rec;
  }

  getMediaByFile(fileName: string): MediaRecord | undefined { return this.s.media.find(m => m.fileName === fileName); }
  getMedia(id: string): MediaRecord | undefined { return this.s.media.find(m => m.id === id); }

  linkMedia(id: string, link: { sosId?: string; complaintId?: string }) {
    const m = this.getMedia(id);
    if (m) { Object.assign(m, link); this.touch(); }
  }

  // ── REVIEW TASKS (M4) ───────────────────────────────────────────────────────
  createReviewTask(t: Omit<ReviewTask, "id" | "createdAt" | "status">): ReviewTask {
    const task: ReviewTask = { ...t, id: genId(), status: "open", createdAt: now() };
    this.s.reviewTasks.push(task);
    this.touch();
    return task;
  }

  getReviewTasks(status?: "open" | "done") {
    return this.s.reviewTasks.filter(t => !status || t.status === status);
  }

  // ── WARDS (computed from stored complaints; formula documented) ─────────────
  /**
   * healthScore = round(100 × closedVerified / total − 2 × openP1), clamped to 0..100.
   * With n = 0 the score is 100 and `n` = 0 is reported so clients can show "no data".
   */
  getWards(district?: string): (Ward & { n: number; scoreMethod: string })[] {
    const list = WARDS_DATA.filter(w => !district || isStateWide(district) || w.district === district);
    return list.map(w => {
      const wc = this.s.complaints.filter(c => c.district === w.district && c.wardNumber === w.number);
      const closed = wc.filter(c => c.state === "CLOSED");
      const pending = wc.filter(c => c.status === "pending").length;
      const openP1 = wc.filter(c => c.priority === "P1" && !TERMINAL.has(c.state)).length;
      const n = wc.length;
      const health = n === 0 ? 100 : Math.max(0, Math.min(100, Math.round((100 * closed.length) / n - 2 * openP1)));
      const resHours = closed.filter(c => c.resolvedAt).map(c => (new Date(c.resolvedAt!).getTime() - new Date(c.submittedAt).getTime()) / 3600000);
      const rated = closed.filter(c => typeof c.rating === "number");
      const reopened = wc.filter(c => c.reopened).length;
      const riskLevel: Ward["riskLevel"] = n === 0 ? "low" : health < 50 ? "critical" : health < 65 ? "high" : health < 80 ? "medium" : "low";
      return {
        id: `ward-${w.district}-${w.number}`,
        name: w.name, number: w.number, district: w.district,
        healthScore: health,
        totalComplaints: n,
        resolvedComplaints: closed.length,
        pendingComplaints: pending,
        avgResolutionHours: resHours.length ? Math.round(resHours.reduce((a, b) => a + b, 0) / resHours.length) : 0,
        population: w.pop, area: w.area, center: w.center, riskLevel,
        satisfactionScore: rated.length ? parseFloat((rated.reduce((a, c) => a + (c.rating || 0), 0) / rated.length).toFixed(1)) : 0,
        reopenRate: n ? parseFloat((reopened / n).toFixed(2)) : 0,
        n,
        scoreMethod: "100×citizen-verified closed/total − 2×open P1; n=complaints in ward",
      };
    });
  }

  // ── WORKERS (M1) ────────────────────────────────────────────────────────────
  getWorkers(district?: string): Worker[] {
    if (district && !isStateWide(district)) return this.s.workers.filter(w => w.district === district);
    return [...this.s.workers];
  }

  /** Real location report from a logged-in worker. Creates the worker record on first report. */
  reportWorkerLocation(user: AppUser, geo: GeoPoint, status?: Worker["status"], currentTask?: string): Worker {
    let w = this.s.workers.find(x => x.userId === user.id);
    if (!w) {
      w = { id: genId(), userId: user.id, name: user.name, phone: user.phone, ward: "", wardNumber: 0, district: user.district,
        score: 0, resolvedToday: 0, totalResolved: 0, avgRating: 0, status: "active" };
      this.s.workers.push(w);
    }
    w.geo = geo;
    w.lastLocationAt = now();
    if (status) w.status = status;
    if (currentTask !== undefined) w.currentTask = currentTask;
    this.touch();
    bus.emit("worker", { type: "worker_geo_update", updates: [{ id: w.id, geo, status: w.status, name: w.name, currentTask: w.currentTask }], timestamp: now() });
    return w;
  }

  /** DEMO_MODE only — called by the demo job; never runs otherwise. */
  simulateDemoWorkerMovement() {
    const updates: Array<{ id: string; geo: GeoPoint; status: string; name: string; currentTask?: string }> = [];
    for (const w of this.s.workers) {
      if (!w.isDemo || w.status !== "active" || !w.geo) continue;
      w.geo = { lat: +(w.geo.lat + (Math.random() - 0.5) * 0.0025).toFixed(6), lng: +(w.geo.lng + (Math.random() - 0.5) * 0.0025).toFixed(6) };
      updates.push({ id: w.id, geo: w.geo, status: w.status, name: w.name, currentTask: w.currentTask });
    }
    if (updates.length) bus.emit("worker", { type: "worker_geo_update", updates, timestamp: now(), demo: true });
  }

  // ── GEO REFERENCE ───────────────────────────────────────────────────────────
  getDistrictCenter(district: string): GeoPoint {
    return DISTRICTS_DATA.find(d => d.district === district)?.center ?? tenant().mapBounds.center;
  }

  getPoliceStations(district?: string): PoliceStation[] {
    if (district && !isStateWide(district)) return this.policeStations.filter(p => p.district === district);
    return [...this.policeStations];
  }

  getNearestPoliceStations(geo: GeoPoint, count = 3, district?: string): (PoliceStation & { distance: number })[] {
    const pool = district && !isStateWide(district) ? this.policeStations.filter(p => p.district === district) : this.policeStations;
    const src = pool.length ? pool : this.policeStations;
    return src.map(p => ({ ...p, distance: parseFloat(distanceKm(geo, p.geo).toFixed(2)) }))
      .sort((a, b) => a.distance - b.distance).slice(0, count);
  }

  /** Risk zones derived from clusters of ≥3 unresolved complaints in a ~5 km grid cell (plus demo zones in DEMO_MODE). */
  getRiskZones(district?: string): RiskZone[] {
    const open = this.getComplaints(district).filter(c => !TERMINAL.has(c.state) && c.geo);
    const cells = new Map<string, Complaint[]>();
    for (const c of open) {
      const k = `${Math.round(c.geo.lat * 20) / 20},${Math.round(c.geo.lng * 20) / 20}`;
      cells.set(k, [...(cells.get(k) || []), c]);
    }
    const typeFor = (cat: string): RiskZone["type"] => cat === "garbage" ? "garbage" : ["drain", "water", "disaster"].includes(cat) ? "flood" : "infrastructure";
    const zones: RiskZone[] = [];
    cells.forEach((items, key) => {
      if (items.length < 3) return;
      const counts = new Map<string, number>();
      items.forEach(i => counts.set(i.category, (counts.get(i.category) || 0) + 1));
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const lat = items.reduce((a, i) => a + i.geo.lat, 0) / items.length;
      const lng = items.reduce((a, i) => a + i.geo.lng, 0) / items.length;
      zones.push({ id: `rz-${key}`, type: typeFor(top), severity: items.length >= 7 ? "high" : items.length >= 5 ? "medium" : "low",
        geo: { lat, lng }, radius: 2500, description: `${items.length} unresolved complaints (mostly ${top}) in this area`,
        complaintCount: items.length, district: items[0].district });
    });
    const demo = this.s.demoRiskZones.filter(z => !district || isStateWide(district) || z.district === district);
    return [...zones, ...demo];
  }

  // ── LEADERBOARD ─────────────────────────────────────────────────────────────
  getLeaderboard() {
    return this.s.users.filter(u => u.role === "citizen").sort((a, b) => b.points - a.points).slice(0, 20)
      .map((u, i) => ({ rank: i + 1, id: u.id, name: shortName(u.name), phone: "XXXXXXXXXX", points: u.points, level: u.level, badges: u.badges, district: u.district }));
  }

  // ── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
  getAnnouncements(district?: string): Announcement[] {
    if (district && !isStateWide(district)) return this.s.announcements.filter(a => !a.targetDistrict || a.targetDistrict === "all" || a.targetDistrict === district);
    return [...this.s.announcements];
  }

  getAnnouncement(id: string) { return this.s.announcements.find(a => a.id === id); }

  createAnnouncement(data: Omit<Announcement, "id" | "postedAt" | "views">): Announcement {
    const ann: Announcement = { ...demoFlag(), ...data, id: genId(), postedAt: now(), views: 0 };
    this.s.announcements.unshift(ann);
    this.touch();
    bus.emit("announcement", { type: "announcement", announcement: ann });
    return ann;
  }

  deleteAnnouncement(id: string): boolean {
    const i = this.s.announcements.findIndex(a => a.id === id);
    if (i === -1) return false;
    this.s.announcements.splice(i, 1);
    this.touch();
    return true;
  }

  incrementAnnouncementViews(id: string) {
    const a = this.getAnnouncement(id);
    if (a) { a.views++; this.touch(); }
  }

  // ── POLLS / PETITIONS / EVENTS ──────────────────────────────────────────────
  getPolls(district?: string): Poll[] {
    if (district && !isStateWide(district)) return this.s.polls.filter(p => !p.district || p.district === district);
    return [...this.s.polls];
  }
  createPoll(data: Omit<Poll, "id">): Poll { const p = { ...demoFlag(), ...data, id: genId() }; this.s.polls.unshift(p); this.touch(); return p; }
  votePoll(id: string, optionIndex: number, userId: string): Poll | null {
    const p = this.s.polls.find(x => x.id === id);
    if (!p || p.status !== "active") return null;
    if (p.voterIds.includes(userId)) return p;
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= p.options.length) return null;
    p.votes[optionIndex]++;
    p.voterIds.push(userId);
    this.touch();
    return p;
  }

  getPetitions(district?: string): Petition[] {
    if (district && !isStateWide(district)) return this.s.petitions.filter(p => !p.district || p.district === district);
    return [...this.s.petitions];
  }
  createPetition(data: Omit<Petition, "id">): Petition { const p = { ...demoFlag(), ...data, id: genId() }; this.s.petitions.unshift(p); this.touch(); return p; }
  signPetition(id: string, userId: string): Petition | null {
    const p = this.s.petitions.find(x => x.id === id);
    if (!p || p.status !== "active") return null;
    if (!p.signerIds.includes(userId)) {
      p.signerIds.push(userId);
      if (p.signerIds.length >= p.goalSignatures) p.status = "delivered";
      this.touch();
    }
    return p;
  }

  getEvents(district?: string): CivicEvent[] {
    if (district && !isStateWide(district)) return this.s.civicEvents.filter(e => !e.district || e.district === district);
    return [...this.s.civicEvents];
  }
  createEvent(data: Omit<CivicEvent, "id" | "createdAt" | "rsvpIds">): CivicEvent {
    const e: CivicEvent = { ...demoFlag(), ...data, id: genId(), createdAt: now(), rsvpIds: [] };
    this.s.civicEvents.unshift(e);
    this.touch();
    return e;
  }
  rsvpEvent(id: string, userId: string): CivicEvent | null {
    const e = this.s.civicEvents.find(x => x.id === id);
    if (!e) return null;
    if (!e.rsvpIds.includes(userId)) { e.rsvpIds.push(userId); this.touch(); }
    return e;
  }

  // ── RTI ─────────────────────────────────────────────────────────────────────
  getRTIs(district?: string): RTIRequest[] {
    if (district && !isStateWide(district)) return this.s.rtis.filter(r => r.district === district);
    return [...this.s.rtis];
  }
  getRTI(id: string) { return this.s.rtis.find(r => r.id === id); }
  getRTIsByPhone(phone: string): RTIRequest[] { return this.s.rtis.filter(r => r.filedByPhone === phone); }
  createRTI(data: Omit<RTIRequest, "id" | "ticketId" | "filedAt" | "deadline" | "status">, actorId: string): RTIRequest {
    const filed = new Date();
    const rti: RTIRequest = { ...demoFlag(), ...data, id: genId(), ticketId: `RTI-${tenant().ticketPrefix}-${randomUUID().slice(0, 8).toUpperCase()}`,
      filedAt: filed.toISOString(), deadline: new Date(filed.getTime() + 30 * 86400000).toISOString(), status: "filed" };
    this.s.rtis.unshift(rti);
    this.addAuditLog("rti_filed", actorId, "citizen", `RTI ${rti.ticketId} filed`, rti.id);
    this.touch();
    return rti;
  }
  submitRTI(id: string): RTIRequest | null {
    const r = this.getRTI(id);
    if (!r) return null;
    if (r.status === "filed") r.status = "acknowledged";
    this.touch();
    return r;
  }
  respondRTI(id: string, response: string): RTIRequest | null {
    const r = this.getRTI(id);
    if (!r) return null;
    r.response = response; r.status = "responded"; r.respondedAt = now();
    this.touch();
    return r;
  }

  // ── CHAT ────────────────────────────────────────────────────────────────────
  getChatMessages(complaintId: string): ChatMessage[] { return this.s.chatMessages.filter(m => m.complaintId === complaintId); }
  addChatMessage(complaintId: string, message: string, senderName: string, senderRole: ChatMessage["senderRole"]): ChatMessage {
    const msg: ChatMessage = { ...demoFlag(), id: genId(), complaintId, message, senderName, senderRole, sentAt: now() };
    this.s.chatMessages.push(msg);
    this.touch();
    bus.emit("chat", { type: "chat_message", complaintId, message: msg });
    return msg;
  }

  // ── BUDGET ──────────────────────────────────────────────────────────────────
  getBudgetItems(district?: string): BudgetItem[] {
    if (district && !isStateWide(district)) return this.s.budgetItems.filter(b => b.district === district);
    return [...this.s.budgetItems];
  }

  // ── PREDICTIVE SIGNALS (M9 — computed, no invented numbers) ─────────────────
  getPredictiveAlerts(district?: string): PredictiveAlert[] {
    const t = Date.now();
    const day = 86400000;
    const items = this.getComplaints(district);
    const groups = new Map<string, Complaint[]>();
    for (const c of items) {
      const k = `${c.district}::${c.category}`;
      groups.set(k, [...(groups.get(k) || []), c]);
    }
    const out: PredictiveAlert[] = [];
    groups.forEach((list, key) => {
      const [dist, category] = key.split("::");
      const age = (c: Complaint) => t - new Date(c.submittedAt).getTime();
      const last7 = list.filter(c => age(c) < 7 * day).length;
      const prev7 = list.filter(c => age(c) >= 7 * day && age(c) < 14 * day).length;
      const last30 = list.filter(c => age(c) < 30 * day).length;
      const cells = new Map<string, number>();
      list.filter(c => !TERMINAL.has(c.state)).forEach(c => {
        const k = `${Math.round(c.geo.lat * 100) / 100},${Math.round(c.geo.lng * 100) / 100}`;
        cells.set(k, (cells.get(k) || 0) + 1);
      });
      const largest = cells.size ? Math.max(...cells.values()) : 0;
      const sufficient = last30 >= 5 && prev7 >= 3;
      out.push({
        category, district: dist,
        status: sufficient ? "signal" : "insufficient_data",
        last7Days: last7, previous7Days: prev7,
        weekOverWeekPct: sufficient ? Math.round(((last7 - prev7) / prev7) * 100) : null,
        last30Days: last30, largestClusterSize: largest, n: list.length,
        method: "counts of stored complaints; WoW% = (last7 − prev7)/prev7, shown only if last30 ≥ 5 and prev7 ≥ 3; cluster = open complaints per ~1 km cell",
      });
    });
    return out.sort((a, b) => (b.status === "signal" ? 1 : 0) - (a.status === "signal" ? 1 : 0) || b.last7Days - a.last7Days);
  }

  // ── AUDIT ───────────────────────────────────────────────────────────────────
  addAuditLog(action: string, actorId: string, actorName: string, details: string, complaintId?: string): AuditLog {
    const log: AuditLog = { id: genId(), action, userId: actorId, userName: actorName, details, timestamp: now(), complaintId,
      actorName, referenceId: complaintId || undefined };
    this.s.auditLogs.push(log);
    if (this.s.auditLogs.length > 20000) this.s.auditLogs.shift();
    this.touch();
    return log;
  }

  getAuditLogs(complaintId?: string): AuditLog[] {
    if (complaintId) return this.s.auditLogs.filter(l => l.complaintId === complaintId);
    return [...this.s.auditLogs].reverse().slice(0, 200);
  }

  // ── STATS ───────────────────────────────────────────────────────────────────
  getAdminStats(district?: string) {
    const complaints = this.getComplaints(district);
    const sos = this.getSosAlerts(district);
    const wards = this.getWards(district);
    const workers = this.getWorkers(district);
    const withData = wards.filter(w => w.n > 0);
    return {
      totalComplaints: complaints.length,
      pendingComplaints: complaints.filter(c => c.status === "pending").length,
      inProgressComplaints: complaints.filter(c => c.status === "in_progress").length,
      awaitingCitizenConfirmation: complaints.filter(c => c.state === "VERIFYING" || c.state === "NEEDS_REVIEW").length,
      resolvedComplaints: complaints.filter(c => c.state === "CLOSED").length,
      activeSos: sos.filter(s => s.status === "active").length,
      totalWards: wards.length,
      avgHealthScore: withData.length ? Math.round(withData.reduce((a, w) => a + w.healthScore, 0) / withData.length) : 0,
      wardsWithData: withData.length,
      activeWorkers: workers.filter(w => w.status === "active").length,
    };
  }

  slaBreached(c: Complaint, at = Date.now()): boolean {
    if (TERMINAL.has(c.state) || c.state === "VERIFYING" || c.state === "NEEDS_REVIEW") return false;
    const sla = SLA_HOURS[c.priority] ?? 72;
    return (at - new Date(c.submittedAt).getTime()) / 3600000 > sla;
  }

  // ── CPR / PATROL ────────────────────────────────────────────────────────────
  getPatrolVans(district?: string): PatrolVan[] {
    if (district && !isStateWide(district)) return this.s.patrolVans.filter(v => v.district === district);
    return [...this.s.patrolVans];
  }

  getSafetyIncidents(district?: string): SafetyIncident[] {
    const list = district && !isStateWide(district) ? this.s.safetyIncidents.filter(i => i.district === district) : [...this.s.safetyIncidents];
    return list.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  }

  createSafetyIncident(data: { citizenName: string; district: string; location: string; lat: number; lng: number }): SafetyIncident {
    const van = this.s.patrolVans.find(v => v.status === "active_patrol" && v.district === data.district);
    const incident: SafetyIncident = {
      ...demoFlag(),
      id: genId(), citizenName: data.citizenName, district: data.district, location: data.location,
      geo: { lat: data.lat, lng: data.lng }, status: van ? "patrol_dispatched" : "active", reportedAt: now(), escalationLevel: 1,
      assignedPatrolVan: van?.vanNumber, assignedPatrolOfficer: van?.officerInCharge, assignedPatrolPhone: van?.officerPhone,
      updates: [{ time: now(), message: `SOS received at ${data.location}`, actor: "SYSTEM" }],
    };
    if (van) {
      van.status = "responding";
      incident.updates.push({ time: now(), message: `${van.vanNumber} dispatched`, actor: "DISPATCH" });
    }
    this.s.safetyIncidents.unshift(incident);
    this.touch();
    cprEmitter.emit("event", { type: "safety_incident_new", incident });
    return incident;
  }

  updateIncidentStatus(id: string, status: SafetyIncident["status"], message: string, actor: string): SafetyIncident | null {
    const inc = this.s.safetyIncidents.find(i => i.id === id);
    if (!inc) return null;
    const prev = inc.status;
    inc.status = status;
    inc.updates.push({ time: now(), message, actor });
    if ((status === "safe" || status === "closed") && inc.assignedPatrolVan) {
      const van = this.s.patrolVans.find(v => v.vanNumber === inc.assignedPatrolVan);
      if (van?.status === "responding") van.status = "active_patrol";
    }
    if (status !== prev) {
      const lvl = status === "police_responding" ? 3 : status === "patrol_dispatched" ? 2 : 1;
      if (lvl > inc.escalationLevel) inc.escalationLevel = lvl;
    }
    this.touch();
    cprEmitter.emit("event", { type: "incident_updated", incident: inc });
    return inc;
  }

  updatePatrolLocation(id: string, geo: GeoPoint): PatrolVan | null {
    const van = this.s.patrolVans.find(v => v.id === id);
    if (!van) return null;
    van.geo = geo;
    this.touch();
    return van;
  }

  getNightSafetyZones(): NightSafetyZone[] {
    return [...this.s.nightSafetyZones].sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  }

  createNightSafetyZone(data: { location: string; district: string; description: string; riskType: NightSafetyZone["riskType"]; geo: GeoPoint | null; reporterName: string }): NightSafetyZone {
    const z: NightSafetyZone = { ...demoFlag(), ...data, id: genId(), reportedAt: now(), status: "active", patrolVisits: 0 };
    this.s.nightSafetyZones.unshift(z);
    this.touch();
    return z;
  }

  getEmergencyServices(): EmergencyService[] { return [...this.emergencyServices]; }

  // ── PUSH TOKENS ─────────────────────────────────────────────────────────────
  storePushToken(e: PushEntry) {
    const i = this.s.pushTokens.findIndex(x => x.token === e.token);
    if (i === -1) this.s.pushTokens.push(e); else this.s.pushTokens[i] = e;
    this.touch();
  }
  pushTokensForUser(userId: string) { return this.s.pushTokens.filter(t => t.userId === userId).map(t => t.token); }
  adminPushTokensForDistrict(district: string) {
    return this.s.pushTokens.filter(t => t.role === "super_admin" || (t.role === "admin" && t.district === district)).map(t => t.token);
  }
}

export type { ComplaintCategory };

// ── Tenant registry: one isolated store per tenant (P1.3) ─────────────────────
const stores = new Map<string, AppStorage>();

export function storeFor(tenantId: string): AppStorage {
  let s = stores.get(tenantId);
  if (!s) { s = new AppStorage(tenantId); stores.set(tenantId, s); }
  return s;
}

export function allStores(): AppStorage[] {
  return [...stores.values()];
}

/**
 * `storage` is the store of the tenant bound to the current request (AsyncLocalStorage).
 * Code outside a request (jobs, scripts) runs inside runInTenant(...) or gets the default tenant.
 */
export const storage: AppStorage = new Proxy({} as AppStorage, {
  get(_t, p) {
    const s = storeFor(currentTenantId());
    const v = Reflect.get(s, p, s);
    return typeof v === "function" ? v.bind(s) : v;
  },
  set(_t, p, v) { return Reflect.set(storeFor(currentTenantId()), p, v); },
});
