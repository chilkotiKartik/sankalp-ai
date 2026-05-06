import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
  Platform, Animated, Modal, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#EF4444", P2: "#F59E0B", P3: "#3B82F6", P4: "#6B7280",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B", in_progress: "#3B82F6", resolved: "#10B981", closed: "#6B7280",
};

type AdminView = "overview" | "complaints" | "sos" | "workers";
type PriorityFilter = "all" | "P1" | "P2" | "P3" | "P4";
type StatusFilter = "all" | "pending" | "in_progress" | "resolved" | "closed";

function KPITile({
  label, value, color, bg, icon, onPress, pct,
}: {
  label: string; value: number | string; color: string; bg: string;
  icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; pct?: number;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(anim, { toValue: 1, duration: 500, useNativeDriver: false }).start(); }, []);
  return (
    <Pressable onPress={onPress} style={[s.kpiTile, { backgroundColor: bg, borderColor: color + "30" }]}>
      <View style={[s.kpiIconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Animated.Text style={[s.kpiValue, { color, opacity: anim }]}>{value}</Animated.Text>
      <Text style={s.kpiLabel}>{label}</Text>
      {pct !== undefined && (
        <View style={s.kpiBar}>
          <Animated.View style={[s.kpiBarFill, { backgroundColor: color, width: anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${pct}%` as any] }) as any }]} />
        </View>
      )}
    </Pressable>
  );
}

function ComplaintRow({ c, onPress }: { c: any; onPress: () => void }) {
  return (
    <Pressable style={s.row} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <View style={[s.priorityBadge, { backgroundColor: PRIORITY_COLORS[c.priority] + "20", borderColor: PRIORITY_COLORS[c.priority] + "50" }]}>
            <Text style={[s.priorityBadgeText, { color: PRIORITY_COLORS[c.priority] }]}>{c.priority}</Text>
          </View>
          <Text style={s.rowTitle} numberOfLines={1}>{c.ticketId} — {c.category}</Text>
        </View>
        <Text style={s.rowSub} numberOfLines={1}>{c.location}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <View style={[s.statusDot, { backgroundColor: STATUS_COLORS[c.status] || "#6B7280" }]} />
          <Text style={[s.rowStatus, { color: STATUS_COLORS[c.status] || "#6B7280" }]}>{c.status.replace("_", " ").toUpperCase()}</Text>
          <Text style={s.rowTime}>· AI: {c.aiScore}%</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#4B5563" />
    </Pressable>
  );
}

function SOSRow({ alert, onPress }: { alert: any; onPress: () => void }) {
  const isWomen = alert.category === "women_safety";
  const accentCol = isWomen ? "#8B5CF6" : "#EF4444";
  return (
    <Pressable style={[s.row, { borderLeftWidth: 3, borderLeftColor: accentCol }]} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Text style={{ fontSize: 16 }}>{isWomen ? "🛡️" : "🆘"}</Text>
          <Text style={[s.rowTitle, { color: accentCol }]} numberOfLines={1}>
            {(alert.category || "").replace(/_/g, " ").toUpperCase()}
          </Text>
          <View style={[s.statusDot, { backgroundColor: alert.status === "active" ? "#EF4444" : "#10B981" }]} />
        </View>
        <Text style={s.rowSub}>{alert.location}</Text>
        <Text style={s.rowTime}>{alert.district} · {new Date(alert.triggeredAt).toLocaleTimeString("en-IN")}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color="#4B5563" />
    </Pressable>
  );
}

function WorkerRow({ w }: { w: any }) {
  const col = w.status === "active" ? "#10B981" : w.status === "on_leave" ? "#F59E0B" : "#6B7280";
  return (
    <View style={s.row}>
      <View style={[s.workerAvatar, { backgroundColor: col + "18", borderColor: col + "30" }]}>
        <Text style={{ fontSize: 14 }}>👷</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{w.name}</Text>
        <Text style={s.rowSub}>{w.department} · {w.district}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <View style={[s.statusDot, { backgroundColor: col }]} />
          <Text style={[s.rowStatus, { color: col }]}>{w.status.replace("_", " ").toUpperCase()}</Text>
          {w.currentTask && <Text style={s.rowTime} numberOfLines={1}>· {w.currentTask}</Text>}
        </View>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {w.performanceScore !== undefined && (
          <Text style={{ color: "#FF9933", fontSize: 13, fontFamily: "Inter_700Bold" }}>{w.performanceScore}%</Text>
        )}
      </View>
    </View>
  );
}

export default function AdminDashboard() {
  const insets = useSafeAreaInsets();
  const { complaints, sosAlerts, workers, isLoading, refresh } = useApp();
  const { user } = useAuth();
  const [view, setView] = useState<AdminView>("overview");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selComplaint, setSelComplaint] = useState<any>(null);
  const [selSOS, setSelSOS] = useState<any>(null);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const stats = {
    total: complaints.length,
    p1: complaints.filter(c => c.priority === "P1").length,
    p1Open: complaints.filter(c => c.priority === "P1" && c.status !== "resolved" && c.status !== "closed").length,
    activeSOS: sosAlerts.filter(s => s.status === "active").length,
    pending: complaints.filter(c => c.status === "pending").length,
    inProgress: complaints.filter(c => c.status === "in_progress").length,
    resolved: complaints.filter(c => c.status === "resolved" || c.status === "closed").length,
    workers: workers.length,
    activeWorkers: workers.filter(w => w.status === "active").length,
    avgScore: Math.round(complaints.reduce((s, c) => s + (c.aiScore || 0), 0) / Math.max(complaints.length, 1)),
    resolveRate: complaints.length > 0 ? Math.round(complaints.filter(c => c.status === "resolved" || c.status === "closed").length / complaints.length * 100) : 0,
  };

  const filteredComplaints = complaints.filter(c => {
    if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (user?.role === "admin" && user?.district !== "Uttarakhand") {
      if (c.district !== user.district) return false;
    }
    return true;
  }).sort((a, b) => {
    const pri = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return (pri[a.priority as keyof typeof pri] || 3) - (pri[b.priority as keyof typeof pri] || 3);
  });

  const districtComplaints = user?.role === "admin" && user?.district !== "Uttarakhand"
    ? complaints.filter(c => c.district === user.district)
    : complaints;

  if (!isAdmin) {
    return (
      <View style={[s.container, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🔒</Text>
        <Text style={{ color: "#EF4444", fontSize: 16, fontFamily: "Inter_700Bold" }}>Admin Access Only</Text>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: Platform.OS === "web" ? 0 : insets.top }]}>
      {/* HEADER */}
      <LinearGradient colors={["#0A0F1C", "#0D1426"]} style={s.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Pressable onPress={() => router.back()} style={s.backIcon}>
          <Ionicons name="arrow-back" size={20} color="#9CA3AF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="shield-checkmark" size={18} color="#FF9933" />
            <Text style={s.headerTitle}>Admin War Room</Text>
            <View style={s.livePill}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>LIVE</Text>
            </View>
          </View>
          <Text style={s.headerSub}>
            {user?.role === "super_admin" ? "All Uttarakhand" : user?.district} · {user?.name}
          </Text>
        </View>
        <Pressable onPress={refresh} style={s.refreshBtn}>
          <Ionicons name="refresh" size={18} color="#FF9933" />
        </Pressable>
      </LinearGradient>

      {/* VIEW TABS */}
      <View style={s.viewTabs}>
        {([
          ["overview", "grid-outline", "Overview"],
          ["complaints", "document-text-outline", "Complaints"],
          ["sos", "warning-outline", "SOS"],
          ["workers", "people-outline", "Workers"],
        ] as const).map(([key, icon, label]) => (
          <Pressable key={key} onPress={() => setView(key as AdminView)}
            style={[s.viewTab, view === key && s.viewTabActive]}>
            <Ionicons name={icon as any} size={15} color={view === key ? "#FF9933" : "#6B7280"} />
            <Text style={[s.viewTabText, view === key && { color: "#FF9933" }]}>{label}</Text>
            {key === "sos" && stats.activeSOS > 0 && (
              <View style={s.tabBadge}><Text style={s.tabBadgeText}>{stats.activeSOS}</Text></View>
            )}
          </Pressable>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#FF9933" colors={["#FF9933"]} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
      >
        {/* ── OVERVIEW ── */}
        {view === "overview" && (
          <>
            {/* KPI Grid */}
            <View style={s.kpiGrid}>
              <KPITile label="Total Complaints" value={stats.total} color="#FF9933" bg="#1A1200"
                icon="document-text" onPress={() => setView("complaints")} />
              <KPITile label="P1 Critical" value={stats.p1Open} color="#EF4444" bg="#1A0A0A"
                icon="warning" onPress={() => { setPriorityFilter("P1"); setView("complaints"); }} />
              <KPITile label="Active SOS" value={stats.activeSOS} color="#DC2626" bg="#1A0A0A"
                icon="alert-circle" onPress={() => setView("sos")} />
              <KPITile label="Pending" value={stats.pending} color="#F59E0B" bg="#1A1200"
                icon="time" onPress={() => { setStatusFilter("pending"); setView("complaints"); }} />
              <KPITile label="Resolved" value={stats.resolved} color="#10B981" bg="#0A1A10"
                icon="checkmark-circle" pct={stats.resolveRate}
                onPress={() => { setStatusFilter("resolved"); setView("complaints"); }} />
              <KPITile label="Workers" value={`${stats.activeWorkers}/${stats.workers}`} color="#3B82F6" bg="#0A0F1A"
                icon="people" onPress={() => setView("workers")} />
              <KPITile label="Avg AI Score" value={`${stats.avgScore}%`} color="#8B5CF6" bg="#100A1A"
                icon="analytics" pct={stats.avgScore} />
              <KPITile label="Resolve Rate" value={`${stats.resolveRate}%`} color="#06B6D4" bg="#0A1418"
                icon="trending-up" pct={stats.resolveRate} />
            </View>

            {/* P1 CRITICAL ALERTS */}
            {stats.p1Open > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionIconWrap}>
                    <Ionicons name="warning" size={14} color="#EF4444" />
                  </View>
                  <Text style={s.sectionTitle}>P1 Critical — Needs Immediate Action</Text>
                </View>
                {complaints.filter(c => c.priority === "P1" && c.status !== "resolved" && c.status !== "closed")
                  .slice(0, 5).map(c => (
                    <ComplaintRow key={c.id} c={c} onPress={() => setSelComplaint(c)} />
                  ))}
                {stats.p1Open > 5 && (
                  <Pressable onPress={() => { setPriorityFilter("P1"); setView("complaints"); }}
                    style={s.seeAllBtn}>
                    <Text style={s.seeAllText}>See all {stats.p1Open} P1 complaints →</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* ACTIVE SOS */}
            {stats.activeSOS > 0 && (
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={[s.sectionIconWrap, { backgroundColor: "#450A0A" }]}>
                    <Ionicons name="alert-circle" size={14} color="#EF4444" />
                  </View>
                  <Text style={s.sectionTitle}>Active SOS Incidents</Text>
                </View>
                {sosAlerts.filter(s => s.status === "active").slice(0, 5).map(a => (
                  <SOSRow key={a.id} alert={a} onPress={() => setSelSOS(a)} />
                ))}
              </View>
            )}

            {/* COMPLAINT BREAKDOWN */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionIconWrap}>
                  <Ionicons name="pie-chart" size={14} color="#FF9933" />
                </View>
                <Text style={s.sectionTitle}>Priority Breakdown</Text>
              </View>
              {(["P1", "P2", "P3", "P4"] as const).map(p => {
                const count = districtComplaints.filter(c => c.priority === p).length;
                const pct = districtComplaints.length > 0 ? count / districtComplaints.length * 100 : 0;
                return (
                  <View key={p} style={s.breakdownRow}>
                    <View style={[s.priorityBadge, { backgroundColor: PRIORITY_COLORS[p] + "20", borderColor: PRIORITY_COLORS[p] + "50", width: 36 }]}>
                      <Text style={[s.priorityBadgeText, { color: PRIORITY_COLORS[p] }]}>{p}</Text>
                    </View>
                    <View style={s.breakdownBar}>
                      <View style={[s.breakdownFill, { backgroundColor: PRIORITY_COLORS[p], width: `${pct}%` as any }]} />
                    </View>
                    <Text style={[s.breakdownCount, { color: PRIORITY_COLORS[p] }]}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── COMPLAINTS ── */}
        {view === "complaints" && (
          <View>
            {/* Filters */}
            <View style={s.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                {(["all", "P1", "P2", "P3", "P4"] as const).map(p => (
                  <Pressable key={p} onPress={() => setPriorityFilter(p)}
                    style={[s.chip, priorityFilter === p && { backgroundColor: (PRIORITY_COLORS[p] || "#FF9933") + "20", borderColor: PRIORITY_COLORS[p] || "#FF9933" }]}>
                    <Text style={[s.chipText, priorityFilter === p && { color: PRIORITY_COLORS[p] || "#FF9933" }]}>{p === "all" ? "All Priority" : p}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}>
                {(["all", "pending", "in_progress", "resolved", "closed"] as const).map(st => (
                  <Pressable key={st} onPress={() => setStatusFilter(st)}
                    style={[s.chip, statusFilter === st && { backgroundColor: (STATUS_COLORS[st] || "#FF9933") + "20", borderColor: STATUS_COLORS[st] || "#FF9933" }]}>
                    <Text style={[s.chipText, statusFilter === st && { color: STATUS_COLORS[st] || "#FF9933" }]}>{st === "all" ? "All Status" : st.replace("_", " ")}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <Text style={s.resultCount}>{filteredComplaints.length} complaint{filteredComplaints.length !== 1 ? "s" : ""}</Text>

            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {filteredComplaints.slice(0, 100).map(c => (
                <ComplaintRow key={c.id} c={c} onPress={() => setSelComplaint(c)} />
              ))}
              {filteredComplaints.length === 0 && (
                <View style={s.emptyState}>
                  <Text style={{ fontSize: 36 }}>✅</Text>
                  <Text style={s.emptyStateText}>No complaints match the selected filters</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── SOS ── */}
        {view === "sos" && (
          <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
            {sosAlerts.filter(s => user?.role === "admin" && user?.district !== "Uttarakhand" ? (s as any).district === user.district : true)
              .sort((a, b) => {
                const pri = { active: 0, dispatched: 1, resolved: 2, closed: 3 };
                return (pri[a.status as keyof typeof pri] || 0) - (pri[b.status as keyof typeof pri] || 0);
              })
              .map(a => <SOSRow key={a.id} alert={a} onPress={() => setSelSOS(a)} />)}
            {sosAlerts.length === 0 && (
              <View style={s.emptyState}>
                <Text style={{ fontSize: 36 }}>🛡️</Text>
                <Text style={s.emptyStateText}>No SOS incidents yet</Text>
              </View>
            )}
          </View>
        )}

        {/* ── WORKERS ── */}
        {view === "workers" && (
          <View>
            <View style={s.workerStats}>
              {[
                { label: "Active", value: workers.filter(w => w.status === "active").length, color: "#10B981" },
                { label: "On Leave", value: workers.filter(w => w.status === "on_leave").length, color: "#F59E0B" },
                { label: "Inactive", value: workers.filter(w => w.status === "idle").length, color: "#6B7280" },
              ].map(ws => (
                <View key={ws.label} style={[s.workerStatCard, { borderColor: ws.color + "30" }]}>
                  <Text style={[s.workerStatNum, { color: ws.color }]}>{ws.value}</Text>
                  <Text style={s.workerStatLabel}>{ws.label}</Text>
                </View>
              ))}
            </View>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {workers.filter(w => user?.role === "admin" && user?.district !== "Uttarakhand" ? w.district === user.district : true)
                .sort((a, b) => a.status === "active" ? -1 : 1)
                .map(w => <WorkerRow key={w.id} w={w} />)}
            </View>
          </View>
        )}
      </ScrollView>

      {/* COMPLAINT DETAIL MODAL */}
      {selComplaint && (
        <Modal visible animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelComplaint(null)} />
            <View style={s.modalCard}>
              <View style={s.modalHandle} />
              <ScrollView>
                <View style={s.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <View style={[s.priorityBadge, { backgroundColor: PRIORITY_COLORS[selComplaint.priority] + "20", borderColor: PRIORITY_COLORS[selComplaint.priority] + "50" }]}>
                        <Text style={[s.priorityBadgeText, { color: PRIORITY_COLORS[selComplaint.priority] }]}>{selComplaint.priority}</Text>
                      </View>
                      <View style={[s.priorityBadge, { backgroundColor: (STATUS_COLORS[selComplaint.status] || "#6B7280") + "20", borderColor: (STATUS_COLORS[selComplaint.status] || "#6B7280") + "50" }]}>
                        <Text style={[s.priorityBadgeText, { color: STATUS_COLORS[selComplaint.status] || "#6B7280" }]}>{selComplaint.status.replace("_", " ").toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={s.modalTitle}>{selComplaint.ticketId}</Text>
                    <Text style={s.modalSub}>{selComplaint.category.toUpperCase()} · {selComplaint.district}</Text>
                  </View>
                  <Pressable onPress={() => setSelComplaint(null)} style={s.modalClose}>
                    <Ionicons name="close" size={18} color="#6B7280" />
                  </Pressable>
                </View>
                <View style={s.modalBody}>
                  <View style={s.detailRow}><Ionicons name="location-outline" size={15} color="#6B7280" /><Text style={s.detailText}>{selComplaint.location}</Text></View>
                  <View style={s.detailRow}><Ionicons name="person-outline" size={15} color="#6B7280" /><Text style={s.detailText}>{selComplaint.submittedByPhone}</Text></View>
                  <View style={s.detailRow}><Ionicons name="analytics-outline" size={15} color="#6B7280" /><Text style={s.detailText}>AI Score: {selComplaint.aiScore}% confidence</Text></View>
                  {selComplaint.description && (
                    <View style={s.descBox}>
                      <Text style={s.descBoxLabel}>DESCRIPTION</Text>
                      <Text style={s.descBoxText}>{selComplaint.description}</Text>
                    </View>
                  )}
                  {selComplaint.adminNote && (
                    <View style={[s.descBox, { borderLeftColor: "#FF9933" }]}>
                      <Text style={[s.descBoxLabel, { color: "#FF9933" }]}>ADMIN NOTE</Text>
                      <Text style={s.descBoxText}>{selComplaint.adminNote}</Text>
                    </View>
                  )}
                  <Pressable style={s.closeModalBtn} onPress={() => setSelComplaint(null)}>
                    <Text style={s.closeModalBtnText}>Close</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* SOS DETAIL MODAL */}
      {selSOS && (
        <Modal visible animationType="slide" transparent>
          <View style={s.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelSOS(null)} />
            <View style={s.modalCard}>
              <View style={s.modalHandle} />
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 24, marginBottom: 6 }}>{selSOS.category === "women_safety" ? "🛡️" : "🆘"}</Text>
                  <Text style={[s.modalTitle, { color: selSOS.category === "women_safety" ? "#8B5CF6" : "#EF4444" }]}>
                    {(selSOS.category || "").replace(/_/g, " ").toUpperCase()}
                  </Text>
                  <Text style={s.modalSub}>{selSOS.district} · {selSOS.location}</Text>
                </View>
                <Pressable onPress={() => setSelSOS(null)} style={s.modalClose}>
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </View>
              <View style={s.modalBody}>
                <View style={s.detailRow}><Ionicons name="person-outline" size={15} color="#6B7280" /><Text style={s.detailText}>{selSOS.triggeredBy || selSOS.submittedByPhone}</Text></View>
                <View style={s.detailRow}><Ionicons name="time-outline" size={15} color="#6B7280" /><Text style={s.detailText}>{new Date(selSOS.triggeredAt).toLocaleString("en-IN")}</Text></View>
                {selSOS.geo && (
                  <View style={s.detailRow}><Ionicons name="navigate-outline" size={15} color="#6B7280" /><Text style={s.detailText}>{selSOS.geo.lat.toFixed(5)}°N, {selSOS.geo.lng.toFixed(5)}°E</Text></View>
                )}
                {selSOS.audioUrl && (
                  <View style={s.detailRow}><Ionicons name="mic-outline" size={15} color="#8B5CF6" /><Text style={[s.detailText, { color: "#8B5CF6" }]}>Audio evidence recorded</Text></View>
                )}
                <Pressable style={s.closeModalBtn} onPress={() => setSelSOS(null)}>
                  <Text style={s.closeModalBtnText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0F1C" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  backIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#F9FAFB", fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#14532D", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#4ADE80" },
  liveText: { color: "#4ADE80", fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  refreshBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center" },
  backBtn: { marginTop: 20, backgroundColor: "#1F2937", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backBtnText: { color: "#F9FAFB", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  viewTabs: { flexDirection: "row", backgroundColor: "#0D1426", borderBottomWidth: 1, borderBottomColor: "#1F2937" },
  viewTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: "transparent" },
  viewTabActive: { borderBottomColor: "#FF9933" },
  viewTabText: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  tabBadge: { backgroundColor: "#EF4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tabBadgeText: { color: "#fff", fontSize: 8, fontFamily: "Inter_700Bold" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  kpiTile: {
    width: "47.5%", borderRadius: 14, padding: 14, gap: 4,
    borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  kpiIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiValue: { fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 30 },
  kpiLabel: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_500Medium" },
  kpiBar: { height: 4, backgroundColor: "#1F2937", borderRadius: 2, overflow: "hidden", marginTop: 6 },
  kpiBarFill: { height: 4, borderRadius: 2 },
  section: { marginHorizontal: 16, marginBottom: 18 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionIconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#7F1D1D", alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: "#D1D5DB", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#111827", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#1F2937", marginBottom: 8,
  },
  rowTitle: { color: "#F9FAFB", fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  rowSub: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular" },
  rowStatus: { fontSize: 10, fontFamily: "Inter_700Bold" },
  rowTime: { color: "#4B5563", fontSize: 10, fontFamily: "Inter_400Regular" },
  priorityBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1 },
  priorityBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  seeAllBtn: { paddingVertical: 10, alignItems: "center" },
  seeAllText: { color: "#FF9933", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterRow: {},
  chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: "#374151", backgroundColor: "#1F2937" },
  chipText: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  resultCount: { color: "#4B5563", fontSize: 11, fontFamily: "Inter_400Regular", paddingHorizontal: 16, paddingBottom: 8 },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyStateText: { color: "#4B5563", fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  workerAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  workerStats: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  workerStatCard: { flex: 1, backgroundColor: "#111827", borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1 },
  workerStatNum: { fontSize: 22, fontFamily: "Inter_700Bold" },
  workerStatLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2 },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  breakdownBar: { flex: 1, height: 8, backgroundColor: "#1F2937", borderRadius: 4, overflow: "hidden" },
  breakdownFill: { height: 8, borderRadius: 4 },
  breakdownCount: { fontSize: 13, fontFamily: "Inter_700Bold", width: 28, textAlign: "right" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.75)" },
  modalCard: { backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", overflow: "hidden" },
  modalHandle: { width: 40, height: 4, backgroundColor: "#374151", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 20, paddingBottom: 12 },
  modalTitle: { color: "#F9FAFB", fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSub: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalClose: { width: 32, height: 32, borderRadius: 8, backgroundColor: "#1F2937", alignItems: "center", justifyContent: "center" },
  modalBody: { padding: 20, paddingTop: 8 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  detailText: { flex: 1, color: "#D1D5DB", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  descBox: { backgroundColor: "#1F2937", borderRadius: 10, padding: 12, marginTop: 4, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: "#374151" },
  descBoxLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 6 },
  descBoxText: { color: "#D1D5DB", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  closeModalBtn: { backgroundColor: "#1F2937", borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 8 },
  closeModalBtnText: { color: "#9CA3AF", fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
