import { randomUUID } from "crypto";
import { EventEmitter } from "events";

// ── DEPARTMENT CONFIG ─────────────────────────────────────────────────────────
export interface DeptConfig {
  id: string; name: string; nameHindi: string;
  icon: string; color: string; helpline: string;
  slaHours: number; categories: string[];
}

export const DEPARTMENTS: Record<string, DeptConfig> = {
  pwd:    { id:"pwd",    name:"PWD — Public Works Dept.",       nameHindi:"लोक निर्माण विभाग",          icon:"🏗️", color:"#F59E0B", helpline:"1800-180-4244", slaHours:24, categories:["pothole","road_damage","other"] },
  ulb:    { id:"ulb",    name:"ULB — Municipal Corporation",    nameHindi:"नगर पालिका / नगर निगम",       icon:"🗑️", color:"#10B981", helpline:"1533",          slaHours:48, categories:["garbage","drain","sewage"] },
  jal:    { id:"jal",    name:"Jal Sansthan",                   nameHindi:"उत्तराखण्ड जल संस्थान",       icon:"💧", color:"#3B82F6", helpline:"1916",          slaHours:12, categories:["water"] },
  upcl:   { id:"upcl",  name:"UPCL — Power Corporation",       nameHindi:"उत्तराखण्ड पावर कॉर्पोरेशन", icon:"⚡", color:"#8B5CF6", helpline:"1912",          slaHours:6,  categories:["electricity","streetlight","transformer"] },
  forest: { id:"forest", name:"Forest Department",             nameHindi:"वन विभाग",                    icon:"🌳", color:"#166534", helpline:"1800-180-4288", slaHours:96, categories:["tree"] },
  health: { id:"health", name:"Health & Family Welfare",       nameHindi:"स्वास्थ्य विभाग",             icon:"🏥", color:"#EF4444", helpline:"104",           slaHours:24, categories:["health_hazard"] },
  usdma:  { id:"usdma",  name:"USDMA — Disaster Management",   nameHindi:"आपदा प्रबंधन प्राधिकरण",     icon:"🆘", color:"#DC2626", helpline:"1070",          slaHours:2,  categories:["disaster"] },
  police: { id:"police", name:"Uttarakhand Police",            nameHindi:"उत्तराखण्ड पुलिस",            icon:"🚔", color:"#1E3A5F", helpline:"100",           slaHours:1,  categories:["noise"] },
};

export function getDeptIdForCategory(category: string): string {
  for (const [id, dept] of Object.entries(DEPARTMENTS)) {
    if (dept.categories.includes(category)) return id;
  }
  return "pwd";
}

// Global event emitter for SSE department streams
export const deptEmitter = new EventEmitter();
deptEmitter.setMaxListeners(200);

// Global event emitter for SSE CPR/safety streams
export const cprEmitter = new EventEmitter();
cprEmitter.setMaxListeners(200);

export type UserRole = "citizen" | "worker" | "admin" | "super_admin";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type ComplaintStatus = "pending" | "in_progress" | "resolved" | "closed";
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
  aiScore: number;
  aiConfidence: number;
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
  assignedWorkerPin?: string;
  proofPhoto?: string;
  proofNote?: string;
  proofSubmittedAt?: string;
}

// Department routing: AI maps complaint category → responsible government dept
export function assignDepartment(category: string): string {
  const map: Record<string, string> = {
    electricity:   "UPCL (Uttarakhand Power Corporation Ltd)",
    transformer:   "UPCL (Uttarakhand Power Corporation Ltd)",
    streetlight:   "UPCL (Uttarakhand Power Corporation Ltd)",
    water:         "Jal Sansthan (Uttarakhand Jal Sansthan)",
    drain:         "ULB (Urban Local Bodies / Nagar Palika)",
    sewage:        "ULB (Urban Local Bodies / Nagar Palika)",
    garbage:       "ULB (Urban Local Bodies / Nagar Palika)",
    pothole:       "PWD (Public Works Department)",
    road_damage:   "PWD (Public Works Department)",
    tree:          "Forest Department",
    noise:         "Uttarakhand Police",
    health_hazard: "Health & Family Welfare Department",
    disaster:      "USDMA (Disaster Management Authority)",
    other:         "PWD (Public Works Department)",
  };
  return map[category] || "PWD (Public Works Department)";
}

export interface SOSAlert {
  id: string;
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
  token: string;
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

export interface PredictiveAlert {
  category: string;
  district: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  prediction: string;
  confidence: number;
  recommendedAction: string;
}

// ── UTTARAKHAND DISTRICTS & BLOCKS ────────────────────────────────────────────
const DISTRICTS_DATA = [
  { district: "Dehradun",         center: { lat: 30.3165, lng: 78.0322 } },
  { district: "Haridwar",         center: { lat: 29.9457, lng: 78.1642 } },
  { district: "Tehri Garhwal",    center: { lat: 30.3783, lng: 78.4831 } },
  { district: "Pauri Garhwal",    center: { lat: 30.1455, lng: 78.7756 } },
  { district: "Rudraprayag",      center: { lat: 30.2847, lng: 78.9816 } },
  { district: "Chamoli",          center: { lat: 30.3960, lng: 79.3203 } },
  { district: "Uttarkashi",       center: { lat: 30.7268, lng: 78.4350 } },
  { district: "Pithoragarh",      center: { lat: 29.5826, lng: 80.2181 } },
  { district: "Bageshwar",        center: { lat: 29.8380, lng: 79.7700 } },
  { district: "Almora",           center: { lat: 29.5971, lng: 79.6537 } },
  { district: "Champawat",        center: { lat: 29.3333, lng: 80.0905 } },
  { district: "Nainital",         center: { lat: 29.3803, lng: 79.4636 } },
  { district: "Udham Singh Nagar",center: { lat: 28.9935, lng: 79.4024 } },
];

const WARDS_DATA: { name: string; number: number; area: string; district: string; center: GeoPoint; pop: number }[] = [
  // Dehradun
  { name: "Sahastradhara Block",    number: 1,  area: "Dehradun Urban",   district: "Dehradun",         center: { lat: 30.3760, lng: 78.0882 }, pop: 95000  },
  { name: "Raipur Block",           number: 2,  area: "Dehradun East",    district: "Dehradun",         center: { lat: 30.2900, lng: 78.0620 }, pop: 72000  },
  { name: "Vikasnagar Block",       number: 3,  area: "Dehradun West",    district: "Dehradun",         center: { lat: 30.4490, lng: 77.7750 }, pop: 58000  },
  // Haridwar
  { name: "Haridwar Block",         number: 4,  area: "Haridwar Urban",   district: "Haridwar",         center: { lat: 29.9457, lng: 78.1642 }, pop: 310000 },
  { name: "Roorkee Block",          number: 5,  area: "Haridwar East",    district: "Haridwar",         center: { lat: 29.8542, lng: 77.8880 }, pop: 185000 },
  { name: "Bhagwanpur Block",       number: 6,  area: "Haridwar South",   district: "Haridwar",         center: { lat: 29.8100, lng: 78.1200 }, pop: 64000  },
  // Tehri Garhwal
  { name: "New Tehri Block",        number: 7,  area: "Tehri Urban",      district: "Tehri Garhwal",    center: { lat: 30.3783, lng: 78.4831 }, pop: 28000  },
  { name: "Narendra Nagar Block",   number: 8,  area: "Tehri South",      district: "Tehri Garhwal",    center: { lat: 30.1650, lng: 78.2870 }, pop: 35000  },
  // Pauri Garhwal
  { name: "Pauri Block",            number: 9,  area: "Pauri Urban",      district: "Pauri Garhwal",    center: { lat: 30.1455, lng: 78.7756 }, pop: 45000  },
  { name: "Kotdwar Block",          number: 10, area: "Pauri South",      district: "Pauri Garhwal",    center: { lat: 29.7476, lng: 78.5247 }, pop: 62000  },
  // Rudraprayag
  { name: "Rudraprayag Block",      number: 11, area: "Rudraprayag Urban", district: "Rudraprayag",      center: { lat: 30.2847, lng: 78.9816 }, pop: 23000  },
  { name: "Agastmuni Block",        number: 12, area: "Rudraprayag North", district: "Rudraprayag",      center: { lat: 30.4127, lng: 79.0760 }, pop: 18000  },
  // Chamoli
  { name: "Gopeshwar Block",        number: 13, area: "Chamoli Urban",     district: "Chamoli",          center: { lat: 30.3960, lng: 79.3203 }, pop: 21000  },
  { name: "Joshimath Block",        number: 14, area: "Chamoli North",     district: "Chamoli",          center: { lat: 30.5596, lng: 79.5668 }, pop: 17000  },
  // Uttarkashi
  { name: "Uttarkashi Block",       number: 15, area: "Uttarkashi Urban",  district: "Uttarkashi",       center: { lat: 30.7268, lng: 78.4350 }, pop: 32000  },
  { name: "Bhatwari Block",         number: 16, area: "Uttarkashi North",  district: "Uttarkashi",       center: { lat: 30.8780, lng: 78.5010 }, pop: 19000  },
  // Pithoragarh
  { name: "Pithoragarh Block",      number: 17, area: "Pithoragarh Urban", district: "Pithoragarh",      center: { lat: 29.5826, lng: 80.2181 }, pop: 55000  },
  { name: "Dharchula Block",        number: 18, area: "Pithoragarh North", district: "Pithoragarh",      center: { lat: 29.8530, lng: 80.5290 }, pop: 29000  },
  // Bageshwar
  { name: "Bageshwar Block",        number: 19, area: "Bageshwar Urban",   district: "Bageshwar",        center: { lat: 29.8380, lng: 79.7700 }, pop: 34000  },
  { name: "Kapkot Block",           number: 20, area: "Bageshwar North",   district: "Bageshwar",        center: { lat: 30.0200, lng: 79.8900 }, pop: 22000  },
  // Almora
  { name: "Almora Block",           number: 21, area: "Almora Urban",      district: "Almora",           center: { lat: 29.5971, lng: 79.6537 }, pop: 48000  },
  { name: "Ranikhet Block",         number: 22, area: "Almora West",       district: "Almora",           center: { lat: 29.6407, lng: 79.4374 }, pop: 32000  },
  // Champawat
  { name: "Champawat Block",        number: 23, area: "Champawat Urban",   district: "Champawat",        center: { lat: 29.3333, lng: 80.0905 }, pop: 38000  },
  { name: "Lohaghat Block",         number: 24, area: "Champawat South",   district: "Champawat",        center: { lat: 29.4136, lng: 80.0620 }, pop: 26000  },
  { name: "Tanakpur Block",         number: 25, area: "Champawat East",    district: "Champawat",        center: { lat: 29.0770, lng: 80.1110 }, pop: 42000  },
  // Nainital
  { name: "Nainital Block",         number: 26, area: "Nainital Urban",    district: "Nainital",         center: { lat: 29.3803, lng: 79.4636 }, pop: 65000  },
  { name: "Haldwani Block",         number: 27, area: "Nainital South",    district: "Nainital",         center: { lat: 29.2183, lng: 79.5129 }, pop: 250000 },
  { name: "Bhimtal Block",          number: 28, area: "Nainital West",     district: "Nainital",         center: { lat: 29.3500, lng: 79.5600 }, pop: 38000  },
  // Udham Singh Nagar
  { name: "Rudrapur Block",         number: 29, area: "US Nagar Urban",    district: "Udham Singh Nagar",center: { lat: 28.9835, lng: 79.4026 }, pop: 290000 },
  { name: "Kashipur Block",         number: 30, area: "US Nagar West",     district: "Udham Singh Nagar",center: { lat: 29.2100, lng: 78.9600 }, pop: 120000 },
  { name: "Khatima Block",          number: 31, area: "US Nagar South",    district: "Udham Singh Nagar",center: { lat: 28.9250, lng: 79.9650 }, pop: 85000  },
  { name: "Sitarganj Block",        number: 32, area: "US Nagar East",     district: "Udham Singh Nagar",center: { lat: 28.9280, lng: 79.7024 }, pop: 95000  },
];

const POLICE_STATIONS: PoliceStation[] = [
  // Dehradun
  { id: "ps1",  name: "Dehradun Kotwali PS",     address: "Kotwali Area, Dehradun 248001",            phone: "0135-2712050", geo: { lat: 30.3165, lng: 78.0322 }, ward: "Sahastradhara Block",  district: "Dehradun" },
  { id: "ps2",  name: "Rajpur Road PS",           address: "Rajpur Road, Dehradun 248001",             phone: "0135-2743200", geo: { lat: 30.3450, lng: 78.0630 }, ward: "Raipur Block",         district: "Dehradun" },
  { id: "ps3",  name: "Patel Nagar PS",           address: "Patel Nagar, Dehradun 248001",             phone: "0135-2653200", geo: { lat: 30.2940, lng: 78.0240 }, ward: "Sahastradhara Block",  district: "Dehradun" },
  { id: "ps4",  name: "Vikasnagar PS",            address: "Vikasnagar, Dehradun 248198",              phone: "01360-263055", geo: { lat: 30.4490, lng: 77.7750 }, ward: "Vikasnagar Block",     district: "Dehradun" },
  // Haridwar
  { id: "ps5",  name: "Haridwar Kotwali PS",      address: "Haridwar City, Haridwar 249401",           phone: "01334-225020", geo: { lat: 29.9457, lng: 78.1642 }, ward: "Haridwar Block",       district: "Haridwar" },
  { id: "ps6",  name: "Roorkee PS",               address: "Civil Lines, Roorkee 247667",              phone: "01332-272040", geo: { lat: 29.8542, lng: 77.8880 }, ward: "Roorkee Block",        district: "Haridwar" },
  { id: "ps7",  name: "Bhagwanpur PS",            address: "Bhagwanpur, Haridwar 247661",              phone: "01334-231032", geo: { lat: 29.8100, lng: 78.1200 }, ward: "Bhagwanpur Block",     district: "Haridwar" },
  // Tehri Garhwal
  { id: "ps8",  name: "New Tehri PS",             address: "New Tehri Town, Tehri 249001",             phone: "01376-233400", geo: { lat: 30.3783, lng: 78.4831 }, ward: "New Tehri Block",      district: "Tehri Garhwal" },
  { id: "ps9",  name: "Narendra Nagar PS",        address: "Narendra Nagar, Tehri 249175",             phone: "01376-222030", geo: { lat: 30.1650, lng: 78.2870 }, ward: "Narendra Nagar Block", district: "Tehri Garhwal" },
  // Pauri Garhwal
  { id: "ps10", name: "Pauri PS",                 address: "Pauri Town, Pauri Garhwal 246001",         phone: "01368-222020", geo: { lat: 30.1455, lng: 78.7756 }, ward: "Pauri Block",          district: "Pauri Garhwal" },
  { id: "ps11", name: "Kotdwar PS",               address: "Kotdwar Town, Pauri Garhwal 246149",       phone: "01382-222050", geo: { lat: 29.7476, lng: 78.5247 }, ward: "Kotdwar Block",        district: "Pauri Garhwal" },
  // Rudraprayag
  { id: "ps12", name: "Rudraprayag PS",           address: "Rudraprayag Town 246171",                  phone: "01364-233500", geo: { lat: 30.2847, lng: 78.9816 }, ward: "Rudraprayag Block",    district: "Rudraprayag" },
  // Chamoli
  { id: "ps13", name: "Gopeshwar PS",             address: "Gopeshwar, Chamoli 246401",                phone: "01372-252100", geo: { lat: 30.3960, lng: 79.3203 }, ward: "Gopeshwar Block",      district: "Chamoli" },
  { id: "ps14", name: "Joshimath PS",             address: "Joshimath, Chamoli 246443",                phone: "01389-222500", geo: { lat: 30.5596, lng: 79.5668 }, ward: "Joshimath Block",      district: "Chamoli" },
  // Uttarkashi
  { id: "ps15", name: "Uttarkashi PS",            address: "Uttarkashi Town 249193",                   phone: "01374-222020", geo: { lat: 30.7268, lng: 78.4350 }, ward: "Uttarkashi Block",     district: "Uttarkashi" },
  // Pithoragarh
  { id: "ps16", name: "Pithoragarh PS",           address: "Pithoragarh Town 262501",                  phone: "05964-225032", geo: { lat: 29.5826, lng: 80.2181 }, ward: "Pithoragarh Block",    district: "Pithoragarh" },
  { id: "ps17", name: "Dharchula PS",             address: "Dharchula, Pithoragarh 262552",            phone: "05966-226018", geo: { lat: 29.8530, lng: 80.5290 }, ward: "Dharchula Block",      district: "Pithoragarh" },
  // Bageshwar
  { id: "ps18", name: "Bageshwar PS",             address: "Bageshwar Town 263642",                    phone: "05963-220050", geo: { lat: 29.8380, lng: 79.7700 }, ward: "Bageshwar Block",      district: "Bageshwar" },
  // Almora
  { id: "ps19", name: "Almora Kotwali PS",        address: "Almora Town 263601",                       phone: "05962-230070", geo: { lat: 29.5971, lng: 79.6537 }, ward: "Almora Block",         district: "Almora" },
  { id: "ps20", name: "Ranikhet PS",              address: "Ranikhet Cantonment, Almora 263645",       phone: "05966-220100", geo: { lat: 29.6407, lng: 79.4374 }, ward: "Ranikhet Block",       district: "Almora" },
  // Champawat
  { id: "ps21", name: "Champawat PS",             address: "Champawat Town 262523",                    phone: "05965-230025", geo: { lat: 29.3333, lng: 80.0905 }, ward: "Champawat Block",      district: "Champawat" },
  { id: "ps22", name: "Lohaghat PS",              address: "Lohaghat, Champawat 262524",               phone: "05965-231050", geo: { lat: 29.4136, lng: 80.0620 }, ward: "Lohaghat Block",       district: "Champawat" },
  { id: "ps23", name: "Tanakpur PS",              address: "Tanakpur, Champawat 262309",               phone: "05943-252018", geo: { lat: 29.0770, lng: 80.1110 }, ward: "Tanakpur Block",       district: "Champawat" },
  // Nainital
  { id: "ps24", name: "Nainital Kotwali PS",      address: "Mall Road, Nainital 263002",               phone: "05942-235036", geo: { lat: 29.3803, lng: 79.4636 }, ward: "Nainital Block",       district: "Nainital" },
  { id: "ps25", name: "Haldwani PS",              address: "Haldwani Town, Nainital 263139",           phone: "05946-224040", geo: { lat: 29.2183, lng: 79.5129 }, ward: "Haldwani Block",       district: "Nainital" },
  // Udham Singh Nagar
  { id: "ps26", name: "Rudrapur Kotwali PS",      address: "Civil Lines, Rudrapur 263153",             phone: "05944-240050", geo: { lat: 28.9835, lng: 79.4026 }, ward: "Rudrapur Block",       district: "Udham Singh Nagar" },
  { id: "ps27", name: "Kashipur PS",              address: "Kashipur Town 244713",                     phone: "05947-271600", geo: { lat: 29.2100, lng: 78.9600 }, ward: "Kashipur Block",       district: "Udham Singh Nagar" },
  { id: "ps28", name: "Khatima PS",               address: "Khatima, US Nagar 262308",                 phone: "05943-254020", geo: { lat: 28.9250, lng: 79.9650 }, ward: "Khatima Block",        district: "Udham Singh Nagar" },
];

const WORKER_NAMES = [
  "Ramesh Negi","Gopal Bisht","Pushpa Rawat","Suresh Rana","Anita Devi",
  "Vikram Panwar","Meena Mehta","Mohan Joshi","Kavita Bora","Deepak Kunwar",
  "Sunita Adhikari","Ravi Bhandari","Pooja Mahar","Arun Rikhola","Geeta Semwal",
  "Sanjay Nautiyal","Rekha Chauhan","Lokesh Dobhal","Shashi Kala","Prakash Tamta",
  "Dinesh Ghildiyal","Hema Kandpal","Bijendra Singh","Lalita Pant","Naresh Tolia",
  "Seema Lingwal","Bhupesh Maithani","Kamla Sajwan","Trilok Rana","Usha Bhatt",
];

const COMPLAINT_DESCS: Record<ComplaintCategory, string[]> = {
  pothole: [
    "Large pothole on Badrinath highway causing accidents, vehicles getting damaged",
    "Deep crater near government school gate, children at serious risk",
    "Multiple potholes on hospital road, patient transport hampered",
    "Road completely broken near bus stand, flooding during rain",
    "Two-wheeler accident due to hidden pothole on mountain road",
    "Pothole 3ft wide near market junction blocking traffic on hill road",
  ],
  garbage: [
    "Garbage not collected for 7 days near market area, creating health hazard",
    "Overflowing municipality dustbin near primary school",
    "Illegal garbage dump near residential colony on hillside",
    "Construction waste dumped on public footpath near river",
    "Burning garbage creating toxic smoke near residential area",
    "Abandoned garbage near tourist area damaging Uttarakhand's image",
  ],
  streetlight: [
    "Street lights non-functional for 3 weeks, area unsafe at night on mountain road",
    "Single working light in 500m stretch, residents afraid to walk",
    "Lights sparking dangerously near children's park",
    "New LED poles installed but never switched on",
    "Lights malfunction — running all day, off at night",
    "Multiple broken lights causing accidents on dark mountain curve",
  ],
  water: [
    "No water supply for 5 days in summer, valley residents suffering",
    "Brown dirty water flowing from taps due to pipeline damage in landslide",
    "Pipeline burst flooding village road for 48 hours",
    "Water pressure critically low — upper floor residents getting nothing",
    "Sewage mixing with drinking water, disease risk in densely populated area",
    "Water tanker not arriving despite request, senior citizens suffering",
  ],
  drain: [
    "Clogged drain flooding market area after 10 minutes of rain",
    "Sewage overflow entering homes, furniture damaged",
    "Open drain near primary school breeding dengue mosquitoes",
    "Blocked storm drain causing road waterlogging since monsoon",
    "Drain wall collapsed, children have fallen in twice",
    "Raw sewage smell making entire market area unbearable",
  ],
  electricity: [
    "Power cuts 8-10 hours daily due to transformer fault",
    "Transformer sparking visibly, entire village at risk",
    "Exposed high-voltage wire fallen on footpath after landslide",
    "Electricity bill paid but supply disconnected wrongly",
    "Short circuit causing fires, 3 incidents in one week",
    "Meter tampering by officials causing inflated bills",
  ],
  tree: [
    "Massive dead tree leaning over house after storm, will fall any day",
    "Fallen tree blocking main road connecting two villages",
    "Tree roots breaking water main pipe, water loss in colony",
    "Hanging branch over school compound wall, child safety risk",
    "Tree fell on parked vehicles during storm, no response from authorities",
    "Uprooted tree blocking only access footpath in hilly area",
  ],
  road_damage: [
    "Entire road surface broken after monsoon flooding, vehicles cannot pass",
    "Bridge road damaged with cracks, heavy vehicles advised to avoid",
    "Mountain highway shoulder has collapsed, one-lane road extremely dangerous",
    "Storm washed away road surface near village, ambulance route cut",
    "Road sinkhole appeared overnight, 3-feet deep near bus stop",
    "Landslide debris still blocking half of NH-58, traffic jams 5km",
  ],
  sewage: [
    "Sewage line overflowing onto footpath for 4 days, unbearable smell",
    "Manhole cover missing on main road, open sewage exposing residents",
    "Sewage leaking into drinking water supply, disease risk in colony",
    "Underground sewage pipe burst near market, flooding footpaths",
    "Old sewage drain collapsed, contents spilling on residential street",
    "Sewage treatment plant overflow entering river, environmental hazard",
  ],
  transformer: [
    "Transformer burnt last night, 400 homes without power for 2 days",
    "Oil leaking from transformer near school, fire hazard",
    "Transformer sparking loudly, entire neighborhood afraid to sleep",
    "Old transformer overloaded — trips 6-7 times daily, appliances damaged",
    "Transformer pole tilted after rain, could fall on road",
    "No transformer installed in new colony despite 6 months of payment",
  ],
  noise: [
    "Illegal loudspeakers running till 3 AM near residential area daily",
    "Construction drilling from 5 AM disrupting sleep and exams",
    "Commercial generator running 24/7 next to homes — 85 decibels",
    "Pub playing loud music till midnight in residential zone",
    "Temple festival loudspeaker causing noise beyond 10 PM limit",
    "Factory noise and vibration cracking walls of nearby houses",
  ],
  health_hazard: [
    "Dead animals on main road for 3 days, disease outbreak risk",
    "Illegal slaughterhouse waste dumped in river causing contamination",
    "Stagnant water breeding dengue mosquitoes near primary school",
    "Food stall operating without hygiene — students falling ill",
    "Chemical waste dumped near water body, strong toxic smell",
    "Mass rat infestation in market area destroying food stocks",
  ],
  disaster: [
    "Landslide has blocked the only road to our village for 2 days",
    "Heavy flooding in low-lying area, 20 families need evacuation",
    "Hill slope showing cracks after heavy rain — landslide imminent",
    "Flash flood destroyed agricultural land, farmers need emergency help",
    "Bridge cracked due to excessive water flow — unsafe to cross",
    "Mountain stream overflowing due to cloudburst, road cut off",
  ],
  other: [
    "Stray dogs attacking residents at night regularly in colony",
    "Broken footpath tiles on main market road causing injury to elderly",
    "Unauthorized encroachment on forest land near village boundary",
    "Abandoned vehicle blocking emergency access near hospital",
    "Landslide debris on road not cleared for 2 days",
    "Public toilet broken and overflowing near tourist spot",
  ],
};

const LOCATIONS_PREFIX = [
  "Near Bus Stand", "Main Bazar", "Block Road", "Colony Gate",
  "Hospital Road", "School Road", "Park Area", "Market Junction",
  "Railway Bridge", "Temple Road", "Residential Colony", "Market Chowk",
  "Near Forest Range Office", "NH-58 Bypass", "River Bridge Road",
];

function rnd<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function rndFloat(min: number, max: number, decimals = 4): number {
  return parseFloat((min + Math.random() * (max - min)).toFixed(decimals));
}
function hoursAgo(h: number): string { return new Date(Date.now() - h * 3600000).toISOString(); }
function genId(): string { return randomUUID(); }
function genTicketId(): string { return `UK-${rndInt(10000, 99999)}`; }

function perturbGeo(center: GeoPoint, radiusDeg = 0.020): GeoPoint {
  return {
    lat: rndFloat(center.lat - radiusDeg, center.lat + radiusDeg),
    lng: rndFloat(center.lng - radiusDeg, center.lng + radiusDeg),
  };
}

const PATROL_VANS_SEED: PatrolVan[] = [
  { id: "pv001", vanNumber: "UK07-CPR-001", officerInCharge: "SI Anil Kumar", officerPhone: "9412012001", crewCount: 3, district: "Dehradun", zone: "Clock Tower-Rajpur Road", status: "active_patrol", geo: { lat: 30.3165, lng: 78.0322 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv002", vanNumber: "UK07-CPR-002", officerInCharge: "SI Priya Rana", officerPhone: "9412012002", crewCount: 3, district: "Dehradun", zone: "Clement Town-Ballupur", status: "active_patrol", geo: { lat: 30.2880, lng: 78.0450 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv003", vanNumber: "UK01-CPR-003", officerInCharge: "SI Mohan Singh", officerPhone: "9412012003", crewCount: 4, district: "Haridwar", zone: "Har Ki Pauri-Jwalapur", status: "base", geo: { lat: 29.9457, lng: 78.1642 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv004", vanNumber: "UK05-CPR-004", officerInCharge: "SI Neha Bisht", officerPhone: "9412012004", crewCount: 3, district: "Nainital", zone: "Mall Road-Tallital", status: "active_patrol", geo: { lat: 29.3909, lng: 79.4542 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv005", vanNumber: "UK06-CPR-005", officerInCharge: "SI Ravi Joshi", officerPhone: "9412012005", crewCount: 3, district: "Udham Singh Nagar", zone: "Rudrapur Central", status: "active_patrol", geo: { lat: 29.0293, lng: 79.4661 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv006", vanNumber: "UK03-CPR-006", officerInCharge: "SI Kavita Panwar", officerPhone: "9412012006", crewCount: 3, district: "Almora", zone: "Mall Road-Lala Bazaar", status: "active_patrol", geo: { lat: 29.5971, lng: 79.6460 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv007", vanNumber: "UK09-CPR-007", officerInCharge: "SI Deepak Negi", officerPhone: "9412012007", crewCount: 4, district: "Pithoragarh", zone: "Pithoragarh Town", status: "base", geo: { lat: 29.5829, lng: 80.2176 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv008", vanNumber: "UK08-CPR-008", officerInCharge: "SI Sunita Rawat", officerPhone: "9412012008", crewCount: 3, district: "Chamoli", zone: "Gopeshwar-Joshimath", status: "active_patrol", geo: { lat: 30.3990, lng: 79.3205 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv009", vanNumber: "UK02-CPR-009", officerInCharge: "SI Harish Bartwal", officerPhone: "9412012009", crewCount: 4, district: "Uttarkashi", zone: "Town Area-Gangotri Road", status: "active_patrol", geo: { lat: 30.7268, lng: 78.4354 }, shift: "night", isWomenSafetyUnit: false },
  { id: "pv010", vanNumber: "UK07-CPR-010", officerInCharge: "SI Meena Thakur", officerPhone: "9412012010", crewCount: 3, district: "Dehradun", zone: "Prem Nagar-Selaqui", status: "off_duty", geo: { lat: 30.3565, lng: 77.9900 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv011", vanNumber: "UK04-CPR-011", officerInCharge: "SI Ramesh Dobhal", officerPhone: "9412012011", crewCount: 4, district: "Tehri Garhwal", zone: "Tehri-Devprayag", status: "active_patrol", geo: { lat: 30.3912, lng: 78.4803 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv012", vanNumber: "UK01-CPR-012", officerInCharge: "SI Anita Nautiyal", officerPhone: "9412012012", crewCount: 3, district: "Haridwar", zone: "BHEL-Sidcul", status: "active_patrol", geo: { lat: 29.9820, lng: 78.1100 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv013", vanNumber: "UK11-CPR-013", officerInCharge: "SI Bhavna Rawat", officerPhone: "9412012013", crewCount: 3, district: "Rudraprayag", zone: "Rudraprayag Town-Agastmuni", status: "active_patrol", geo: { lat: 30.2847, lng: 78.9816 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv014", vanNumber: "UK10-CPR-014", officerInCharge: "SI Suresh Panwar", officerPhone: "9412012014", crewCount: 4, district: "Pauri Garhwal", zone: "Pauri-Kotdwar Highway", status: "active_patrol", geo: { lat: 30.1455, lng: 78.7756 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv015", vanNumber: "UK12-CPR-015", officerInCharge: "SI Geeta Rana", officerPhone: "9412012015", crewCount: 3, district: "Champawat", zone: "Champawat-Tanakpur Road", status: "active_patrol", geo: { lat: 29.3333, lng: 80.0905 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv016", vanNumber: "UK13-CPR-016", officerInCharge: "SI Dinesh Mahar", officerPhone: "9412012016", crewCount: 3, district: "Bageshwar", zone: "Bageshwar Town-Kapkot", status: "active_patrol", geo: { lat: 29.8380, lng: 79.7700 }, shift: "night", isWomenSafetyUnit: false },
  { id: "pv017", vanNumber: "UK07-CPR-017", officerInCharge: "SI Naina Bisht", officerPhone: "9412012017", crewCount: 3, district: "Dehradun", zone: "ISBT-Saharanpur Road", status: "active_patrol", geo: { lat: 30.2980, lng: 78.0520 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv018", vanNumber: "UK01-CPR-018", officerInCharge: "SI Rajesh Thapli", officerPhone: "9412012018", crewCount: 4, district: "Haridwar", zone: "Rishikesh-Shyampur", status: "active_patrol", geo: { lat: 29.9582, lng: 78.2143 }, shift: "day", isWomenSafetyUnit: false },
];

function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

class AppStorage {
  private users: Map<string, AppUser> = new Map();
  private tokens: Map<string, AuthToken> = new Map();
  private workerTempTokens: Map<string, { complaintId: string; phone: string; pin: string; expiresAt: number }> = new Map();
  private complaints: Complaint[] = [];
  private sosAlerts: SOSAlert[] = [];
  private wards: Ward[] = [];
  private workers: Worker[] = [];
  private patrolVans: PatrolVan[] = PATROL_VANS_SEED.map(v => ({ ...v }));
  private safetyIncidents: SafetyIncident[] = [];
  private nightSafetyZones: NightSafetyZone[] = [];
  private policeStations: PoliceStation[] = POLICE_STATIONS;
  private riskZones: RiskZone[] = [];
  private announcements: Announcement[] = [];
  private polls: Poll[] = [];
  private petitions: Petition[] = [];
  private rtis: RTIRequest[] = [];
  private civicEvents: CivicEvent[] = [];
  private chatMessages: ChatMessage[] = [];
  private budgetItems: BudgetItem[] = [];
  private auditLogs: AuditLog[] = [];
  private emergencyServices: EmergencyService[] = [
    // Dehradun
    { id: "es1",  type: "hospital",  name: "Doon Medical College & Hospital",    district: "Dehradun",          address: "New Road, Dehradun",                    phone: "0135-2520411", beds: 500, available: true,  geo: { lat: 30.3200, lng: 78.0400 } },
    { id: "es2",  type: "hospital",  name: "Mahant Indiresh Hospital",            district: "Dehradun",          address: "Patel Nagar, Dehradun",                 phone: "0135-2520800", beds: 350, available: true,  geo: { lat: 30.3150, lng: 78.0350 } },
    { id: "es3",  type: "fire",      name: "Dehradun Fire Station",               district: "Dehradun",          address: "Subhash Road, Dehradun",                phone: "0135-2652222",              available: true,  geo: { lat: 30.3165, lng: 78.0322 } },
    { id: "es4",  type: "ambulance", name: "108 Emergency Dehradun Hub",          district: "Dehradun",          address: "AIIMS Rishikesh Road, Dehradun",        phone: "108",                        available: true,  geo: { lat: 30.3100, lng: 78.0100 } },
    { id: "es5",  type: "disaster",  name: "SDRF Dehradun Command",               district: "Dehradun",          address: "Govind Garh, Dehradun",                 phone: "0135-2710334",              available: true,  geo: { lat: 30.3300, lng: 78.0550 } },
    // Haridwar
    { id: "es6",  type: "hospital",  name: "District Hospital Haridwar",          district: "Haridwar",          address: "Jwalapur Road, Haridwar",               phone: "01334-226800", beds: 400, available: true,  geo: { lat: 29.9457, lng: 78.1642 } },
    { id: "es7",  type: "fire",      name: "Haridwar Fire & Rescue",              district: "Haridwar",          address: "Ranipur Mod, Haridwar",                 phone: "01334-220101",              available: true,  geo: { lat: 29.9500, lng: 78.1700 } },
    { id: "es8",  type: "ambulance", name: "108 Emergency Haridwar",              district: "Haridwar",          address: "Rishikesh Bypass, Haridwar",            phone: "108",                        available: true,  geo: { lat: 29.9400, lng: 78.1500 } },
    // Nainital
    { id: "es9",  type: "hospital",  name: "BG Sardar Ballabh Pant Govt Hospital",district: "Nainital",          address: "Mall Road, Nainital",                   phone: "05942-235812", beds: 250, available: true,  geo: { lat: 29.3803, lng: 79.4636 } },
    { id: "es10", type: "fire",      name: "Nainital Fire Station",               district: "Nainital",          address: "Malital, Nainital",                     phone: "05942-235100",              available: true,  geo: { lat: 29.3800, lng: 79.4600 } },
    { id: "es11", type: "ambulance", name: "108 Emergency Nainital",              district: "Nainital",          address: "Mallital, Nainital",                    phone: "108",                        available: true,  geo: { lat: 29.3810, lng: 79.4640 } },
    { id: "es12", type: "disaster",  name: "NDRF Camp Ramnagar",                  district: "Nainital",          address: "Ramnagar Base, Nainital",               phone: "05947-251500",              available: true,  geo: { lat: 29.3900, lng: 79.4800 } },
    // Pithoragarh
    { id: "es13", type: "hospital",  name: "District Hospital Pithoragarh",       district: "Pithoragarh",       address: "Munsiari Road, Pithoragarh",            phone: "05964-225102", beds: 180, available: true,  geo: { lat: 29.5826, lng: 80.2181 } },
    { id: "es14", type: "fire",      name: "Pithoragarh Fire Station",            district: "Pithoragarh",       address: "Sadar Bazar, Pithoragarh",              phone: "05964-224222",              available: false, geo: { lat: 29.5800, lng: 80.2150 } },
    // Champawat
    { id: "es15", type: "hospital",  name: "District Hospital Champawat",         district: "Champawat",         address: "Main Road, Champawat",                  phone: "05965-230200", beds: 100, available: true,  geo: { lat: 29.3333, lng: 80.0893 } },
    { id: "es16", type: "ambulance", name: "108 Emergency Champawat",             district: "Champawat",         address: "Champawat Bus Stand",                   phone: "108",                        available: true,  geo: { lat: 29.3340, lng: 80.0900 } },
    // Almora
    { id: "es17", type: "hospital",  name: "Base Hospital Almora",                district: "Almora",            address: "Lamachaur, Almora",                     phone: "05962-231002", beds: 200, available: true,  geo: { lat: 29.5971, lng: 79.6591 } },
    { id: "es18", type: "fire",      name: "Almora Fire Brigade",                 district: "Almora",            address: "Kachahri Road, Almora",                 phone: "05962-231100",              available: true,  geo: { lat: 29.5960, lng: 79.6580 } },
    // Udham Singh Nagar
    { id: "es19", type: "hospital",  name: "Govt Medical College Rudrapur",       district: "Udham Singh Nagar", address: "Udham Singh Nagar Bypass",              phone: "05944-251800", beds: 450, available: true,  geo: { lat: 28.9800, lng: 79.4000 } },
    { id: "es20", type: "fire",      name: "Rudrapur Fire Station",               district: "Udham Singh Nagar", address: "SIDCUL, Rudrapur",                      phone: "05944-240101",              available: true,  geo: { lat: 28.9750, lng: 79.3950 } },
    { id: "es21", type: "ambulance", name: "108 Emergency USN Hub",               district: "Udham Singh Nagar", address: "Pantnagar Airport Rd",                  phone: "108",                        available: true,  geo: { lat: 28.9900, lng: 79.4100 } },
    // Tehri
    { id: "es22", type: "hospital",  name: "District Hospital New Tehri",         district: "Tehri Garhwal",     address: "New Tehri Town",                        phone: "01376-233300", beds: 150, available: true,  geo: { lat: 30.3783, lng: 78.4831 } },
    { id: "es23", type: "disaster",  name: "Tehri Dam Disaster Response",         district: "Tehri Garhwal",     address: "THDC Colony, New Tehri",                phone: "01376-232800",              available: true,  geo: { lat: 30.3800, lng: 78.4850 } },
    // Uttarkashi
    { id: "es24", type: "hospital",  name: "District Hospital Uttarkashi",        district: "Uttarkashi",        address: "Birpur Road, Uttarkashi",               phone: "01374-222802", beds: 120, available: true,  geo: { lat: 30.7268, lng: 78.4350 } },
    { id: "es25", type: "fire",      name: "Uttarkashi Fire Station",             district: "Uttarkashi",        address: "Nehru Market, Uttarkashi",              phone: "01374-222100",              available: true,  geo: { lat: 30.7260, lng: 78.4340 } },
    // Chamoli
    { id: "es26", type: "hospital",  name: "District Hospital Gopeshwar",         district: "Chamoli",           address: "Gopeshwar, Chamoli",                    phone: "01372-252802", beds: 130, available: true,  geo: { lat: 30.3960, lng: 79.3203 } },
    { id: "es27", type: "disaster",  name: "ITBP Joshimath Rescue Base",          district: "Chamoli",           address: "Joshimath, Chamoli",                    phone: "01389-222025",              available: true,  geo: { lat: 30.5503, lng: 79.5656 } },
    // Rudraprayag
    { id: "es28", type: "hospital",  name: "District Hospital Rudraprayag",       district: "Rudraprayag",       address: "Agastyamuni Road, Rudraprayag",         phone: "01364-233100", beds: 100, available: true,  geo: { lat: 30.2847, lng: 78.9816 } },
    // Pauri Garhwal
    { id: "es29", type: "hospital",  name: "Base Hospital Pauri",                 district: "Pauri Garhwal",     address: "Kandoliya, Pauri",                      phone: "01368-222200", beds: 180, available: true,  geo: { lat: 30.1455, lng: 78.7756 } },
    // Bageshwar
    { id: "es30", type: "hospital",  name: "District Hospital Bageshwar",         district: "Bageshwar",         address: "Bagnath, Bageshwar",                    phone: "05963-220200", beds: 80,  available: false, geo: { lat: 29.8389, lng: 79.7726 } },
  ];
  private wsListeners: Set<(event: any) => void> = new Set();

  constructor() { this.seed(); }

  addWsListener(fn: (event: any) => void) { this.wsListeners.add(fn); }
  removeWsListener(fn: (event: any) => void) { this.wsListeners.delete(fn); }
  broadcastEvent(event: any) { this.wsListeners.forEach(fn => fn(event)); }

  private seed() {
    // Super Admin — sees all Uttarakhand
    const superAdminId = genId();
    this.users.set(superAdminId, {
      id: superAdminId, name: "SANKALP Super Admin", phone: "9999999999", pin: "000000",
      role: "super_admin", district: "Uttarakhand", points: 9999,
      badges: ["super_admin"], level: 99, createdAt: new Date().toISOString()
    });

    // District Admins — one per district
    const adminDistricts = [
      { phone: "9999000001", name: "Dehradun Admin",         district: "Dehradun",         pin: "111111" },
      { phone: "9999000002", name: "Haridwar Admin",         district: "Haridwar",         pin: "222222" },
      { phone: "9999000003", name: "Champawat Admin",        district: "Champawat",        pin: "333333" },
      { phone: "9999000004", name: "Nainital Admin",         district: "Nainital",         pin: "444444" },
      { phone: "9999000005", name: "Almora Admin",           district: "Almora",           pin: "555555" },
      { phone: "9999000006", name: "Rudrapur Admin",         district: "Udham Singh Nagar",pin: "666666" },
    ];
    adminDistricts.forEach(a => {
      const id = genId();
      this.users.set(id, {
        id, name: a.name, phone: a.phone, pin: a.pin,
        role: "admin", district: a.district, points: 9999,
        badges: ["district_admin"], level: 50, createdAt: new Date().toISOString()
      });
    });

    // Demo citizen from Champawat
    const citizenId = genId();
    this.users.set(citizenId, {
      id: citizenId, name: "Arjun", phone: "9876543210", pin: "123456",
      role: "citizen", district: "Champawat", points: 350,
      badges: ["first_report", "active_citizen"], level: 4, createdAt: new Date().toISOString()
    });

    // More Uttarakhand citizens across districts
    const citizenSeeds: Omit<AppUser, "id" | "createdAt">[] = [
      { name: "Ramesh Kumar Rawat",    phone: "9811234567", pin: "112233", role: "citizen", district: "Dehradun",          points: 1420, badges: ["first_report", "active_citizen", "civic_hero", "city_champion"], level: 10 },
      { name: "Priya Bisht",           phone: "9711234568", pin: "223344", role: "citizen", district: "Haridwar",          points: 1180, badges: ["first_report", "active_citizen", "civic_hero", "city_champion"], level: 10 },
      { name: "Amit Negi",             phone: "9911234569", pin: "334455", role: "citizen", district: "Nainital",          points:  980, badges: ["first_report", "active_citizen", "civic_hero"], level: 9 },
      { name: "Sunita Mahar",          phone: "9611234570", pin: "445566", role: "citizen", district: "Almora",            points:  760, badges: ["first_report", "active_citizen", "civic_hero"], level: 8 },
      { name: "Ravi Panwar",           phone: "9511234571", pin: "556677", role: "citizen", district: "Champawat",         points:  890, badges: ["first_report", "active_citizen", "civic_hero", "city_champion"], level: 9 },
      { name: "Deepa Adhikari",        phone: "9411234572", pin: "667788", role: "citizen", district: "Pithoragarh",       points:  610, badges: ["first_report", "active_citizen", "civic_hero"], level: 7 },
      { name: "Suresh Tamta",          phone: "9311234573", pin: "778899", role: "citizen", district: "Udham Singh Nagar", points:  455, badges: ["first_report", "active_citizen"], level: 5 },
      { name: "Kavita Bora",           phone: "9211234574", pin: "889900", role: "citizen", district: "Dehradun",          points: 1050, badges: ["first_report", "active_citizen", "civic_hero", "city_champion"], level: 10 },
      { name: "Vikas Rana",            phone: "8811234575", pin: "990011", role: "citizen", district: "Tehri Garhwal",     points:  395, badges: ["first_report", "active_citizen"], level: 4 },
      { name: "Asha Devi",             phone: "8711234576", pin: "001122", role: "citizen", district: "Rudraprayag",       points:  530, badges: ["first_report", "active_citizen"], level: 6 },
      { name: "Mohan Joshi",           phone: "8611234577", pin: "112244", role: "citizen", district: "Uttarkashi",        points:  320, badges: ["first_report", "active_citizen"], level: 4 },
      { name: "Lalita Semwal",         phone: "8511234578", pin: "223355", role: "citizen", district: "Chamoli",           points:  480, badges: ["first_report", "active_citizen"], level: 5 },
      { name: "Naresh Singh",          phone: "8411234579", pin: "334466", role: "citizen", district: "Bageshwar",         points:  210, badges: ["first_report"], level: 3 },
      { name: "Kamla Pant",            phone: "8311234580", pin: "445577", role: "citizen", district: "Pauri Garhwal",     points:  860, badges: ["first_report", "active_citizen", "civic_hero", "city_champion"], level: 9 },
      { name: "Dinesh Bisht",          phone: "8211234581", pin: "556688", role: "citizen", district: "Dehradun",          points:  720, badges: ["first_report", "active_citizen", "civic_hero"], level: 8 },
      { name: "Geeta Rawat",           phone: "8111234582", pin: "667799", role: "citizen", district: "Haridwar",          points:  640, badges: ["first_report", "active_citizen"], level: 7 },
      { name: "Prakash Pant",          phone: "7911234583", pin: "778800", role: "citizen", district: "Nainital",          points:  580, badges: ["first_report", "active_citizen", "civic_hero"], level: 6 },
      { name: "Savita Arya",           phone: "7811234584", pin: "889911", role: "citizen", district: "Almora",            points:  290, badges: ["first_report"], level: 3 },
      { name: "Harish Chandra",        phone: "7711234585", pin: "990022", role: "citizen", district: "Pithoragarh",       points:  415, badges: ["first_report", "active_citizen"], level: 5 },
      { name: "Meena Devi Tamang",     phone: "7611234586", pin: "001233", role: "citizen", district: "Chamoli",           points:  175, badges: ["new_citizen", "first_report"], level: 2 },
    ];
    citizenSeeds.forEach(c => {
      const id = genId();
      this.users.set(id, { ...c, id, createdAt: new Date(Date.now() - rndInt(1, 365) * 86400000).toISOString() });
    });

    // Workers with geo positions across districts
    WORKER_NAMES.forEach((name, i) => {
      const ward = WARDS_DATA[i % WARDS_DATA.length];
      const score = rndInt(55, 98);
      this.workers.push({
        id: `w${i}`,
        name,
        phone: `98${rndInt(10000000, 99999999)}`,
        ward: ward.name,
        wardNumber: ward.number,
        district: ward.district,
        score,
        resolvedToday: rndInt(0, 8),
        totalResolved: rndInt(50, 500),
        avgRating: parseFloat((3 + Math.random() * 2).toFixed(1)),
        status: Math.random() < 0.7 ? "active" : Math.random() < 0.5 ? "idle" : "on_leave",
        currentTask: Math.random() < 0.6 ? rnd([
          "Inspecting pothole", "Garbage collection", "Fixing streetlight",
          "Pipeline repair", "Drain clearing", "Tree removal", "Road repair",
          "Landslide debris clearing"
        ]) : undefined,
        geo: perturbGeo(ward.center, 0.012),
      });
    });

    // 220 complaints with geo across Uttarakhand
    const cats: ComplaintCategory[] = ["pothole", "garbage", "streetlight", "water", "drain", "electricity", "tree", "other"];
    for (let i = 0; i < 220; i++) {
      const ward = rnd(WARDS_DATA);
      const category = rnd(cats);
      const hoursBack = rndInt(1, 720);
      const roll = Math.random();
      let status: ComplaintStatus =
        roll < 0.22 ? "pending" : roll < 0.42 ? "in_progress" : roll < 0.85 ? "resolved" : "closed";
      const pRoll = Math.random();
      let priority: Priority = pRoll < 0.08 ? "P1" : pRoll < 0.3 ? "P2" : pRoll < 0.65 ? "P3" : "P4";
      const isCluster = Math.random() < 0.15;
      const hasProof = status === "resolved" || status === "closed";
      const hasBeforePhoto = hasProof || (!hasProof && Math.random() < 0.35);
      const isDemo = i === 0;

      const photoIsRealVal = hasBeforePhoto ? Math.random() < 0.87 : undefined;
      const photoAiConf = hasBeforePhoto ? rndInt(72, 97) : undefined;
      const PHOTO_REASONS = [
        "Clear civic infrastructure damage visible in photo",
        "Image matches reported complaint category",
        "Road surface damage consistent with pothole report",
        "Garbage accumulation confirmed in submitted image",
        "Street lighting damage clearly visible",
        "Water leakage or pipe damage evident in photo",
        "Drain blockage and debris visible",
        "Electrical hazard or damaged wiring confirmed",
        "Tree fallen or obstructing road confirmed",
        "Construction debris and road damage visible",
        "Waterlogging on road surface confirmed",
        "Image shows structural damage to civic property",
      ];
      const photoAiReason = hasBeforePhoto ? rnd(PHOTO_REASONS) : undefined;

      this.complaints.push({
        id: genId(),
        ticketId: genTicketId(),
        category,
        description: rnd(COMPLAINT_DESCS[category]),
        location: `${rnd(LOCATIONS_PREFIX)}, ${ward.name}`,
        geo: perturbGeo(ward.center),
        ward: ward.name,
        wardNumber: ward.number,
        district: ward.district,
        priority,
        status,
        department: assignDepartment(category),
        submittedAt: hoursAgo(hoursBack),
        resolvedAt: hasProof ? hoursAgo(Math.max(1, hoursBack - rndInt(2, 48))) : undefined,
        submittedBy: isDemo ? "Arjun" : WORKER_NAMES[rndInt(0, WORKER_NAMES.length - 1)],
        submittedByPhone: isDemo ? "9876543210" : undefined,
        workerName: status !== "pending" ? rnd(WORKER_NAMES) : undefined,
        upvotes: rndInt(0, 80),
        upvotedBy: [],
        isCluster,
        clusterSize: isCluster ? rndInt(5, 40) : undefined,
        aiScore: rndInt(62, 99),
        aiConfidence: rndInt(70, 98),
        hasProof,
        beforePhoto: hasBeforePhoto ? `https://picsum.photos/seed/${i + 10}/400/300` : undefined,
        afterPhoto: hasProof ? `https://picsum.photos/seed/${i + 310}/400/300` : undefined,
        photoIsReal: photoIsRealVal,
        photoAiConfidence: photoAiConf,
        photoAiReason,
        rating: hasProof ? rndInt(2, 5) : undefined,
        feedback: hasProof && Math.random() < 0.5 ? rnd(["Good work!", "Could be better", "Very satisfied", "Quick resolution"]) : undefined,
        reopened: Math.random() < 0.08,
      });
    }
    this.complaints.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    // SOS alerts
    const sosCats: SOSCategory[] = ["gas_leak", "water_burst", "electric_hazard", "fire_risk", "road_accident", "infrastructure", "women_safety", "medical"];
    const sosDescs: Record<SOSCategory, string> = {
      gas_leak: "LPG gas leak detected in residential block, evacuation needed immediately",
      water_burst: "Major pipeline burst on mountain road, road flooding and sinkhole risk",
      electric_hazard: "High-tension wire snapped and fallen across main road after storm",
      fire_risk: "Smoke visible from forest area near residential colony, fire spreading",
      road_accident: "Multi-vehicle collision on NH-58, 3 injured, road blocked",
      infrastructure: "Retaining wall collapse, landslide debris blocking arterial road",
      women_safety: "Woman being harassed near isolated mountain road, immediate response needed",
      medical: "Elderly person collapsed on footpath, ambulance not reachable on mountain road",
      disaster: "Flash flood warning — rivers breaching banks in low-lying areas",
      forest_fire: "Forest fire spreading rapidly near Chakrata range, villages at risk",
    };
    for (let i = 0; i < 8; i++) {
      const ward = rnd(WARDS_DATA);
      const cat = rnd(sosCats);
      const geo = perturbGeo(ward.center, 0.015);
      const near = this.getNearestPoliceStations(geo);
      let status: SOSAlert["status"] = i < 2 ? "active" : i < 5 ? "responding" : "resolved";
      this.sosAlerts.push({
        id: genId(),
        category: cat,
        description: sosDescs[cat],
        location: `${rnd(LOCATIONS_PREFIX)}, ${ward.name}`,
        geo,
        ward: ward.name,
        wardNumber: ward.number,
        district: ward.district,
        triggeredAt: hoursAgo(rndInt(0, 24)),
        status,
        respondingWorker: status !== "active" ? rnd(WORKER_NAMES) : undefined,
        nearestPoliceStation: near[0]?.name,
        policeDistance: near[0] ? parseFloat(distanceKm(geo, near[0].geo).toFixed(2)) : undefined,
      });
    }

    this.recomputeWards();
    this.generateRiskZones();

    // Seed announcements
    const seedAnnouncements: Omit<Announcement, "id" | "postedAt" | "views">[] = [
      {
        title: "PM Awas Yojana — Uttarakhand Housing Applications Open",
        body: "Uttarakhand Government invites applications for affordable housing under PM Awas Yojana Urban 2.0. Eligible families with annual income below ₹18 lakh can apply at district collector offices or online at ukhfdc.com. Last date: 31 March 2026.",
        type: "scheme", department: "Uttarakhand Housing Development & Construction Unit", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Free Eye Checkup Camp — Champawat District",
        body: "Uttarakhand Health Department organising free eye checkup and spectacle distribution camps in Champawat. Venue: District Hospital Champawat. Timings: 9 AM–4 PM. Bring Aadhaar card.",
        type: "welfare", department: "Uttarakhand Health Department", priority: "important", postedBy: "SANKALP Super Admin", targetDistrict: "Champawat"
      },
      {
        title: "Uttarakhand Mukhyamantri Swarojgar Yojana 2026",
        body: "Apply for self-employment loans under CM Swarojgar Yojana. Subsidy of 25% up to ₹2 lakh for mountain residents. Visit district magistrate office or apply at cm.uk.gov.in.",
        type: "scheme", department: "District Industries Centre, Uttarakhand", priority: "urgent", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Water Supply Disruption — Dehradun City",
        body: "Due to emergency pipeline repair work, water supply will remain disrupted in parts of Dehradun from 10 PM to 6 AM tonight. Water tankers will be deployed at designated points. Contact 1916.",
        type: "emergency", department: "Uttarakhand Jal Sansthan", priority: "urgent", postedBy: "Dehradun Admin", targetDistrict: "Dehradun"
      },
      {
        title: "Landslide Alert — Heavy Rain Warning for Hill Districts",
        body: "IMD has issued Orange Alert for heavy rainfall in Chamoli, Rudraprayag, Uttarkashi and Tehri districts. Citizens are advised to stay away from landslide-prone areas. Emergency helpline: 1070.",
        type: "emergency", department: "Uttarakhand Disaster Management Authority", priority: "urgent", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Veer Chandra Singh Garhwali Paryatan Vikas Yojana",
        body: "Uttarakhand Tourism Department invites applications from villagers to develop eco-tourism homestays. Grant of ₹5 lakh available. Visit tourism.uk.gov.in or nearest ITDC office.",
        type: "scheme", department: "Uttarakhand Tourism Development Board", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Ration Card Correction Drive — All Districts",
        body: "Uttarakhand Food & Civil Supplies Department is conducting a special ration card correction and Aadhaar seeding drive. Citizens can get names added/corrected at tehsil offices. Documents needed: Aadhaar, old ration card, address proof. Drive runs from 1st to 31st of this month.",
        type: "welfare", department: "Uttarakhand Food & Civil Supplies Department", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Uttarakhand Board Result 2025 — Class 10 & 12 Declared",
        body: "Uttarakhand Board of School Education (UBSE) has declared class 10 and 12 results for 2025. Pass percentage: Class 10 — 82.3%, Class 12 — 79.6%. Students can check results at ubse.uk.gov.in. Merit certificates to be issued within 30 days. Helpline: 0135-2674117.",
        type: "general", department: "Uttarakhand Board of School Education", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Gas Cylinder Home Delivery — Apply Online Now",
        body: "Uttarakhand residents in remote hill areas can now register for home delivery of LPG cylinders under Pradhan Mantri Ujjwala Yojana. Apply at pmuy.gov.in or at nearest Common Service Centre. Priority for BPL families and women-headed households. Subsidy continues: ₹300 per cylinder for eligible beneficiaries.",
        type: "scheme", department: "Ministry of Petroleum & Natural Gas, UK Nodal Office", priority: "normal", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Road Closure — Rishikesh–Badrinath Highway Repair",
        body: "Due to emergency road repair work after monsoon damage, the Rishikesh–Badrinath National Highway (NH-58) will remain closed for heavy vehicles from Devprayag to Srinagar on Tuesdays and Thursdays (9 AM – 5 PM). Light vehicles and pilgrim buses will be allowed via alternate route. Helpline: 1800-180-4247.",
        type: "emergency", department: "National Highways Authority of India (NHAI)", priority: "urgent", postedBy: "SANKALP Super Admin"
      },
      {
        title: "MGNREGA 100-Day Work Guarantee — Register Now",
        body: "All rural households of Uttarakhand can register for MGNREGA employment guarantee. 100 days of guaranteed wage employment per year. Daily wage: ₹230–₹250 for Uttarakhand (varies by district). Register at your Gram Panchayat or online at nregastrep.nic.in. Priority work includes road maintenance, tree plantation, water conservation.",
        type: "scheme", department: "Rural Development Department, Uttarakhand", priority: "normal", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Holiday Notice — Uttarakhand Sthapna Diwas (9 November)",
        body: "9 November is a public holiday in Uttarakhand on account of Uttarakhand Sthapna Diwas (State Foundation Day). All government offices, banks, schools, and courts will remain closed. Emergency services will continue. State-level cultural events to be held at Parade Ground, Dehradun from 10 AM.",
        type: "holiday", department: "Uttarakhand General Administration Department", priority: "normal", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Tender Notice — LED Streetlight Upgrade Haridwar",
        body: "Haridwar Urban Local Body invites sealed tenders from registered contractors for supply and installation of 2,400 LED streetlights across Haridwar Municipal area. Bid document available at HUL office, Civil Lines, Haridwar. Submission deadline: 15 days from notice date. EMD: ₹2 lakh. Helpline: 01334-225600.",
        type: "tender", department: "Haridwar Urban Local Body", priority: "normal", postedBy: "Haridwar Admin", targetDistrict: "Haridwar"
      },
    ];
    seedAnnouncements.forEach(a => {
      const id = genId();
      this.announcements.push({ ...a, id, postedAt: new Date(Date.now() - rndInt(0, 72) * 3600000).toISOString(), views: rndInt(50, 5000) });
    });

    // Seed polls
    const seedPolls: Omit<Poll, "id">[] = [
      { question: "Which area needs urgent road repair in Dehradun?", options: ["Rajpur Road", "Sahastradhara Road", "Haridwar Road", "Rispana Bridge area"], votes: [45, 32, 28, 19], voterIds: [], district: "Dehradun", createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), createdBy: "Dehradun Admin", status: "active" },
      { question: "Should we extend garbage collection to Sundays?", options: ["Yes, strongly agree", "No, weekdays are enough", "Need more dustbins first"], votes: [128, 34, 67], voterIds: [], createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), createdBy: "SANKALP Super Admin", status: "active" },
      { question: "Rate the water supply quality in your area", options: ["Excellent", "Good", "Average", "Poor", "Very Poor"], votes: [12, 38, 56, 41, 23], voterIds: [], district: "Haridwar", createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), createdBy: "Haridwar Admin", status: "active" },
      { question: "Which civic service needs most improvement?", options: ["Street Lighting", "Garbage Collection", "Road Repair", "Water Supply", "Drainage"], votes: [55, 72, 98, 61, 44], voterIds: [], createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), createdBy: "SANKALP Super Admin", status: "active" },
    ];
    seedPolls.forEach(p => this.polls.push({ ...p, id: genId() }));

    // Seed petitions
    const seedPetitions: Omit<Petition, "id">[] = [
      { title: "Install Speed Breakers Near Government School Dehradun", description: "Children's safety at risk due to speeding vehicles near Govt Inter College Dehradun. We demand immediate installation of speed breakers and zebra crossings at all 3 entry/exit points of the school.", target: "PWD Department & District Administration, Dehradun", goalSignatures: 500, signerIds: Array(312).fill("").map(() => genId()), district: "Dehradun", createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), createdBy: "Ramesh Kumar Rawat", status: "active", department: "Public Works Department" },
      { title: "Fix Broken Street Lights on Haridwar Bypass", description: "Over 40 street lights on the Haridwar Bypass have been non-functional for 3+ months. This is a major safety hazard, especially for women walking at night. We demand immediate repair.", target: "ULB Electric Wing, Haridwar", goalSignatures: 1000, signerIds: Array(647).fill("").map(() => genId()), district: "Haridwar", createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), createdBy: "Priya Bisht", status: "active", department: "Urban Local Body" },
      { title: "Open Health Sub-Centre in Agastmuni Block", description: "Residents of Agastmuni have to travel 25 km to Rudraprayag for basic healthcare. We demand a fully functional health sub-centre with doctor and medicine facilities in our block.", target: "Uttarakhand Health Department", goalSignatures: 750, signerIds: Array(189).fill("").map(() => genId()), district: "Rudraprayag", createdAt: new Date(Date.now() - 20 * 86400000).toISOString(), createdBy: "Asha Devi", status: "active", department: "Health Department" },
      { title: "Ban Plastic Bags in Nainital Market", description: "Naini Lake is being polluted by single-use plastic. We urge the district administration to strictly enforce the plastic ban in Nainital market and tourist areas with heavy fines.", target: "Nainital District Administration", goalSignatures: 2000, signerIds: Array(1823).fill("").map(() => genId()), district: "Nainital", createdAt: new Date(Date.now() - 8 * 86400000).toISOString(), createdBy: "Amit Negi", status: "active", department: "Environment Department" },
    ];
    seedPetitions.forEach(p => this.petitions.push({ ...p, id: genId() }));

    // Seed civic events
    const futureDate = (days: number) => {
      const d = new Date(Date.now() + days * 86400000);
      return d.toISOString().split("T")[0];
    };
    const seedEvents: Omit<CivicEvent, "id">[] = [
      { title: "Free Health Camp — Haridwar District", description: "Free general health checkup, blood pressure, sugar, eye testing and dental checkup for all citizens. Medicines provided free of cost. Bring Aadhaar card.", date: futureDate(3), time: "9:00 AM – 4:00 PM", location: "District Hospital, Haridwar", type: "camp", district: "Haridwar", rsvpIds: Array(78).fill("").map(() => genId()), organizer: "Uttarakhand Health Dept", createdAt: new Date().toISOString() },
      { title: "Ward Committee Meeting — Dehradun East", description: "Monthly citizen grievance redressal meeting with ward officer. Bring your pending complaint tickets for direct resolution. All residents welcome.", date: futureDate(5), time: "11:00 AM – 1:00 PM", location: "Ward Office, Raipur Block, Dehradun", type: "meeting", district: "Dehradun", rsvpIds: Array(34).fill("").map(() => genId()), organizer: "Dehradun Admin", createdAt: new Date().toISOString() },
      { title: "Swachh Bharat Drive — Nainital Lake Cleanup", description: "Join us in cleaning the banks of Naini Lake. Gloves and bags provided. Earn 50 SANKALP civic points for participating. All age groups welcome.", date: futureDate(7), time: "7:00 AM – 10:00 AM", location: "Naini Lake Boat Club, Nainital", type: "drive", district: "Nainital", rsvpIds: Array(112).fill("").map(() => genId()), organizer: "Nainital Admin", createdAt: new Date().toISOString() },
      { title: "PM Awas Yojana Registration Drive", description: "Government camp for registering beneficiaries for PM Awas Yojana urban housing scheme. Income below ₹18L. Bring Aadhaar, income certificate, land documents.", date: futureDate(10), time: "10:00 AM – 5:00 PM", location: "Collectorate Office, Dehradun", type: "scheme", district: "Dehradun", rsvpIds: Array(203).fill("").map(() => genId()), organizer: "Dehradun Admin", createdAt: new Date().toISOString() },
      { title: "Tree Plantation Drive — Uttarkashi Hills", description: "Forest Department invites volunteers to plant 5000 saplings on degraded hillside. Transportation provided from Uttarkashi town. Certificate given to all volunteers.", date: futureDate(14), time: "8:00 AM – 3:00 PM", location: "Forest Range Office, Uttarkashi", type: "drive", district: "Uttarkashi", rsvpIds: Array(45).fill("").map(() => genId()), organizer: "Forest Department, Uttarkashi", createdAt: new Date().toISOString() },
      { title: "SANKALP AI Town Hall — All Districts", description: "State-level town hall on civic infrastructure improvement. Citizens can directly address district officers. Live broadcast. Attend in person or online.", date: futureDate(20), time: "3:00 PM – 6:00 PM", location: "Raj Bhavan Auditorium, Dehradun (+ Online)", type: "meeting", rsvpIds: Array(567).fill("").map(() => genId()), organizer: "SANKALP Super Admin", createdAt: new Date().toISOString() },
    ];
    seedEvents.forEach(e => this.civicEvents.push({ ...e, id: genId() }));

    // Seed budget items
    const DEPARTMENTS_BUDGET = [
      { department: "Public Works Department", category: "Road Repair", allocated: 8500, spent: 6200, description: "National and state highway pothole repairs and resurfacing" },
      { department: "Uttarakhand Jal Sansthan", category: "Water Infrastructure", allocated: 5200, spent: 4100, description: "Pipeline replacement, bore wells, water treatment plant upgrade" },
      { department: "Urban Local Body", category: "Solid Waste Management", allocated: 3800, spent: 2900, description: "Garbage trucks, sweeping machines, landfill management" },
      { department: "ULB Electric Wing", category: "Street Lighting", allocated: 2400, spent: 1800, description: "LED street light installation and maintenance across wards" },
      { department: "Forest Department", category: "Green Cover", allocated: 1600, spent: 900, description: "Tree plantation, hill slope stabilization, eco-parks" },
      { department: "Health Department", category: "Primary Health", allocated: 4500, spent: 3200, description: "PHC upgrades, medicine stock, health camps, ambulances" },
      { department: "UPCL", category: "Power Infrastructure", allocated: 6100, spent: 5400, description: "Transformer upgrades, last-mile connectivity, smart metering" },
      { department: "Disaster Management", category: "Emergency Preparedness", allocated: 2800, spent: 1400, description: "Landslide barriers, flood early warning, rescue equipment" },
    ];
    const DISTRICT_SCALE: Record<string, { alloc: number; spent: number }> = {
      "Dehradun":         { alloc: 1.40, spent: 1.30 },
      "Haridwar":         { alloc: 1.20, spent: 1.08 },
      "Nainital":         { alloc: 1.00, spent: 0.88 },
      "Udham Singh Nagar":{ alloc: 1.10, spent: 0.96 },
      "Almora":           { alloc: 0.75, spent: 0.62 },
      "Pithoragarh":      { alloc: 0.70, spent: 0.55 },
      "Champawat":        { alloc: 0.55, spent: 0.42 },
      "Bageshwar":        { alloc: 0.50, spent: 0.36 },
      "Tehri Garhwal":    { alloc: 0.80, spent: 0.65 },
      "Pauri Garhwal":    { alloc: 0.72, spent: 0.58 },
      "Rudraprayag":      { alloc: 0.60, spent: 0.44 },
      "Chamoli":          { alloc: 0.65, spent: 0.50 },
      "Uttarkashi":       { alloc: 0.62, spent: 0.47 },
    };
    DEPARTMENTS_BUDGET.forEach(b => {
      Object.entries(DISTRICT_SCALE).forEach(([district, scale]) => {
        this.budgetItems.push({
          id: genId(), ...b,
          district,
          year: 2025,
          allocated: Math.round(b.allocated * scale.alloc),
          spent: Math.round(b.spent * scale.spent),
        });
      });
    });

    // Seed RTI examples
    const seedRTIs: Omit<RTIRequest, "id">[] = [
      { ticketId: `RTI-UK-${rndInt(10000, 99999)}`, subject: "Status of road repair work on Rajpur Road", description: "I am a resident of Rajpur Road, Dehradun. I request information on the status of road repair work sanctioned in 2024-25 budget, total expenditure incurred, contractor details and expected completion date.", department: "Public Works Department", filedBy: "Arjun", filedByPhone: "9876543210", filedAt: new Date(Date.now() - 15 * 86400000).toISOString(), status: "acknowledged", district: "Champawat", deadline: new Date(Date.now() + 15 * 86400000).toISOString() },
    ];
    seedRTIs.forEach(r => this.rtis.push({ ...r, id: genId() }));
  }

  private recomputeWards() {
    this.wards = WARDS_DATA.map(w => {
      const wc = this.complaints.filter(c => c.wardNumber === w.number);
      const resolved = wc.filter(c => c.status === "resolved" || c.status === "closed").length;
      const pending = wc.filter(c => c.status === "pending").length;
      const inProgress = wc.filter(c => c.status === "in_progress").length;
      const resolveRate = wc.length ? resolved / wc.length : 1;
      const health = Math.round(40 + resolveRate * 50 - Math.min(pending * 0.5, 15));
      const riskLevel = health < 50 ? "critical" : health < 65 ? "high" : health < 80 ? "medium" : "low";
      return {
        id: `ward-${w.number}`,
        name: w.name,
        number: w.number,
        district: w.district,
        healthScore: Math.min(100, Math.max(30, health)),
        totalComplaints: wc.length,
        resolvedComplaints: resolved,
        pendingComplaints: pending,
        avgResolutionHours: rndInt(4, 96),
        population: w.pop,
        area: w.area,
        center: w.center,
        riskLevel: riskLevel as Ward["riskLevel"],
        satisfactionScore: parseFloat((2.5 + resolveRate * 2.5).toFixed(1)),
        reopenRate: parseFloat((Math.random() * 0.15).toFixed(2)),
      };
    });
  }

  private generateRiskZones() {
    const types: RiskZone["type"][] = ["flood", "garbage", "infrastructure", "crime"];
    this.riskZones = WARDS_DATA.slice(0, 16).map((w, i) => ({
      id: `rz${i}`,
      type: types[i % types.length],
      severity: (["low", "medium", "high"] as const)[i % 3],
      geo: perturbGeo(w.center, 0.010),
      radius: rndInt(500, 3000),
      description: [
        "Flash flood risk near river bank during monsoon season",
        "Open garbage dumping site affecting mountain ecosystem",
        "Unstable retaining wall on steep slope — landslide risk",
        "Isolated mountain path — limited street lighting at night",
      ][i % 4],
      complaintCount: rndInt(3, 25),
      district: w.district,
    }));
  }

  // ── USER OPERATIONS ──────────────────────────────────────────────────────────
  async findUserByPhone(phone: string): Promise<AppUser | undefined> {
    for (const u of this.users.values()) {
      if (u.phone === phone) return u;
    }
    return undefined;
  }

  async createUser(data: Omit<AppUser, "id" | "createdAt">): Promise<AppUser> {
    const id = genId();
    const user: AppUser = { ...data, id, createdAt: new Date().toISOString() };
    this.users.set(id, user);
    return user;
  }

  getUserById(id: string): AppUser | undefined { return this.users.get(id); }

  // ── TOKEN OPERATIONS ─────────────────────────────────────────────────────────
  createToken(userId: string): string {
    const token = randomUUID();
    this.tokens.set(token, { token, userId, expiresAt: Date.now() + 7 * 24 * 3600 * 1000 });
    return token;
  }

  validateToken(token: string): AppUser | null {
    const t = this.tokens.get(token);
    if (!t || t.expiresAt < Date.now()) return null;
    return this.users.get(t.userId) || null;
  }

  revokeToken(token: string) { this.tokens.delete(token); }

  // ── COMPLAINT OPERATIONS ─────────────────────────────────────────────────────
  getComplaints(district?: string): Complaint[] {
    if (district && district !== "Uttarakhand") {
      return this.complaints.filter(c => c.district === district);
    }
    return [...this.complaints];
  }

  createComplaint(data: Omit<Complaint, "id" | "ticketId" | "submittedAt" | "upvotes" | "upvotedBy" | "aiScore" | "aiConfidence">, userId: string): Complaint {
    const complaint: Complaint = {
      ...data,
      id: genId(),
      ticketId: genTicketId(),
      submittedAt: new Date().toISOString(),
      upvotes: 0,
      upvotedBy: [],
      aiScore: rndInt(62, 99),
      aiConfidence: rndInt(70, 98),
      department: data.department || assignDepartment(data.category),
    };
    this.complaints.unshift(complaint);
    const user = this.users.get(userId);
    if (user) { user.points += 10; this.users.set(userId, user); }
    this.recomputeWards();
    this.broadcastEvent({ type: "complaint_new", complaint });
    return complaint;
  }

  upvoteComplaint(id: string, userId: string): Complaint | null {
    const c = this.complaints.find(x => x.id === id);
    if (!c) return null;
    if (!c.upvotedBy.includes(userId)) {
      c.upvotes++;
      c.upvotedBy.push(userId);
      const user = this.users.get(userId);
      if (user) { user.points += 1; this.users.set(userId, user); }
    }
    this.broadcastEvent({ type: "upvote", id, upvotes: c.upvotes });
    return c;
  }

  resolveComplaint(id: string, rating?: number, feedback?: string, afterPhoto?: string, userId?: string): Complaint | null {
    const c = this.complaints.find(x => x.id === id);
    if (!c) return null;
    c.status = "resolved";
    c.resolvedAt = new Date().toISOString();
    if (rating !== undefined) c.rating = rating;
    if (feedback) c.feedback = feedback;
    if (afterPhoto) c.afterPhoto = afterPhoto;
    c.hasProof = !!afterPhoto;
    if (userId) {
      const user = this.users.get(userId);
      if (user) { user.points += 5; this.users.set(userId, user); }
    }
    this.recomputeWards();
    this.broadcastEvent({ type: "resolved", id });
    return c;
  }

  rejectResolution(id: string, userId: string): Complaint | null {
    const c = this.complaints.find(x => x.id === id);
    if (!c) return null;
    if (!c.rejectedBy) c.rejectedBy = [];
    if (!c.rejectedBy.includes(userId)) c.rejectedBy.push(userId);
    if (c.rejectedBy.length >= 3 && c.status === "resolved") {
      c.status = "in_progress";
      c.reopened = true;
      c.resolvedAt = undefined;
    }
    this.broadcastEvent({ type: "rejected", id });
    return c;
  }

  // ── SOS OPERATIONS ───────────────────────────────────────────────────────────
  getSosAlerts(district?: string): SOSAlert[] {
    if (district && district !== "Uttarakhand") {
      return this.sosAlerts.filter(s => s.district === district);
    }
    return [...this.sosAlerts];
  }

  createSos(data: Omit<SOSAlert, "id" | "triggeredAt">, userId: string): SOSAlert {
    const alert: SOSAlert = { ...data, id: genId(), triggeredAt: new Date().toISOString() };
    this.sosAlerts.unshift(alert);
    this.broadcastEvent({ type: "sos_new", alert });
    return alert;
  }

  updateSosLocation(id: string, geo: GeoPoint): SOSAlert | null {
    const s = this.sosAlerts.find(x => x.id === id);
    if (!s) return null;
    s.liveGeo = geo;
    s.liveUpdatedAt = new Date().toISOString();
    this.broadcastEvent({ type: "sos_location_update", id, geo, liveUpdatedAt: s.liveUpdatedAt });
    return s;
  }

  resolveSos(id: string): SOSAlert | null {
    const s = this.sosAlerts.find(x => x.id === id);
    if (!s) return null;
    s.status = "resolved";
    s.resolvedAt = new Date().toISOString();
    this.broadcastEvent({ type: "sos_resolved", id });
    return s;
  }

  // ── WARD OPERATIONS ──────────────────────────────────────────────────────────
  getWards(district?: string): Ward[] {
    if (district && district !== "Uttarakhand") {
      return this.wards.filter(w => w.district === district);
    }
    return [...this.wards];
  }

  // ── WORKER OPERATIONS ────────────────────────────────────────────────────────
  getWorkers(district?: string): Worker[] {
    if (district && district !== "Uttarakhand") {
      return this.workers.filter(w => w.district === district);
    }
    return [...this.workers];
  }

  // ── DISTRICT CENTER ──────────────────────────────────────────────────────────
  getDistrictCenter(district: string): GeoPoint {
    const found = DISTRICTS_DATA.find(d => d.district === district);
    return found ? found.center : { lat: 30.0668, lng: 79.0193 }; // Uttarakhand state center
  }

  // ── POLICE OPERATIONS ────────────────────────────────────────────────────────
  getPoliceStations(district?: string): PoliceStation[] {
    if (district && district !== "Uttarakhand") {
      return this.policeStations.filter(ps => ps.district === district);
    }
    return [...this.policeStations];
  }

  getNearestPoliceStations(geo: GeoPoint, count = 3, district?: string): (PoliceStation & { distance: number })[] {
    let stations = district && district !== "Uttarakhand"
      ? this.policeStations.filter(ps => ps.district === district)
      : this.policeStations;
    return stations
      .map(ps => ({ ...ps, distance: parseFloat(distanceKm(geo, ps.geo).toFixed(2)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count);
  }

  // ── RISK ZONES ───────────────────────────────────────────────────────────────
  getRiskZones(district?: string): RiskZone[] {
    if (district && district !== "Uttarakhand") {
      return this.riskZones.filter(rz => rz.district === district);
    }
    return [...this.riskZones];
  }

  // ── LEADERBOARD ──────────────────────────────────────────────────────────────
  getLeaderboard() {
    return Array.from(this.users.values())
      .filter(u => u.role === "citizen")
      .sort((a, b) => b.points - a.points)
      .slice(0, 20)
      .map((u, i) => ({ rank: i + 1, name: u.name, phone: u.phone.slice(0, 5) + "XXXXX", points: u.points, level: u.level, badges: u.badges, district: u.district }));
  }

  // ── ANNOUNCEMENTS ────────────────────────────────────────────────────────────
  getAnnouncements(district?: string): Announcement[] {
    if (district && district !== "Uttarakhand") {
      return this.announcements.filter(a => !a.targetDistrict || a.targetDistrict === district);
    }
    return [...this.announcements];
  }

  createAnnouncement(data: Omit<Announcement, "id" | "postedAt" | "views">): Announcement {
    const ann: Announcement = { ...data, id: genId(), postedAt: new Date().toISOString(), views: 0 };
    this.announcements.unshift(ann);
    this.broadcastEvent({ type: "announcement", announcement: ann });
    return ann;
  }

  deleteAnnouncement(id: string): boolean {
    const idx = this.announcements.findIndex(a => a.id === id);
    if (idx === -1) return false;
    this.announcements.splice(idx, 1);
    return true;
  }

  incrementAnnouncementViews(id: string) {
    const a = this.announcements.find(x => x.id === id);
    if (a) a.views++;
  }

  // ── POLLS ────────────────────────────────────────────────────────────────────
  getPolls(district?: string): Poll[] {
    if (district && district !== "Uttarakhand") {
      return this.polls.filter(p => !p.district || p.district === district);
    }
    return [...this.polls];
  }

  createPoll(data: Omit<Poll, "id">): Poll {
    const poll: Poll = { ...data, id: genId() };
    this.polls.unshift(poll);
    return poll;
  }

  votePoll(id: string, optionIndex: number, userId: string): Poll | null {
    const poll = this.polls.find(p => p.id === id);
    if (!poll || poll.status !== "active") return null;
    if (poll.voterIds.includes(userId)) return poll;
    if (optionIndex < 0 || optionIndex >= poll.options.length) return null;
    poll.votes[optionIndex]++;
    poll.voterIds.push(userId);
    return poll;
  }

  // ── PETITIONS ────────────────────────────────────────────────────────────────
  getPetitions(_district?: string): Petition[] {
    return [...this.petitions];
  }

  createPetition(data: Omit<Petition, "id">): Petition {
    const petition: Petition = { ...data, id: genId() };
    this.petitions.unshift(petition);
    return petition;
  }

  signPetition(id: string, userId: string): Petition | null {
    const petition = this.petitions.find(p => p.id === id);
    if (!petition || petition.status !== "active") return null;
    if (petition.signerIds.includes(userId)) return petition;
    petition.signerIds.push(userId);
    if (petition.signerIds.length >= petition.goalSignatures) {
      petition.status = "delivered";
    }
    return petition;
  }

  // ── RTI ──────────────────────────────────────────────────────────────────────
  getRTIs(userId?: string, district?: string): RTIRequest[] {
    let list = [...this.rtis];
    if (userId) list = list.filter(r => r.filedByPhone !== undefined);
    if (district && district !== "Uttarakhand") list = list.filter(r => r.district === district);
    return list;
  }

  getRTIsByPhone(phone: string): RTIRequest[] {
    return this.rtis.filter(r => r.filedByPhone === phone);
  }

  createRTI(data: Omit<RTIRequest, "id" | "ticketId" | "filedAt" | "deadline" | "status">): RTIRequest {
    const now = new Date();
    const deadline = new Date(now.getTime() + 30 * 86400000);
    const rti: RTIRequest = {
      ...data,
      id: genId(),
      ticketId: `RTI-UK-${Math.floor(10000 + Math.random() * 90000)}`,
      filedAt: now.toISOString(),
      deadline: deadline.toISOString(),
      status: "filed",
    };
    this.rtis.unshift(rti);
    this.addAuditLog("rti_filed", data.filedByPhone, data.filedBy, `RTI filed: ${data.subject}`, rti.id);
    return rti;
  }

  submitRTI(id: string): RTIRequest | null {
    const rti = this.rtis.find(r => r.id === id);
    if (!rti) return null;
    rti.status = "acknowledged";
    return rti;
  }

  respondRTI(id: string, response: string): RTIRequest | null {
    const rti = this.rtis.find(r => r.id === id);
    if (!rti) return null;
    rti.response = response;
    rti.status = "responded";
    rti.respondedAt = new Date().toISOString();
    return rti;
  }

  // ── CIVIC EVENTS ──────────────────────────────────────────────────────────────
  getEvents(district?: string): CivicEvent[] {
    if (district && district !== "Uttarakhand") {
      return this.civicEvents.filter(e => !e.district || e.district === district);
    }
    return [...this.civicEvents];
  }

  createEvent(data: Omit<CivicEvent, "id" | "createdAt" | "rsvpIds">): CivicEvent {
    const event: CivicEvent = { ...data, id: genId(), createdAt: new Date().toISOString(), rsvpIds: [] };
    this.civicEvents.unshift(event);
    return event;
  }

  rsvpEvent(id: string, userId: string): CivicEvent | null {
    const event = this.civicEvents.find(e => e.id === id);
    if (!event) return null;
    if (!event.rsvpIds.includes(userId)) event.rsvpIds.push(userId);
    return event;
  }

  // ── CHAT MESSAGES ─────────────────────────────────────────────────────────────
  getChatMessages(complaintId: string): ChatMessage[] {
    return this.chatMessages.filter(m => m.complaintId === complaintId);
  }

  addChatMessage(complaintId: string, message: string, senderName: string, senderRole: ChatMessage["senderRole"]): ChatMessage {
    const msg: ChatMessage = { id: genId(), complaintId, message, senderName, senderRole, sentAt: new Date().toISOString() };
    this.chatMessages.push(msg);
    this.broadcastEvent({ type: "chat_message", complaintId, message: msg });
    return msg;
  }

  // ── BUDGET ───────────────────────────────────────────────────────────────────
  getBudgetItems(district?: string): BudgetItem[] {
    if (district && district !== "Uttarakhand") {
      return this.budgetItems.filter(b => b.district === district);
    }
    return [...this.budgetItems];
  }

  // ── WORKER TEMP CREDENTIALS ──────────────────────────────────────────────────
  assignWorkerToComplaint(complaintId: string, workerName: string, workerPhone: string): string {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    const key = `${workerPhone}_${complaintId}`;
    this.workerTempTokens.set(key, { complaintId, phone: workerPhone, pin, expiresAt: Date.now() + 48 * 3600 * 1000 });
    const c = this.complaints.find(x => x.id === complaintId);
    if (c) {
      c.assignedWorkerName = workerName;
      c.assignedWorkerPhone = workerPhone;
      c.assignedWorkerPin = pin;
      c.status = "in_progress";
    }
    return pin;
  }

  verifyWorkerTempToken(phone: string, pin: string, complaintId: string): boolean {
    const key = `${phone}_${complaintId}`;
    const t = this.workerTempTokens.get(key);
    if (!t) return false;
    if (t.pin !== pin) return false;
    if (t.expiresAt < Date.now()) { this.workerTempTokens.delete(key); return false; }
    return true;
  }

  submitComplaintProof(complaintId: string, proofPhoto?: string, proofNote?: string): Complaint | null {
    const c = this.complaints.find(x => x.id === complaintId);
    if (!c) return null;
    c.proofPhoto = proofPhoto;
    c.proofNote = proofNote;
    c.proofSubmittedAt = new Date().toISOString();
    c.hasProof = true;
    c.status = "resolved";
    c.resolvedAt = new Date().toISOString();
    return c;
  }

  // ── GET SINGLE SOS ALERT ──────────────────────────────────────────────────────
  getSOSAlert(id: string): SOSAlert | undefined {
    return this.sosAlerts.find(a => a.id === id);
  }

  // ── AUDIO CHUNKS ──────────────────────────────────────────────────────────────
  addSOSAudioChunk(id: string, chunk: { url: string; chunkIndex: number; duration: number }): SOSAlert | null {
    const alert = this.sosAlerts.find(a => a.id === id);
    if (!alert) return null;
    if (!alert.audioChunks) alert.audioChunks = [];
    alert.audioChunks.push({ ...chunk, timestamp: new Date().toISOString() });
    return alert;
  }

  // ── EMERGENCY SERVICES ────────────────────────────────────────────────────────
  getEmergencyServices(): EmergencyService[] {
    return [...this.emergencyServices];
  }

  // ── PREDICTIVE MAINTENANCE ────────────────────────────────────────────────────
  getPredictiveAlerts(district?: string): PredictiveAlert[] {
    const complaints = district && district !== "Uttarakhand"
      ? this.complaints.filter(c => c.district === district)
      : this.complaints;

    const categoryCount: Record<string, Record<string, number>> = {};
    for (const c of complaints) {
      if (!categoryCount[c.district]) categoryCount[c.district] = {};
      categoryCount[c.district][c.category] = (categoryCount[c.district][c.category] || 0) + 1;
    }

    const PREDICTIONS: Record<string, { prediction: string; action: string }> = {
      pothole:     { prediction: "Road surface degradation trend detected — 73% increase in pothole reports over 14 days in this district", action: "Schedule district-wide road survey and pre-monsoon patching drive" },
      garbage:     { prediction: "Waste accumulation hotspot identified — collection gaps on Tuesdays causing overflow at 3 wards", action: "Increase pickup frequency; deploy additional vehicles on Tuesday/Friday routes" },
      water:       { prediction: "Pipe network stress pattern — recurring leaks suggest aging infrastructure in eastern zones", action: "Expedite pipe replacement tender; issue boil-water advisory for affected wards" },
      streetlight: { prediction: "Lighting failure cluster near market areas — 40% of complaints repeat within 72 hours of repair", action: "Conduct full MSEB inspection; replace aging sodium-vapor lamps with LED" },
      drain:       { prediction: "Pre-monsoon drainage blockage risk — history shows 3x spike in July–August in this district", action: "Begin drain desilting campaign immediately; identify critical choke points" },
      electricity: { prediction: "Grid load imbalance detected — transformer overloads likely during peak summer demand (June–July)", action: "Request UPCL load balancing audit; identify areas needing substation upgrades" },
      tree:        { prediction: "Tree-fall risk elevated ahead of monsoon — 12 complaints in 30 days signals pre-storm vulnerability", action: "Deploy arborist teams for pre-monsoon pruning; mark 25+ critical trees for removal" },
    };

    const alerts: PredictiveAlert[] = [];
    for (const [dist, cats] of Object.entries(categoryCount)) {
      if (district && district !== "Uttarakhand" && dist !== district) continue;
      for (const [cat, count] of Object.entries(cats)) {
        if (count < 3) continue;
        const meta = PREDICTIONS[cat];
        if (!meta) continue;
        const riskLevel: PredictiveAlert["riskLevel"] =
          count >= 20 ? "critical" : count >= 12 ? "high" : count >= 7 ? "medium" : "low";
        const confidence = Math.min(95, 55 + count * 2);
        alerts.push({ category: cat, district: dist, riskLevel, prediction: meta.prediction, confidence, recommendedAction: meta.action });
      }
    }
    return alerts.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.riskLevel] - order[b.riskLevel];
    });
  }

  // ── AUDIT LOGS ────────────────────────────────────────────────────────────────
  addAuditLog(action: string, userId: string, userName: string, details: string, complaintId?: string): AuditLog {
    const log: AuditLog = {
      id: genId(), action, userId, userName, details, timestamp: new Date().toISOString(), complaintId,
      actorPhone: userId, actorName: userName,
      referenceId: complaintId || `REF-${Date.now()}`,
      hash: `0x${Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`,
    };
    this.auditLogs.push(log);
    if (this.auditLogs.length > 5000) this.auditLogs.shift();
    return log;
  }

  getAuditLogs(complaintId?: string): AuditLog[] {
    if (complaintId) return this.auditLogs.filter(l => l.complaintId === complaintId);
    return [...this.auditLogs].reverse().slice(0, 200);
  }

  // ── ADMIN STATS ──────────────────────────────────────────────────────────────
  getAdminStats(district?: string) {
    const complaints = this.getComplaints(district);
    const sos = this.getSosAlerts(district);
    const wards = this.getWards(district);
    const workers = this.getWorkers(district);
    return {
      totalComplaints: complaints.length,
      pendingComplaints: complaints.filter(c => c.status === "pending").length,
      resolvedComplaints: complaints.filter(c => c.status === "resolved" || c.status === "closed").length,
      activeSos: sos.filter(s => s.status === "active").length,
      totalWards: wards.length,
      avgHealthScore: wards.length ? Math.round(wards.reduce((s, w) => s + w.healthScore, 0) / wards.length) : 0,
      activeWorkers: workers.filter(w => w.status === "active").length,
    };
  }

  // ── CPR PATROL & SAFETY INCIDENTS ─────────────────────────────────────────────
  getPatrolVans(district?: string): PatrolVan[] {
    if (district && district !== "Uttarakhand") return this.patrolVans.filter(v => v.district === district);
    return [...this.patrolVans];
  }

  getSafetyIncidents(district?: string): SafetyIncident[] {
    let list = [...this.safetyIncidents];
    if (district && district !== "Uttarakhand") list = list.filter(i => i.district === district);
    return list.sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  }

  createSafetyIncident(data: { citizenName: string; district: string; location: string; lat: number; lng: number }): SafetyIncident {
    const nearbyVan = this.patrolVans.find(v => v.status === "active_patrol" && v.district === data.district)
      || this.patrolVans.find(v => v.status === "active_patrol");
    const incident: SafetyIncident = {
      id: genId(),
      citizenName: data.citizenName,
      district: data.district,
      location: data.location,
      geo: { lat: data.lat, lng: data.lng },
      status: nearbyVan ? "patrol_dispatched" : "active",
      reportedAt: new Date().toISOString(),
      escalationLevel: 1,
      assignedPatrolVan: nearbyVan?.vanNumber,
      assignedPatrolOfficer: nearbyVan?.officerInCharge,
      assignedPatrolPhone: nearbyVan?.officerPhone,
      eta: nearbyVan ? Math.floor(5 + Math.random() * 15) : undefined,
      updates: [{ time: new Date().toISOString(), message: `SOS received from ${data.citizenName} at ${data.location}`, actor: "SYSTEM" }],
    };
    if (nearbyVan) {
      nearbyVan.status = "responding";
      incident.updates.push({ time: new Date().toISOString(), message: `${nearbyVan.vanNumber} dispatched — ETA ~${incident.eta} minutes`, actor: "DISPATCH" });
    }
    this.safetyIncidents.unshift(incident);
    cprEmitter.emit("event", { type: "safety_incident_new", incident });
    return incident;
  }

  updateIncidentStatus(id: string, status: SafetyIncident["status"], message: string, actor: string): SafetyIncident | null {
    const incident = this.safetyIncidents.find(i => i.id === id);
    if (!incident) return null;
    const prev = incident.status;
    incident.status = status;
    incident.updates.push({ time: new Date().toISOString(), message, actor });
    if ((status === "safe" || status === "closed") && incident.assignedPatrolVan) {
      const van = this.patrolVans.find(v => v.vanNumber === incident.assignedPatrolVan);
      if (van && van.status === "responding") van.status = "active_patrol";
    }
    cprEmitter.emit("event", { type: "incident_updated", incident });
    if (status !== prev) {
      const lvl = status === "police_responding" ? 3 : status === "patrol_dispatched" ? 2 : 1;
      if (lvl > incident.escalationLevel) {
        incident.escalationLevel = lvl;
        cprEmitter.emit("event", { type: "incident_escalated", incident, level: lvl });
      }
    }
    return incident;
  }

  updatePatrolLocation(id: string, geo: { lat: number; lng: number }): PatrolVan | null {
    const van = this.patrolVans.find(v => v.id === id);
    if (!van) return null;
    van.geo = geo;
    return van;
  }

  // ── NIGHT SAFETY ZONES ────────────────────────────────────────────────────────
  getNightSafetyZones(): NightSafetyZone[] {
    return [...this.nightSafetyZones].sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime());
  }

  createNightSafetyZone(data: { location: string; district: string; description: string; riskType: string; geo: any; reporterName: string }): NightSafetyZone {
    const zone: NightSafetyZone = {
      id: genId(),
      location: data.location,
      district: data.district,
      description: data.description,
      riskType: (data.riskType as NightSafetyZone["riskType"]) || "general",
      geo: data.geo || null,
      reporterName: data.reporterName,
      reportedAt: new Date().toISOString(),
      status: "active",
      patrolVisits: 0,
    };
    this.nightSafetyZones.unshift(zone);
    return zone;
  }
}

export const storage = new AppStorage();
