import React, { useRef, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Platform,
  TextInput,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import Colors from "@/constants/colors";

function HealthBar({ score }: { score: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: score / 100,
      tension: 70,
      friction: 8,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const color =
    score >= 70 ? Colors.green : score >= 45 ? Colors.amber : Colors.red;

  return (
    <View style={hb.track}>
      <Animated.View
        style={[
          hb.fill,
          {
            flex: anim,
            backgroundColor: color,
          },
        ]}
      />
      <Animated.View
        style={[
          hb.remaining,
          {
            flex: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
            }),
          },
        ]}
      />
    </View>
  );
}

function WardCard({ ward, rank }: { ward: any; rank: number }) {
  const entryAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(entryAnim, {
      toValue: 1,
      tension: 70,
      friction: 8,
      delay: rank * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const color =
    ward.healthScore >= 70
      ? Colors.green
      : ward.healthScore >= 45
      ? Colors.amber
      : Colors.red;

  const rankColors: Record<number, string> = {
    1: "#FFD700",
    2: "#C0C0C0",
    3: "#CD7F32",
  };
  const rankColor = rankColors[rank] || Colors.textMuted;

  return (
    <Animated.View
      style={[
        styles.wardCard,
        {
          opacity: entryAnim,
          transform: [
            {
              translateY: entryAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.wardTop}>
        <View style={[styles.rankBadge, { borderColor: rankColor + "60" }]}>
          <Text style={[styles.rankText, { color: rankColor }]}>#{rank}</Text>
        </View>
        <View style={styles.wardInfo}>
          <Text style={styles.wardName}>{ward.name}</Text>
          <Text style={styles.wardArea}>{ward.area}</Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={[styles.healthScore, { color }]}>{ward.healthScore}</Text>
          <Text style={styles.scoreLabel}>/ 100</Text>
        </View>
      </View>

      <HealthBar score={ward.healthScore} />

      <View style={styles.wardStats}>
        <View style={styles.wardStat}>
          <Feather name="inbox" size={12} color={Colors.blue} />
          <Text style={styles.wardStatValue}>{ward.totalComplaints}</Text>
          <Text style={styles.wardStatLabel}>Total</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.wardStat}>
          <Feather name="check-circle" size={12} color={Colors.green} />
          <Text style={styles.wardStatValue}>{ward.resolvedComplaints}</Text>
          <Text style={styles.wardStatLabel}>Resolved</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.wardStat}>
          <Feather name="clock" size={12} color={Colors.amber} />
          <Text style={styles.wardStatValue}>{ward.pendingComplaints}</Text>
          <Text style={styles.wardStatLabel}>Pending</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.wardStat}>
          <Feather name="zap" size={12} color={Colors.cyan} />
          <Text style={styles.wardStatValue}>{ward.avgResolutionHours}h</Text>
          <Text style={styles.wardStatLabel}>Avg Fix</Text>
        </View>
      </View>
    </Animated.View>
  );
}

function CivicMap({ wards }: { wards: any[] }) {
  const positions: { x: string; y: string }[] = [
    { x: "45%", y: "20%" },
    { x: "25%", y: "30%" },
    { x: "55%", y: "35%" },
    { x: "40%", y: "55%" },
    { x: "20%", y: "50%" },
    { x: "30%", y: "65%" },
    { x: "65%", y: "45%" },
    { x: "20%", y: "70%" },
    { x: "70%", y: "30%" },
    { x: "50%", y: "70%" },
  ];

  return (
    <View style={map.container}>
      <Text style={map.title}>Uttarakhand Block Map</Text>
      <View style={map.mapArea}>
        <View style={map.mapBg}>
          {wards.map((ward, i) => {
            const pos = positions[i % positions.length];
            const color =
              ward.healthScore >= 70
                ? Colors.green
                : ward.healthScore >= 45
                ? Colors.amber
                : Colors.red;
            return (
              <View
                key={ward.id}
                style={[map.wardDot, { left: pos.x as any, top: pos.y as any, backgroundColor: color + "40", borderColor: color }]}
              >
                <View style={[map.dotCenter, { backgroundColor: color }]} />
                <Text style={[map.dotLabel, { color }]} numberOfLines={1}>
                  W{ward.number}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={map.legend}>
        {[
          { label: "Healthy (70+)", color: Colors.green },
          { label: "Moderate (45-69)", color: Colors.amber },
          { label: "Critical (<45)", color: Colors.red },
        ].map((l) => (
          <View key={l.label} style={map.legendItem}>
            <View style={[map.legendDot, { backgroundColor: l.color }]} />
            <Text style={map.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type HealthFilter = "all" | "healthy" | "moderate" | "critical";
type SortKey = "score" | "total" | "pending" | "resolution";

export default function WardsScreen() {
  const insets = useSafeAreaInsets();
  const { wards } = useApp();
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("score");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const healthy = wards.filter((w) => w.healthScore >= 70).length;
  const moderate = wards.filter((w) => w.healthScore >= 45 && w.healthScore < 70).length;
  const critical = wards.filter((w) => w.healthScore < 45).length;
  const avgScore =
    wards.length > 0
      ? Math.round(wards.reduce((s, w) => s + w.healthScore, 0) / wards.length)
      : 0;

  const filteredWards = useMemo(() => {
    let list = [...wards];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(w => w.name.toLowerCase().includes(q) || (w.area || "").toLowerCase().includes(q));
    }
    if (healthFilter === "healthy") list = list.filter(w => w.healthScore >= 70);
    else if (healthFilter === "moderate") list = list.filter(w => w.healthScore >= 45 && w.healthScore < 70);
    else if (healthFilter === "critical") list = list.filter(w => w.healthScore < 45);

    if (sortKey === "score") list.sort((a, b) => b.healthScore - a.healthScore);
    else if (sortKey === "total") list.sort((a, b) => b.totalComplaints - a.totalComplaints);
    else if (sortKey === "pending") list.sort((a, b) => b.pendingComplaints - a.pendingComplaints);
    else if (sortKey === "resolution") list.sort((a, b) => b.resolvedComplaints - a.resolvedComplaints);
    return list;
  }, [wards, search, healthFilter, sortKey]);

  const HEALTH_FILTERS: { key: HealthFilter; label: string; color: string; count: number }[] = [
    { key: "all", label: "All Wards", color: Colors.textMuted, count: wards.length },
    { key: "healthy", label: "Healthy 70+", color: Colors.green, count: healthy },
    { key: "moderate", label: "Moderate", color: Colors.amber, count: moderate },
    { key: "critical", label: "Critical", color: Colors.red, count: critical },
  ];

  const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
    { key: "score", label: "Health Score", icon: "activity" },
    { key: "pending", label: "Most Pending", icon: "clock" },
    { key: "total", label: "Total Issues", icon: "inbox" },
    { key: "resolution", label: "Most Resolved", icon: "check-circle" },
  ];

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Ward Health</Text>
          <Text style={styles.headerSub}>Uttarakhand Block Performance Board</Text>
        </View>
        <View style={styles.avgBadge}>
          <Text style={styles.avgLabel}>Avg</Text>
          <Text style={[styles.avgScore, { color: avgScore >= 70 ? Colors.green : avgScore >= 45 ? Colors.amber : Colors.red }]}>{avgScore}</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search wards, areas…"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Health Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {HEALTH_FILTERS.map(f => {
          const active = healthFilter === f.key;
          return (
            <Pressable key={f.key} onPress={() => setHealthFilter(f.key)}
              style={[styles.filterChip, active && { backgroundColor: f.color + "20", borderColor: f.color }]}>
              {f.key !== "all" && <View style={[styles.filterDot, { backgroundColor: active ? f.color : Colors.textMuted }]} />}
              <Text style={[styles.filterChipText, active && { color: f.color, fontFamily: "Inter_700Bold" }]}>{f.label}</Text>
              <View style={[styles.filterCount, active && { backgroundColor: f.color + "30" }]}>
                <Text style={[styles.filterCountText, active && { color: f.color }]}>{f.count}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Sort Options */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={styles.sortContent}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {SORT_OPTIONS.map(s => {
          const active = sortKey === s.key;
          return (
            <Pressable key={s.key} onPress={() => setSortKey(s.key)}
              style={[styles.sortChip, active && { backgroundColor: Colors.saffron + "18", borderColor: Colors.saffron }]}>
              <Feather name={s.icon as any} size={10} color={active ? Colors.saffron : Colors.textMuted} />
              <Text style={[styles.sortChipText, active && { color: Colors.saffron }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Stats */}
        <View style={styles.summaryRow}>
          {[
            { label: "Avg Score", value: avgScore, icon: "activity", color: Colors.cyan },
            { label: "Healthy", value: healthy, icon: "check-circle", color: Colors.green },
            { label: "Moderate", value: moderate, icon: "alert-circle", color: Colors.amber },
            { label: "Critical", value: critical, icon: "alert-octagon", color: Colors.red },
          ].map((s) => (
            <View key={s.label} style={styles.summaryCard}>
              <Feather name={s.icon as any} size={14} color={s.color} />
              <Text style={[styles.summaryValue, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <CivicMap wards={filteredWards.slice(0, 10)} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rankings</Text>
          <Text style={styles.sectionSub}>{filteredWards.length} wards</Text>
        </View>

        {filteredWards.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={40} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No wards found</Text>
            <Text style={styles.emptySubText}>Try adjusting your search or filter</Text>
          </View>
        ) : (
          filteredWards.map((ward, i) => (
            <WardCard key={ward.id} ward={ward} rank={i + 1} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 8,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  avgBadge: {
    alignItems: "center",
    backgroundColor: Colors.bgCard,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avgLabel: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  avgScore: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textPrimary,
  },
  filterScroll: { flexShrink: 0, maxHeight: 44 },
  filterContent: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  filterDot: { width: 7, height: 7, borderRadius: 3.5 },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  filterCount: {
    backgroundColor: Colors.bgCardAlt,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  filterCountText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: Colors.textMuted,
  },
  sortScroll: { flexShrink: 0, maxHeight: 36 },
  sortContent: {
    paddingHorizontal: 14,
    paddingBottom: 6,
    gap: 6,
    flexDirection: "row",
    alignItems: "center",
  },
  sortLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    flexShrink: 0,
  },
  sortChipText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
  },
  emptySubText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryValue: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  summaryLabel: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textPrimary,
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  wardCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
    gap: 12,
  },
  wardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.bgCardAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  rankText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  wardInfo: {
    flex: 1,
  },
  wardName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textPrimary,
  },
  wardArea: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 2,
  },
  scoreBlock: {
    alignItems: "flex-end",
  },
  healthScore: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  scoreLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: -4,
  },
  wardStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wardStat: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  wardStatValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.textPrimary,
  },
  wardStatLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.border,
  },
});

const hb = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: Colors.bgCardAlt,
    borderRadius: 3,
    flexDirection: "row",
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  remaining: {
    height: 6,
  },
});

const map = StyleSheet.create({
  container: {
    backgroundColor: Colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 16,
    gap: 12,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textPrimary,
  },
  mapArea: {
    height: 200,
    backgroundColor: Colors.bgCardAlt,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  mapBg: {
    flex: 1,
    position: "relative",
  },
  wardDot: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateX: -18 }, { translateY: -18 }],
  },
  dotCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 2,
  },
  dotLabel: {
    fontSize: 7,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
});
