import type { ComplaintState, LegacyStatus } from "./domain/complaintState";

export type UserRole = "citizen" | "worker" | "officer" | "dept_admin" | "district_admin" | "admin" | "police" | "disaster_authority" | "state_admin" | "super_admin";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type ComplaintStatus = LegacyStatus;
export type ComplaintCategory =
  | "pothole" | "road_damage" | "garbage" | "drain" | "sewage"
  | "streetlight" | "water" | "electricity" | "transformer"
  | "tree" | "noise" | "health_hazard" | "disaster" | "other";
export type SOSCategory =
  | "gas_leak" | "water_burst" | "electric_hazard"
  | "fire_risk" | "road_accident" | "infrastructure" | "women_safety" | "medical"
  | "disaster" | "forest_fire";

export interface AppUser {
  id: string;
  isDemo?: boolean;
  /** Department for officer / dept_admin accounts (P1.4). */
  departmentId?: string;
  name: string;
  phone: string;
  pin: string;
  role: UserRole;
  district: string;
  points: number;
  badges: string[];
  level: number;
  createdAt: string;
  /** P6.1: up to 5 people alerted by SMS when this user triggers an SOS. */
  trustedContacts?: Array<{ id: string; label: string; phone: string; addedAt: string }>;
  /** Separate, optional consent (DPDP purpose limitation): this person's complaint photos may train SANKALP's own AI. */
  trainingOptIn?: boolean;
  trainingOptInAt?: string;
  /** P5.2: complaint text received by SMS/WhatsApp before the sender accepted the privacy notice. */
  pendingChannelText?: string;
  pendingChannelAt?: string;
  /** P3.6: may be asked whether nearby repairs were really done. Off unless the user opts in. */
  neighbourOptIn?: boolean;
}

export interface GeoPoint { lat: number; lng: number; }

export interface Complaint {
  id: string;
  /** Owner (citizen user id). Required for confirm/reject and push. */
  userId?: string;
  /** Authoritative lifecycle state (M7). `status` is derived for backwards compatibility. */
  state: ComplaintState;
  rejectionCount: number;
  isDemo?: boolean;
  aiRouting?: { method: string; confidence: number; reason: string; department: string };
  /** P2.6 explainability: model, prompt version, input hash, output and confidence of every AI decision. */
  aiDecisions?: Array<{ task: string; method: string; provider: string; model: string; promptVersion: string; inputHash: string; output: Record<string, unknown>; confidence: number; reason: string; at: string }>;
  photoReview?: "manual_review" | "verified" | "not_required";
  ticketId: string;
  category: ComplaintCategory;
  description: string;
  location: string;
  geo: GeoPoint;
  ward: string;
  wardNumber: number;
  district: string;
  priority: Priority;
  status: ComplaintStatus;
  submittedAt: string;
  resolvedAt?: string;
  submittedBy?: string;
  submittedByPhone?: string;
  workerName?: string;
  upvotes: number;
  upvotedBy: string[];
  isCluster: boolean;
  clusterSize?: number;
  /** @deprecated always null — was random. Kept for client compatibility. */
  aiScore: number | null;
  aiConfidence: number | null;
  hasProof?: boolean;
  beforePhoto?: string;
  afterPhoto?: string;
  photoIsReal?: boolean;
  photoAiConfidence?: number;
  photoAiReason?: string;
  rating?: number;
  feedback?: string;
  rejectedBy?: string[];
  reopened?: boolean;
  department?: string;
  adminNote?: string;
  assignedWorkerName?: string;
  assignedWorkerPhone?: string;
  proofPhoto?: string;
  proofNote?: string;
  /** P4.1 duplicate merge (reversible): a child points at its parent; the parent counts affected citizens. */
  duplicateOf?: string;
  duplicates?: string[];
  affectedCount?: number;
  priorityBeforeMerge?: string;
  /** P4.2 SLA escalation ladder: 1 = officer (75%), 2 = dept head (100%), 3 = district admin (150%). */
  slaLevel?: number;
  slaSnoozedUntil?: string;
  slaSnoozeReason?: string;
  slaSnoozedTotalH?: number;
  /** P3: device GPS sent with the proof (worker app / officer upload). */
  proofGeo?: GeoPoint;
  verification?: ProofVerification;
  /** Review P3-1: true from proof submission until the machine signals are stored. Answers wait for it. */
  verificationPending?: boolean;
  clientRequestId?: string;
  /** P5.2/P5.3: where the complaint came from. */
  channel?: "app" | "sms" | "ivr" | "whatsapp";
  /** Review P3-3: geo is the district centre (citizen sent no GPS) — not usable for geo/neighbour/duplicate checks. */
  geoApproximate?: boolean;
  /** P3.5: the citizen's answer and the channel it came from. "yes" alone never closes a flagged case. */
  citizenAnswer?: "yes" | "no";
  citizenAnswerChannel?: "app" | "voice" | "sms";
  citizenAnsweredAt?: string;
  /** P3.5 reminders already sent while VERIFYING. */
  confirmReminders?: Array<{ channel: "sms" | "voice"; at: string; ok: boolean }>;
  /** P3.6 neighbour confirmation: invited user ids and their answers. */
  neighbourInvites?: string[];
  neighbourAnswers?: Array<{ userId: string; fixed: boolean; at: string }>;
  proofSubmittedAt?: string;
}

export interface DeptConfig {
  id: string; name: string; nameHindi: string;
  icon: string; color: string; helpline: string;
  slaHours: number; categories: string[];
}

export interface SOSAlert {
  id: string;
  /** Set by police/state: evidence must not be purged (P1.9). */
  legalHold?: boolean;
  userId?: string;
  isDemo?: boolean;
  category: SOSCategory;
  description: string;
  location: string;
  geo: GeoPoint;
  liveGeo?: GeoPoint;
  liveUpdatedAt?: string;
  ward: string;
  wardNumber: number;
  district: string;
  triggeredAt: string;
  resolvedAt?: string;
  status: "active" | "responding" | "resolved" | "cancelled";
  respondingWorker?: string;
  /** P6.1: cancelled by the sender with their PIN (kept, audited — never deleted). */
  cancelledAt?: string;
  cancelPinAttempts?: number;
  /** P6.1: per trusted-contact SMS delivery with retry/backoff and provider receipts. */
  contactDeliveries?: Array<{ contactId: string; phoneMasked: string; attempts: number; status: "pending" | "sending" | "sent" | "delivered" | "failed"; lastAttemptAt?: string; nextAttemptAt: number; messageId?: string; error?: string }>;
  triggeredBy?: string;
  triggeredByPhone?: string;
  nearestPoliceStation?: string;
  nearestPolicePhone?: string;
  policeDistance?: number;
  notifiedStations?: { name: string; phone: string; distance: number; address: string }[];
  isWomenSafety?: boolean;
  audioRecordingUrl?: string;
  cprRequestId?: string;
  audioChunks?: { url: string; chunkIndex: number; duration: number; timestamp: string }[];
}

export interface Ward {
  id: string;
  name: string;
  number: number;
  district: string;
  healthScore: number;
  totalComplaints: number;
  resolvedComplaints: number;
  pendingComplaints: number;
  avgResolutionHours: number;
  population: number;
  area: string;
  center: GeoPoint;
  riskLevel: "low" | "medium" | "high" | "critical";
  satisfactionScore: number;
  reopenRate: number;
}

export interface Worker {
  id: string;
  userId?: string;
  isDemo?: boolean;
  lastLocationAt?: string;
  name: string;
  phone: string;
  ward: string;
  wardNumber: number;
  district: string;
  score: number;
  resolvedToday: number;
  totalResolved: number;
  avgRating: number;
  status: "active" | "idle" | "on_leave";
  currentTask?: string;
  geo?: GeoPoint;
  /** P4.3: department and complaint categories this worker is trained for (optional). */
  departmentId?: string;
  skills?: string[];
}

export interface PoliceStation {
  id: string;
  name: string;
  address: string;
  phone: string;
  geo: GeoPoint;
  ward: string;
  district: string;
}

export interface AuthToken {
  /** HMAC-SHA256 of the bearer token — the raw token is never stored. */
  tokenHash: string;
  userId: string;
  expiresAt: number;
}

export interface RiskZone {
  id: string;
  type: "flood" | "garbage" | "infrastructure" | "crime";
  severity: "low" | "medium" | "high";
  geo: GeoPoint;
  radius: number;
  description: string;
  complaintCount: number;
  district: string;
}

export type AnnouncementType = "general" | "scheme" | "emergency" | "welfare" | "tender" | "holiday";

export interface Announcement {
  id: string;
  isDemo?: boolean;
  title: string;
  body: string;
  type: AnnouncementType;
  department: string;
  postedAt: string;
  expiresAt?: string;
  postedBy: string;
  priority: "normal" | "important" | "urgent";
  targetWards?: number[];
  targetDistrict?: string;
  link?: string;
  views: number;
}

export interface Poll {
  id: string;
  isDemo?: boolean;
  question: string;
  options: string[];
  votes: number[];
  voterIds: string[];
  district?: string;
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  status: "active" | "closed";
}

export interface Petition {
  id: string;
  isDemo?: boolean;
  title: string;
  description: string;
  target: string;
  goalSignatures: number;
  signerIds: string[];
  district?: string;
  createdAt: string;
  createdBy: string;
  /** "delivered" only when an official records the hand-over; reaching the goal alone sets goalReachedAt. */
  status: "active" | "closed" | "delivered";
  goalReachedAt?: string;
  department: string;
}

export interface RTIRequest {
  id: string;
  isDemo?: boolean;
  ticketId: string;
  subject: string;
  description: string;
  department: string;
  filedBy: string;
  filedByPhone: string;
  filedAt: string;
  /** draft = written in SANKALP only (not yet an RTI in law); filed_official = filed on the government portal. */
  status: "draft" | "filed_official" | "filed" | "acknowledged" | "processing" | "responded" | "closed";
  response?: string;
  respondedAt?: string;
  district: string;
  /** For a filed RTI: 30 days after the official filing date (RTI Act s.7(1)). */
  deadline: string;
  officialRegNo?: string;
  officialFiledOn?: string;
  officialPortal?: "central" | "state";
}

export interface NightSafetyZone {
  id: string;
  isDemo?: boolean;
  location: string;
  district: string;
  description: string;
  riskType: "crime" | "accident" | "harassment" | "lighting" | "general";
  geo: GeoPoint | null;
  reporterName: string;
  reporterId?: string;
  reportedAt: string;
  status: "active" | "resolved";
  patrolVisits: number;
}

export interface PatrolVan {
  id: string;
  vanNumber: string;
  officerInCharge: string;
  officerPhone: string;
  crewCount: number;
  district: string;
  zone: string;
  status: "active_patrol" | "responding" | "base" | "off_duty";
  geo: { lat: number; lng: number };
  shift: "day" | "night";
  isWomenSafetyUnit: boolean;
}

/** One line of a person's Sankalp Points history (D-059). */
export interface PointsEntry { id: string; userId: string; delta: number; reason: string; ref?: string; at: string }

export interface SafetyIncident {
  id: string;
  /** The SOS this incident was opened for (voice clips and live location belong to it). */
  sosId?: string;
  isDemo?: boolean;
  citizenName: string;
  citizenId?: string;
  district: string;
  location: string;
  geo: { lat: number; lng: number };
  status: "active" | "patrol_dispatched" | "police_responding" | "safe" | "closed";
  reportedAt: string;
  assignedPatrolVan?: string;
  assignedPatrolOfficer?: string;
  assignedPatrolPhone?: string;
  eta?: number;
  escalationLevel: number;
  updates: Array<{ time: string; message: string; actor: string }>;
}

export interface CivicEvent {
  id: string;
  isDemo?: boolean;
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  type: "meeting" | "camp" | "drive" | "scheme" | "emergency";
  district?: string;
  rsvpIds: string[];
  organizer: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  isDemo?: boolean;
  complaintId: string;
  message: string;
  senderName: string;
  /** Who sent it (review P1-H2): erasure matches on this, never on the display name. */
  senderId?: string;
  senderRole: "citizen" | "officer" | "system";
  sentAt: string;
}

export interface BudgetItem {
  id: string;
  department: string;
  category: string;
  allocated: number;
  spent: number;
  district: string;
  year: number;
  description: string;
  /** Official source document (.gov.in / .nic.in) — required for anything published (no unsourced numbers). */
  sourceUrl?: string;
  publishedBy?: string;
  publishedAt?: string;
  isDemo?: boolean;
}

export interface AuditLog {
  id: string;
  action: string;
  complaintId?: string;
  userId: string;
  userName: string;
  timestamp: string;
  details: string;
  actorPhone?: string;
  actorName?: string;
  referenceId?: string;
  /** P1.7 hash chain: seq is gap-free per tenant; hash = sha256(prevHash + canonical_json(entry without hash)). */
  seq?: number;
  prevHash?: string;
  hash?: string;
}

export interface EmergencyService {
  id: string;
  type: "police" | "hospital" | "fire" | "ambulance" | "disaster";
  name: string;
  district: string;
  address: string;
  phone: string;
  phone2?: string;
  beds?: number;
  available?: boolean;
  geo: { lat: number; lng: number };
}

/** Computed signal (M9) — every number is derived from stored complaints. */
export interface PredictiveAlert {
  category: string;
  district: string;
  status: "signal" | "insufficient_data";
  last7Days: number;
  previous7Days: number;
  weekOverWeekPct: number | null;
  last30Days: number;
  largestClusterSize: number;
  n: number;
  method: string;
}

/** P3: one verification signal. score null = unknown (not measurable) — never counted as a pass. */
export interface VerificationSignal {
  name: "geo" | "reuse" | "scene" | "change" | "citizen" | "neighbour";
  score: number | null;
  method: string;
  detail: string;
}
export interface ProofVerification {
  engineVersion: string;
  signals: VerificationSignal[];
  flags: string[];
  score: number | null;
  coverage: number;
  decision: "VERIFIED" | "NEEDS_REVIEW" | "REJECTED" | "PENDING_CITIZEN";
  at: string;
}

export interface MediaRecord {
  id: string;
  fileName: string;
  /** P3.2 perceptual hash and P3.3 background (periphery) hash — absent when the image cannot be fingerprinted. */
  phash?: string;
  sceneHash?: string;
  mime: string;
  kind: "image" | "audio";
  size: number;
  visibility: "public" | "private";
  ownerId: string;
  sosId?: string;
  complaintId?: string;
  createdAt: string;
}

export interface ComplaintEvent {
  id: string;
  complaintId: string;
  from: ComplaintState | null;
  to: ComplaintState;
  actorKind: string;
  actorId: string;
  note?: string;
  at: string;
}

export interface ReviewTask {
  id: string;
  kind: "photo_authenticity" | "proof_review" | "transcription";
  complaintId?: string;
  mediaId?: string;
  reason: string;
  status: "open" | "done";
  createdAt: string;
}

export interface DeptCredential {
  departmentId: string;
  codeHash: string;
  version: number;
  rotatedAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  version: string;
  lang: string;
  purposes: string[];
  at: string;
}

/** P6.5 disaster mode. */
export interface DisasterReport {
  id: string; reporterId?: string; kind: "road_block" | "landslide" | "flood" | "bridge_damage" | "other";
  district: string; geo: GeoPoint; description: string; reportedAt: string;
  status: "unverified" | "verified" | "cleared" | "rejected"; verifiedBy?: string; verifiedAt?: string;
}
export interface ReliefCamp {
  id: string; name: string; district: string; geo: GeoPoint; capacity: number; occupancy: number;
  facilities: string[]; officialPhone?: string; open: boolean; updatedAt: string; updatedBy: string;
}
export interface MissingPerson {
  id: string; reporterId: string; name: string; age?: number; gender?: string; description: string;
  lastSeenArea: string; district: string; lastSeenAt?: string; status: "pending_review" | "missing" | "found" | "withdrawn"; reportedAt: string; closedAt?: string;
}
export interface DisasterModeState { active: boolean; since?: string; by?: string; districts?: string[] }

/** P6.6 yatra / tourist group. Locations are deleted when the group expires. */
export interface YatraGroup {
  id: string; code: string; name: string; leaderId: string; createdAt: string; expiresAt: string;
  members: Array<{ userId: string; displayName: string; joinedAt: string; geo?: GeoPoint; at?: string; lost?: boolean; lostReason?: "self" | "silent"; lostAlertedAt?: string }>;
}

/** P6.3 safety check-in: if the user does not confirm by dueAt (+ grace), trusted contacts are alerted. */
export interface CheckIn {
  id: string;
  userId: string;
  startedAt: string;
  dueAt: string;
  note?: string;
  lastGeo?: GeoPoint;
  status: "active" | "done" | "alerted" | "cancelled";
  alertedAt?: string;
  doneAt?: string;
}

export interface ErasureRequest {
  id: string;
  userRef: string; // pseudonymous reference — the user record may already be gone
  status: "completed" | "legal_hold" | "rejected";
  reason?: string;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}
