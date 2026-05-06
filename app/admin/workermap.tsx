import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, Modal, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface Worker {
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
  geo: { lat: number; lng: number };
}

const STATUS_META = {
  active:   { color: "#00A651", bg: "#00A65122", label: "Active",    icon: "radio-button-on" as const },
  idle:     { color: "#F59E0B", bg: "#F59E0B22", label: "Idle",      icon: "pause-circle" as const },
  on_leave: { color: "#6B7280", bg: "#6B728022", label: "On Leave",  icon: "moon" as const },
};

const DISTRICT_COORDS: Record<string, { lat: number; lng: number; label: string }> = {
  "Dehradun":          { lat: 30.3165, lng: 78.0322, label: "DUN" },
  "Haridwar":          { lat: 29.9457, lng: 78.1642, label: "HRW" },
  "Nainital":          { lat: 29.3919, lng: 79.4542, label: "NTL" },
  "Almora":            { lat: 29.5971, lng: 79.6596, label: "ALM" },
  "Champawat":         { lat: 29.3377, lng: 80.0914, label: "CPW" },
  "Pithoragarh":       { lat: 29.5829, lng: 80.2178, label: "PTH" },
  "Udham Singh Nagar": { lat: 28.9982, lng: 79.5050, label: "USN" },
  "Tehri Garhwal":     { lat: 30.3822, lng: 78.4800, label: "TGR" },
  "Pauri Garhwal":     { lat: 29.6864, lng: 78.9764, label: "PGR" },
  "Chamoli":           { lat: 30.4090, lng: 79.3206, label: "CML" },
  "Rudraprayag":       { lat: 30.2846, lng: 78.9806, label: "RDP" },
  "Uttarkashi":        { lat: 30.7268, lng: 78.4354, label: "UTK" },
  "Bageshwar":         { lat: 29.8371, lng: 79.7715, label: "BGS" },
};

const W = Dimensions.get("window").width - 32;
const MAP_H = 280;
const MAP_LAT_MIN = 28.8, MAP_LAT_MAX = 31.0;
const MAP_LNG_MIN = 77.8, MAP_LNG_MAX = 81.0;

function geoToXY(lat: number, lng: number) {
  const x = ((lng - MAP_LNG_MIN) / (MAP_LNG_MAX - MAP_LNG_MIN)) * W;
  const y = ((MAP_LAT_MAX - lat) / (MAP_LAT_MAX - MAP_LAT_MIN)) * MAP_H;
  return { x, y };
}

function WorkerDot({ worker, onPress }: { worker: Worker; onPress: () => void }) {
  const { x, y } = geoToXY(worker.geo.lat, worker.geo.lng);
  const meta = STATUS_META[worker.status];
  return (
    <Pressable
      onPress={onPress}
      style={[wd.dot, { left: x - 8, top: y - 8, backgroundColor: meta.color }]}
    >
      <Ionicons name="person" size={8} color="#FFF" />
    </Pressable>
  );
}
const wd = StyleSheet.create({
  dot: { position: "absolute", width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#FFF" },
});

export default function WorkerMapScreen() {
  const insets = useSafeAreaInsets();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "idle" | "on_leave">("all");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("token");
      if (!tok) { setLoading(false); setRefreshing(false); return; }
      const base = getApiUrl();
      // Try admin endpoint first, fall back to citizen endpoint
      let res = await fetch(`${base}api/admin/workers`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (!res.ok) {
        res = await fetch(`${base}api/workers`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
      }
      if (res.ok) {
        const data = await res.json();
        setWorkers(Array.isArray(data) ? data : []);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => { load(); }, []);

  const filteredWorkers = workers.filter(w => {
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterDistrict !== "all" && w.district !== filterDistrict) return false;
    return true;
  });

  const districts = ["all", ...Array.from(new Set(workers.map(w => w.district))).sort()];

  const activeCount = workers.filter(w => w.status === "active").length;
  const idleCount = workers.filter(w => w.status === "idle").length;
  const leaveCount = workers.filter(w => w.status === "on_leave").length;

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#001A08", Colors.bg]} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <Pressable onPress={() => router.back()} style={cs.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={cs.headerTitle}>
          <Text style={cs.headerTitleText}>Worker GPS Map</Text>
          <Text style={cs.headerSub}>Live field worker locations</Text>
        </View>
        <View style={cs.viewToggle}>
          <Pressable onPress={() => setViewMode("map")} style={[cs.toggleBtn, viewMode === "map" && cs.toggleBtnActive]}>
            <Ionicons name="map" size={15} color={viewMode === "map" ? Colors.saffron : Colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setViewMode("list")} style={[cs.toggleBtn, viewMode === "list" && cs.toggleBtnActive]}>
            <Ionicons name="list" size={15} color={viewMode === "list" ? Colors.saffron : Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Stats Row */}
      <View style={cs.statsRow}>
        {[
          { label: "Active", count: activeCount, color: Colors.green, icon: "radio-button-on" as const },
          { label: "Idle", count: idleCount, color: Colors.amber, icon: "pause-circle" as const },
          { label: "Leave", count: leaveCount, color: Colors.textMuted, icon: "moon" as const },
          { label: "Total", count: workers.length, color: Colors.saffron, icon: "people" as const },
        ].map(s => (
          <View key={s.label} style={[cs.statBox, { borderColor: s.color + "33" }]}>
            <Ionicons name={s.icon} size={14} color={s.color} />
            <Text style={[cs.statCount, { color: s.color }]}>{s.count}</Text>
            <Text style={cs.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
        {(["all", "active", "idle", "on_leave"] as const).map(s => (
          <Pressable key={s} onPress={() => setFilterStatus(s)} style={[cs.filterChip, filterStatus === s && cs.filterChipActive]}>
            <Ionicons name={s === "all" ? "people" : STATUS_META[s].icon} size={11} color={filterStatus === s ? Colors.saffron : Colors.textMuted} />
            <Text style={[cs.filterChipText, filterStatus === s && { color: Colors.saffron }]}>
              {s === "all" ? "All" : STATUS_META[s].label}
            </Text>
          </Pressable>
        ))}
        <View style={{ width: 1, backgroundColor: Colors.border, marginHorizontal: 4 }} />
        {districts.slice(0, 6).map(d => (
          <Pressable key={d} onPress={() => setFilterDistrict(d)} style={[cs.filterChip, filterDistrict === d && { backgroundColor: Colors.peacock + "22", borderColor: Colors.peacock }]}>
            <Text style={[cs.filterChipText, filterDistrict === d && { color: Colors.peacock }]}>
              {d === "all" ? "All Districts" : d.split(" ")[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.green} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.green} />}
          showsVerticalScrollIndicator={false}
        >
          {viewMode === "map" ? (
            <>
              {/* Interactive Map */}
              <View style={cs.mapContainer}>
                <LinearGradient colors={["#001A08", "#002D10"]} style={cs.mapBg}>
                  {/* District Labels */}
                  {Object.entries(DISTRICT_COORDS).map(([district, coords]) => {
                    const { x, y } = geoToXY(coords.lat, coords.lng);
                    return (
                      <View key={district} style={[cs.districtLabel, { left: x - 16, top: y - 8 }]}>
                        <Text style={cs.districtLabelText}>{coords.label}</Text>
                      </View>
                    );
                  })}
                  {/* Worker Dots */}
                  {filteredWorkers.map(w => (
                    <WorkerDot key={w.id} worker={w} onPress={() => setSelectedWorker(w)} />
                  ))}
                </LinearGradient>
                <View style={cs.mapLegend}>
                  {Object.entries(STATUS_META).map(([status, meta]) => (
                    <View key={status} style={cs.legendItem}>
                      <View style={[cs.legendDot, { backgroundColor: meta.color }]} />
                      <Text style={cs.legendText}>{meta.label}</Text>
                    </View>
                  ))}
                </View>
                <Text style={cs.mapCaption}>Uttarakhand · {filteredWorkers.length} workers shown · Tap dot for details</Text>
              </View>

              {/* District breakdown grid */}
              <Text style={cs.sectionTitle}>District Summary</Text>
              <View style={cs.districtGrid}>
                {Object.entries(DISTRICT_COORDS).map(([district, coords]) => {
                  const dWorkers = filteredWorkers.filter(w => w.district === district);
                  if (!dWorkers.length) return null;
                  const active = dWorkers.filter(w => w.status === "active").length;
                  return (
                    <Pressable key={district} onPress={() => setFilterDistrict(district)} style={cs.districtCard}>
                      <Text style={cs.districtCardName} numberOfLines={1}>{district}</Text>
                      <Text style={cs.districtCardCount}>{dWorkers.length}</Text>
                      <View style={cs.districtCardBar}>
                        <View style={[cs.districtCardFill, { width: `${(active / dWorkers.length) * 100}%` }]} />
                      </View>
                      <Text style={cs.districtCardActive}>{active} active</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <Text style={cs.sectionTitle}>{filteredWorkers.length} Workers</Text>
              {filteredWorkers.map(w => {
                const meta = STATUS_META[w.status];
                return (
                  <Pressable key={w.id} onPress={() => setSelectedWorker(w)} style={cs.workerCard}>
                    <View style={[cs.workerAvatar, { borderColor: meta.color }]}>
                      <Text style={cs.workerAvatarText}>{w.name.charAt(0)}</Text>
                    </View>
                    <View style={cs.workerInfo}>
                      <View style={cs.workerNameRow}>
                        <Text style={cs.workerName}>{w.name}</Text>
                        <View style={[cs.statusBadge, { backgroundColor: meta.bg }]}>
                          <Ionicons name={meta.icon} size={9} color={meta.color} />
                          <Text style={[cs.statusText, { color: meta.color }]}>{meta.label}</Text>
                        </View>
                      </View>
                      <Text style={cs.workerWard}>{w.ward} · {w.district}</Text>
                      {w.currentTask && <Text style={cs.workerTask} numberOfLines={1}>{w.currentTask}</Text>}
                    </View>
                    <View style={cs.workerScore}>
                      <Text style={cs.scoreVal}>{w.score}</Text>
                      <Text style={cs.scoreLabel}>score</Text>
                    </View>
                  </Pressable>
                );
              })}
            </>
          )}
        </ScrollView>
      )}

      {/* Worker Detail Modal */}
      <Modal visible={!!selectedWorker} transparent animationType="slide" onRequestClose={() => setSelectedWorker(null)}>
        <View style={cs.modalOverlay}>
          {selectedWorker && (() => {
            const meta = STATUS_META[selectedWorker.status];
            return (
              <View style={cs.detailModal}>
                <View style={cs.detailHeader}>
                  <View style={[cs.detailAvatar, { borderColor: meta.color }]}>
                    <Text style={cs.detailAvatarText}>{selectedWorker.name.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.detailName}>{selectedWorker.name}</Text>
                    <Text style={cs.detailDistrict}>{selectedWorker.ward} · {selectedWorker.district}</Text>
                    <View style={[cs.statusBadge, { backgroundColor: meta.bg, alignSelf: "flex-start" }]}>
                      <Ionicons name={meta.icon} size={10} color={meta.color} />
                      <Text style={[cs.statusText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setSelectedWorker(null)}>
                    <Ionicons name="close-circle" size={28} color={Colors.textMuted} />
                  </Pressable>
                </View>

                {selectedWorker.currentTask && (
                  <View style={cs.taskBox}>
                    <Ionicons name="construct" size={14} color={Colors.saffron} />
                    <Text style={cs.taskText}>{selectedWorker.currentTask}</Text>
                  </View>
                )}

                <View style={cs.detailStatsRow}>
                  {[
                    { label: "Today", value: selectedWorker.resolvedToday, icon: "today" as const, color: Colors.green },
                    { label: "Total", value: selectedWorker.totalResolved, icon: "checkmark-done" as const, color: Colors.blue },
                    { label: "Rating", value: selectedWorker.avgRating.toFixed(1), icon: "star" as const, color: Colors.turmeric },
                    { label: "Score", value: selectedWorker.score, icon: "trophy" as const, color: Colors.saffron },
                  ].map(s => (
                    <View key={s.label} style={cs.detailStat}>
                      <Ionicons name={s.icon} size={16} color={s.color} />
                      <Text style={[cs.detailStatVal, { color: s.color }]}>{s.value}</Text>
                      <Text style={cs.detailStatLabel}>{s.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={cs.geoBox}>
                  <Ionicons name="location" size={13} color={Colors.textMuted} />
                  <Text style={cs.geoText}>
                    {selectedWorker.geo.lat.toFixed(4)}°N, {selectedWorker.geo.lng.toFixed(4)}°E
                  </Text>
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
  viewToggle: { flexDirection: "row", gap: 4 },
  toggleBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  toggleBtnActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },

  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  statBox: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 10, padding: 10, alignItems: "center", gap: 3, borderWidth: 1 },
  statCount: { fontSize: 18, fontWeight: "800" },
  statLabel: { fontSize: 10, color: Colors.textMuted },

  filterScroll: { marginBottom: 8 },
  filterRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },
  filterChipText: { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },

  scroll: { padding: 16, gap: 0 },

  mapContainer: { borderRadius: 16, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  mapBg: { width: W, height: MAP_H, position: "relative" },
  districtLabel: { position: "absolute", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1 },
  districtLabelText: { fontSize: 7, color: "rgba(255,255,255,0.5)", fontWeight: "700" },
  mapLegend: { flexDirection: "row", gap: 12, padding: 10, backgroundColor: Colors.bgCard },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: Colors.textSecondary },
  mapCaption: { fontSize: 10, color: Colors.textMuted, textAlign: "center", paddingBottom: 6, backgroundColor: Colors.bgCard },

  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary, marginBottom: 10 },

  districtGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  districtCard: { backgroundColor: Colors.bgCard, borderRadius: 10, padding: 10, width: "47%", borderWidth: 1, borderColor: Colors.border, gap: 4 },
  districtCardName: { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  districtCardCount: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary },
  districtCardBar: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  districtCardFill: { height: "100%", backgroundColor: Colors.green, borderRadius: 2 },
  districtCardActive: { fontSize: 10, color: Colors.green },

  workerCard: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border },
  workerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bgWarm, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  workerAvatarText: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  workerInfo: { flex: 1, gap: 3 },
  workerNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  workerName: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary, flex: 1 },
  workerWard: { fontSize: 11, color: Colors.textMuted },
  workerTask: { fontSize: 11, color: Colors.saffron, fontStyle: "italic" },
  workerScore: { alignItems: "center" },
  scoreVal: { fontSize: 20, fontWeight: "800", color: Colors.saffron },
  scoreLabel: { fontSize: 10, color: Colors.textMuted },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  detailModal: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bgWarm, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  detailAvatarText: { fontSize: 22, fontWeight: "800", color: Colors.textPrimary },
  detailName: { fontSize: 17, fontWeight: "700", color: Colors.textPrimary },
  detailDistrict: { fontSize: 12, color: Colors.textMuted, marginVertical: 2 },
  taskBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.saffronBg, borderRadius: 10, padding: 10 },
  taskText: { fontSize: 13, color: Colors.saffronLight, flex: 1 },
  detailStatsRow: { flexDirection: "row", gap: 8 },
  detailStat: { flex: 1, backgroundColor: Colors.bgWarm, borderRadius: 10, padding: 10, alignItems: "center", gap: 4 },
  detailStatVal: { fontSize: 20, fontWeight: "800" },
  detailStatLabel: { fontSize: 10, color: Colors.textMuted },
  geoBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.bgWarm, borderRadius: 8, padding: 10 },
  geoText: { fontSize: 11, color: Colors.textMuted, fontFamily: "monospace" },
});
