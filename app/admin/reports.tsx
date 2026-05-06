import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform,
  ScrollView, Modal, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApp, type Complaint } from "@/context/AppContext";
import Colors from "@/constants/colors";

const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pothole:     { label: "Pothole",     icon: "alert-circle",    color: "#F59E0B" },
  garbage:     { label: "Garbage",     icon: "trash",           color: "#EF4444" },
  streetlight: { label: "Streetlight", icon: "bulb",            color: "#FCD34D" },
  water:       { label: "Water",       icon: "water",           color: "#3B82F6" },
  drain:       { label: "Drain",       icon: "git-network",     color: "#06B6D4" },
  electricity: { label: "Electricity", icon: "flash",           color: "#8B5CF6" },
  tree:        { label: "Tree",        icon: "leaf",            color: "#22C55E" },
  other:       { label: "Other",       icon: "ellipsis-horizontal", color: "#6B7280" },
};

const PRIORITY_COLORS: Record<string, string> = { P1: "#EF4444", P2: "#F59E0B", P3: "#3B82F6", P4: "#6B7280" };
const STATUS_COLORS: Record<string, string> = { pending: "#F59E0B", in_progress: "#3B82F6", resolved: "#22C55E", closed: "#6B7280" };

type SortKey = "submittedAt" | "priority" | "upvotes" | "aiScore";
type FilterCat = "all" | "pothole" | "garbage" | "streetlight" | "water" | "drain" | "electricity" | "tree" | "other";
type FilterStatus = "all" | "pending" | "in_progress" | "resolved" | "closed";

function ComplaintDetailModal({ complaint, onClose, onResolve, onReject }: {
  complaint: Complaint | null;
  onClose: () => void;
  onResolve: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  if (!complaint) return null;
  const meta = CATEGORY_META[complaint.category] || CATEGORY_META.other;
  const priColor = PRIORITY_COLORS[complaint.priority] || "#6B7280";
  const statusColor = STATUS_COLORS[complaint.status] || "#6B7280";
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const doResolve = async () => {
    setLoading(true);
    try { await onResolve(complaint.id); } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };
  const doReject = async () => {
    setLoading(true);
    try { await onReject(complaint.id); } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setLoading(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.detailSheet} onPress={e => e.stopPropagation?.()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Handle */}
            <View style={styles.handle} />
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={[styles.detailIcon, { backgroundColor: meta.color + "22" }]}>
                <Ionicons name={meta.icon} size={22} color={meta.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailTicket}>{complaint.ticketId}</Text>
                <Text style={styles.detailMeta}>{meta.label} · {complaint.ward}</Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Priority + Status */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { icon: "alert-circle" as const, color: priColor, label: complaint.priority + " Critical" },
                { icon: "time" as const, color: statusColor, label: complaint.status.replace("_", " ") },
              ].map((chip, i) => (
                <View key={i} style={[styles.chip, { backgroundColor: chip.color + "22", borderColor: chip.color + "44" }]}>
                  <Ionicons name={chip.icon} size={12} color={chip.color} />
                  <Text style={[styles.chipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
              ))}
              {complaint.isCluster && (
                <View style={[styles.chip, { backgroundColor: "#06B6D422", borderColor: "#06B6D444" }]}>
                  <Ionicons name="git-merge" size={12} color="#06B6D4" />
                  <Text style={[styles.chipText, { color: "#06B6D4" }]}>{complaint.clusterSize} cluster</Text>
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.descBox}>
              <Text style={styles.descLabel}>Description</Text>
              <Text style={styles.descText}>{complaint.description}</Text>
            </View>

            {/* Department badge */}
            {complaint.department && (
              <View style={[styles.chip, { backgroundColor: "#FF993322", borderColor: "#FF993344", marginBottom: 12 }]}>
                <Ionicons name="business" size={12} color="#FF9933" />
                <Text style={[styles.chipText, { color: "#FF9933" }]}>Routed → {complaint.department.split(" (")[0]}</Text>
              </View>
            )}

            {/* Info rows */}
            {[
              { icon: "location" as const, color: Colors.textMuted, label: complaint.location },
              { icon: "person" as const, color: Colors.textMuted, label: complaint.submittedBy || "Anonymous" },
              ...(complaint.workerName ? [{ icon: "construct" as const, color: Colors.cyan, label: `Assigned: ${complaint.workerName}` }] : []),
            ].map((row, i) => (
              <View key={i} style={styles.infoRow}>
                <Ionicons name={row.icon} size={13} color={row.color} />
                <Text style={[styles.infoText, { color: row.color }]}>{row.label}</Text>
              </View>
            ))}
            <View style={styles.infoRow}>
              <Ionicons name="calendar" size={13} color={Colors.textMuted} />
              <Text style={styles.infoText}>{timeAgo(complaint.submittedAt)}</Text>
            </View>

            {/* Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statItem}><Ionicons name="chevron-up" size={14} color={Colors.green} /><Text style={styles.statVal}>{complaint.upvotes}</Text><Text style={styles.statLbl}>Upvotes</Text></View>
              <View style={styles.statItem}><Ionicons name="hardware-chip" size={14} color="#8B5CF6" /><Text style={styles.statVal}>{complaint.aiScore}%</Text><Text style={styles.statLbl}>AI Score</Text></View>
              <View style={styles.statItem}><Ionicons name="shield" size={14} color={Colors.amber} /><Text style={styles.statVal}>{complaint.aiConfidence}%</Text><Text style={styles.statLbl}>Confidence</Text></View>
              {complaint.rating && <View style={styles.statItem}><Ionicons name="star" size={14} color={Colors.amber} /><Text style={styles.statVal}>{complaint.rating}/5</Text><Text style={styles.statLbl}>Rating</Text></View>}
            </View>

            {complaint.feedback && (
              <View style={styles.feedbackBox}>
                <Ionicons name="chatbubble-ellipses" size={12} color={Colors.textMuted} />
                <Text style={styles.feedbackText}>"{complaint.feedback}"</Text>
              </View>
            )}

            {/* Actions */}
            {(complaint.status === "pending" || complaint.status === "in_progress") && (
              <View style={styles.actionRow}>
                <Pressable onPress={doResolve} disabled={loading} style={styles.resolveBtn}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="checkmark-circle" size={16} color="#fff" /><Text style={styles.resolveBtnText}>Mark Resolved</Text></>}
                </Pressable>
                <Pressable onPress={doReject} disabled={loading} style={styles.rejectBtn}>
                  <Ionicons name="close-circle" size={16} color="#EF4444" />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AdminReports() {
  const insets = useSafeAreaInsets();
  const { complaints, resolveComplaint, rejectComplaint, refresh, isLoading } = useApp();

  const [sortKey, setSortKey] = useState<SortKey>("submittedAt");
  const [filterCat, setFilterCat] = useState<FilterCat>("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [selectedC, setSelectedC] = useState<Complaint | null>(null);

  const sorted = [...complaints]
    .filter(c => filterCat === "all" || c.category === filterCat)
    .filter(c => filterStatus === "all" || c.status === filterStatus)
    .filter(c => filterPriority === "all" || c.priority === filterPriority)
    .sort((a, b) => {
      if (sortKey === "submittedAt") return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      if (sortKey === "priority") return a.priority.localeCompare(b.priority);
      if (sortKey === "upvotes") return b.upvotes - a.upvotes;
      if (sortKey === "aiScore") return b.aiScore - a.aiScore;
      return 0;
    });

  const handleResolve = useCallback(async (id: string) => {
    await resolveComplaint(id, 4, "Admin resolved");
    setSelectedC(null);
  }, [resolveComplaint]);

  const handleReject = useCallback(async (id: string) => {
    await rejectComplaint(id);
    setSelectedC(null);
  }, [rejectComplaint]);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.textMuted} />
        </Pressable>
        <Text style={styles.headerTitle}>Reports</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{sorted.length}</Text>
        </View>
      </View>

      {/* Sort */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8, alignItems: "center" }}>
        <Ionicons name="swap-vertical" size={14} color={Colors.textMuted} />
        {(["submittedAt", "priority", "upvotes", "aiScore"] as SortKey[]).map(key => (
          <Pressable key={key} onPress={() => setSortKey(key)} style={[styles.pill, sortKey === key && styles.pillActive]}>
            <Text style={[styles.pillText, sortKey === key && { color: Colors.green }]}>
              {key === "submittedAt" ? "Latest" : key === "priority" ? "Priority" : key === "upvotes" ? "Upvotes" : "AI Score"}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8, alignItems: "center" }}>
        <Pressable onPress={() => setFilterCat("all")} style={[styles.pill, filterCat === "all" && styles.pillActive]}>
          <Text style={[styles.pillText, filterCat === "all" && { color: Colors.green }]}>All Cats</Text>
        </Pressable>
        {Object.entries(CATEGORY_META).map(([key, meta]) => (
          <Pressable key={key} onPress={() => setFilterCat(key as FilterCat)} style={[styles.pill, filterCat === key && { backgroundColor: meta.color + "22", borderColor: meta.color + "55" }]}>
            <Ionicons name={meta.icon} size={12} color={filterCat === key ? meta.color : Colors.textMuted} />
            <Text style={[styles.pillText, filterCat === key && { color: meta.color }]}>{meta.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Priority filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8, alignItems: "center" }}>
        {["all", "P1", "P2", "P3", "P4"].map(p => {
          const col = PRIORITY_COLORS[p] || Colors.green;
          const active = filterPriority === p;
          return (
            <Pressable key={p} onPress={() => setFilterPriority(p)} style={[styles.pill, active && (p === "all" ? styles.pillActive : { backgroundColor: col + "22", borderColor: col + "55" })]}>
              {p !== "all" && <Ionicons name="alert-circle" size={11} color={active ? col : Colors.textMuted} />}
              <Text style={[styles.pillText, active && { color: p === "all" ? Colors.green : col }]}>{p === "all" ? "All Priority" : p}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={sorted}
        keyExtractor={i => i.id}
        onRefresh={refresh}
        refreshing={isLoading}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 20 }}
        renderItem={({ item: c }) => {
          const meta = CATEGORY_META[c.category] || CATEGORY_META.other;
          const priColor = PRIORITY_COLORS[c.priority] || "#6B7280";
          const statusColor = STATUS_COLORS[c.status] || "#6B7280";
          return (
            <Pressable onPress={() => setSelectedC(c)} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={[styles.catIcon, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon} size={16} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTicket}>{c.ticketId}</Text>
                  <Text style={styles.cardCat}>{meta.label} · {c.ward}</Text>
                </View>
                <View style={{ gap: 4, alignItems: "flex-end" }}>
                  <View style={[styles.chip, { backgroundColor: priColor + "22", borderColor: priColor + "44" }]}>
                    <Ionicons name="alert-circle" size={9} color={priColor} />
                    <Text style={[styles.chipText, { color: priColor }]}>{c.priority}</Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: statusColor + "22", borderColor: statusColor + "44" }]}>
                    <Text style={[styles.chipText, { color: statusColor }]}>{c.status.replace("_", " ")}</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.cardDesc} numberOfLines={2}>{c.description}</Text>
              {c.department && (
                <View style={[styles.chip, { backgroundColor: "#FF993318", borderColor: "#FF993333", marginTop: 6, alignSelf: "flex-start" }]}>
                  <Ionicons name="business" size={9} color="#FF9933" />
                  <Text style={[styles.chipText, { color: "#FF9933" }]}>{(c as any).department?.split(" (")[0] || "DM Office"}</Text>
                </View>
              )}
              <View style={styles.cardBottom}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1 }}>
                  <Ionicons name="location-outline" size={11} color={Colors.textMuted} />
                  <Text style={styles.cardLoc} numberOfLines={1}>{c.location}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Ionicons name="hardware-chip" size={11} color="#8B5CF6" />
                    <Text style={styles.aiText}>{c.aiScore}%</Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Ionicons name="chevron-up" size={11} color={Colors.green} />
                    <Text style={styles.upvoteText}>{c.upvotes}</Text>
                  </View>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
                <Ionicons name="open-outline" size={11} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" }}>Tap for full details & actions</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: 60, alignItems: "center", gap: 12 }}>
            <Ionicons name="mail-open-outline" size={36} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, fontFamily: "Inter_400Regular", fontSize: 14 }}>No complaints found</Text>
          </View>
        }
      />

      <ComplaintDetailModal
        complaint={selectedC}
        onClose={() => setSelectedC(null)}
        onResolve={handleResolve}
        onReject={handleReject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  countBadge: { backgroundColor: Colors.bgCard, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.border },
  countText: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  pillActive: { backgroundColor: Colors.green + "11", borderColor: Colors.green + "44" },
  pillText: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_500Medium" },
  card: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  catIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTicket: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  cardCat: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textTransform: "capitalize" },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
  chipText: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "capitalize" },
  cardDesc: { color: "#D1D5DB", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 8 },
  cardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLoc: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  aiText: { color: "#8B5CF6", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  upvoteText: { color: Colors.green, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  // Modal styles
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  detailSheet: { backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: Colors.border, maxHeight: "90%" },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  detailIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  detailTicket: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  detailMeta: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, textTransform: "capitalize" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  descBox: { backgroundColor: Colors.bg, borderRadius: 12, padding: 12, marginBottom: 12 },
  descLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  descText: { color: "#D1D5DB", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  infoText: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular" },
  statsGrid: { flexDirection: "row", backgroundColor: Colors.bg, borderRadius: 12, padding: 14, marginVertical: 12, gap: 4 },
  statItem: { flex: 1, alignItems: "center", gap: 3 },
  statVal: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  statLbl: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular" },
  feedbackBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: Colors.bg, borderRadius: 8, padding: 10, marginBottom: 12 },
  feedbackText: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic", flex: 1, lineHeight: 16 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.border },
  resolveBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.green, borderRadius: 12, padding: 12 },
  resolveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  rejectBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#EF444422", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#EF444444" },
  rejectBtnText: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
