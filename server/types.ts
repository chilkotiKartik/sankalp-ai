import type { ComplaintState, LegacyStatus } from "./domain/complaintState";

export type UserRole = "citizen" | "worker" | "officer" | "dept_admin" | "district_admin" | "admin" | "police" | "state_admin" | "super_admin";
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
  proofSubmittedAt?: string;
}

export interface DeptConfig {
  id: string; name: string; nameHindi: string;
  icon: string; color: string; helpline: string;
  slaHours: number; categories: string[];
}

export interface SOSAlert {
  id: string;
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
  status: "active" | "responding" | "resolved";
  respondingWorker?: string;
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
  status: "active" | "closed" | "delivered";
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
  status: "filed" | "acknowledged" | "processing" | "responded" | "closed";
  response?: string;
  respondedAt?: string;
  district: string;
  deadline: string;
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

export interface SafetyIncident {
  id: string;
  isDemo?: boolean;
  citizenName: string;
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

export interface MediaRecord {
  id: string;
  fileName: string;
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
  kind: "photo_authenticity" | "proof_review";
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
