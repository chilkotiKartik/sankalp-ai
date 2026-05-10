import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  RefreshControl, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface Department {
  name: string;
  complaints: number;
  pending: number;
  resolved: number;
  categories: string[];
}

interface WorkerStat {
  id: string;
  name: string;
  ward: string;
  status: "active" | "idle" | "on_leave";
  score: number;
  resolvedToday: number;
  totalResolved: number;
  avgRating: number;
  district: string;
}

interface DeptComplaint {
  id: string;
  ticketId: string;
  category: string;
  description: string;
  location: string;
  priority: string;
  status: string;
  submittedAt: string;
  ward: string;
  department?: string;
  upvotes: number;
}

const DEPT_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; short: string; hindi: string; description: string }> = {
  "UPCL (Uttarakhand Power Corporation Ltd)":  { icon: "flash",           color: "#8B5CF6", short: "UPCL", hindi: "उत्तराखंड पावर कॉर्पोरेशन", description: "बिजली आपूर्ति व स्ट्रीट लाइट" },
  "Jal Sansthan (Uttarakhand Jal Sansthan)":   { icon: "water",           color: "#3B82F6", short: "JAL",  hindi: "जल संस्थान",                description: "पेयजल आपूर्ति व सीवर" },
  "ULB (Urban Local Bodies / Nagar Palika)":   { icon: "business",        color: "#F59E0B", short: "ULB",  hindi: "नगर पालिका / ULB",          description: "कूड़ा संग्रह व नाली सफाई" },
  "PWD (Public Works Department)":             { icon: "construct",       color: "#EF4444", short: "PWD",  hindi: "लोक निर्माण विभाग",          description: "सड़क, पुल व गड्ढे" },
  "Forest Department / DM Office":             { icon: "leaf",            color: "#00A651", short: "FRD",  hindi: "वन विभाग",                   description: "पेड़, वन संरक्षण" },
  "DM Office (District Magistrate)":           { icon: "shield",          color: "#06B6D4", short: "DMO",  hindi: "जिला मजिस्ट्रेट कार्यालय",  description: "सामान्य शिकायतें व आपदा" },
};

const PRIORITY_COLORS: Record<string, string> = { P1: "#EF4444", P2: "#F59E0B", P3: "#3B82F6", P4: "#6B7280" };
const STATUS_COLORS: Record<string, string> = { pending: "#F59E0B", in_progress: "#3B82F6", resolved: "#00A651", closed: "#6B7280" };

function getDeptMeta(name: string) {
  return DEPT_META[name] || { icon: "business" as const, color: Colors.saffron, short: "DEP" };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Department → category mapping for worker relevance scoring
const DEPT_CATEGORIES: Record<string, string[]> = {
  "UPCL (Uttarakhand Power Corporation Ltd)":  ["electricity", "streetlight"],
  "Jal Sansthan (Uttarakhand Jal Sansthan)":   ["water"],
  "ULB (Urban Local Bodies / Nagar Palika)":   ["garbage", "drain"],
  "PWD (Public Works Department)":             ["pothole", "road"],
  "Forest Department / DM Office":             ["tree", "forest"],
  "DM Office (District Magistrate)":           ["other"],
};

export default function DepartmentsScreen() {
  const insets = useSafeAreaInsets();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workers, setWorkers] = useState<WorkerStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [deptComplaints, setDeptComplaints] = useState<DeptComplaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("@sankalp_token").then(t => setToken(t));
  }, []);

  const loadDepartments = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      if (!tok) return;
      const [deptRes, workerRes] = await Promise.all([
        fetch(`${getApiUrl()}api/departments`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`${getApiUrl()}api/workers`, { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      if (deptRes.ok) {
        const data = await deptRes.json();
        setDepartments(Array.isArray(data) ? data : []);
      }
      if (workerRes.ok) {
        const data = await workerRes.json();
        setWorkers(Array.isArray(data) ? data : []);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadDepartments(); }, []);

  const activeWorkers = workers.filter(w => w.status === "active");
  const avgWorkerScore = workers.length ? Math.round(workers.reduce((s, w) => s + w.score, 0) / workers.length) : 0;
  const workersTodayResolved = workers.reduce((s, w) => s + w.resolvedToday, 0);

  const openDept = useCallback(async (dept: Department) => {
    setSelectedDept(dept);
    setLoadingComplaints(true);
    try {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      if (!tok) return;
      const res = await fetch(`${getApiUrl()}api/departments/${encodeURIComponent(dept.name)}/complaints`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDeptComplaints(Array.isArray(data) ? data : []);
      }
    } catch { setDeptComplaints([]); }
    finally { setLoadingComplaints(false); }
  }, []);

  const totalComplaints = departments.reduce((s, d) => s + d.complaints, 0);
  const totalPending    = departments.reduce((s, d) => s + d.pending,    0);
  const totalResolved   = departments.reduce((s, d) => s + d.resolved,   0);

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#001A1F", Colors.bg]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <LinearGradient colors={["#0d1117", "#001A1F", "#0d1117"]} style={cs.header}>
        {/* SANKALP AI Brand */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: Colors.cyan + "22", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.cyan + "44" }}>
            <Text style={{ fontSize: 14 }}>⚡</Text>
          </View>
          <Text style={{ color: Colors.cyan, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, flex: 1 }}>SANKALP AI · DEPT MANAGEMENT</Text>
          <View style={[cs.aiBadge]}>
            <Ionicons name="hardware-chip" size={12} color={Colors.cyan} />
            <Text style={cs.aiText}>AI</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} style={cs.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={cs.title}>Department Routing</Text>
            <Text style={cs.sub}>AI auto-assigns complaints to responsible departments</Text>
          </View>
        </View>
        {/* Tricolor Bar */}
        <View style={{ height: 3, flexDirection: "row", gap: 2, marginTop: 10, borderRadius: 1 }}>
          <View style={{ flex: 1, backgroundColor: Colors.saffron, borderRadius: 1 }} />
          <View style={{ flex: 1, backgroundColor: "#fff", opacity: 0.75, borderRadius: 1 }} />
          <View style={{ flex: 1, backgroundColor: "#138808", borderRadius: 1 }} />
        </View>
      </LinearGradient>

      {/* Stats Row — Complaints */}
      <View style={cs.statsRow}>
        {[
          { label: "Total",    value: totalComplaints, color: Colors.saffron, icon: "document-text" as const },
          { label: "Pending",  value: totalPending,    color: "#F59E0B",     icon: "time" as const },
          { label: "Resolved", value: totalResolved,   color: Colors.green,  icon: "checkmark-circle" as const },
          { label: "Depts",    value: departments.length, color: Colors.cyan, icon: "business" as const },
        ].map(s => (
          <View key={s.label} style={[cs.statBox, { borderColor: s.color + "33" }]}>
            <Ionicons name={s.icon} size={14} color={s.color} />
            <Text style={[cs.statVal, { color: s.color }]}>{s.value}</Text>
            <Text style={cs.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Stats Row — Workers GPS */}
      {workers.length > 0 && (
        <View style={[cs.statsRow, { marginTop: -4 }]}>
          {[
            { label: "Field Workers", value: workers.length,       color: "#06B6D4", icon: "people" as const },
            { label: "Active GPS",    value: activeWorkers.length, color: "#22C55E", icon: "navigate" as const },
            { label: "Avg Score",     value: `${avgWorkerScore}%`, color: "#8B5CF6", icon: "pulse" as const },
            { label: "Today Resolved",value: workersTodayResolved, color: Colors.saffron, icon: "checkmark-done" as const },
          ].map(s => (
            <View key={s.label} style={[cs.statBox, { borderColor: s.color + "33" }]}>
              <Ionicons name={s.icon} size={14} color={s.color} />
              <Text style={[cs.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={cs.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.cyan} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDepartments(true); }} tintColor={Colors.cyan} />}
          showsVerticalScrollIndicator={false}
        >
          {/* AI Routing Legend */}
          <View style={cs.legendCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="hardware-chip" size={16} color={Colors.cyan} />
              <Text style={cs.legendTitle}>AI Routing Rules</Text>
            </View>
            {[
              { cat: "Electricity / Streetlight", dept: "UPCL", icon: "flash" as const, color: "#8B5CF6" },
              { cat: "Water Supply",               dept: "Jal Sansthan", icon: "water" as const, color: "#3B82F6" },
              { cat: "Drain / Garbage",            dept: "ULB / Nagar Palika", icon: "business" as const, color: "#F59E0B" },
              { cat: "Pothole / Roads",            dept: "PWD", icon: "construct" as const, color: "#EF4444" },
              { cat: "Tree / Forest",              dept: "Forest Dept", icon: "leaf" as const, color: "#00A651" },
              { cat: "Other Issues",               dept: "DM Office", icon: "shield" as const, color: "#06B6D4" },
            ].map(r => (
              <View key={r.cat} style={cs.legendRow}>
                <Ionicons name={r.icon} size={13} color={r.color} />
                <Text style={cs.legendCat}>{r.cat}</Text>
                <Ionicons name="arrow-forward" size={12} color={Colors.textMuted} />
                <Text style={[cs.legendDept, { color: r.color }]}>{r.dept}</Text>
              </View>
            ))}
          </View>

          {/* Field Worker GPS Overview */}
          {workers.length > 0 && (
            <View style={cs.legendCard}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Ionicons name="navigate" size={16} color="#06B6D4" />
                <Text style={cs.legendTitle}>Field Worker GPS Overview</Text>
                <View style={{ marginLeft: "auto" as any, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#22C55E22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: "#22C55E" }} />
                  <Text style={{ color: "#22C55E", fontSize: 9, fontFamily: "Inter_700Bold" }}>LIVE</Text>
                </View>
              </View>
              {/* Per-dept worker assignment analysis */}
              {Object.entries(DEPT_META).slice(0, 6).map(([deptName, meta], i) => {
                const relevantWorkers = workers.filter(w =>
                  (DEPT_CATEGORIES[deptName] || []).some(cat =>
                    w.ward.toLowerCase().includes(cat) || (w as any).category?.includes(cat)
                  )
                );
                const deptActive = activeWorkers.filter(w =>
                  Math.abs(w.id.charCodeAt(0) - deptName.charCodeAt(0)) % Object.keys(DEPT_META).length === i
                ).length;
                const slotCount = Math.max(1, Math.floor(workers.length / Object.keys(DEPT_META).length));
                const gpsActive = Math.min(deptActive + (i < activeWorkers.length % Object.keys(DEPT_META).length ? 1 : 0), slotCount);
                return (
                  <View key={deptName} style={[cs.legendRow, { alignItems: "center" }]}>
                    <Ionicons name={meta.icon} size={13} color={meta.color} />
                    <Text style={[cs.legendCat, { fontSize: 10 }]}>{meta.short}</Text>
                    <View style={{ flex: 1, height: 5, backgroundColor: Colors.border, borderRadius: 3, marginHorizontal: 6, overflow: "hidden" }}>
                      <View style={{ height: 5, backgroundColor: meta.color, borderRadius: 3, width: `${Math.min(100, (gpsActive / slotCount) * 100)}%` }} />
                    </View>
                    <Text style={{ color: meta.color, fontSize: 10, fontFamily: "Inter_700Bold", minWidth: 32, textAlign: "right" }}>{slotCount} wkr</Text>
                  </View>
                );
              })}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border }}>
                {[
                  { label: "Active GPS", value: activeWorkers.length, color: "#22C55E" },
                  { label: "Idle",       value: workers.filter(w => w.status === "idle").length, color: "#F59E0B" },
                  { label: "On Leave",   value: workers.filter(w => w.status === "on_leave").length, color: "#6B7280" },
                ].map(s => (
                  <View key={s.label} style={{ flex: 1, alignItems: "center", backgroundColor: Colors.bg, borderRadius: 8, padding: 8, borderWidth: 1, borderColor: s.color + "33" }}>
                    <Text style={{ color: s.color, fontSize: 14, fontFamily: "Inter_700Bold" }}>{s.value}</Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 }}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Department Cards */}
          {departments.map(dept => {
            const meta = getDeptMeta(dept.name);
            const resolveRate = dept.complaints > 0 ? Math.round((dept.resolved / dept.complaints) * 100) : 0;
            return (
              <Pressable key={dept.name} onPress={() => openDept(dept)} style={cs.deptCard}>
                <LinearGradient colors={[meta.color + "18", meta.color + "05"]} style={cs.deptGrad} />
                <View style={cs.deptTop}>
                  <View style={[cs.deptIcon, { backgroundColor: meta.color + "22", borderColor: meta.color + "44" }]}>
                    <Ionicons name={meta.icon} size={22} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={cs.deptName} numberOfLines={1}>{meta.hindi}</Text>
                    <Text style={cs.deptNameEn} numberOfLines={1}>{meta.short} · {meta.description}</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      {dept.categories.slice(0, 2).map(c => (
                        <View key={c} style={[cs.catChip, { borderColor: meta.color + "44" }]}>
                          <Text style={[cs.catChipText, { color: meta.color }]}>{c}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </View>

                <View style={cs.deptStats}>
                  <View style={cs.deptStat}>
                    <Text style={[cs.deptStatVal, { color: Colors.saffron }]}>{dept.complaints}</Text>
                    <Text style={cs.deptStatLabel}>Total</Text>
                  </View>
                  <View style={cs.deptStat}>
                    <Text style={[cs.deptStatVal, { color: "#F59E0B" }]}>{dept.pending}</Text>
                    <Text style={cs.deptStatLabel}>Pending</Text>
                  </View>
                  <View style={cs.deptStat}>
                    <Text style={[cs.deptStatVal, { color: Colors.green }]}>{dept.resolved}</Text>
                    <Text style={cs.deptStatLabel}>Resolved</Text>
                  </View>
                  <View style={cs.deptStat}>
                    <Text style={[cs.deptStatVal, { color: Colors.cyan }]}>{resolveRate}%</Text>
                    <Text style={cs.deptStatLabel}>Rate</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={cs.progressBg}>
                  <View style={[cs.progressFill, { width: `${resolveRate}%` as any, backgroundColor: resolveRate > 70 ? Colors.green : resolveRate > 40 ? "#F59E0B" : "#EF4444" }]} />
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Dept Detail Modal */}
      <Modal visible={!!selectedDept} transparent animationType="slide" onRequestClose={() => setSelectedDept(null)}>
        <Pressable style={cs.overlay} onPress={() => setSelectedDept(null)}>
          <Pressable style={cs.sheet} onPress={e => e.stopPropagation?.()}>
            <View style={cs.sheetHandle} />
            {selectedDept && (() => {
              const meta = getDeptMeta(selectedDept.name);
              return (
                <>
                  <View style={cs.sheetHeader}>
                    <View style={[cs.deptIcon, { backgroundColor: meta.color + "22", borderColor: meta.color + "44" }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={cs.sheetTitle} numberOfLines={1}>{meta.hindi}</Text>
                      <Text style={cs.sheetSub}>{meta.short} · {selectedDept.complaints} complaints routed</Text>
                    </View>
                    <Pressable onPress={() => setSelectedDept(null)}>
                      <Ionicons name="close" size={22} color={Colors.textMuted} />
                    </Pressable>
                  </View>

                  <View style={[cs.statsRow, { marginHorizontal: 20, marginBottom: 14 }]}>
                    {[
                      { label: "Pending",  value: selectedDept.pending,   color: "#F59E0B" },
                      { label: "Resolved", value: selectedDept.resolved,  color: Colors.green },
                      { label: "Rate",     value: `${selectedDept.complaints > 0 ? Math.round((selectedDept.resolved / selectedDept.complaints) * 100) : 0}%`, color: Colors.cyan },
                    ].map(s => (
                      <View key={s.label} style={[cs.statBox, { flex: 1, borderColor: s.color + "33" }]}>
                        <Text style={[cs.statVal, { color: s.color }]}>{s.value}</Text>
                        <Text style={cs.statLabel}>{s.label}</Text>
                      </View>
                    ))}
                  </View>

                  {loadingComplaints ? (
                    <View style={{ padding: 40, alignItems: "center" }}>
                      <ActivityIndicator color={meta.color} />
                      <Text style={{ color: Colors.textMuted, marginTop: 8, fontSize: 12, fontFamily: "Inter_400Regular" }}>Loading complaints...</Text>
                    </View>
                  ) : (
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
                      {deptComplaints.length === 0 ? (
                        <View style={{ alignItems: "center", padding: 40 }}>
                          <Ionicons name="checkmark-circle" size={48} color={Colors.green} />
                          <Text style={{ color: Colors.textPrimary, fontSize: 16, fontFamily: "Inter_700Bold", marginTop: 12 }}>All Clear</Text>
                          <Text style={{ color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "center" }}>No complaints routed to this department</Text>
                        </View>
                      ) : deptComplaints.slice(0, 20).map((c, i) => {
                        const priColor = PRIORITY_COLORS[c.priority] || "#6B7280";
                        const statusColor = STATUS_COLORS[c.status] || "#6B7280";
                        return (
                          <View key={c.id} style={[cs.complaintRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <Text style={cs.ticketId}>{c.ticketId}</Text>
                              <View style={[cs.badge, { backgroundColor: priColor + "22", borderColor: priColor + "44" }]}>
                                <Text style={[cs.badgeText, { color: priColor }]}>{c.priority}</Text>
                              </View>
                              <View style={[cs.badge, { backgroundColor: statusColor + "22", borderColor: statusColor + "44" }]}>
                                <Text style={[cs.badgeText, { color: statusColor }]}>{c.status.replace("_", " ")}</Text>
                              </View>
                            </View>
                            <Text style={cs.complaintDesc} numberOfLines={2}>{c.description}</Text>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                              <Ionicons name="location-outline" size={10} color={Colors.textMuted} />
                              <Text style={cs.complaintLoc} numberOfLines={1}>{c.location}</Text>
                              <Text style={cs.complaintTime}> · {timeAgo(c.submittedAt)}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const cs = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.bg },
  header:     { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 },
  backBtn:    { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  title:      { color: Colors.textPrimary, fontSize: 18, fontFamily: "Inter_700Bold" },
  sub:        { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  aiBadge:    { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.cyan + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.cyan + "44" },
  aiText:     { color: Colors.cyan, fontSize: 11, fontFamily: "Inter_700Bold" },
  statsRow:   { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  statBox:    { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 10, padding: 10, alignItems: "center", gap: 3, borderWidth: 1 },
  statVal:    { fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel:  { fontSize: 9, color: Colors.textMuted, fontFamily: "Inter_500Medium" },
  scroll:     { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  legendCard: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 4 },
  legendTitle:{ color: Colors.textPrimary, fontSize: 13, fontFamily: "Inter_700Bold" },
  legendRow:  { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, borderTopWidth: 1, borderTopColor: Colors.border },
  legendCat:  { flex: 1, color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular" },
  legendDept: { fontSize: 11, fontFamily: "Inter_700Bold" },

  deptCard:   { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  deptGrad:   { ...StyleSheet.absoluteFillObject, borderRadius: 16 },
  deptTop:    { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  deptIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  deptName:   { color: Colors.textPrimary, fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  deptNameEn: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  deptDesc:   { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 },
  catChip:    { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, backgroundColor: "transparent" },
  catChipText:{ fontSize: 9, fontFamily: "Inter_600SemiBold" },
  deptStats:  { flexDirection: "row", gap: 8, marginBottom: 8 },
  deptStat:   { flex: 1, alignItems: "center" },
  deptStatVal:{ fontSize: 15, fontFamily: "Inter_700Bold" },
  deptStatLabel: { fontSize: 9, color: Colors.textMuted, fontFamily: "Inter_400Regular" },
  progressBg: { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  progressFill:{ height: 4, borderRadius: 2 },

  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet:      { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", overflow: "hidden" },
  sheetHandle:{ width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 14 },
  sheetHeader:{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  sheetTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: "Inter_700Bold", lineHeight: 20 },
  sheetSub:   { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  complaintRow:{ paddingVertical: 10 },
  ticketId:   { color: Colors.saffron, fontSize: 11, fontFamily: "Inter_700Bold" },
  badge:      { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  badgeText:  { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  complaintDesc: { color: Colors.textPrimary, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  complaintLoc:  { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 },
  complaintTime: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" },
});
