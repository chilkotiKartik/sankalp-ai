import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, Modal, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

interface BudgetItem {
  id: string;
  department: string;
  category: string;
  district: string;
  year: number;
  allocated: number;
  spent: number;
  description: string;
}

const DEPT_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  "Public Works Department": "construct",
  "Uttarakhand Jal Sansthan": "water",
  "Urban Local Body": "trash",
  "ULB Electric Wing": "bulb",
  "Forest Department": "leaf",
  "Health Department": "medkit",
  "UPCL": "flash",
  "Disaster Management": "warning",
};

const DEPT_COLORS: Record<string, string> = {
  "Public Works Department": "#F59E0B",
  "Uttarakhand Jal Sansthan": "#3B82F6",
  "Urban Local Body": "#EF4444",
  "ULB Electric Wing": "#FBBF24",
  "Forest Department": "#00A651",
  "Health Department": "#EC4899",
  "UPCL": "#8B5CF6",
  "Disaster Management": "#F97316",
};

function getUtilPct(allocated: number, spent: number) {
  if (!allocated) return 0;
  return Math.min(100, Math.round((spent / allocated) * 100));
}

function getUtilColor(pct: number) {
  if (pct >= 90) return Colors.red;
  if (pct >= 75) return Colors.amber;
  return Colors.green;
}

function formatCr(val: number) {
  return `₹${val.toFixed(0)}Cr`;
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 800, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, { width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }), backgroundColor: color }]} />
    </View>
  );
}
const pb = StyleSheet.create({
  track: { height: 6, backgroundColor: Colors.border, borderRadius: 3, overflow: "hidden", flex: 1 },
  fill: { height: "100%", borderRadius: 3 },
});

function BudgetCard({ item, onPress }: { item: BudgetItem; onPress: () => void }) {
  const pct = getUtilPct(item.allocated, item.spent);
  const color = getUtilColor(pct);
  const icon = DEPT_ICONS[item.department] || "briefcase";
  const deptColor = DEPT_COLORS[item.department] || Colors.saffron;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cs.card, pressed && { opacity: 0.85 }]}>
      <View style={cs.cardHeader}>
        <View style={[cs.iconBox, { backgroundColor: deptColor + "22" }]}>
          <Ionicons name={icon} size={20} color={deptColor} />
        </View>
        <View style={cs.cardTitleBlock}>
          <Text style={cs.cardTitle} numberOfLines={1}>{item.department}</Text>
          <Text style={cs.cardSub} numberOfLines={1}>{item.category}</Text>
        </View>
        <View style={[cs.pctBadge, { backgroundColor: color + "22" }]}>
          <Text style={[cs.pctText, { color }]}>{pct}%</Text>
        </View>
      </View>
      <View style={cs.cardRow}>
        <View style={cs.cardStat}>
          <Text style={cs.statLabel}>Allocated</Text>
          <Text style={[cs.statValue, { color: Colors.textSecondary }]}>{formatCr(item.allocated)}</Text>
        </View>
        <View style={cs.cardStat}>
          <Text style={cs.statLabel}>Spent</Text>
          <Text style={[cs.statValue, { color }]}>{formatCr(item.spent)}</Text>
        </View>
        <View style={cs.cardStat}>
          <Text style={cs.statLabel}>Balance</Text>
          <Text style={[cs.statValue, { color: Colors.green }]}>{formatCr(item.allocated - item.spent)}</Text>
        </View>
      </View>
      <View style={cs.progressRow}>
        <ProgressBar pct={pct} color={color} />
        <Text style={[cs.progressLabel, { color }]}>{pct}% utilised</Text>
      </View>
    </Pressable>
  );
}

export default function BudgetScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDistrict, setSelectedDistrict] = useState("all");
  const [selectedItem, setSelectedItem] = useState<BudgetItem | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const districts = ["all", "Dehradun", "Haridwar", "Nainital"];

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("token");
      const res = await fetch(`${getApiUrl()}api/budget`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = selectedDistrict === "all" ? items : items.filter(i => i.district === selectedDistrict);

  const totalAllocated = filtered.reduce((s, i) => s + i.allocated, 0);
  const totalSpent = filtered.reduce((s, i) => s + i.spent, 0);
  const overallPct = getUtilPct(totalAllocated, totalSpent);

  // Group by department
  const byDept: Record<string, BudgetItem[]> = {};
  filtered.forEach(i => {
    if (!byDept[i.department]) byDept[i.department] = [];
    byDept[i.department].push(i);
  });

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#1A0E00", Colors.bg]} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <Pressable onPress={() => router.back()} style={cs.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={cs.headerTitle}>
          <Text style={cs.headerTitleText}>Budget Tracker</Text>
          <Text style={cs.headerSub}>Fiscal Year 2025–26</Text>
        </View>
        <View style={cs.headerRight}>
          <Ionicons name="bar-chart" size={22} color={Colors.saffron} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.saffron} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Card */}
        <LinearGradient colors={[Colors.saffron + "33", Colors.saffron + "11"]} style={cs.summaryCard}>
          <View style={cs.summaryRow}>
            <View style={cs.summaryItem}>
              <Ionicons name="wallet" size={18} color={Colors.saffron} />
              <Text style={cs.summaryLabel}>Total Budget</Text>
              <Text style={cs.summaryValue}>{formatCr(totalAllocated)}</Text>
            </View>
            <View style={cs.summaryDivider} />
            <View style={cs.summaryItem}>
              <Ionicons name="arrow-up-circle" size={18} color={Colors.red} />
              <Text style={cs.summaryLabel}>Spent</Text>
              <Text style={[cs.summaryValue, { color: Colors.red }]}>{formatCr(totalSpent)}</Text>
            </View>
            <View style={cs.summaryDivider} />
            <View style={cs.summaryItem}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.green} />
              <Text style={cs.summaryLabel}>Balance</Text>
              <Text style={[cs.summaryValue, { color: Colors.green }]}>{formatCr(totalAllocated - totalSpent)}</Text>
            </View>
          </View>
          <View style={cs.overallProgress}>
            <Text style={cs.overallLabel}>Overall Utilisation: {overallPct}%</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ProgressBar pct={overallPct} color={getUtilColor(overallPct)} />
            </View>
          </View>
        </LinearGradient>

        {/* District Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
          {districts.map(d => (
            <Pressable key={d} onPress={() => setSelectedDistrict(d)} style={[cs.filterChip, selectedDistrict === d && cs.filterChipActive]}>
              <Text style={[cs.filterChipText, selectedDistrict === d && cs.filterChipTextActive]}>
                {d === "all" ? "All Districts" : d}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator color={Colors.saffron} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Department breakdown */}
            {Object.entries(byDept).map(([dept, deptItems]) => {
              const dAllo = deptItems.reduce((s, i) => s + i.allocated, 0);
              const dSpent = deptItems.reduce((s, i) => s + i.spent, 0);
              const dPct = getUtilPct(dAllo, dSpent);
              const dColor = DEPT_COLORS[dept] || Colors.saffron;
              const dIcon = DEPT_ICONS[dept] || "briefcase";
              return (
                <View key={dept} style={cs.deptSection}>
                  <View style={cs.deptHeader}>
                    <View style={[cs.deptIconBox, { backgroundColor: dColor + "22" }]}>
                      <Ionicons name={dIcon} size={16} color={dColor} />
                    </View>
                    <Text style={cs.deptName} numberOfLines={1}>{dept}</Text>
                    <View style={[cs.deptPct, { backgroundColor: getUtilColor(dPct) + "22" }]}>
                      <Text style={[cs.deptPctText, { color: getUtilColor(dPct) }]}>{dPct}%</Text>
                    </View>
                  </View>
                  <View style={cs.deptStats}>
                    <Text style={cs.deptStat}><Text style={{ color: Colors.textSecondary }}>Allocated: </Text>{formatCr(dAllo)}</Text>
                    <Text style={cs.deptStat}><Text style={{ color: getUtilColor(dPct) }}>Spent: </Text>{formatCr(dSpent)}</Text>
                    <Text style={cs.deptStat}><Text style={{ color: Colors.green }}>Balance: </Text>{formatCr(dAllo - dSpent)}</Text>
                  </View>
                  <View style={cs.deptProgressRow}>
                    <ProgressBar pct={dPct} color={getUtilColor(dPct)} />
                  </View>
                  {deptItems.map(item => (
                    <BudgetCard key={item.id} item={item} onPress={() => { setSelectedItem(item); setShowDetail(true); }} />
                  ))}
                </View>
              );
            })}

            {filtered.length === 0 && (
              <View style={cs.empty}>
                <Ionicons name="bar-chart-outline" size={48} color={Colors.textMuted} />
                <Text style={cs.emptyText}>No budget data available</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Detail Modal */}
      <Modal visible={showDetail} transparent animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={cs.modalOverlay}>
          <View style={cs.detailModal}>
            {selectedItem && (() => {
              const pct = getUtilPct(selectedItem.allocated, selectedItem.spent);
              const color = getUtilColor(pct);
              const deptColor = DEPT_COLORS[selectedItem.department] || Colors.saffron;
              const deptIcon = DEPT_ICONS[selectedItem.department] || "briefcase";
              return (
                <>
                  <View style={cs.detailHeader}>
                    <View style={[cs.detailIconBox, { backgroundColor: deptColor + "22" }]}>
                      <Ionicons name={deptIcon} size={28} color={deptColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cs.detailDept}>{selectedItem.department}</Text>
                      <Text style={cs.detailCat}>{selectedItem.category} · {selectedItem.district}</Text>
                    </View>
                    <Pressable onPress={() => setShowDetail(false)}>
                      <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
                    </Pressable>
                  </View>

                  <Text style={cs.detailDesc}>{selectedItem.description}</Text>

                  <View style={cs.detailStatsGrid}>
                    {[
                      { label: "Allocated", value: formatCr(selectedItem.allocated), color: Colors.textSecondary, icon: "wallet-outline" as const },
                      { label: "Spent", value: formatCr(selectedItem.spent), color, icon: "arrow-up-circle-outline" as const },
                      { label: "Balance", value: formatCr(selectedItem.allocated - selectedItem.spent), color: Colors.green, icon: "checkmark-circle-outline" as const },
                      { label: "Utilised", value: `${pct}%`, color, icon: "pie-chart-outline" as const },
                    ].map(s => (
                      <View key={s.label} style={cs.detailStatBox}>
                        <Ionicons name={s.icon} size={18} color={s.color} />
                        <Text style={[cs.detailStatValue, { color: s.color }]}>{s.value}</Text>
                        <Text style={cs.detailStatLabel}>{s.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={{ marginTop: 12 }}>
                    <Text style={cs.detailProgLabel}>Budget Utilisation</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
                      <ProgressBar pct={pct} color={color} />
                      <Text style={[cs.detailProgPct, { color }]}>{pct}%</Text>
                    </View>
                  </View>

                  <View style={[cs.statusBadge, { backgroundColor: color + "22", marginTop: 16 }]}>
                    <Ionicons name={pct >= 90 ? "warning" : pct >= 75 ? "time" : "checkmark-circle"} size={14} color={color} />
                    <Text style={[cs.statusText, { color }]}>
                      {pct >= 90 ? "Budget nearly exhausted" : pct >= 75 ? "On track" : "Under budget"}
                    </Text>
                  </View>
                </>
              );
            })()}
          </View>
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
  headerRight: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.saffronBg, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, gap: 0 },

  summaryCard: { borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.saffron + "33" },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 0, marginBottom: 14 },
  summaryItem: { flex: 1, alignItems: "center", gap: 4 },
  summaryDivider: { width: 1, height: 48, backgroundColor: Colors.border },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  summaryValue: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  overallProgress: { gap: 6 },
  overallLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },

  filterScroll: { marginBottom: 16 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 0 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },
  filterChipText: { fontSize: 13, color: Colors.textMuted, fontWeight: "500" },
  filterChipTextActive: { color: Colors.saffron, fontWeight: "700" },

  deptSection: { marginBottom: 20 },
  deptHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  deptIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  deptName: { flex: 1, fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  deptPct: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  deptPctText: { fontSize: 12, fontWeight: "700" },
  deptStats: { flexDirection: "row", gap: 16, marginBottom: 8 },
  deptStat: { fontSize: 12, color: Colors.textMuted },
  deptProgressRow: { marginBottom: 8 },

  card: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 13, fontWeight: "600", color: Colors.textPrimary },
  cardSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pctBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pctText: { fontSize: 12, fontWeight: "700" },
  cardRow: { flexDirection: "row", marginBottom: 10 },
  cardStat: { flex: 1, alignItems: "center" },
  statLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  statValue: { fontSize: 13, fontWeight: "700", color: Colors.textPrimary },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressLabel: { fontSize: 11, fontWeight: "600", width: 50, textAlign: "right" },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  detailModal: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  detailDept: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  detailCat: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  detailDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },
  detailStatsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  detailStatBox: { flex: 1, minWidth: "40%", backgroundColor: Colors.bgWarm, borderRadius: 12, padding: 12, alignItems: "center", gap: 4 },
  detailStatValue: { fontSize: 18, fontWeight: "800" },
  detailStatLabel: { fontSize: 11, color: Colors.textMuted },
  detailProgLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: "600" },
  detailProgPct: { fontSize: 13, fontWeight: "700", width: 40, textAlign: "right" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10 },
  statusText: { fontSize: 13, fontWeight: "600" },
});
