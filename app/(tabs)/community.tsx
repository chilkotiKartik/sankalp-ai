import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  Modal, TextInput, Alert, Platform, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

type TabKey = "polls" | "petitions" | "events" | "map";

interface Poll {
  id: string; question: string; options: string[]; votes: number[]; voterIds: string[];
  district?: string; createdAt: string; createdBy: string; status: "active" | "closed";
}
interface Petition {
  id: string; title: string; description: string; target: string;
  goalSignatures: number; signerIds: string[]; district?: string;
  createdAt: string; createdBy: string; status: "active" | "closed" | "delivered";
  department: string;
}
interface CivicEvent {
  id: string; title: string; description: string; date: string; time: string;
  location: string; type: string; district?: string; rsvpIds: string[];
  organizer: string; createdAt: string;
}

const EVENT_TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  meeting: { icon: "people", color: "#3B82F6", bg: "#EFF6FF", label: "Meeting" },
  camp:    { icon: "medkit", color: "#00A651", bg: "#F0FFF4", label: "Health Camp" },
  drive:   { icon: "leaf",   color: "#10B981", bg: "#ECFDF5", label: "Drive" },
  scheme:  { icon: "document-text", color: "#F59E0B", bg: "#FFFBEB", label: "Scheme" },
  emergency: { icon: "warning", color: "#EF4444", bg: "#FEF2F2", label: "Emergency" },
};

function makeApiCall(token: string | null) {
  return async function(path: string, method = "GET", body?: any) {
    const baseUrl = getApiUrl();
    const url = `${baseUrl}${path.startsWith("/") ? path.slice(1) : path}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export default function CommunityScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("polls");
  const [polls, setPolls] = useState<Poll[]>([]);
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const [selectedPetition, setSelectedPetition] = useState<Petition | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CivicEvent | null>(null);
  const [policeStations, setPoliceStations] = useState<any[]>([]);
  const [emergencyServices, setEmergencyServices] = useState<any[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [showNewPetition, setShowNewPetition] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      AsyncStorage.getItem("@sankalp_token").then(t => {
        if (t) setToken(t);
        else setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadData = useCallback(async (tok: string | null) => {
    if (!tok) return;
    const api = makeApiCall(tok);
    setLoading(true);
    try {
      const [p, pet, ev] = await Promise.all([
        api("/api/polls"),
        api("/api/petitions"),
        api("/api/events"),
      ]);
      setPolls(p);
      setPetitions(pet);
      setEvents(ev);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (token) loadData(token);
  }, [token, loadData]);

  const loadMap = useCallback(async () => {
    if (!token) return;
    setMapLoading(true);
    try {
      const api = makeApiCall(token);
      const [ps, es] = await Promise.all([
        api("/api/police-stations"),
        api("/api/emergency-services"),
      ]);
      setPoliceStations(Array.isArray(ps) ? ps : []);
      setEmergencyServices(Array.isArray(es) ? es : []);
    } catch {}
    finally { setMapLoading(false); }
  }, [token]);

  useEffect(() => {
    if (tab === "map" && token && policeStations.length === 0) loadMap();
  }, [tab, token]);

  const handleVote = useCallback(async (pollId: string, optionIndex: number) => {
    if (!token) return;
    const api = makeApiCall(token);
    try {
      const updated = await api(`/api/polls/${pollId}/vote`, "PUT", { optionIndex });
      setPolls(prev => prev.map(p => p.id === pollId ? updated : p));
    } catch { Alert.alert("Error", "Could not record your vote"); }
  }, [token]);

  const handleSign = useCallback(async (petitionId: string) => {
    if (!token) return;
    const api = makeApiCall(token);
    try {
      const updated = await api(`/api/petitions/${petitionId}/sign`, "PUT");
      setPetitions(prev => prev.map(p => p.id === petitionId ? updated : p));
      setSelectedPetition(updated);
    } catch { Alert.alert("Error", "Could not sign petition"); }
  }, [token]);

  const handleRSVP = useCallback(async (eventId: string) => {
    if (!token) return;
    const api = makeApiCall(token);
    try {
      const updated = await api(`/api/events/${eventId}/rsvp`, "PUT");
      setEvents(prev => prev.map(e => e.id === eventId ? updated : e));
      setSelectedEvent(updated);
    } catch { Alert.alert("Error", "Could not RSVP"); }
  }, [token]);

  const handleNewPetition = useCallback(async () => {
    if (!newTitle.trim() || !newDesc.trim() || !newTarget.trim()) {
      Alert.alert("Required", "Please fill all fields"); return;
    }
    if (!token) return;
    const api = makeApiCall(token);
    setSubmitting(true);
    try {
      const created = await api("/api/petitions", "POST", {
        title: newTitle.trim(), description: newDesc.trim(), target: newTarget.trim(),
        goalSignatures: 500, department: "District Administration",
      });
      setPetitions(prev => [created, ...prev]);
      setShowNewPetition(false);
      setNewTitle(""); setNewDesc(""); setNewTarget("");
      Alert.alert("Petition Filed!", "Your petition has been submitted. Share it with others to gather signatures.");
    } catch { Alert.alert("Error", "Could not file petition"); }
    finally { setSubmitting(false); }
  }, [newTitle, newDesc, newTarget, token]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const userId = user?.id || "";

  return (
    <View style={s.container}>
      {/* Header */}
      <LinearGradient colors={["#1E3A5F", "#2563EB", "#3B82F6"]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <Text style={s.headerTitle}>Community Voice</Text>
        <Text style={s.headerSub}>Polls · Petitions · Events · District Map</Text>
        <View style={s.tabRow}>
          {([
            { key: "polls",     label: `Polls (${polls.length})`,       icon: "stats-chart" as const },
            { key: "petitions", label: `Petitions (${petitions.length})`, icon: "pencil" as const },
            { key: "events",    label: `Events (${events.length})`,      icon: "calendar" as const },
            { key: "map",       label: "Map",                            icon: "map" as const },
          ] as { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[]).map(t => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={[s.tab, tab === t.key && s.tabActive]}>
              <Ionicons name={t.icon} size={11} color={tab === t.key ? "#fff" : "rgba(255,255,255,0.5)"} />
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#2563EB" size="large" />
          <Text style={{ color: "#9CA3AF", marginTop: 12, fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading community data...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: botPad + 100, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* POLLS TAB */}
          {tab === "polls" && polls.map(poll => {
            const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
            const hasVoted = poll.voterIds.includes(userId);
            const winnerIdx = poll.votes.indexOf(Math.max(...poll.votes));
            return (
              <View key={poll.id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.pollQ}>{poll.question}</Text>
                    <Text style={s.pollMeta}>
                      {totalVotes.toLocaleString()} votes · {poll.district || "All Districts"} · {timeAgo(poll.createdAt)}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, poll.status === "active" ? { backgroundColor: "#F0FFF4" } : { backgroundColor: "#F9FAFB" }]}>
                    <Text style={[s.statusText, { color: poll.status === "active" ? "#00A651" : "#9CA3AF" }]}>
                      {poll.status === "active" ? "Open" : "Closed"}
                    </Text>
                  </View>
                </View>
                <View style={{ gap: 8, marginTop: 12 }}>
                  {poll.options.map((opt, i) => {
                    const pct = totalVotes > 0 ? Math.round((poll.votes[i] / totalVotes) * 100) : 0;
                    const isWinner = i === winnerIdx && totalVotes > 0;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => !hasVoted && poll.status === "active" && handleVote(poll.id, i)}
                        style={[s.pollOption, isWinner && hasVoted && { borderColor: "#3B82F6" }]}
                      >
                        <View style={[s.pollBar, { width: `${pct}%` as any, backgroundColor: isWinner ? "#DBEAFE" : "#F3F4F6" }]} />
                        <View style={s.pollOptionInner}>
                          <Text style={[s.pollOptionText, isWinner && hasVoted && { color: "#1E40AF", fontFamily: "Inter_600SemiBold" }]}>{opt}</Text>
                          {hasVoted && <Text style={[s.pollPct, isWinner && { color: "#2563EB", fontFamily: "Inter_700Bold" }]}>{pct}%</Text>}
                        </View>
                        {!hasVoted && poll.status === "active" && (
                          <Ionicons name="radio-button-off" size={16} color="#9CA3AF" style={{ position: "absolute", right: 10 }} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
                {!hasVoted && poll.status === "active" && (
                  <Text style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" }}>
                    Tap an option to vote
                  </Text>
                )}
                {hasVoted && (
                  <View style={s.votedRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#00A651" />
                    <Text style={{ color: "#00A651", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>You voted · {totalVotes.toLocaleString()} total responses</Text>
                  </View>
                )}
              </View>
            );
          })}

          {/* PETITIONS TAB */}
          {tab === "petitions" && (
            <>
              <Pressable onPress={() => setShowNewPetition(true)} style={s.newPetitionBtn}>
                <LinearGradient colors={["#1E3A5F", "#2563EB"]} style={s.newPetitionGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}>Start a New Petition</Text>
                </LinearGradient>
              </Pressable>
              {petitions.map(pet => {
                const pct = Math.min(100, Math.round((pet.signerIds.length / pet.goalSignatures) * 100));
                const hasSigned = pet.signerIds.includes(userId);
                const statusColor = pet.status === "active" ? "#2563EB" : pet.status === "delivered" ? "#00A651" : "#9CA3AF";
                return (
                  <Pressable key={pet.id} onPress={() => setSelectedPetition(pet)} style={s.card}>
                    <View style={s.cardHeader}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={s.petitionTitle}>{pet.title}</Text>
                        <Text style={{ color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular" }}>
                          {pet.department} · {pet.district || "All Districts"}
                        </Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: statusColor + "15" }]}>
                        <Text style={[s.statusText, { color: statusColor }]}>
                          {pet.status === "delivered" ? "Delivered" : pet.status === "active" ? "Active" : "Closed"}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.petitionDesc} numberOfLines={2}>{pet.description}</Text>
                    <View style={s.signatureRow}>
                      <View style={s.sigBar}>
                        <View style={[s.sigFill, { width: `${pct}%` as any }]} />
                      </View>
                      <Text style={s.sigCount}>
                        <Text style={{ color: "#2563EB", fontFamily: "Inter_700Bold" }}>{pet.signerIds.length.toLocaleString()}</Text>
                        <Text style={{ color: "#9CA3AF" }}> / {pet.goalSignatures.toLocaleString()} signatures · {pct}%</Text>
                      </Text>
                    </View>
                    {pet.status === "active" && (
                      <Pressable
                        onPress={() => hasSigned ? null : handleSign(pet.id)}
                        style={[s.signBtn, hasSigned && s.signedBtn]}
                      >
                        <Ionicons name={hasSigned ? "checkmark-circle" : "pencil"} size={15} color={hasSigned ? "#00A651" : "#fff"} />
                        <Text style={[s.signBtnText, hasSigned && { color: "#00A651" }]}>
                          {hasSigned ? "Signed ✓" : "Sign this Petition"}
                        </Text>
                      </Pressable>
                    )}
                    <Text style={s.petitionMeta}>By {pet.createdBy} · {timeAgo(pet.createdAt)} · Target: {pet.target}</Text>
                  </Pressable>
                );
              })}
            </>
          )}

          {/* EVENTS TAB */}
          {tab === "events" && events.map(event => {
            const meta = EVENT_TYPE_META[event.type] || EVENT_TYPE_META.meeting;
            const hasRSVP = event.rsvpIds.includes(userId);
            const upcoming = daysUntil(event.date);
            const isPast = upcoming === "Past";
            return (
              <Pressable key={event.id} onPress={() => setSelectedEvent(event)} style={[s.card, isPast && { opacity: 0.7 }]}>
                <View style={s.eventHeader}>
                  <View style={[s.eventTypeBadge, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon as any} size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.eventTitle}>{event.title}</Text>
                    <Text style={s.eventOrg}>{event.organizer}</Text>
                  </View>
                  <View style={[s.dateChip, isPast ? { backgroundColor: "#F9FAFB" } : { backgroundColor: meta.bg }]}>
                    <Text style={[s.dateChipText, { color: isPast ? "#9CA3AF" : meta.color }]}>{upcoming}</Text>
                  </View>
                </View>
                <Text style={s.eventDesc} numberOfLines={2}>{event.description}</Text>
                <View style={s.eventMeta}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="calendar-outline" size={11} color="#9CA3AF" />
                    <Text style={s.eventMetaText}>{formatDate(event.date)} · {event.time}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="location-outline" size={11} color="#9CA3AF" />
                    <Text style={s.eventMetaText} numberOfLines={1}>{event.location}</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name="people-outline" size={11} color="#9CA3AF" />
                    <Text style={s.eventMetaText}>{event.rsvpIds.length} going</Text>
                  </View>
                </View>
                {!isPast && (
                  <Pressable
                    onPress={() => handleRSVP(event.id)}
                    style={[s.rsvpBtn, hasRSVP && s.rsvpedBtn]}
                  >
                    <Ionicons name={hasRSVP ? "checkmark-circle" : "calendar"} size={14} color={hasRSVP ? "#00A651" : "#2563EB"} />
                    <Text style={[s.rsvpBtnText, hasRSVP && { color: "#00A651" }]}>{hasRSVP ? "Going ✓" : "RSVP"}</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          })}

          {/* MAP TAB */}
          {tab === "map" && (
            mapLoading ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color="#2563EB" size="large" />
                <Text style={{ color: "#9CA3AF", marginTop: 12, fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading district data...</Text>
              </View>
            ) : (
              <>
                {/* District banner */}
                <View style={[s.card, { backgroundColor: "#1E3A5F", borderColor: "#2563EB44" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "#2563EB22", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#3B82F655" }}>
                      <Ionicons name="map" size={22} color="#60A5FA" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" }}>{user?.district || "Uttarakhand"} District</Text>
                      <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 }}>
                        {policeStations.length} police stations · {emergencyServices.length} emergency services
                      </Text>
                    </View>
                    <View style={{ backgroundColor: "#22C55E22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#22C55E44" }}>
                      <Text style={{ color: "#22C55E", fontSize: 11, fontFamily: "Inter_700Bold" }}>LIVE</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
                    {[
                      { label: "Police", count: policeStations.length, color: "#3B82F6" },
                      { label: "Hospitals", count: emergencyServices.filter((e: any) => e.type === "hospital").length, color: "#EF4444" },
                      { label: "Fire", count: emergencyServices.filter((e: any) => e.type === "fire").length, color: "#F59E0B" },
                      { label: "Ambulance", count: emergencyServices.filter((e: any) => e.type === "ambulance").length, color: "#22C55E" },
                    ].map(stat => (
                      <View key={stat.label} style={{ flex: 1, alignItems: "center", backgroundColor: stat.color + "15", borderRadius: 8, padding: 8 }}>
                        <Text style={{ color: stat.color, fontSize: 16, fontFamily: "Inter_700Bold" }}>{stat.count}</Text>
                        <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, fontFamily: "Inter_400Regular" }}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Emergency numbers */}
                <View style={s.card}>
                  <Text style={{ color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 10 }}>National Emergency Numbers</Text>
                  {[
                    { label: "Police",       number: "100",   icon: "shield" as const,   color: "#3B82F6" },
                    { label: "Ambulance",    number: "108",   icon: "medkit" as const,   color: "#EF4444" },
                    { label: "Fire Brigade", number: "101",   icon: "flame" as const,    color: "#F59E0B" },
                    { label: "Women Helpline",number: "1090", icon: "woman" as const,    color: "#EC4899" },
                    { label: "DM Helpline",  number: "1077",  icon: "call" as const,     color: "#22C55E" },
                  ].map(svc => (
                    <Pressable key={svc.label} onPress={() => Linking.openURL(`tel:${svc.number}`)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: svc.color + "15", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={svc.icon} size={16} color={svc.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{svc.label}</Text>
                      </View>
                      <View style={{ backgroundColor: svc.color + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: svc.color + "33" }}>
                        <Text style={{ color: svc.color, fontSize: 15, fontFamily: "Inter_700Bold" }}>{svc.number}</Text>
                      </View>
                      <Ionicons name="call" size={14} color={svc.color} />
                    </Pressable>
                  ))}
                </View>

                {/* Police Stations */}
                {policeStations.length > 0 && (
                  <View style={s.card}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Ionicons name="shield-half" size={16} color="#3B82F6" />
                      <Text style={{ color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold" }}>Police Stations</Text>
                      <View style={{ backgroundColor: "#EFF6FF", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: "#2563EB", fontSize: 10, fontFamily: "Inter_700Bold" }}>{policeStations.length}</Text>
                      </View>
                    </View>
                    {policeStations.map((ps: any, i: number) => (
                      <View key={ps.id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "#F3F4F6", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="shield" size={14} color="#3B82F6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{ps.name}</Text>
                            <Text style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }} numberOfLines={1}>{ps.address}</Text>
                          </View>
                          <Pressable onPress={() => ps.phone && Linking.openURL(`tel:${ps.phone.replace(/[^0-9+]/g, "")}`)} style={{ backgroundColor: "#EFF6FF", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#BFDBFE" }}>
                            <Text style={{ color: "#2563EB", fontSize: 12, fontFamily: "Inter_700Bold" }}>Call</Text>
                          </Pressable>
                        </View>
                        {ps.phone && (
                          <Text style={{ color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, marginLeft: 42 }}>{ps.phone}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {/* Emergency Services */}
                {emergencyServices.length > 0 && (
                  <View style={s.card}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <Ionicons name="medkit" size={16} color="#EF4444" />
                      <Text style={{ color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold" }}>Emergency Services</Text>
                      <View style={{ backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ color: "#EF4444", fontSize: 10, fontFamily: "Inter_700Bold" }}>{emergencyServices.length}</Text>
                      </View>
                    </View>
                    {emergencyServices.map((es: any, i: number) => {
                      const esMeta: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
                        hospital:  { icon: "medical",    color: "#EF4444" },
                        fire:      { icon: "flame",      color: "#F59E0B" },
                        ambulance: { icon: "car",        color: "#22C55E" },
                        disaster:  { icon: "warning",    color: "#8B5CF6" },
                      };
                      const m = esMeta[es.type] || { icon: "alert-circle" as const, color: "#6B7280" };
                      return (
                        <View key={es.id} style={{ borderTopWidth: i > 0 ? 1 : 0, borderTopColor: "#F3F4F6", paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
                          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                            <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: m.color + "15", alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name={m.icon} size={14} color={m.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{es.name}</Text>
                              <Text style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }} numberOfLines={1}>{es.address || es.location}</Text>
                            </View>
                            {es.phone && (
                              <Pressable onPress={() => Linking.openURL(`tel:${es.phone.replace(/[^0-9+]/g, "")}`)} style={{ backgroundColor: m.color + "15", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: m.color + "33" }}>
                                <Text style={{ color: m.color, fontSize: 12, fontFamily: "Inter_700Bold" }}>Call</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )
          )}

          {tab === "polls" && polls.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="stats-chart-outline" size={40} color="#9CA3AF" />
              <Text style={s.emptyTitle}>No polls yet</Text>
            </View>
          )}
          {tab === "petitions" && petitions.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="pencil-outline" size={40} color="#9CA3AF" />
              <Text style={s.emptyTitle}>No petitions yet</Text>
            </View>
          )}
          {tab === "events" && events.length === 0 && (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
              <Text style={s.emptyTitle}>No events yet</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Petition Detail Modal */}
      <Modal visible={!!selectedPetition} transparent animationType="slide" onRequestClose={() => setSelectedPetition(null)}>
        <Pressable style={s.overlay} onPress={() => setSelectedPetition(null)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            {selectedPetition && (() => {
              const pct = Math.min(100, Math.round((selectedPetition.signerIds.length / selectedPetition.goalSignatures) * 100));
              const hasSigned = selectedPetition.signerIds.includes(userId);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={{ padding: 20 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <Text style={[s.petitionTitle, { fontSize: 18, flex: 1 }]}>{selectedPetition.title}</Text>
                      <Pressable onPress={() => setSelectedPetition(null)} style={s.closeBtn}>
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </Pressable>
                    </View>
                    <View style={{ gap: 4, marginBottom: 16 }}>
                      <Text style={{ color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" }}>Addressed to: {selectedPetition.target}</Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" }}>Department: {selectedPetition.department}</Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" }}>Filed by: {selectedPetition.createdBy} · {timeAgo(selectedPetition.createdAt)}</Text>
                    </View>
                    <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 20 }}>
                      {selectedPetition.description}
                    </Text>
                    <View style={{ backgroundColor: "#F0F9FF", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                      <Text style={{ color: "#1E40AF", fontSize: 24, fontFamily: "Inter_700Bold" }}>{selectedPetition.signerIds.length.toLocaleString()}</Text>
                      <Text style={{ color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" }}>of {selectedPetition.goalSignatures.toLocaleString()} goal · {pct}% achieved</Text>
                      <View style={s.sigBar}>
                        <View style={[s.sigFill, { width: `${pct}%` as any }]} />
                      </View>
                    </View>
                    {selectedPetition.status === "active" && (
                      <Pressable onPress={() => handleSign(selectedPetition.id)} style={[s.signBtn, hasSigned && s.signedBtn]}>
                        <Ionicons name={hasSigned ? "checkmark-circle" : "pencil"} size={16} color={hasSigned ? "#00A651" : "#fff"} />
                        <Text style={[s.signBtnText, { fontSize: 16 }, hasSigned && { color: "#00A651" }]}>{hasSigned ? "Signed ✓" : "Sign this Petition"}</Text>
                      </Pressable>
                    )}
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* Event Detail Modal */}
      <Modal visible={!!selectedEvent} transparent animationType="slide" onRequestClose={() => setSelectedEvent(null)}>
        <Pressable style={s.overlay} onPress={() => setSelectedEvent(null)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            {selectedEvent && (() => {
              const meta = EVENT_TYPE_META[selectedEvent.type] || EVENT_TYPE_META.meeting;
              const hasRSVP = selectedEvent.rsvpIds.includes(userId);
              const isPast = daysUntil(selectedEvent.date) === "Past";
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <LinearGradient colors={[meta.color + "22", meta.bg]} style={{ padding: 20 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={[s.eventTypeBadge, { backgroundColor: "rgba(255,255,255,0.8)" }]}>
                        <Ionicons name={meta.icon as any} size={24} color={meta.color} />
                      </View>
                      <Pressable onPress={() => setSelectedEvent(null)} style={s.closeBtn}>
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </Pressable>
                    </View>
                    <Text style={{ color: "#111827", fontSize: 20, fontFamily: "Inter_700Bold", marginTop: 12 }}>{selectedEvent.title}</Text>
                    <Text style={{ color: meta.color, fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 4 }}>{meta.label} · {selectedEvent.organizer}</Text>
                  </LinearGradient>
                  <View style={{ padding: 20 }}>
                    <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 20 }}>{selectedEvent.description}</Text>
                    {[
                      { icon: "calendar", label: "Date", val: formatDate(selectedEvent.date) },
                      { icon: "time", label: "Time", val: selectedEvent.time },
                      { icon: "location", label: "Venue", val: selectedEvent.location },
                      { icon: "people", label: "Attending", val: `${selectedEvent.rsvpIds.length} people` },
                    ].map(row => (
                      <View key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: meta.bg, alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={row.icon as any} size={16} color={meta.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_500Medium" }}>{row.label.toUpperCase()}</Text>
                          <Text style={{ color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{row.val}</Text>
                        </View>
                      </View>
                    ))}
                    {/* Get Directions / Live Location */}
                    <Pressable
                      onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(selectedEvent.location + ", Uttarakhand")}`)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#BFDBFE" }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="navigate" size={16} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#2563EB", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>Get Directions</Text>
                        <Text style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 }}>Opens Google Maps with live location</Text>
                      </View>
                      <Ionicons name="open-outline" size={14} color="#9CA3AF" />
                    </Pressable>
                    {!isPast && (
                      <Pressable onPress={() => handleRSVP(selectedEvent.id)} style={[s.signBtn, hasRSVP && s.signedBtn, { marginTop: 4 }]}>
                        <Ionicons name={hasRSVP ? "checkmark-circle" : "calendar"} size={16} color={hasRSVP ? "#00A651" : "#fff"} />
                        <Text style={[s.signBtnText, { fontSize: 16 }, hasRSVP && { color: "#00A651" }]}>{hasRSVP ? "Going ✓" : "RSVP — I'll Attend"}</Text>
                      </Pressable>
                    )}
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* New Petition Modal */}
      <Modal visible={showNewPetition} transparent animationType="slide" onRequestClose={() => setShowNewPetition(false)}>
        <View style={s.overlay}>
          <ScrollView>
            <View style={[s.sheet, { borderRadius: 24, marginTop: 60 }]}>
              <View style={s.sheetHandle} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 16 }}>
                <Text style={{ color: "#111827", fontSize: 20, fontFamily: "Inter_700Bold" }}>Start a Petition</Text>
                <Pressable onPress={() => setShowNewPetition(false)} style={s.closeBtn}>
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </View>
              <View style={{ paddingHorizontal: 20 }}>
                <Text style={s.fieldLabel}>PETITION TITLE *</Text>
                <TextInput style={s.textInput} placeholder="e.g. Fix potholes on NH-58 near Haridwar" placeholderTextColor="#9CA3AF" value={newTitle} onChangeText={setNewTitle} />
                <Text style={s.fieldLabel}>DESCRIPTION *</Text>
                <TextInput style={[s.textInput, { minHeight: 100, textAlignVertical: "top" }]} placeholder="Explain the problem and why action is needed..." placeholderTextColor="#9CA3AF" value={newDesc} onChangeText={setNewDesc} multiline numberOfLines={4} />
                <Text style={s.fieldLabel}>ADDRESSED TO *</Text>
                <TextInput style={s.textInput} placeholder="e.g. District Collector, Dehradun / PWD Department" placeholderTextColor="#9CA3AF" value={newTarget} onChangeText={setNewTarget} />
                <Pressable onPress={handleNewPetition} disabled={submitting} style={[s.signBtn, { marginTop: 8, marginBottom: 20 }]}>
                  {submitting ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="pencil" size={16} color="#fff" />
                      <Text style={s.signBtnText}>Submit Petition</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  header: { paddingHorizontal: 20, paddingBottom: 0 },
  headerTitle: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 16 },
  tabRow: { flexDirection: "row", gap: 2 },
  tab: { flex: 1, alignItems: "center", paddingVertical: 9, borderRadius: 0, gap: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: "#fff" },
  tabText: { color: "rgba(255,255,255,0.55)", fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  tabTextActive: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 9 },

  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  pollQ: { color: "#111827", fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4, lineHeight: 22 },
  pollMeta: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular" },
  pollOption: { position: "relative", backgroundColor: "#F9FAFB", borderRadius: 10, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden", minHeight: 44, justifyContent: "center" },
  pollBar: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 10 },
  pollOptionInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, zIndex: 1 },
  pollOptionText: { color: "#374151", fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  pollPct: { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  votedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, backgroundColor: "#F0FFF4", borderRadius: 8, padding: 8 },

  petitionTitle: { color: "#111827", fontSize: 15, fontFamily: "Inter_700Bold", lineHeight: 22 },
  petitionDesc: { color: "#6B7280", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 8 },
  petitionMeta: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 10, lineHeight: 16 },
  signatureRow: { gap: 6, marginTop: 12 },
  sigBar: { height: 6, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: "hidden", marginVertical: 6 },
  sigFill: { height: 6, backgroundColor: "#2563EB", borderRadius: 3 },
  sigCount: { fontSize: 12, fontFamily: "Inter_500Medium" },
  signBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#2563EB", borderRadius: 12, padding: 14, marginTop: 12 },
  signedBtn: { backgroundColor: "#F0FFF4", borderWidth: 1, borderColor: "#A7F3D0" },
  signBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },

  eventHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  eventTypeBadge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  eventTitle: { color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  eventOrg: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  dateChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  dateChipText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  eventDesc: { color: "#6B7280", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginTop: 8 },
  eventMeta: { gap: 4, marginTop: 10 },
  eventMetaText: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular" },
  rsvpBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10, marginTop: 10, justifyContent: "center", borderWidth: 1, borderColor: "#BFDBFE" },
  rsvpedBtn: { backgroundColor: "#F0FFF4", borderColor: "#A7F3D0" },
  rsvpBtnText: { color: "#2563EB", fontSize: 13, fontFamily: "Inter_700Bold" },

  newPetitionBtn: { borderRadius: 14, overflow: "hidden" },
  newPetitionGrad: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, justifyContent: "center" },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyTitle: { color: "#374151", fontSize: 16, fontFamily: "Inter_600SemiBold" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%", overflow: "hidden" },
  sheetHandle: { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 8 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },

  fieldLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  textInput: { backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, color: "#111827", fontSize: 14, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 4 },
});
