import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform,
  ScrollView, Modal, Alert, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApp, type Worker, type Complaint } from "@/context/AppContext";
import Colors from "@/constants/colors";

type WorkerStatus = "all" | "active" | "idle" | "on_leave";

const STATUS_COLOR: Record<string, string> = { active: Colors.green, idle: Colors.amber, on_leave: Colors.textMuted };
const TASK_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "Inspecting pothole": "alert-circle", "Garbage collection": "trash",
  "Fixing streetlight": "bulb", "Pipeline repair": "water",
  "Drain clearing": "flash", "Tree removal": "leaf",
};

function WorkerDetailModal({ worker, complaints, onClose }: {
  worker: Worker | null;
  complaints: Complaint[];
  onClose: () => void;
}) {
  if (!worker) return null;
  const statusColor = STATUS_COLOR[worker.status] || Colors.textMuted;
  const scoreColor = worker.score >= 80 ? Colors.green : worker.score >= 60 ? Colors.amber : Colors.red;
  const assignedComplaints = complaints.filter(c =>
    c.workerName === worker.name && (c.status === "in_progress" || c.status === "pending")
  );
  const completedComplaints = complaints.filter(c =>
    c.workerName === worker.name && (c.status === "resolved" || c.status === "closed")
  );

  return (
    <Modal visible={!!worker} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.detailCard} onPress={e => e.stopPropagation?.()}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={styles.detailAvatar}>
                <Text style={styles.detailAvatarText}>
                  {worker.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </Text>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{worker.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="location" size={12} color={Colors.textMuted} />
                  <Text style={styles.detailWard}>{worker.ward}</Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: statusColor + "22", borderColor: statusColor + "44" }]}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} />
                  <Text style={[styles.statusChipText, { color: statusColor }]}>
                    {worker.status === "on_leave" ? "On Leave" : worker.status.charAt(0).toUpperCase() + worker.status.slice(1)}
                  </Text>
                </View>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            {/* Contact */}
            <View style={styles.contactRow}>
              <Ionicons name="call" size={14} color={Colors.green} />
              <Text style={styles.contactText}>{worker.phone}</Text>
              <Pressable
                style={styles.callBtn}
                onPress={() => {
                  if (Platform.OS === "web") {
                    Alert.alert("Call", `Calling ${worker.name} at ${worker.phone}...`);
                  } else {
                    Linking.openURL(`tel:${worker.phone}`).catch(() =>
                      Alert.alert("Error", "Unable to initiate call")
                    );
                  }
                }}
              >
                <Ionicons name="call" size={13} color="#fff" />
                <Text style={styles.callBtnText}>Call Now</Text>
              </Pressable>
            </View>

            {/* Performance stats */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { borderColor: scoreColor + "44" }]}>
                <Text style={[styles.statBigVal, { color: scoreColor }]}>{worker.score}</Text>
                <Text style={styles.statLabel}>Performance Score</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statBigVal, { color: Colors.green }]}>{worker.resolvedToday}</Text>
                <Text style={styles.statLabel}>Resolved Today</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statBigVal, { color: Colors.blue }]}>{worker.totalResolved}</Text>
                <Text style={styles.statLabel}>Total Resolved</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statBigVal, { color: Colors.amber }]}>{worker.avgRating.toFixed(1)}</Text>
                <Text style={styles.statLabel}>Avg Rating</Text>
              </View>
            </View>

            {/* Current task */}
            {worker.currentTask && (
              <View style={styles.currentTaskBox}>
                <Ionicons name={TASK_ICONS[worker.currentTask] || "construct"} size={16} color={Colors.cyan} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.currentTaskLabel}>Current Assignment</Text>
                  <Text style={styles.currentTaskText}>{worker.currentTask}</Text>
                </View>
                <View style={styles.activePill}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green }} />
                  <Text style={{ color: Colors.green, fontSize: 9, fontFamily: "Inter_700Bold" }}>LIVE</Text>
                </View>
              </View>
            )}

            {/* Active assignments */}
            {assignedComplaints.length > 0 && (
              <View style={styles.assignSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="construct" size={14} color={Colors.amber} />
                  <Text style={styles.sectionTitle}>Active Assignments ({assignedComplaints.length})</Text>
                </View>
                {assignedComplaints.map(c => (
                  <View key={c.id} style={styles.assignRow}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.status === "in_progress" ? Colors.blue : Colors.amber, marginTop: 4 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assignTicket}>{c.ticketId} · {c.category}</Text>
                      <Text style={styles.assignDesc} numberOfLines={1}>{c.description}</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={9} color={Colors.textMuted} />
                        <Text style={styles.assignLoc} numberOfLines={1}>{c.location}</Text>
                      </View>
                    </View>
                    <View style={[styles.priBadge, { backgroundColor: (c.priority === "P1" ? "#EF4444" : c.priority === "P2" ? "#F59E0B" : "#3B82F6") + "22" }]}>
                      <Text style={[styles.priText, { color: c.priority === "P1" ? "#EF4444" : c.priority === "P2" ? "#F59E0B" : "#3B82F6" }]}>{c.priority}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Completed */}
            {completedComplaints.length > 0 && (
              <View style={styles.assignSection}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.green} />
                  <Text style={styles.sectionTitle}>Completed ({completedComplaints.length})</Text>
                </View>
                {completedComplaints.slice(0, 3).map(c => (
                  <View key={c.id} style={[styles.assignRow, { opacity: 0.7 }]}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.green} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assignTicket}>{c.ticketId} · {c.category}</Text>
                      <Text style={styles.assignDesc} numberOfLines={1}>{c.description}</Text>
                    </View>
                    {c.rating && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <Ionicons name="star" size={10} color={Colors.amber} />
                        <Text style={{ color: Colors.amber, fontSize: 10, fontFamily: "Inter_600SemiBold" }}>{c.rating}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {assignedComplaints.length === 0 && completedComplaints.length === 0 && (
              <View style={{ alignItems: "center", padding: 20 }}>
                <Ionicons name="clipboard-outline" size={28} color={Colors.textMuted} />
                <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 8 }}>No complaints assigned yet</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AdminWorkers() {
  const insets = useSafeAreaInsets();
  const { workers, complaints } = useApp();
  const [filter, setFilter] = useState<WorkerStatus>("all");
  const [sortBy, setSortBy] = useState<"score" | "resolved" | "rating">("score");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const filtered = workers
    .filter(w => filter === "all" || w.status === filter)
    .sort((a, b) => {
      if (sortBy === "resolved") return b.totalResolved - a.totalResolved;
      if (sortBy === "rating") return b.avgRating - a.avgRating;
      return b.score - a.score;
    });

  const active = workers.filter(w => w.status === "active").length;
  const idle = workers.filter(w => w.status === "idle").length;
  const onLeave = workers.filter(w => w.status === "on_leave").length;
  const avgScore = workers.length > 0 ? Math.round(workers.reduce((s, w) => s + w.score, 0) / workers.length) : 0;

  const renderWorker = useCallback(({ item: w, index }: { item: Worker; index: number }) => {
    const statusColor = STATUS_COLOR[w.status] || Colors.textMuted;
    const scoreColor = w.score >= 80 ? Colors.green : w.score >= 60 ? Colors.amber : Colors.red;
    const assignedCount = complaints.filter(c => c.workerName === w.name && c.status === "in_progress").length;

    return (
      <Pressable onPress={() => setSelectedWorker(w)} style={styles.workerCard}>
        <View style={styles.rank}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{w.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</Text>
          </View>
          <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
        </View>
        <View style={styles.workerInfo}>
          <Text style={styles.workerName}>{w.name}</Text>
          <Text style={styles.workerWard}>{w.ward}</Text>
          {w.currentTask && (
            <View style={styles.taskRow}>
              <Ionicons name={TASK_ICONS[w.currentTask] || "construct-outline"} size={10} color={Colors.cyan} />
              <Text style={styles.taskText} numberOfLines={1}>{w.currentTask}</Text>
            </View>
          )}
          {assignedCount > 0 && (
            <View style={styles.assignedPill}>
              <Ionicons name="clipboard" size={9} color={Colors.blue} />
              <Text style={styles.assignedPillText}>{assignedCount} active</Text>
            </View>
          )}
        </View>
        <View style={styles.workerStats}>
          <Text style={[styles.bigScore, { color: scoreColor }]}>{w.score}</Text>
          <Text style={styles.scoreLabel}>score</Text>
        </View>
        <View style={styles.metaBlock}>
          <View style={styles.metaRow}>
            <Ionicons name="checkmark" size={10} color={Colors.green} />
            <Text style={styles.metaVal}>{w.resolvedToday}</Text>
            <Text style={styles.metaLbl}>today</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="archive" size={10} color={Colors.blue} />
            <Text style={styles.metaVal}>{w.totalResolved}</Text>
            <Text style={styles.metaLbl}>total</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={10} color={Colors.amber} />
            <Text style={styles.metaVal}>{w.avgRating.toFixed(1)}</Text>
            <Text style={styles.metaLbl}>rating</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
      </Pressable>
    );
  }, [complaints]);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Worker Dashboard</Text>
          <Text style={styles.headerSub}>{workers.length} field workers · Tap for details</Text>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Active", value: active, color: Colors.green },
          { label: "Idle", value: idle, color: Colors.amber },
          { label: "On Leave", value: onLeave, color: Colors.textMuted },
          { label: "Avg Score", value: avgScore, color: Colors.cyan },
        ].map(s => (
          <View key={s.label} style={styles.statCard2}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel2}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter + Sort */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {(["all", "active", "idle", "on_leave"] as WorkerStatus[]).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={[styles.filterChip, filter === f && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === "all" ? "All" : f === "on_leave" ? "On Leave" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
        <View style={styles.filterDivider} />
        <Text style={styles.sortLabel}>Sort:</Text>
        {([{ key: "score", label: "Score" }, { key: "resolved", label: "Resolved" }, { key: "rating", label: "Rating" }] as { key: "score" | "resolved" | "rating"; label: string }[]).map(s => (
          <Pressable key={s.key} onPress={() => setSortBy(s.key)} style={[styles.filterChip, sortBy === s.key && styles.sortChipActive]}>
            <Text style={[styles.filterText, sortBy === s.key && styles.sortTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderWorker}
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset + 40 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No workers found</Text>
          </View>
        }
      />

      <WorkerDetailModal
        worker={selectedWorker}
        complaints={complaints}
        onClose={() => setSelectedWorker(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.textPrimary, letterSpacing: -0.5 },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  statsRow: { flexDirection: "row", marginHorizontal: 16, backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  statCard2: { flex: 1, alignItems: "center", padding: 12, gap: 2 },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  statLabel2: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  filterRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 6, alignItems: "center" },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.greenBg, borderColor: Colors.green + "60" },
  sortChipActive: { backgroundColor: Colors.blueBg, borderColor: Colors.blue + "60" },
  filterText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  filterTextActive: { color: Colors.green, fontFamily: "Inter_600SemiBold" },
  sortTextActive: { color: Colors.blue, fontFamily: "Inter_600SemiBold" },
  filterDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 4 },
  sortLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.5 },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  workerCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 8, gap: 10 },
  rank: { width: 24 },
  rankText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.textMuted },
  avatarWrap: { position: "relative" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.blueBg, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.blue },
  statusIndicator: { position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.bgCard },
  workerInfo: { flex: 1 },
  workerName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textPrimary },
  workerWard: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  taskText: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.cyan, flex: 1 },
  assignedPill: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  assignedPillText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: Colors.blue },
  workerStats: { alignItems: "center" },
  bigScore: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  scoreLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.textMuted, textTransform: "uppercase" },
  metaBlock: { gap: 3, alignItems: "flex-end" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaVal: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textPrimary },
  metaLbl: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  detailCard: { backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: Colors.border, maxHeight: "92%" },
  detailHeader: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 14 },
  detailAvatar: { position: "relative" },
  detailAvatarText: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.blue },
  statusDot: { position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#111827" },
  detailName: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  detailWard: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, alignSelf: "flex-start", marginTop: 4 },
  statusChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.bg, borderRadius: 10, padding: 10, marginBottom: 14 },
  contactText: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.green, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  callBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  statCard: { flex: 1, minWidth: "40%", backgroundColor: Colors.bg, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  statBigVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },
  currentTaskBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.cyan + "11", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: Colors.cyan + "33", marginBottom: 14 },
  currentTaskLabel: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  currentTaskText: { color: "#fff", fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 1 },
  activePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.green + "22", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  assignSection: { marginBottom: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionTitle: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  assignRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  assignTicket: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  assignDesc: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  assignLoc: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" },
  priBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  priText: { fontSize: 9, fontFamily: "Inter_700Bold" },
});
