import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

interface DistrictStat {
  district: string;
  totalComplaints: number;
  resolved: number;
  pending: number;
  inProgress: number;
  resolutionRate: number;
  avgResolutionHours: number;
  healthScore: number;
  workers: number;
  activeWorkers: number;
  sosAlerts: number;
  topCategory: string;
  grade: "A" | "B" | "C" | "D" | "F";
}

const GRADE_COLORS = {
  A: { color: "#00A651", bg: "#00A65122", label: "Excellent" },
  B: { color: "#3B82F6", bg: "#3B82F622", label: "Good" },
  C: { color: "#F59E0B", bg: "#F59E0B22", label: "Average" },
  D: { color: "#F97316", bg: "#F9731622", label: "Poor" },
  F: { color: "#EF4444", bg: "#EF444422", label: "Critical" },
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  pothole: "alert-circle", garbage: "trash", streetlight: "bulb",
  water: "water", drain: "git-network", electricity: "flash",
  tree: "leaf", other: "ellipsis-horizontal",
};

function getGrade(resolutionRate: number): "A" | "B" | "C" | "D" | "F" {
  if (resolutionRate >= 85) return "A";
  if (resolutionRate >= 70) return "B";
  if (resolutionRate >= 55) return "C";
  if (resolutionRate >= 40) return "D";
  return "F";
}

function DistrictCard({ stat, onPress, rank }: { stat: DistrictStat; onPress: () => void; rank: number }) {
  const grade = GRADE_COLORS[stat.grade];
  const healthColor = stat.healthScore >= 80 ? Colors.green : stat.healthScore >= 60 ? Colors.amber : Colors.red;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cs.districtCard, pressed && { opacity: 0.85 }]}>
      <View style={cs.cardRankCol}>
        <Text style={cs.cardRank}>{rank}</Text>
        <View style={[cs.gradeBadge, { backgroundColor: grade.bg }]}>
          <Text style={[cs.gradeText, { color: grade.color }]}>{stat.grade}</Text>
        </View>
      </View>
      <View style={cs.cardMain}>
        <Text style={cs.districtName}>{stat.district}</Text>
        <View style={cs.cardStatsRow}>
          <View style={cs.cardStat}>
            <Ionicons name="document-text" size={10} color={Colors.textMuted} />
            <Text style={cs.cardStatText}>{stat.totalComplaints} total</Text>
          </View>
          <View style={cs.cardStat}>
            <Ionicons name="checkmark-circle" size={10} color={Colors.green} />
            <Text style={[cs.cardStatText, { color: Colors.green }]}>{stat.resolutionRate}% resolved</Text>
          </View>
          <View style={cs.cardStat}>
            <Ionicons name="time" size={10} color={Colors.amber} />
            <Text style={cs.cardStatText}>{stat.pending} pending</Text>
          </View>
        </View>
        <View style={cs.healthBar}>
          <View style={[cs.healthFill, { width: `${stat.healthScore}%`, backgroundColor: healthColor }]} />
        </View>
      </View>
      <View style={cs.cardRight}>
        <Text style={[cs.healthScore, { color: healthColor }]}>{stat.healthScore}</Text>
        <Text style={cs.healthLabel}>health</Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 4 }} />
      </View>
    </Pressable>
  );
}

export default function SuperAdminScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [stats, setStats] = useState<DistrictStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<"grade" | "complaints" | "resolution" | "health">("health");
  const [selected, setSelected] = useState<DistrictStat | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("token");
      const [wardsRes, workersRes, sosRes] = await Promise.all([
        fetch(`${getApiUrl()}api/wards?all=true`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`${getApiUrl()}api/workers`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`${getApiUrl()}api/sos`, { headers: { Authorization: `Bearer ${tok}` } }),
      ]);

      const wards = wardsRes.ok ? await wardsRes.json() : [];
      const workers: any[] = workersRes.ok ? await workersRes.json() : [];
      const sosAlerts: any[] = sosRes.ok ? await sosRes.json() : [];

      const districtMap: Record<string, DistrictStat> = {};

      wards.forEach((w: any) => {
        const d = w.district;
        if (!districtMap[d]) {
          districtMap[d] = {
            district: d, totalComplaints: 0, resolved: 0, pending: 0, inProgress: 0,
            resolutionRate: 0, avgResolutionHours: 0, healthScore: 0,
            workers: 0, activeWorkers: 0, sosAlerts: 0, topCategory: "pothole", grade: "C",
          };
        }
        const ds = districtMap[d];
        ds.totalComplaints += w.totalComplaints || 0;
        ds.resolved += w.resolvedComplaints || 0;
        ds.pending += w.pendingComplaints || 0;
        ds.inProgress += (w.totalComplaints || 0) - (w.resolvedComplaints || 0) - (w.pendingComplaints || 0);
        ds.avgResolutionHours = Math.max(ds.avgResolutionHours, w.avgResolutionHours || 24);
        ds.healthScore = Math.round((ds.healthScore + (w.healthScore || 50)) / 2);
      });

      workers.forEach((w: any) => {
        const d = w.district;
        if (districtMap[d]) {
          districtMap[d].workers += 1;
          if (w.status === "active") districtMap[d].activeWorkers += 1;
        }
      });

      sosAlerts.forEach((s: any) => {
        const d = s.district;
        if (districtMap[d]) districtMap[d].sosAlerts += 1;
      });

      Object.values(districtMap).forEach(ds => {
        if (ds.totalComplaints > 0) {
          ds.resolutionRate = Math.round((ds.resolved / ds.totalComplaints) * 100);
        }
        ds.grade = getGrade(ds.resolutionRate);
        if (!ds.healthScore) ds.healthScore = Math.round(40 + ds.resolutionRate * 0.5);
      });

      setStats(Object.values(districtMap));
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  if (user?.role !== "super_admin") {
    return (
      <View style={[cs.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <Ionicons name="lock-closed" size={48} color={Colors.red} />
        <Text style={{ color: Colors.textPrimary, fontSize: 16, marginTop: 12 }}>Super Admin Only</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: Colors.saffron }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const sorted = [...stats].sort((a, b) => {
    if (sortBy === "grade") return a.grade.localeCompare(b.grade);
    if (sortBy === "complaints") return b.totalComplaints - a.totalComplaints;
    if (sortBy === "resolution") return b.resolutionRate - a.resolutionRate;
    return b.healthScore - a.healthScore;
  });

  const totalComplaints = stats.reduce((s, d) => s + d.totalComplaints, 0);
  const totalResolved = stats.reduce((s, d) => s + d.resolved, 0);
  const totalPending = stats.reduce((s, d) => s + d.pending, 0);
  const avgHealth = stats.length ? Math.round(stats.reduce((s, d) => s + d.healthScore, 0) / stats.length) : 0;

  const gradeDist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  stats.forEach(d => { gradeDist[d.grade] += 1; });

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#0A0A1A", Colors.bg]} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <Pressable onPress={() => router.back()} style={cs.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={cs.headerTitle}>
          <Text style={cs.headerTitleText}>Super Admin View</Text>
          <Text style={cs.headerSub}>All 13 Districts · Uttarakhand</Text>
        </View>
        <View style={cs.superBadge}>
          <Ionicons name="star" size={18} color={Colors.saffron} />
        </View>
      </View>

      {/* State Overview */}
      <LinearGradient colors={[Colors.saffron + "22", Colors.saffron + "08"]} style={cs.overviewCard}>
        <Text style={cs.overviewTitle}>Uttarakhand State Overview</Text>
        <View style={cs.overviewGrid}>
          {[
            { label: "Total Reports", value: totalComplaints.toLocaleString("en-IN"), icon: "document-text" as const, color: Colors.blue },
            { label: "Resolved", value: totalResolved.toLocaleString("en-IN"), icon: "checkmark-circle" as const, color: Colors.green },
            { label: "Pending", value: totalPending.toLocaleString("en-IN"), icon: "time" as const, color: Colors.amber },
            { label: "Avg Health", value: `${avgHealth}%`, icon: "pulse" as const, color: Colors.saffron },
          ].map(s => (
            <View key={s.label} style={cs.overviewStat}>
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={[cs.overviewStatVal, { color: s.color }]}>{s.value}</Text>
              <Text style={cs.overviewStatLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <Text style={cs.gradeDistTitle}>District Grades</Text>
        <View style={cs.gradeDist}>
          {(["A", "B", "C", "D", "F"] as const).map(g => (
            <View key={g} style={cs.gradeDistItem}>
              <View style={[cs.gradeDistBadge, { backgroundColor: GRADE_COLORS[g].bg }]}>
                <Text style={[cs.gradeDistLetter, { color: GRADE_COLORS[g].color }]}>{g}</Text>
              </View>
              <Text style={cs.gradeDistCount}>{gradeDist[g]}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Sort Buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.sortScroll} contentContainerStyle={cs.sortRow}>
        {[
          { key: "health" as const, label: "Health Score", icon: "pulse" as const },
          { key: "grade" as const, label: "Grade", icon: "school" as const },
          { key: "resolution" as const, label: "Resolution %", icon: "checkmark-circle" as const },
          { key: "complaints" as const, label: "Volume", icon: "document-text" as const },
        ].map(s => (
          <Pressable key={s.key} onPress={() => setSortBy(s.key)} style={[cs.sortChip, sortBy === s.key && cs.sortChipActive]}>
            <Ionicons name={s.icon} size={12} color={sortBy === s.key ? Colors.saffron : Colors.textMuted} />
            <Text style={[cs.sortChipText, sortBy === s.key && { color: Colors.saffron }]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.saffron} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.saffron} />}
          showsVerticalScrollIndicator={false}
        >
          {sorted.map((stat, i) => (
            <DistrictCard key={stat.district} stat={stat} rank={i + 1} onPress={() => setSelected(stat)} />
          ))}
        </ScrollView>
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={cs.modalOverlay}>
          {selected && (() => {
            const grade = GRADE_COLORS[selected.grade];
            return (
              <View style={cs.detailModal}>
                <View style={cs.detailHeader}>
                  <View style={[cs.detailGradeBig, { backgroundColor: grade.bg }]}>
                    <Text style={[cs.detailGradeText, { color: grade.color }]}>{selected.grade}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.detailName}>{selected.district}</Text>
                    <Text style={[cs.detailGradeLabel, { color: grade.color }]}>{grade.label} Performance</Text>
                  </View>
                  <Pressable onPress={() => setSelected(null)}>
                    <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
                  </Pressable>
                </View>

                <View style={cs.detailGrid}>
                  {[
                    { label: "Total Reports", value: selected.totalComplaints, icon: "document-text" as const, color: Colors.blue },
                    { label: "Resolved", value: selected.resolved, icon: "checkmark-circle" as const, color: Colors.green },
                    { label: "Pending", value: selected.pending, icon: "time" as const, color: Colors.amber },
                    { label: "Resolution %", value: `${selected.resolutionRate}%`, icon: "pie-chart" as const, color: grade.color },
                    { label: "Health Score", value: selected.healthScore, icon: "pulse" as const, color: Colors.saffron },
                    { label: "Avg Fix Time", value: `${selected.avgResolutionHours}h`, icon: "hourglass" as const, color: Colors.textSecondary },
                    { label: "Workers", value: selected.workers, icon: "people" as const, color: Colors.peacock },
                    { label: "Active Now", value: selected.activeWorkers, icon: "radio-button-on" as const, color: Colors.green },
                    { label: "SOS Alerts", value: selected.sosAlerts, icon: "warning" as const, color: Colors.red },
                  ].map(s => (
                    <View key={s.label} style={cs.detailStatBox}>
                      <Ionicons name={s.icon} size={16} color={s.color} />
                      <Text style={[cs.detailStatVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={cs.detailStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}
        </View>
      </Modal>
    </View>
  );
}

const cs = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1 },
  headerTitleText: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  superBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.saffronBg, alignItems: "center", justifyContent: "center" },

  overviewCard: { marginHorizontal: 16, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.saffron + "33" },
  overviewTitle: { fontSize: 13, fontWeight: "700", color: Colors.saffron, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.8 },
  overviewGrid: { flexDirection: "row", gap: 4, marginBottom: 14 },
  overviewStat: { flex: 1, backgroundColor: Colors.bgWarm + "88", borderRadius: 10, padding: 10, alignItems: "center", gap: 4 },
  overviewStatVal: { fontSize: 16, fontWeight: "800" },
  overviewStatLabel: { fontSize: 9, color: Colors.textMuted, textAlign: "center" },

  gradeDistTitle: { fontSize: 11, color: Colors.textMuted, fontWeight: "600", marginBottom: 8 },
  gradeDist: { flexDirection: "row", gap: 8 },
  gradeDistItem: { flex: 1, alignItems: "center", gap: 4 },
  gradeDistBadge: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  gradeDistLetter: { fontSize: 14, fontWeight: "800" },
  gradeDistCount: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },

  sortScroll: { marginBottom: 8 },
  sortRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  sortChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  sortChipActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },
  sortChipText: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },

  scroll: { padding: 16, gap: 0 },

  districtCard: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border },
  cardRankCol: { alignItems: "center", width: 40, gap: 6 },
  cardRank: { fontSize: 11, fontWeight: "700", color: Colors.textMuted },
  gradeBadge: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  gradeText: { fontSize: 16, fontWeight: "900" },
  cardMain: { flex: 1, gap: 6 },
  districtName: { fontSize: 15, fontWeight: "700", color: Colors.textPrimary },
  cardStatsRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  cardStat: { flexDirection: "row", alignItems: "center", gap: 3 },
  cardStatText: { fontSize: 10, color: Colors.textMuted },
  healthBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  healthFill: { height: "100%", borderRadius: 2 },
  cardRight: { alignItems: "center" },
  healthScore: { fontSize: 22, fontWeight: "800" },
  healthLabel: { fontSize: 9, color: Colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  detailModal: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailGradeBig: { width: 56, height: 56, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailGradeText: { fontSize: 28, fontWeight: "900" },
  detailName: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary },
  detailGradeLabel: { fontSize: 13, fontWeight: "600", marginTop: 2 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailStatBox: { flex: 1, minWidth: "28%", backgroundColor: Colors.bgWarm, borderRadius: 10, padding: 10, alignItems: "center", gap: 4 },
  detailStatVal: { fontSize: 20, fontWeight: "800" },
  detailStatLabel: { fontSize: 9, color: Colors.textMuted, textAlign: "center" },
});
