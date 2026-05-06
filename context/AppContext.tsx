import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { getApiUrl, getWsUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

function makeApiCall(token: string | null) {
  return async function apiCall(path: string, method = "GET", body?: any) {
    const baseUrl = getApiUrl();
    const url = `${baseUrl}${path.startsWith("/") ? path.slice(1) : path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Request failed" }));
      const error: any = new Error(err.message || "Request failed");
      error.status = res.status;
      throw error;
    }
    return res.json();
  };
}

export interface GeoPoint { lat: number; lng: number; }

export type Priority = "P1" | "P2" | "P3" | "P4";
export type ComplaintStatus = "pending" | "in_progress" | "resolved" | "closed";

export const CATEGORY_META: Record<string, { icon: string; color: string; label: string }> = {
  pothole:     { icon: "alert-circle",    color: "#F59E0B", label: "Pothole" },
  garbage:     { icon: "trash-2",         color: "#22C55E", label: "Garbage" },
  streetlight: { icon: "sun",             color: "#FBBF24", label: "Streetlight" },
  water:       { icon: "droplet",         color: "#3B82F6", label: "Water Issue" },
  drain:       { icon: "git-merge",       color: "#8B5CF6", label: "Drain/Sewer" },
  electricity: { icon: "zap",             color: "#EF4444", label: "Electricity" },
  tree:        { icon: "feather",         color: "#00A651", label: "Tree / Park" },
  other:       { icon: "more-horizontal", color: "#6B7280", label: "Other" },
};

export const PRIORITY_META: Record<Priority, { color: string; bg: string; label: string }> = {
  P1: { color: "#EF4444", bg: "#FEF2F2", label: "Critical — P1" },
  P2: { color: "#F59E0B", bg: "#FFFBEB", label: "High — P2" },
  P3: { color: "#3B82F6", bg: "#EFF6FF", label: "Medium — P3" },
  P4: { color: "#6B7280", bg: "#F9FAFB", label: "Low — P4" },
};

export const STATUS_META: Record<ComplaintStatus, { color: string; bg: string; label: string }> = {
  pending:     { color: "#F59E0B", bg: "#FFFBEB", label: "Pending" },
  in_progress: { color: "#3B82F6", bg: "#EFF6FF", label: "In Progress" },
  resolved:    { color: "#22C55E", bg: "#F0FDF4", label: "Resolved" },
  closed:      { color: "#6B7280", bg: "#F9FAFB", label: "Closed" },
};

export const SOS_META: Record<string, { icon: string; color: string; label: string }> = {
  gas_leak:        { icon: "wind",           color: "#F59E0B", label: "Gas Leak" },
  water_burst:     { icon: "droplet",        color: "#3B82F6", label: "Water Burst" },
  electric_hazard: { icon: "zap",            color: "#EF4444", label: "Electric Hazard" },
  fire_risk:       { icon: "alert-triangle", color: "#EF4444", label: "Fire Risk" },
  road_accident:   { icon: "alert-triangle", color: "#F59E0B", label: "Road Accident" },
  women_safety:    { icon: "shield",         color: "#8B5CF6", label: "Women Safety" },
  medical:         { icon: "heart",          color: "#22C55E", label: "Medical Emergency" },
  infrastructure:  { icon: "tool",           color: "#6B7280", label: "Infrastructure" },
};

export interface Complaint {
  id: string;
  ticketId: string;
  category: string;
  description: string;
  location: string;
  geo: GeoPoint;
  ward: string;
  wardNumber: number;
  priority: "P1" | "P2" | "P3" | "P4";
  status: "pending" | "in_progress" | "resolved" | "closed";
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
  rating?: number;
  feedback?: string;
  reopened?: boolean;
  department?: string;
  district?: string;
}

export interface SOSAlert {
  id: string;
  category: string;
  description: string;
  location: string;
  geo: GeoPoint;
  liveGeo?: GeoPoint;
  liveUpdatedAt?: string;
  ward: string;
  wardNumber: number;
  triggeredAt: string;
  status: "active" | "responding" | "resolved";
  respondingWorker?: string;
  triggeredBy?: string;
  triggeredByPhone?: string;
  nearestPoliceStation?: string;
  nearestPolicePhone?: string;
  policeDistance?: number;
  notifiedStations?: { name: string; phone: string; distance: number; address: string }[];
  isWomenSafety?: boolean;
  resolvedAt?: string;
}

export interface Ward {
  id: string;
  name: string;
  number: number;
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
  distance?: number;
}

export interface RiskZone {
  id: string;
  type: "flood" | "garbage" | "infrastructure" | "crime";
  severity: "low" | "medium" | "high";
  geo: GeoPoint;
  radius: number;
  description: string;
  complaintCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  phone: string;
  points: number;
  level: number;
  badges: string[];
}

export interface EmergencyAlert {
  message: string;
  severity: string;
  timestamp: string;
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
  link?: string;
  views: number;
}

interface AppStats {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  sos: number;
  avgHealth: number;
}

interface AppContextType {
  complaints: Complaint[];
  sosAlerts: SOSAlert[];
  wards: Ward[];
  workers: Worker[];
  policeStations: PoliceStation[];
  riskZones: RiskZone[];
  leaderboard: LeaderboardEntry[];
  announcements: Announcement[];
  isLoading: boolean;
  lastUpdated: Date | null;
  emergencyAlert: EmergencyAlert | null;
  clearEmergency: () => void;
  getStats: () => AppStats;
  submitComplaint: (data: Partial<Complaint>) => Promise<Complaint>;
  upvoteComplaint: (id: string) => Promise<void>;
  resolveComplaint: (id: string, rating?: number, feedback?: string, afterPhoto?: string) => Promise<void>;
  rejectComplaint: (id: string) => Promise<void>;
  triggerSOS: (data: Partial<SOSAlert>) => Promise<SOSAlert>;
  triggerWomenSafetySOS: (geo: GeoPoint | null, location: string) => Promise<{ alert: SOSAlert; nearestStations: PoliceStation[] }>;
  resolveSOS: (id: string) => Promise<void>;
  updateSOSLocation: (id: string, geo: GeoPoint) => Promise<void>;
  broadcastEmergency: (message: string) => Promise<void>;
  getNearestPolice: (geo: GeoPoint) => Promise<(PoliceStation & { distance: number })[]>;
  postAnnouncement: (data: Partial<Announcement>) => Promise<Announcement>;
  deleteAnnouncement: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { token, logout } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [sosAlerts, setSosAlerts] = useState<SOSAlert[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [policeStations, setPoliceStations] = useState<PoliceStation[]>([]);
  const [riskZones, setRiskZones] = useState<RiskZone[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [emergencyAlert, setEmergencyAlert] = useState<EmergencyAlert | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;
  const wsRef = useRef<WebSocket | null>(null);

  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  const loadData = useCallback(async (silent = false) => {
    const currentToken = tokenRef.current;
    if (!currentToken) { if (!silent) setIsLoading(false); return; }
    if (!silent) setIsLoading(true);
    try {
      const apiCall = makeApiCall(currentToken);
      const [c, s, w, wk, ps, rz, lb, ann] = await Promise.all([
        apiCall("/api/complaints"),
        apiCall("/api/sos"),
        apiCall("/api/wards"),
        apiCall("/api/workers"),
        apiCall("/api/police-stations"),
        apiCall("/api/risk-zones"),
        apiCall("/api/leaderboard"),
        apiCall("/api/announcements"),
      ]);
      setComplaints(Array.isArray(c) ? c : []);
      setSosAlerts(Array.isArray(s) ? s : []);
      setWards(Array.isArray(w) ? w : []);
      setWorkers(Array.isArray(wk) ? wk : []);
      setPoliceStations(Array.isArray(ps) ? ps : []);
      setRiskZones(Array.isArray(rz) ? rz : []);
      setLeaderboard(Array.isArray(lb) ? lb : []);
      setAnnouncements(Array.isArray(ann) ? ann : []);
      setLastUpdated(new Date());
    } catch (e: any) {
      // Token expired or invalid → force re-login so user sees fresh data
      if (e?.status === 401 || String(e?.message).includes("401") || String(e?.message).toLowerCase().includes("invalid or expired")) {
        logoutRef.current();
      }
    }
    finally { if (!silent) setIsLoading(false); }
  }, []);

  // Reload whenever the auth token arrives or changes
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (token) {
      loadData(false);
      pollRef.current = setInterval(() => loadData(true), 30000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, loadData]);

  // WebSocket connection for real-time alerts
  useEffect(() => {
    if (!token) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        const wsBaseUrl = getWsUrl();
        const wsUrlWithToken = token ? `${wsBaseUrl}${wsBaseUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : wsBaseUrl;
        ws = new WebSocket(wsUrlWithToken);
        wsRef.current = ws;
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "emergency_broadcast") {
              setEmergencyAlert({ message: data.message, severity: data.severity, timestamp: data.timestamp });
            } else if (data.type === "women_safety_sos" || data.type === "sos_new") {
              loadData(true);
            } else if (data.type === "sos_location_update") {
              setSosAlerts(prev => prev.map(s => s.id === data.id
                ? { ...s, liveGeo: data.geo, liveUpdatedAt: data.liveUpdatedAt }
                : s));
            } else if (data.type === "sos_resolved") {
              setSosAlerts(prev => prev.map(s => s.id === data.id ? { ...s, status: "resolved" } : s));
            } else if (data.type === "announcement") {
              setAnnouncements(prev => [data.announcement, ...prev]);
            } else if (data.type === "resolved" || data.type === "upvote") {
              loadData(true);
            }
          } catch {}
        };
        ws.onerror = () => {};
        ws.onclose = () => {
          if (tokenRef.current) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
      } catch {}
    };

    connect();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
      wsRef.current = null;
    };
  }, [token, loadData]);

  const clearEmergency = useCallback(() => setEmergencyAlert(null), []);

  const getStats = useCallback((): AppStats => ({
    total: complaints.length,
    pending: complaints.filter(c => c.status === "pending").length,
    inProgress: complaints.filter(c => c.status === "in_progress").length,
    resolved: complaints.filter(c => c.status === "resolved" || c.status === "closed").length,
    sos: sosAlerts.filter(s => s.status === "active").length,
    avgHealth: wards.length ? Math.round(wards.reduce((s, w) => s + w.healthScore, 0) / wards.length) : 0,
  }), [complaints, sosAlerts, wards]);

  const submitComplaint = useCallback(async (data: Partial<Complaint>): Promise<Complaint> => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall("/api/complaints", "POST", data);
    setComplaints(prev => [result, ...prev]);
    return result;
  }, []);

  const upvoteComplaint = useCallback(async (id: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/complaints/${id}/upvote`, "PUT");
    setComplaints(prev => prev.map(c => c.id === id ? result : c));
  }, []);

  const resolveComplaint = useCallback(async (id: string, rating?: number, feedback?: string, afterPhoto?: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/complaints/${id}/resolve`, "PUT", { rating, feedback, afterPhoto });
    setComplaints(prev => prev.map(c => c.id === id ? result : c));
  }, []);

  const rejectComplaint = useCallback(async (id: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/complaints/${id}/reject`, "PUT");
    setComplaints(prev => prev.map(c => c.id === id ? result : c));
  }, []);

  const triggerSOS = useCallback(async (data: Partial<SOSAlert>): Promise<SOSAlert> => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall("/api/sos", "POST", data);
    setSosAlerts(prev => [result, ...prev]);
    return result;
  }, []);

  const triggerWomenSafetySOS = useCallback(async (geo: GeoPoint | null, location: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall("/api/sos/women-safety", "POST", {
      geo: geo || { lat: 28.6139, lng: 77.2090 },
      location,
    });
    setSosAlerts(prev => [result.alert, ...prev]);
    return result;
  }, []);

  const updateSOSLocation = useCallback(async (id: string, geo: GeoPoint) => {
    const apiCall = makeApiCall(tokenRef.current);
    try {
      const result = await apiCall(`/api/sos/${id}/location`, "PUT", { lat: geo.lat, lng: geo.lng });
      setSosAlerts(prev => prev.map(s => s.id === id ? result : s));
    } catch {}
  }, []);

  const resolveSOS = useCallback(async (id: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/sos/${id}/resolve`, "PUT");
    setSosAlerts(prev => prev.map(s => s.id === id ? result : s));
  }, []);

  const broadcastEmergency = useCallback(async (message: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    await apiCall("/api/admin/emergency-broadcast", "POST", { message, severity: "high" });
  }, []);

  const getNearestPolice = useCallback(async (geo: GeoPoint) => {
    const apiCall = makeApiCall(tokenRef.current);
    return apiCall(`/api/nearest-police?lat=${geo.lat}&lng=${geo.lng}`);
  }, []);

  const postAnnouncement = useCallback(async (data: Partial<Announcement>): Promise<Announcement> => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall("/api/announcements", "POST", data);
    setAnnouncements(prev => [result, ...prev]);
    return result;
  }, []);

  const deleteAnnouncement = useCallback(async (id: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    await apiCall(`/api/announcements/${id}`, "DELETE");
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  }, []);

  const refresh = useCallback(() => loadData(false), [loadData]);

  return (
    <AppContext.Provider value={{
      complaints, sosAlerts, wards, workers, policeStations, riskZones, leaderboard, announcements,
      isLoading, lastUpdated, emergencyAlert, clearEmergency,
      getStats, submitComplaint, upvoteComplaint, resolveComplaint, rejectComplaint,
      triggerSOS, triggerWomenSafetySOS, resolveSOS, updateSOSLocation, broadcastEmergency, getNearestPolice,
      postAnnouncement, deleteAnnouncement, refresh,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be inside AppProvider");
  return ctx;
}
