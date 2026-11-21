import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { Platform, AppState } from "react-native";
import * as Outbox from "@/lib/offline-queue";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
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
  resolved:    { color: "#22C55E", bg: "#F0FDF4", label: "Fix submitted" },
  closed:      { color: "#6B7280", bg: "#F9FAFB", label: "Closed (citizen-verified)" },
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
  disaster:        { icon: "alert-octagon",  color: "#DC2626", label: "Natural Disaster" },
  forest_fire:     { icon: "flame",          color: "#EA580C", label: "Forest Fire" },
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
  audioChunks?: { url: string; chunkIndex: number; duration: number; timestamp: string }[];
  district?: string;
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
  district: string;
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
  resolveComplaint: (id: string, rating?: number, feedback?: string) => Promise<void>;
  cancelComplaint: (id: string) => Promise<void>;
  updateComplaintStatus: (id: string, status: "in_progress" | "resolved", extra?: { proofPhoto?: string; proofNote?: string; adminNote?: string; proofGeo?: { lat: number; lng: number } }) => Promise<void>;
  rejectComplaint: (id: string) => Promise<void>;
  triggerSOS: (data: Partial<SOSAlert>) => Promise<SOSAlert>;
  triggerWomenSafetySOS: (geo: GeoPoint | null, location: string, audioUrl?: string) => Promise<{ alert: SOSAlert; nearestStations: PoliceStation[] }>;
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
  const { token, logout, refreshSession, user: authUser } = useAuth();
  const uidRef = useRef<string | null>(null);
  uidRef.current = authUser?.id ?? null;
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
  const refreshRef = useRef(refreshSession);
  refreshRef.current = refreshSession;

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
        // Access tokens are short-lived: try the refresh token first; sign out only if that fails too.
        const renewed = await refreshRef.current();
        if (!renewed) logoutRef.current();
      }
    }
    finally { if (!silent) setIsLoading(false); }
  }, []);

  // Reload whenever the auth token arrives or changes
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (token) {
      loadData(false);
      pollRef.current = setInterval(() => loadData(true), 60000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, loadData]);

  // Register Expo push token with server after login (native only)
  useEffect(() => {
    if (!token || Platform.OS === "web") return;
    let cancelled = false;
    (async () => {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync();
        let finalStatus = existing;
        if (existing !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") return;

        // Android: create high-priority SOS notification channel
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("sos-alerts", {
            name: "SOS Alerts",
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500],
            lightColor: "#EF4444",
            sound: "default",
            enableVibrate: true,
            showBadge: true,
          });
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) return;
        const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) return;
        const baseUrl = getApiUrl();
        await fetch(`${baseUrl}api/push-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token: pushToken.data, platform: Platform.OS }),
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [token]);

  // WebSocket for real-time alerts (m11: backoff, no reconnect after unmount or auth failure).
  useEffect(() => {
    if (!token) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      return;
    }
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;
    let attempt = 0;
    const reloadSoon = () => {
      if (reloadTimer) return;
      reloadTimer = setTimeout(() => { reloadTimer = null; loadData(true); }, 2000);
    };

    const connect = () => {
      if (disposed) return;
      try {
        const base = getWsUrl();
        ws = new WebSocket(`${base}${base.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`);
        wsRef.current = ws;
        ws.onopen = () => { attempt = 0; };
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(String(event.data));
            switch (data.type) {
              case "emergency_broadcast":
                setEmergencyAlert({ message: data.message, severity: data.severity, timestamp: data.timestamp });
                break;
              case "sos_new":
                reloadSoon();
                break;
              case "sos_location_update":
                setSosAlerts(prev => prev.map(s => s.id === data.id ? { ...s, liveGeo: data.geo, liveUpdatedAt: data.liveUpdatedAt } : s));
                break;
              case "sos_resolved":
                setSosAlerts(prev => prev.map(s => s.id === data.id ? { ...s, status: "resolved" } : s));
                break;
              case "announcement":
                if (data.announcement) setAnnouncements(prev => [data.announcement, ...prev.filter(a => a.id !== data.announcement.id)]);
                break;
              case "complaint_new":
              case "complaint_state":
              case "complaint_updated":
              case "upvote":
                reloadSoon();
                break;
            }
          } catch {}
        };
        ws.onclose = (ev) => {
          wsRef.current = null;
          if (disposed || ev.code === 4001) return; // unmounted, or token rejected — don't hammer the server
          attempt += 1;
          reconnectTimer = setTimeout(connect, Math.min(60000, 1000 * 2 ** Math.min(attempt, 6)));
        };
      } catch {}
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (reloadTimer) clearTimeout(reloadTimer);
      ws?.close();
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

  /**
   * P5.1: complaints are sent with a client id; with no network they are saved in the outbox and sent later
   * (the returned placeholder has `queued: true` so the screen can say "Saved — will send when online").
   */
  const submitComplaint = useCallback(async (data: Partial<Complaint>): Promise<Complaint> => {
    const apiCall = makeApiCall(tokenRef.current);
    const clientRequestId = Outbox.newClientId();
    const body = { ...data, clientRequestId };
    try {
      const result = await apiCall("/api/complaints", "POST", body);
      setComplaints(prev => [result, ...prev]);
      return result;
    } catch (err) {
      if (!Outbox.isNetworkError(err) || !uidRef.current) throw err;
      await Outbox.enqueue(uidRef.current, { id: clientRequestId, path: "/api/complaints", method: "POST", body: data as Record<string, unknown>, label: String(data.description ?? "").slice(0, 60) });
      const placeholder = { ...data, id: `local-${clientRequestId}`, ticketId: "SAVED", status: "pending", queued: true, submittedAt: new Date().toISOString(), upvotes: 0, upvotedBy: [] } as unknown as Complaint;
      setComplaints(prev => [placeholder, ...prev]);
      return placeholder;
    }
  }, []);

  // P5.1 outbox flush: on sign-in/start, every 30 s, and whenever the app comes back to the foreground.
  useEffect(() => {
    const uid = authUser?.id;
    if (!token || !uid) return;
    // Only this user's queue is ever sent (review P5-3); a 401 triggers one token refresh (review P5-4).
    const send = Outbox.makeSender(getApiUrl(), () => tokenRef.current, () => refreshRef.current());
    const run = () => { void Outbox.flush(uid, send, (item, result) => {
      if (result && typeof result === "object") setComplaints(prev => prev.map(c => (c.id === `local-${item.id}` ? (result as Complaint) : c)));
    }); };
    run();
    const t = setInterval(run, 30_000);
    const sub = AppState.addEventListener("change", st => { if (st === "active") run(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [token, authUser?.id]);

  const upvoteComplaint = useCallback(async (id: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/complaints/${id}/upvote`, "PUT");
    setComplaints(prev => prev.map(c => c.id === id ? result : c));
  }, []);

  /** Citizen confirms the fix on their own complaint (closes it). */
  const resolveComplaint = useCallback(async (id: string, rating?: number, feedback?: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/complaints/${id}/confirm`, "PUT", { rating, feedback });
    setComplaints(prev => prev.map(c => c.id === id ? result : c));
  }, []);

  const cancelComplaint = useCallback(async (id: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/complaints/${id}/cancel`, "PUT");
    setComplaints(prev => prev.map(c => c.id === id ? result : c));
  }, []);

  /** Officer status change. "resolved" requires a proof photo (data URL or /uploads URL). Officers can never close. */
  const updateComplaintStatus = useCallback(async (id: string, status: "in_progress" | "resolved", extra: { proofPhoto?: string; proofNote?: string; adminNote?: string; proofGeo?: { lat: number; lng: number } } = {}) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall(`/api/admin/complaints/${id}`, "PUT", { status, ...extra });
    setComplaints(prev => prev.map(c => c.id === id ? { ...c, ...result } : c));
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

  const triggerWomenSafetySOS = useCallback(async (geo: GeoPoint | null, location: string, audioUrl?: string) => {
    const apiCall = makeApiCall(tokenRef.current);
    const result = await apiCall("/api/sos/women-safety", "POST", {
      ...(geo ? { geo } : { geoApproximate: true }),
      location,
      ...(audioUrl ? { audioUrl } : {}),
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
      getStats, submitComplaint, upvoteComplaint, resolveComplaint, rejectComplaint, cancelComplaint, updateComplaintStatus,
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
