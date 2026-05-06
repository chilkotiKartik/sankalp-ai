import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Animated, Platform, Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const CAT_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  pothole:     { label: "Pothole",     icon: "alert-circle",        color: "#F59E0B" },
  garbage:     { label: "Garbage",     icon: "trash",               color: "#EF4444" },
  streetlight: { label: "Streetlight", icon: "bulb",                color: "#FCD34D" },
  water:       { label: "Water",       icon: "water",               color: "#3B82F6" },
  drain:       { label: "Drain",       icon: "git-network",         color: "#06B6D4" },
  electricity: { label: "Electricity", icon: "flash",               color: "#8B5CF6" },
  tree:        { label: "Tree",        icon: "leaf",                color: "#22C55E" },
  other:       { label: "Other",       icon: "ellipsis-horizontal", color: "#6B7280" },
};

const BADGE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  new_citizen:    { icon: "leaf",             color: "#22C55E" },
  active_citizen: { icon: "star",             color: "#F59E0B" },
  civic_hero:     { icon: "shield-checkmark", color: "#8B5CF6" },
  city_champion:  { icon: "trophy",           color: "#EF4444" },
  first_report:   { icon: "document-text",    color: "#3B82F6" },
  system_admin:   { icon: "settings",         color: "#06B6D4" },
  district_admin: { icon: "business",         color: "#FF9933" },
};

function getWardGrade(healthScore: number): { grade: "A" | "B" | "C" | "D" | "F"; color: string } {
  if (healthScore >= 85) return { grade: "A", color: "#00A651" };
  if (healthScore >= 70) return { grade: "B", color: "#3B82F6" };
  if (healthScore >= 55) return { grade: "C", color: "#F59E0B" };
  if (healthScore >= 40) return { grade: "D", color: "#F97316" };
  return { grade: "F", color: "#EF4444" };
}

const PREDICT_CATEGORY_COLORS: Record<string, string> = {
  pothole: "#F59E0B", garbage: "#EF4444", water: "#3B82F6",
  streetlight: "#FCD34D", drain: "#06B6D4", electricity: "#8B5CF6",
};

function AnimatedBar({ pct, color, delay = 0 }: { pct: number; color: string; delay?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 900, delay, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={{ flex: 1, height: 8, backgroundColor: Colors.bg, borderRadius: 4, overflow: "hidden" }}>
      <Animated.View style={{ height: 8, backgroundColor: color, borderRadius: 4, width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) as any }} />
    </View>
  );
}

function SectionCard({ children, icon, iconColor, title }: { children: React.ReactNode; icon: keyof typeof Ionicons.glyphMap; iconColor: string; title: string }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

interface PredictiveAlert {
  category: string;
  district: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  prediction: string;
  confidence: number;
  recommendedAction: string;
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { complaints, wards, workers, leaderboard, refresh } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [predictions, setPredictions] = useState<PredictiveAlert[]>([]);

  const total = complaints.length || 1;
  const resolved = complaints.filter(c => c.status === "resolved" || c.status === "closed").length;
  const pending = complaints.filter(c => c.status === "pending").length;
  const inProgress = complaints.filter(c => c.status === "in_progress").length;
  const resolutionRate = Math.round((resolved / total) * 100);

  const catData = Object.entries(CAT_META).map(([key, meta]) => {
    const count = complaints.filter(c => c.category === key).length;
    return { key, ...meta, count, pct: Math.round((count / total) * 100) };
  }).sort((a, b) => b.count - a.count);

  const priorities = [
    { key: "P1", label: "Critical", color: "#EF4444" },
    { key: "P2", label: "High",     color: "#F59E0B" },
    { key: "P3", label: "Medium",   color: "#3B82F6" },
    { key: "P4", label: "Low",      color: "#6B7280" },
  ].map(p => ({ ...p, count: complaints.filter(c => c.priority === p.key).length, pct: Math.round((complaints.filter(c => c.priority === p.key).length / total) * 100) }));

  const avgAiScore = Math.round(complaints.reduce((s, c) => s + c.aiScore, 0) / total);
  const clusters = complaints.filter(c => c.isCluster).length;
  const rated = complaints.filter(c => c.rating);
  const avgRating = rated.length ? (rated.reduce((s, c) => s + (c.rating || 0), 0) / rated.length).toFixed(1) : "N/A";

  const headerAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    loadPredictions();
  }, []);

  const loadPredictions = useCallback(async () => {
    try {
      const tok = await AsyncStorage.getItem("token");
      const res = await fetch(`${getApiUrl()}api/predictive`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPredictions(data);
      }
    } catch {}
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadPredictions()]);
    setRefreshing(false);
  }, [refresh, loadPredictions]);

  const RISK_COLORS = { low: Colors.green, medium: Colors.amber, high: Colors.marigold, critical: Colors.red };
  const RISK_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
    low: "checkmark-circle", medium: "time", high: "warning", critical: "alert-circle",
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <Animated.View style={{ opacity: headerAnim, paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={styles.headerTitle}>Analytics</Text>
          <Text style={styles.headerSub}>{complaints.length} complaints analyzed</Text>
        </View>
        <Pressable onPress={() => router.push("/admin/audit" as any)} style={styles.auditBtn}>
          <Ionicons name="git-network" size={15} color={Colors.cyan} />
          <Text style={styles.auditBtnText}>Audit</Text>
        </Pressable>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.saffron} />}
      >
        {/* Key metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <LinearGradient colors={["#064E3B", "#047857"]} style={styles.metricGrad}>
              <Ionicons name="checkmark-circle" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.metricValue}>{resolutionRate}%</Text>
              <Text style={styles.metricLabel}>Resolution Rate</Text>
            </LinearGradient>
          </View>
          <View style={styles.metricCard}>
            <LinearGradient colors={["#1E1B4B", "#4338CA"]} style={styles.metricGrad}>
              <Ionicons name="hardware-chip" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.metricValue}>{avgAiScore}%</Text>
              <Text style={styles.metricLabel}>Avg AI Score</Text>
            </LinearGradient>
          </View>
          <View style={styles.metricCard}>
            <LinearGradient colors={["#7C2D12", "#C2410C"]} style={styles.metricGrad}>
              <Ionicons name="star" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.metricValue}>{avgRating}</Text>
              <Text style={styles.metricLabel}>Avg Rating</Text>
            </LinearGradient>
          </View>
          <View style={styles.metricCard}>
            <LinearGradient colors={["#1E3A5F", "#1D4ED8"]} style={styles.metricGrad}>
              <Ionicons name="git-network" size={18} color="rgba(255,255,255,0.6)" />
              <Text style={styles.metricValue}>{clusters}</Text>
              <Text style={styles.metricLabel}>Clusters</Text>
            </LinearGradient>
          </View>
        </View>

        {/* Status breakdown */}
        <SectionCard icon="pie-chart" iconColor={Colors.green} title="Status Breakdown">
          {[
            { label: "Resolved",    count: resolved,    color: "#22C55E", pct: Math.round(resolved / total * 100),    icon: "checkmark-circle" as const },
            { label: "In Progress", count: inProgress,  color: "#3B82F6", pct: Math.round(inProgress / total * 100),  icon: "time" as const },
            { label: "Pending",     count: pending,     color: "#F59E0B", pct: Math.round(pending / total * 100),     icon: "hourglass" as const },
          ].map((s, i) => (
            <View key={s.label} style={styles.barRow}>
              <Ionicons name={s.icon} size={13} color={s.color} />
              <Text style={styles.barLabel}>{s.label}</Text>
              <AnimatedBar pct={s.pct} color={s.color} delay={i * 100} />
              <Text style={[styles.barPct, { color: s.color }]}>{s.pct}%</Text>
              <Text style={styles.barCount}>{s.count}</Text>
            </View>
          ))}
        </SectionCard>

        {/* Category breakdown */}
        <SectionCard icon="bar-chart" iconColor="#3B82F6" title="Category Distribution">
          {catData.map((cat, i) => (
            <View key={cat.key} style={styles.barRow}>
              <Ionicons name={cat.icon} size={14} color={cat.color} />
              <Text style={styles.barLabel}>{cat.label}</Text>
              <AnimatedBar pct={cat.pct} color={cat.color} delay={i * 80} />
              <Text style={[styles.barPct, { color: cat.color }]}>{cat.pct}%</Text>
              <Text style={styles.barCount}>{cat.count}</Text>
            </View>
          ))}
        </SectionCard>

        {/* Priority breakdown */}
        <SectionCard icon="alert-circle" iconColor="#F59E0B" title="Priority Distribution">
          {priorities.map((p, i) => (
            <View key={p.key} style={styles.barRow}>
              <View style={[styles.priorityBadge, { backgroundColor: p.color + "22" }]}>
                <Text style={[styles.priorityText, { color: p.color }]}>{p.key}</Text>
              </View>
              <Text style={styles.barLabel}>{p.label}</Text>
              <AnimatedBar pct={p.pct} color={p.color} delay={i * 100} />
              <Text style={[styles.barPct, { color: p.color }]}>{p.pct}%</Text>
              <Text style={styles.barCount}>{p.count}</Text>
            </View>
          ))}
        </SectionCard>

        {/* Predictive Maintenance AI */}
        <SectionCard icon="analytics" iconColor={Colors.saffron} title="Predictive Maintenance AI">
          {predictions.length === 0 ? (
            <View style={styles.predictEmpty}>
              <Ionicons name="analytics-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyText}>Analyzing complaint patterns...</Text>
            </View>
          ) : (
            predictions.map((p, i) => {
              const riskColor = RISK_COLORS[p.riskLevel] || Colors.amber;
              const riskIcon = RISK_ICONS[p.riskLevel] || "warning";
              return (
                <View key={i} style={[styles.predictCard, { borderLeftColor: riskColor }]}>
                  <View style={styles.predictHeader}>
                    <Ionicons name={CAT_META[p.category]?.icon || "alert-circle"} size={14} color={PREDICT_CATEGORY_COLORS[p.category] || Colors.saffron} />
                    <Text style={styles.predictCategory}>{CAT_META[p.category]?.label || p.category}</Text>
                    <View style={[styles.riskBadge, { backgroundColor: riskColor + "22" }]}>
                      <Ionicons name={riskIcon} size={10} color={riskColor} />
                      <Text style={[styles.riskText, { color: riskColor }]}>{p.riskLevel.toUpperCase()}</Text>
                    </View>
                    <Text style={styles.predictDistrict}>{p.district}</Text>
                  </View>
                  <Text style={styles.predictText}>{p.prediction}</Text>
                  <View style={styles.predictAction}>
                    <Ionicons name="bulb" size={11} color={Colors.saffron} />
                    <Text style={styles.predictActionText}>{p.recommendedAction}</Text>
                  </View>
                  <View style={styles.confidenceRow}>
                    <Text style={styles.confidenceLabel}>Confidence: </Text>
                    <View style={styles.confidenceBar}>
                      <View style={[styles.confidenceFill, { width: `${p.confidence}%`, backgroundColor: riskColor }]} />
                    </View>
                    <Text style={[styles.confidencePct, { color: riskColor }]}>{p.confidence}%</Text>
                  </View>
                </View>
              );
            })
          )}
        </SectionCard>

        {/* Citizen Leaderboard */}
        <SectionCard icon="trophy" iconColor="#F59E0B" title="Citizen Leaderboard">
          {leaderboard.slice(0, 10).map((entry, idx) => {
            const isTop3 = entry.rank <= 3;
            const topColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
            const rankColor = isTop3 ? topColors[entry.rank - 1] : Colors.textMuted;
            return (
              <View key={entry.rank} style={styles.leaderRow}>
                <View style={[styles.rankBadge, isTop3 && { backgroundColor: rankColor + "22", borderColor: rankColor + "44" }]}>
                  {isTop3
                    ? <Ionicons name={["trophy", "ribbon", "medal"][entry.rank - 1] as keyof typeof Ionicons.glyphMap} size={16} color={rankColor} />
                    : <Text style={[styles.rankNum, { color: Colors.textMuted }]}>#{entry.rank}</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.leaderName}>{entry.name}</Text>
                  <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
                    {entry.badges.slice(0, 3).map(b => {
                      const bMeta = BADGE_META[b];
                      if (!bMeta) return null;
                      return (
                        <View key={b} style={[styles.badgeChip, { backgroundColor: bMeta.color + "22" }]}>
                          <Ionicons name={bMeta.icon} size={9} color={bMeta.color} />
                        </View>
                      );
                    })}
                    <Text style={styles.leaderLevel}>Lvl {entry.level}</Text>
                  </View>
                </View>
                <View style={styles.pointsBadge}>
                  <Ionicons name="star" size={10} color={Colors.turmeric} />
                  <Text style={styles.pointsText}>{entry.points.toLocaleString("en-IN")} pts</Text>
                </View>
              </View>
            );
          })}
          {leaderboard.length === 0 && <Text style={styles.emptyText}>Leaderboard loading...</Text>}
          <Pressable onPress={() => router.push("/leaderboard" as any)} style={styles.viewAllBtn}>
            <Text style={styles.viewAllText}>View Full Leaderboard</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.saffron} />
          </Pressable>
        </SectionCard>

        {/* Ward Health Report Card */}
        <SectionCard icon="map" iconColor="#06B6D4" title="Ward Report Cards">
          {[...wards].sort((a, b) => b.healthScore - a.healthScore).map((ward, i) => {
            const { grade, color } = getWardGrade(ward.healthScore);
            return (
              <View key={ward.id} style={styles.wardRow}>
                <Text style={[styles.wardRank, { color: i < 3 ? "#F59E0B" : Colors.textMuted }]}>#{i + 1}</Text>
                <View style={[styles.gradeBox, { backgroundColor: color + "22" }]}>
                  <Text style={[styles.gradeText, { color }]}>{grade}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.wardName}>{ward.name}</Text>
                  <Text style={styles.wardArea}>{ward.area} · {ward.totalComplaints} complaints</Text>
                </View>
                <View style={styles.wardBar}>
                  <View style={[styles.wardBarFill, { width: `${ward.healthScore}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={[styles.wardScore, { color }]}>{ward.healthScore}</Text>
              </View>
            );
          })}
        </SectionCard>

        {/* Top Workers */}
        <SectionCard icon="people" iconColor="#8B5CF6" title="Top Workers">
          {[...workers].sort((a, b) => b.score - a.score).slice(0, 8).map((w, i) => (
            <View key={w.id} style={styles.workerRow}>
              <Text style={[styles.workerRank, { color: i < 3 ? "#F59E0B" : Colors.textMuted }]}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.workerName}>{w.name}</Text>
                <Text style={styles.workerWard}>{w.ward} · {w.resolvedToday} today</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.workerScore}>{w.score}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Ionicons name="star" size={10} color={Colors.turmeric} />
                  <Text style={styles.workerRating}>{w.avgRating}</Text>
                </View>
              </View>
            </View>
          ))}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  headerTitle: { color: "#fff", fontSize: 22, fontWeight: "700" },
  headerSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  auditBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.cyan + "22", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: Colors.cyan + "44" },
  auditBtnText: { fontSize: 12, color: Colors.cyan, fontWeight: "600" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10, marginBottom: 16 },
  metricCard: { width: "47%", borderRadius: 14, overflow: "hidden" },
  metricGrad: { padding: 16, gap: 4 },
  metricValue: { color: "#fff", fontSize: 28, fontWeight: "700" },
  metricLabel: { color: "rgba(255,255,255,0.6)", fontSize: 11, marginTop: 2 },
  sectionCard: { marginHorizontal: 16, backgroundColor: Colors.bgCard, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  barLabel: { color: "#D1D5DB", fontSize: 11, width: 70 },
  barPct: { fontSize: 11, fontWeight: "700", width: 34, textAlign: "right" },
  barCount: { color: Colors.textMuted, fontSize: 11, width: 30, textAlign: "right" },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  priorityText: { fontSize: 10, fontWeight: "700" },

  predictEmpty: { alignItems: "center", paddingVertical: 20, gap: 8 },
  predictCard: { backgroundColor: Colors.bgWarm, borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, gap: 6 },
  predictHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  predictCategory: { fontSize: 12, fontWeight: "700", color: Colors.textPrimary, flex: 1 },
  predictDistrict: { fontSize: 10, color: Colors.textMuted },
  riskBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  riskText: { fontSize: 9, fontWeight: "700" },
  predictText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  predictAction: { flexDirection: "row", alignItems: "flex-start", gap: 5, backgroundColor: Colors.saffronBg, borderRadius: 7, padding: 8 },
  predictActionText: { fontSize: 11, color: Colors.saffronLight, flex: 1 },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  confidenceLabel: { fontSize: 10, color: Colors.textMuted },
  confidenceBar: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  confidenceFill: { height: "100%", borderRadius: 2 },
  confidencePct: { fontSize: 10, fontWeight: "700", width: 30, textAlign: "right" },

  leaderRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  rankBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  rankNum: { color: Colors.textMuted, fontSize: 12, fontWeight: "700" },
  leaderName: { color: "#fff", fontSize: 13, fontWeight: "600" },
  leaderLevel: { color: Colors.textMuted, fontSize: 9 },
  badgeChip: { width: 18, height: 18, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  pointsBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22C55E22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  pointsText: { color: Colors.green, fontSize: 11, fontWeight: "700" },
  viewAllBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  viewAllText: { fontSize: 13, color: Colors.saffron, fontWeight: "600" },

  emptyText: { color: Colors.textMuted, textAlign: "center", fontSize: 13, padding: 16 },

  wardRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  wardRank: { fontSize: 11, fontWeight: "700", width: 24 },
  gradeBox: { width: 26, height: 26, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  gradeText: { fontSize: 12, fontWeight: "800" },
  wardName: { color: "#fff", fontSize: 12, fontWeight: "600" },
  wardArea: { color: Colors.textMuted, fontSize: 10 },
  wardBar: { width: 60, height: 6, backgroundColor: Colors.bg, borderRadius: 3, overflow: "hidden" },
  wardBarFill: { height: 6, borderRadius: 3 },
  wardScore: { fontSize: 13, fontWeight: "700", width: 28, textAlign: "right" },

  workerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.border },
  workerRank: { fontSize: 11, fontWeight: "700", width: 24 },
  workerName: { color: "#fff", fontSize: 12, fontWeight: "600" },
  workerWard: { color: Colors.textMuted, fontSize: 10 },
  workerScore: { color: Colors.green, fontSize: 14, fontWeight: "700" },
  workerRating: { color: Colors.textMuted, fontSize: 10 },
});
