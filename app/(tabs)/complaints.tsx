import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  Modal, ScrollView, Platform, ActivityIndicator, Animated, Alert, Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { useApp, type Complaint } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

const CATS = [
  { key: "pothole",     label: "Pothole",     icon: "alert-circle"        as const, color: "#F59E0B", bg: "#FFFBEB" },
  { key: "garbage",     label: "Garbage",     icon: "trash"               as const, color: "#EF4444", bg: "#FEF2F2" },
  { key: "streetlight", label: "Streetlight", icon: "bulb"                as const, color: "#F59E0B", bg: "#FFFBEB" },
  { key: "water",       label: "Water",       icon: "water"               as const, color: "#3B82F6", bg: "#EFF6FF" },
  { key: "drain",       label: "Drain",       icon: "git-network"         as const, color: "#06B6D4", bg: "#F0FDFF" },
  { key: "electricity", label: "Electricity", icon: "flash"               as const, color: "#8B5CF6", bg: "#F5F3FF" },
  { key: "tree",        label: "Tree",        icon: "leaf"                as const, color: "#00A651", bg: "#F0FFF4" },
  { key: "other",       label: "Other",       icon: "ellipsis-horizontal" as const, color: "#6B7280", bg: "#F9FAFB" },
];

const PRIORITIES = [
  { key: "P1", label: "Critical", color: "#EF4444" },
  { key: "P2", label: "High",     color: "#F59E0B" },
  { key: "P3", label: "Medium",   color: "#3B82F6" },
  { key: "P4", label: "Low",      color: "#6B7280" },
];

const STATUS_META: Record<string, { color: string; bg: string }> = {
  pending:     { color: "#F59E0B", bg: "#FFFBEB" },
  in_progress: { color: "#3B82F6", bg: "#EFF6FF" },
  resolved:    { color: "#00A651", bg: "#F0FFF4" },
  closed:      { color: "#6B7280", bg: "#F9FAFB" },
};

const BEFORE_PHOTOS: Record<string, string> = {
  pothole:     "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=200&fit=crop",
  garbage:     "https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=400&h=200&fit=crop",
  streetlight: "https://images.unsplash.com/photo-1536240478700-b869ad10e093?w=400&h=200&fit=crop",
  water:       "https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=400&h=200&fit=crop",
  drain:       "https://images.unsplash.com/photo-1621451537084-482c73073a0f?w=400&h=200&fit=crop",
  electricity: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400&h=200&fit=crop",
  tree:        "https://images.unsplash.com/photo-1541795795328-f073b763494e?w=400&h=200&fit=crop",
  other:       "https://images.unsplash.com/photo-1517685352821-92cf88aee5a5?w=400&h=200&fit=crop",
};

const AFTER_PHOTOS: Record<string, string> = {
  pothole:     "https://images.unsplash.com/photo-1590486803833-1c5dc8ddd4c8?w=400&h=200&fit=crop",
  garbage:     "https://images.unsplash.com/photo-1534759926370-e4b08f282c9e?w=400&h=200&fit=crop",
  streetlight: "https://images.unsplash.com/photo-1505673542670-a5e3ff5b14c3?w=400&h=200&fit=crop",
  water:       "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=200&fit=crop",
  drain:       "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&h=200&fit=crop",
  electricity: "https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=400&h=200&fit=crop",
  tree:        "https://images.unsplash.com/photo-1535766571970-9376f5d1cd1e?w=400&h=200&fit=crop",
  other:       "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&h=200&fit=crop",
};

function aiClassify(text: string): string {
  const lower = text.toLowerCase();
  if (/pothole|crack|road|broken|damage|bump/.test(lower)) return "pothole";
  if (/garbage|trash|waste|bin|dump|smell|rat/.test(lower)) return "garbage";
  if (/light|lamp|dark|streetlight|bulb/.test(lower)) return "streetlight";
  if (/water|pipeline|supply|bore|tank|leak|pipe/.test(lower)) return "water";
  if (/drain|sewer|flood|overflow|choke/.test(lower)) return "drain";
  if (/electric|power|wire|transformer|voltage|shock/.test(lower)) return "electricity";
  if (/tree|branch|fall|fell|uprooted/.test(lower)) return "tree";
  return "";
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 8, justifyContent: "center", marginVertical: 8 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <Pressable key={s} onPress={() => onChange(s)}>
          <Text style={{ fontSize: 28 }}>{s <= value ? "⭐" : "☆"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ComplaintCard({ item, onPress, onUpvote, userId, index = 0 }: {
  item: Complaint; onPress: () => void; onUpvote: () => void; userId: string; index?: number;
}) {
  const hasUpvoted = item.upvotedBy.includes(userId);
  const upvoteAnim = useRef(new Animated.Value(1)).current;
  const slideY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const col = CATS.find(c => c.key === item.category) || CATS[7];
  const st = STATUS_META[item.status] || STATUS_META.closed;
  const pr = PRIORITIES.find(p => p.key === item.priority);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 0, duration: 350, delay: Math.min(index * 60, 350), useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: Math.min(index * 60, 350), useNativeDriver: false }),
    ]).start();
  }, []);

  const doUpvote = () => {
    if (!hasUpvoted) {
      Animated.sequence([
        Animated.timing(upvoteAnim, { toValue: 1.4, duration: 120, useNativeDriver: false }),
        Animated.timing(upvoteAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
      ]).start();
    }
    onUpvote();
  };

  const slaHours: Record<string, number> = { P1: 24, P2: 48, P3: 72, P4: 168 };
  const hoursElapsed = (Date.now() - new Date(item.submittedAt).getTime()) / 3600000;
  const sla = slaHours[item.priority] || 72;
  const isBreached = (item.status === "pending" || item.status === "in_progress") && hoursElapsed > sla;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: slideY }] }}>
      <Pressable onPress={onPress} style={[cs.card, isBreached && { borderColor: "#FCA5A5" }]}>
        <View style={[cs.catBar, { backgroundColor: col.color }]} />
        <View style={{ flex: 1, padding: 14 }}>
          <View style={cs.cardTop}>
            <View style={[cs.catIconWrap, { backgroundColor: col.bg }]}>
              <Ionicons name={col.icon} size={16} color={col.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={cs.cardTicket}>{item.ticketId}</Text>
              <Text style={cs.cardCat}>{col.label} · {item.ward}</Text>
            </View>
            <View style={{ gap: 4, alignItems: "flex-end" }}>
              <View style={[cs.badge, { backgroundColor: (pr?.color || "#6B7280") + "18" }]}>
                <Text style={[cs.badgeText, { color: pr?.color || "#6B7280" }]}>{item.priority}</Text>
              </View>
              <View style={[cs.badge, { backgroundColor: st.bg }]}>
                <Text style={[cs.badgeText, { color: st.color }]}>{item.status.replace("_", " ")}</Text>
              </View>
            </View>
          </View>
          <Text style={cs.cardDesc} numberOfLines={2}>{item.description}</Text>
          <View style={cs.cardBottom}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
              <Ionicons name="location-outline" size={11} color="#9CA3AF" />
              <Text style={cs.cardLoc} numberOfLines={1}>{item.location}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {isBreached && (
                <View style={{ backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ color: "#EF4444", fontSize: 9, fontFamily: "Inter_700Bold" }}>SLA!</Text>
                </View>
              )}
              <View style={cs.aiScore}>
                <Ionicons name="hardware-chip" size={9} color="#8B5CF6" />
                <Text style={cs.aiScoreText}>{item.aiScore}%</Text>
              </View>
              {item.isCluster && (
                <View style={cs.clusterBadge}>
                  <Text style={cs.clusterText}>🔗{item.clusterSize}</Text>
                </View>
              )}
              <Animated.View style={{ transform: [{ scale: upvoteAnim }] }}>
                <Pressable onPress={doUpvote} style={[cs.upvoteBtn, hasUpvoted && { backgroundColor: "#F0FFF4", borderColor: "#00A65133" }]}>
                  <Ionicons name={hasUpvoted ? "chevron-up" : "chevron-up-outline"} size={13} color={hasUpvoted ? "#00A651" : "#9CA3AF"} />
                  <Text style={[cs.upvoteCount, hasUpvoted && { color: "#00A651" }]}>{item.upvotes}</Text>
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

type SortKey = "latest" | "priority" | "upvotes" | "ai_score";

function startVoiceInput(onResult: (text: string) => void, onEnd: () => void) {
  if (Platform.OS !== "web") { Alert.alert("Voice Input", "Voice input is available on web. On mobile, please type your complaint."); onEnd(); return; }
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) { Alert.alert("Not Supported", "Voice input is not supported in this browser."); onEnd(); return; }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event: any) => {
    const transcript = event.results[0][0].transcript;
    onResult(transcript);
  };
  recognition.onend = () => onEnd();
  recognition.onerror = () => onEnd();
  recognition.start();
}

export default function ComplaintsScreen() {
  const insets = useSafeAreaInsets();
  const { complaints, submitComplaint, upvoteComplaint, resolveComplaint, rejectComplaint, isLoading, refresh } = useApp();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [showSubmit, setShowSubmit] = useState(false);
  const [selectedC, setSelectedC] = useState<Complaint | null>(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ senderName: string; senderRole: string; message: string; sentAt: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [newCat, setNewCat] = useState("pothole");
  const [newDesc, setNewDesc] = useState("");
  const [newLoc, setNewLoc] = useState("");
  const [newPriority, setNewPriority] = useState("P3");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiDetected, setAiDetected] = useState("");
  const [isListening, setIsListening] = useState(false);

  const [showResolution, setShowResolution] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [resolving, setResolving] = useState(false);
  const [proofAdded, setProofAdded] = useState(false);

  const userId = user?.id || user?.phone || "";

  const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

  const filtered = complaints
    .filter(c => {
      if (search && !c.description.toLowerCase().includes(search.toLowerCase()) && !c.ticketId.includes(search) && !c.location.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterCat !== "all" && c.category !== filterCat) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "latest") return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      if (sortKey === "priority") return (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
      if (sortKey === "upvotes") return b.upvotes - a.upvotes;
      if (sortKey === "ai_score") return b.aiScore - a.aiScore;
      return 0;
    });

  useEffect(() => {
    if (newDesc.length > 15) {
      const detected = aiClassify(newDesc);
      if (detected) { setAiDetected(detected); setNewCat(detected); }
    }
  }, [newDesc]);

  const handleVoiceInput = useCallback(() => {
    setIsListening(true);
    startVoiceInput(
      (text) => { setNewDesc(prev => prev ? prev + " " + text : text); },
      () => setIsListening(false)
    );
  }, []);

  const handlePickPhoto = useCallback(async () => {
    if (Platform.OS === "web") {
      setNewPhoto("https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop");
      return;
    }
    Alert.alert("Attach Photo", "Choose source", [
      { text: "Camera", onPress: async () => {
        const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 });
        if (!r.canceled && r.assets[0]) setNewPhoto(r.assets[0].uri);
      }},
      { text: "Gallery", onPress: async () => {
        const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 });
        if (!r.canceled && r.assets[0]) setNewPhoto(r.assets[0].uri);
      }},
      { text: "Cancel", style: "cancel" },
    ]);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!newDesc.trim() || !newLoc.trim()) { Alert.alert("Required fields", "Please fill in description and location"); return; }
    setSubmitting(true);
    try {
      await submitComplaint({
        category: newCat as any, description: newDesc.trim(), location: newLoc.trim(),
        geo: { lat: 30.0668 + (Math.random() - 0.5) * 2.8, lng: 79.0193 + (Math.random() - 0.5) * 3.8 },
        ward: user?.district || "Dehradun", wardNumber: 1, priority: newPriority as any,
        status: "pending", isCluster: false, hasProof: !!newPhoto,
      });
      setShowSubmit(false);
      setNewDesc(""); setNewLoc(""); setNewCat("pothole"); setNewPriority("P3"); setAiDetected(""); setNewPhoto(null);
    } catch (err: any) { Alert.alert("Error", err.message); }
    finally { setSubmitting(false); }
  }, [newCat, newDesc, newLoc, newPriority, newPhoto, submitComplaint, user]);

  const handleUpvote = useCallback(async (id: string) => { try { await upvoteComplaint(id); } catch {} }, [upvoteComplaint]);

  const handleConfirmResolution = useCallback(async () => {
    if (!selectedC) return;
    setResolving(true);
    try {
      await resolveComplaint(selectedC.id, rating || 4, feedback, `https://images.unsplash.com/photo-${Date.now()}?w=400`);
      setSelectedC(null); setShowResolution(false); setRating(0); setFeedback(""); setProofAdded(false);
    } catch (err: any) { Alert.alert("Error", err.message); }
    finally { setResolving(false); }
  }, [selectedC, rating, feedback, resolveComplaint]);

  const handleReject = useCallback(async () => {
    if (!selectedC) return;
    try { await rejectComplaint(selectedC.id); setSelectedC(null); setShowResolution(false); } catch {}
  }, [selectedC, rejectComplaint]);

  const handleOpenChat = useCallback(async (complaint: Complaint) => {
    setSelectedC(complaint);
    setChatLoading(true);
    setShowChatModal(true);
    try {
      const { getApiUrl } = await import("@/lib/query-client");
      const token = (await import("@react-native-async-storage/async-storage")).default.getItem("token");
      const tok = await token;
      const res = await fetch(`${getApiUrl()}api/complaints/${complaint.id}/chat`, {
        headers: { Authorization: `Bearer ${tok}` }
      });
      if (res.ok) {
        const msgs = await res.json();
        if (msgs.length === 0) {
          setChatMessages([{ senderName: "SANKALP System", senderRole: "system", message: `Your complaint ${complaint.ticketId} has been received. An officer will respond shortly.`, sentAt: complaint.submittedAt }]);
        } else {
          setChatMessages(msgs);
        }
      }
    } catch { setChatMessages([]); }
    finally { setChatLoading(false); }
  }, []);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || !selectedC) return;
    const msg = chatInput.trim();
    setChatInput("");
    try {
      const { getApiUrl } = await import("@/lib/query-client");
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const tok = await AsyncStorage.getItem("token");
      const res = await fetch(`${getApiUrl()}api/complaints/${selectedC.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) {
        const newMsg = await res.json();
        setChatMessages(prev => [...prev, newMsg]);
      }
    } catch {}
  }, [chatInput, selectedC]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
    { key: "latest", label: "Latest", icon: "time" },
    { key: "priority", label: "Priority", icon: "alert-circle" },
    { key: "upvotes", label: "Upvotes", icon: "chevron-up" },
    { key: "ai_score", label: "AI Score", icon: "hardware-chip" },
  ];

  return (
    <View style={cs.container}>
      {/* Header */}
      <LinearGradient colors={["#BF360C", "#E64A19", "#FF8F00"]} style={[cs.header, { paddingTop: topPad + 12 }]}>
        <View style={cs.headerContent}>
          <View>
            <Text style={cs.headerTitle}>Civic Reports</Text>
            <Text style={cs.headerSub}>{complaints.length} total · {filtered.length} shown</Text>
          </View>
          <View style={cs.headerStats}>
            <View style={cs.statPill}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#FCD34D" }} />
              <Text style={cs.statPillText}>{complaints.filter(c => c.status === "pending").length} pending</Text>
            </View>
            <View style={[cs.statPill, { borderColor: "rgba(0,166,81,0.4)" }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" }} />
              <Text style={[cs.statPillText, { color: "#4ADE80" }]}>{complaints.filter(c => c.status === "resolved").length} done</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Search */}
      <View style={cs.filterSection}>
        <View style={cs.searchBox}>
          <Ionicons name="search" size={16} color="#9CA3AF" />
          <TextInput
            style={cs.searchInput}
            placeholder="Search ticket, location, description..."
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={16} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* Sort Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.pillRow}>
          {SORT_OPTIONS.map(s => {
            const active = sortKey === s.key;
            return (
              <Pressable key={s.key} onPress={() => setSortKey(s.key)} style={[cs.sortPill, active && cs.sortPillActive]}>
                <Ionicons name={s.icon as any} size={11} color={active ? "#E64A19" : "#6B7280"} />
                <Text style={[cs.sortPillText, active && cs.sortPillTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Status Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.pillRow}>
          {[
            { key: "all", label: "All Status", color: "#6B7280" },
            { key: "pending", label: "Pending", color: "#F59E0B" },
            { key: "in_progress", label: "In Progress", color: "#3B82F6" },
            { key: "resolved", label: "Resolved", color: "#00A651" },
          ].map(s => {
            const active = filterStatus === s.key;
            return (
              <Pressable key={s.key} onPress={() => setFilterStatus(s.key)} style={[cs.pill, active && { backgroundColor: s.color + "20", borderColor: s.color }]}>
                {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.color }} />}
                <Text style={[cs.pillText, active && { color: s.color, fontFamily: "Inter_700Bold" }]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Category Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[cs.pillRow, { paddingBottom: 8 }]}>
          <Pressable onPress={() => setFilterCat("all")} style={[cs.catPill, filterCat === "all" && { backgroundColor: "#F3F4F6", borderColor: "#374151" }]}>
            <Text style={[cs.catPillText, filterCat === "all" && { color: "#111827", fontFamily: "Inter_700Bold" }]}>All</Text>
          </Pressable>
          {CATS.map(c => {
            const active = filterCat === c.key;
            return (
              <Pressable key={c.key} onPress={() => setFilterCat(c.key)} style={[cs.catPill, active && { backgroundColor: c.bg, borderColor: c.color }]}>
                <Ionicons name={c.icon} size={12} color={active ? c.color : "#9CA3AF"} />
                <Text style={[cs.catPillText, active && { color: c.color, fontFamily: "Inter_700Bold" }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item, index }) => (
          <ComplaintCard item={item} userId={userId} onPress={() => setSelectedC(item)} onUpvote={() => handleUpvote(item.id)} index={index} />
        )}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: botPad + 100, gap: 8 }}
        onRefresh={refresh}
        refreshing={isLoading}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={cs.empty}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="document-text-outline" size={36} color="#9CA3AF" />
            </View>
            <Text style={cs.emptyTitle}>No complaints found</Text>
            <Text style={cs.emptySub}>Try adjusting your filters or tap + to file a new report</Text>
          </View>
        }
      />

      {/* FAB */}
      <Pressable onPress={() => setShowSubmit(true)} style={[cs.fab, { bottom: botPad + 100 }]}>
        <LinearGradient colors={["#E64A19", "#FF8F00"]} style={cs.fabGrad}>
          <Ionicons name="add" size={26} color="#fff" />
        </LinearGradient>
      </Pressable>

      {/* Detail Modal */}
      <Modal visible={!!selectedC && !showChatModal} transparent animationType="slide" onRequestClose={() => setSelectedC(null)}>
        <Pressable style={cs.overlay} onPress={() => setSelectedC(null)}>
          <View style={cs.sheet}>
            <View style={cs.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedC && (() => {
                const col = CATS.find(c => c.key === selectedC.category) || CATS[7];
                const st = STATUS_META[selectedC.status] || STATUS_META.closed;
                const pr = PRIORITIES.find(p => p.key === selectedC.priority);
                const hoursElapsed = Math.round((Date.now() - new Date(selectedC.submittedAt).getTime()) / 3600000);
                const slaHours: Record<string, number> = { P1: 24, P2: 48, P3: 72, P4: 168 };
                const sla = slaHours[selectedC.priority] || 72;
                const slaBreached = (selectedC.status === "pending" || selectedC.status === "in_progress") && hoursElapsed > sla;
                return (
                  <>
                    <LinearGradient colors={[col.color + "22", col.bg]} style={cs.detailHero}>
                      <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: col.bg, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: col.color + "44" }}>
                        <Ionicons name={col.icon} size={28} color={col.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={cs.detailTicket}>{selectedC.ticketId}</Text>
                        <Text style={cs.detailCat}>{col.label} · {selectedC.ward}</Text>
                        <View style={{ flexDirection: "row", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                          <View style={[cs.badge, { backgroundColor: st.bg }]}>
                            <Text style={[cs.badgeText, { color: st.color }]}>{selectedC.status.replace("_", " ")}</Text>
                          </View>
                          <View style={[cs.badge, { backgroundColor: (pr?.color || "#6B7280") + "18" }]}>
                            <Text style={[cs.badgeText, { color: pr?.color || "#6B7280" }]}>{selectedC.priority}</Text>
                          </View>
                          {slaBreached && (
                            <View style={[cs.badge, { backgroundColor: "#FEF2F2" }]}>
                              <Text style={[cs.badgeText, { color: "#EF4444" }]}>SLA Breached</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Pressable onPress={() => setSelectedC(null)} style={cs.closeBtn}>
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </Pressable>
                    </LinearGradient>

                    <View style={{ paddingHorizontal: 20 }}>
                      <Text style={cs.detailDesc}>{selectedC.description}</Text>
                      <View style={cs.detailLocRow}>
                        <Ionicons name="location" size={14} color="#9CA3AF" />
                        <Text style={cs.detailLoc}>{selectedC.location}</Text>
                      </View>

                      {/* SLA Info */}
                      <View style={[cs.slaRow, slaBreached && cs.slaRowBad]}>
                        <Ionicons name="time" size={13} color={slaBreached ? "#EF4444" : "#6B7280"} />
                        <Text style={[cs.slaText, slaBreached && { color: "#EF4444" }]}>
                          {hoursElapsed}h elapsed · SLA: {sla}h · {slaBreached ? "⚠️ Overdue" : `${sla - hoursElapsed}h remaining`}
                        </Text>
                      </View>

                      {/* Stats */}
                      <View style={cs.statsRow}>
                        {[
                          { label: "Upvotes", val: selectedC.upvotes, color: "#00A651" },
                          { label: "AI Score", val: `${selectedC.aiScore}%`, color: "#8B5CF6" },
                          { label: "Worker", val: selectedC.workerName || "—", color: "#3B82F6" },
                        ].map(s => (
                          <View key={s.label} style={cs.statBox}>
                            <Text style={[cs.statVal, { color: s.color }]}>{s.val}</Text>
                            <Text style={cs.statLabel}>{s.label}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Before / After Photos */}
                      <View style={{ marginBottom: 14 }}>
                        <Text style={[cs.statLabel, { marginBottom: 8, textAlign: "left" }]}>PHOTO EVIDENCE</Text>
                        <View style={cs.proofRow}>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Image source={{ uri: BEFORE_PHOTOS[selectedC.category] || BEFORE_PHOTOS.other }} style={[cs.proofImg, { width: "100%", height: 90 }]} resizeMode="cover" />
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                              <Text style={[cs.proofLabel, { color: "#EF4444" }]}>Before</Text>
                            </View>
                          </View>
                          <View style={{ alignItems: "center", gap: 4 }}>
                            <Ionicons name="arrow-forward" size={16} color="#9CA3AF" />
                            <Text style={{ fontSize: 8, color: "#9CA3AF", fontFamily: "Inter_400Regular" }}>AI Verified</Text>
                          </View>
                          <View style={{ flex: 1, gap: 4 }}>
                            {selectedC.status === "resolved" ? (
                              <Image source={{ uri: AFTER_PHOTOS[selectedC.category] || AFTER_PHOTOS.other }} style={[cs.proofImg, { width: "100%", height: 90, borderColor: "#A7F3D0" }]} resizeMode="cover" />
                            ) : (
                              <View style={[cs.proofImg, { width: "100%", height: 90, borderStyle: "dashed" }]}>
                                <Ionicons name="camera-outline" size={22} color="#9CA3AF" />
                                <Text style={cs.proofLabel}>Pending</Text>
                              </View>
                            )}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedC.status === "resolved" ? "#00A651" : "#9CA3AF" }} />
                              <Text style={[cs.proofLabel, { color: selectedC.status === "resolved" ? "#00A651" : "#9CA3AF" }]}>After</Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {selectedC.rating && (
                        <View style={cs.ratingBox}>
                          <Text style={cs.ratingLabel}>Citizen Rating</Text>
                          <View style={{ flexDirection: "row", gap: 3 }}>
                            {[1,2,3,4,5].map(n => (
                              <Ionicons key={n} name={n <= selectedC.rating! ? "star" : "star-outline"} size={18} color="#F59E0B" />
                            ))}
                          </View>
                          {selectedC.feedback && <Text style={cs.feedbackText}>"{selectedC.feedback}"</Text>}
                        </View>
                      )}

                      {/* Chat Button */}
                      <Pressable onPress={() => handleOpenChat(selectedC)} style={[cs.actionBtn, { borderColor: "#BFDBFE", marginBottom: 8 }]}>
                        <Ionicons name="chatbubbles" size={16} color="#3B82F6" />
                        <Text style={[cs.actionText, { color: "#3B82F6" }]}>Message Officer</Text>
                        <View style={{ flex: 1 }} />
                        <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                      </Pressable>

                      {(selectedC.status === "pending" || selectedC.status === "in_progress") && (
                        <View style={{ gap: 8, marginTop: 4 }}>
                          <Pressable onPress={() => handleUpvote(selectedC.id)} style={cs.actionBtn}>
                            <Ionicons name="chevron-up" size={16} color="#00A651" />
                            <Text style={[cs.actionText, { color: "#00A651" }]}>Upvote ({selectedC.upvotes})</Text>
                          </Pressable>
                          <Pressable onPress={() => setShowResolution(true)} style={[cs.actionBtn, { borderColor: "#A7F3D0" }]}>
                            <Ionicons name="checkmark-circle" size={16} color="#00A651" />
                            <Text style={[cs.actionText, { color: "#00A651" }]}>Mark Resolved</Text>
                          </Pressable>
                        </View>
                      )}

                      {selectedC.status === "resolved" && !selectedC.rating && (
                        <View style={{ gap: 8, marginTop: 8 }}>
                          <Pressable onPress={() => setShowResolution(true)} style={[cs.actionBtn, { borderColor: "#A7F3D0" }]}>
                            <Ionicons name="checkmark-circle" size={16} color="#00A651" />
                            <Text style={[cs.actionText, { color: "#00A651" }]}>Confirm & Rate</Text>
                          </Pressable>
                          <Pressable onPress={handleReject} style={[cs.actionBtn, { borderColor: "#FECACA" }]}>
                            <Ionicons name="close-circle" size={16} color="#EF4444" />
                            <Text style={[cs.actionText, { color: "#EF4444" }]}>Reject — Reopen</Text>
                          </Pressable>
                        </View>
                      )}
                      <View style={{ height: 20 }} />
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Chat Modal */}
      <Modal visible={showChatModal} transparent animationType="slide" onRequestClose={() => { setShowChatModal(false); }}>
        <View style={cs.overlay}>
          <View style={[cs.sheet, { height: "80%" }]}>
            <View style={cs.sheetHandle} />
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 }}>
              <Ionicons name="chatbubbles" size={20} color="#3B82F6" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: "#111827", fontSize: 16, fontFamily: "Inter_700Bold" }}>Message Officer</Text>
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular" }}>{selectedC?.ticketId}</Text>
              </View>
              <Pressable onPress={() => setShowChatModal(false)} style={cs.closeBtn}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
              {chatLoading ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <ActivityIndicator color="#3B82F6" />
                  <Text style={{ color: "#9CA3AF", marginTop: 8, fontSize: 12, fontFamily: "Inter_400Regular" }}>Loading messages...</Text>
                </View>
              ) : chatMessages.length === 0 ? (
                <View style={{ padding: 40, alignItems: "center" }}>
                  <Text style={{ fontSize: 36 }}>💬</Text>
                  <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 8 }}>No messages yet</Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 4 }}>Send a message to communicate with the responsible officer</Text>
                </View>
              ) : chatMessages.map((msg, i) => {
                const isOfficer = msg.senderRole === "officer" || msg.senderRole === "system";
                return (
                  <View key={i} style={{ flexDirection: isOfficer ? "row" : "row-reverse", gap: 8, marginBottom: 12, alignItems: "flex-end" }}>
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: isOfficer ? "#EFF6FF" : "#F0FFF4", alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name={isOfficer ? "shield-half" : "person"} size={14} color={isOfficer ? "#3B82F6" : "#00A651"} />
                    </View>
                    <View style={{ maxWidth: "75%" }}>
                      <View style={{ backgroundColor: isOfficer ? "#EFF6FF" : "#E64A19", borderRadius: 12, padding: 10, borderBottomLeftRadius: isOfficer ? 4 : 12, borderBottomRightRadius: isOfficer ? 12 : 4 }}>
                        <Text style={{ color: isOfficer ? "#1E40AF" : "#fff", fontSize: 13, fontFamily: "Inter_400Regular" }}>{msg.message}</Text>
                      </View>
                      <Text style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3, textAlign: isOfficer ? "left" : "right" }}>{msg.senderName}</Text>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
              <TextInput
                style={[cs.searchInput, { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#E5E7EB" }]}
                placeholder="Type your message..."
                placeholderTextColor="#9CA3AF"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendChat}
              />
              <Pressable onPress={handleSendChat} style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: "#E64A19", alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="send" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Resolution Modal */}
      <Modal visible={showResolution} transparent animationType="slide">
        <View style={cs.overlay}>
          <View style={cs.sheet}>
            <View style={cs.sheetHandle} />
            <Text style={cs.modalTitle}>Resolution Proof</Text>
            {!proofAdded ? (
              <>
                <Text style={cs.modalSub}>Add after-photo to verify the fix</Text>
                <Pressable onPress={() => setProofAdded(true)} style={cs.cameraBtn}>
                  <Ionicons name="camera" size={24} color="#00A651" />
                  <Text style={[cs.actionText, { color: "#00A651" }]}>Capture After Photo</Text>
                </Pressable>
                <View style={cs.gpsRow}>
                  <Ionicons name="location" size={13} color="#00A651" />
                  <Text style={cs.gpsText}>GPS Verified · Location Match ✓</Text>
                </View>
              </>
            ) : (
              <View style={cs.proofAddedBox}>
                <Ionicons name="checkmark-circle" size={20} color="#00A651" />
                <Text style={cs.proofAddedText}>After photo uploaded ✓</Text>
              </View>
            )}
            <Text style={[cs.modalSub, { marginTop: 16 }]}>Rate this resolution</Text>
            <StarRating value={rating} onChange={setRating} />
            <TextInput style={cs.textArea} placeholder="Feedback (optional)..." placeholderTextColor="#9CA3AF" value={feedback} onChangeText={setFeedback} />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 12, marginBottom: 20 }}>
              <Pressable onPress={() => setShowResolution(false)} style={cs.cancelBtn}>
                <Text style={cs.cancelText}>Back</Text>
              </Pressable>
              <Pressable onPress={handleConfirmResolution} style={cs.confirmBtn} disabled={resolving}>
                {resolving ? <ActivityIndicator color="#fff" /> : <Text style={cs.confirmText}>Confirm ✓</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Submit Modal */}
      <Modal visible={showSubmit} transparent animationType="slide">
        <View style={cs.overlay}>
          <ScrollView>
            <View style={[cs.sheet, { borderRadius: 24, marginTop: 60, marginHorizontal: 0 }]}>
              <View style={cs.sheetHandle} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 16 }}>
                <Text style={cs.modalTitle}>File a Complaint</Text>
                <Pressable onPress={() => setShowSubmit(false)} style={cs.closeBtn}>
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </View>

              <View style={{ paddingHorizontal: 20 }}>
                {/* Description + Voice */}
                <Text style={cs.fieldLabel}>WHAT'S THE PROBLEM? *</Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    style={[cs.textArea, { paddingRight: 48 }]}
                    placeholder="Describe the issue clearly..."
                    placeholderTextColor="#9CA3AF"
                    value={newDesc}
                    onChangeText={setNewDesc}
                    multiline
                    numberOfLines={3}
                  />
                  <Pressable
                    onPress={handleVoiceInput}
                    style={{ position: "absolute", right: 10, bottom: 18, width: 34, height: 34, borderRadius: 17, backgroundColor: isListening ? "#E64A19" : "#F3F4F6", alignItems: "center", justifyContent: "center" }}
                  >
                    <Ionicons name={isListening ? "radio" : "mic"} size={16} color={isListening ? "#fff" : "#6B7280"} />
                  </Pressable>
                </View>
                {isListening && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF8E7", borderRadius: 8, padding: 8, marginTop: 4, marginBottom: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#E64A19" }} />
                    <Text style={{ color: "#E64A19", fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Listening... speak now</Text>
                  </View>
                )}
                {aiDetected && (
                  <View style={cs.aiDetectRow}>
                    <Text style={{ fontSize: 14 }}>🤖</Text>
                    <Text style={cs.aiDetectText}>AI detected: <Text style={{ color: "#E64A19", fontFamily: "Inter_700Bold" }}>{CATS.find(c => c.key === aiDetected)?.label}</Text></Text>
                  </View>
                )}

                {/* Category */}
                <Text style={cs.fieldLabel}>CATEGORY *</Text>
                <View style={cs.catGrid}>
                  {CATS.map(c => (
                    <Pressable key={c.key} onPress={() => setNewCat(c.key)}
                      style={[cs.catCard, newCat === c.key && { backgroundColor: c.bg, borderColor: c.color, borderWidth: 2 }]}
                    >
                      <Text style={{ fontSize: 20 }}>{c.icon}</Text>
                      <Text style={[cs.catCardText, newCat === c.key && { color: c.color }]}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Location */}
                <Text style={cs.fieldLabel}>LOCATION *</Text>
                <View style={cs.inputWrap}>
                  <Ionicons name="location" size={16} color="#9CA3AF" />
                  <TextInput style={cs.inputField} placeholder="Street, area, landmark..." placeholderTextColor="#9CA3AF" value={newLoc} onChangeText={setNewLoc} />
                </View>

                {/* Priority */}
                <Text style={cs.fieldLabel}>PRIORITY</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                  {PRIORITIES.map(p => (
                    <Pressable key={p.key} onPress={() => setNewPriority(p.key)}
                      style={[cs.prBtn, newPriority === p.key && { backgroundColor: p.color + "18", borderColor: p.color }]}
                    >
                      <Text style={[cs.prBtnText, newPriority === p.key && { color: p.color }]}>{p.key}</Text>
                      <Text style={cs.prBtnSub}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>

                {/* Photo */}
                <Text style={cs.fieldLabel}>PHOTO PROOF</Text>
                {newPhoto ? (
                  <View style={{ marginBottom: 16 }}>
                    <Image source={{ uri: newPhoto }} style={cs.photoPreview} />
                    <Pressable onPress={() => setNewPhoto(null)} style={cs.removePhoto}>
                      <Ionicons name="close-circle" size={24} color="#EF4444" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={handlePickPhoto} style={cs.photoPicker}>
                    <View style={cs.photoPickerIcon}>
                      <Ionicons name="camera" size={22} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cs.photoPickerTitle}>Attach Photo</Text>
                      <Text style={cs.photoPickerSub}>Camera or gallery · Boosts AI priority score</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                  </Pressable>
                )}

                <Pressable onPress={handleSubmit} disabled={submitting} style={cs.submitBtn}>
                  {submitting ? <ActivityIndicator color="#fff" /> : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="paper-plane" size={16} color="#fff" />
                      <Text style={cs.submitBtnText}>Submit Complaint</Text>
                    </View>
                  )}
                </Pressable>
                <View style={{ height: 20 }} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const cs = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  header: { paddingHorizontal: 20, paddingBottom: 16, overflow: "hidden" },
  headerContent: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerTitle: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerStats: { gap: 6 },
  statPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,215,0,0.3)" },
  statPillText: { color: "#FCD34D", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  filterSection: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3F4F6", paddingTop: 12 },
  searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10, borderWidth: 1, borderColor: "#E5E7EB", marginHorizontal: 16, marginBottom: 10 },
  searchInput: { flex: 1, color: "#111827", fontSize: 14, fontFamily: "Inter_400Regular" },
  pillRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8, flexDirection: "row" },

  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" },
  pillText: { color: "#374151", fontSize: 12, fontFamily: "Inter_500Medium" },

  sortPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" },
  sortPillActive: { backgroundColor: "#FFF3E0", borderColor: "#E64A19" },
  sortPillText: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_500Medium" },
  sortPillTextActive: { color: "#E64A19", fontFamily: "Inter_700Bold" },

  catPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" },
  catPillText: { color: "#374151", fontSize: 11, fontFamily: "Inter_500Medium" },

  card: { backgroundColor: "#fff", borderRadius: 16, overflow: "hidden", flexDirection: "row", borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  catBar: { width: 4 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 6 },
  catIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTicket: { color: "#111827", fontSize: 13, fontFamily: "Inter_700Bold" },
  cardCat: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  cardDesc: { color: "#374151", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 8 },
  cardBottom: { flexDirection: "row", alignItems: "center" },
  cardLoc: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular" },
  aiScore: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F5F3FF", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  aiScoreText: { color: "#8B5CF6", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  clusterBadge: { backgroundColor: "#F0FDFF", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  clusterText: { color: "#06B6D4", fontSize: 9, fontFamily: "Inter_600SemiBold" },
  upvoteBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F9FAFB", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "#E5E7EB" },
  upvoteCount: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyTitle: { color: "#374151", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  fab: { position: "absolute", right: 20, zIndex: 10 },
  fabGrad: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", shadowColor: "#E64A19", shadowRadius: 12, shadowOpacity: 0.5, elevation: 8 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", overflow: "hidden" },
  sheetHandle: { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 16 },
  detailHero: { flexDirection: "row", alignItems: "flex-start", gap: 14, padding: 20 },
  detailTicket: { color: "#111827", fontSize: 18, fontFamily: "Inter_700Bold" },
  detailCat: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  detailDesc: { color: "#374151", fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 10 },
  detailLocRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  detailLoc: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  slaRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F9FAFB", borderRadius: 8, padding: 8, marginBottom: 14 },
  slaRowBad: { backgroundColor: "#FEF2F2" },
  slaText: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", gap: 8, backgroundColor: "#F9FAFB", borderRadius: 14, padding: 14, marginBottom: 14 },
  statBox: { flex: 1, alignItems: "center" },
  statVal: { fontSize: 18, fontFamily: "Inter_700Bold" },
  statLabel: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  proofRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 14 },
  proofImg: { width: 90, height: 70, backgroundColor: "#F9FAFB", borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB", gap: 4 },
  proofLabel: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_500Medium" },
  ratingBox: { alignItems: "center", gap: 4, marginBottom: 14 },
  ratingLabel: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_500Medium" },
  feedbackText: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  actionText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalTitle: { color: "#111827", fontSize: 20, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 4 },
  modalSub: { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, marginBottom: 8 },
  cameraBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F0FFF4", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#A7F3D0", justifyContent: "center", marginHorizontal: 20, marginBottom: 8 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#F0FFF4", borderRadius: 8, padding: 10, marginHorizontal: 20, marginBottom: 8 },
  gpsText: { color: "#00A651", fontSize: 12, fontFamily: "Inter_500Medium" },
  proofAddedBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0FFF4", borderRadius: 10, padding: 12, marginHorizontal: 20, marginBottom: 8 },
  proofAddedText: { color: "#00A651", fontSize: 13, fontFamily: "Inter_500Medium" },
  textArea: { backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, color: "#111827", fontSize: 14, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: "#E5E7EB", minHeight: 80, textAlignVertical: "top", marginBottom: 8 },
  cancelBtn: { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", marginLeft: 20 },
  cancelText: { color: "#6B7280", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { flex: 2, backgroundColor: "#00A651", borderRadius: 12, padding: 14, alignItems: "center", marginRight: 20 },
  confirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  fieldLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 12 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  catCard: { width: "22%", backgroundColor: "#F9FAFB", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB", gap: 4 },
  catCardText: { color: "#9CA3AF", fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F9FAFB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 12 },
  inputField: { flex: 1, color: "#111827", fontSize: 14, fontFamily: "Inter_400Regular" },
  prBtn: { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 10, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  prBtnText: { color: "#374151", fontSize: 13, fontFamily: "Inter_700Bold" },
  prBtnSub: { color: "#9CA3AF", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  photoPreview: { width: "100%", height: 160, borderRadius: 12, backgroundColor: "#F3F4F6", marginBottom: 4 },
  removePhoto: { position: "absolute", top: 8, right: 8 },
  photoPicker: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#BFDBFE", marginBottom: 16 },
  photoPickerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  photoPickerTitle: { color: "#3B82F6", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  photoPickerSub: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  submitBtn: { backgroundColor: "#E64A19", borderRadius: 14, padding: 18, alignItems: "center", marginTop: 4 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  aiDetectRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF8E7", borderRadius: 10, padding: 10, marginBottom: 8 },
  aiDetectText: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_500Medium" },
});
