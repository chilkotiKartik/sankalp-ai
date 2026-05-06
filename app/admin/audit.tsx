import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface AuditLog {
  id: string;
  action: string;
  actorPhone?: string;
  actorName?: string;
  details: string;
  referenceId?: string;
  timestamp: string;
  hash?: string;
}

const ACTION_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  complaint_created:   { icon: "document-text",   color: "#3B82F6", label: "Complaint Filed" },
  complaint_resolved:  { icon: "checkmark-circle", color: "#00A651", label: "Complaint Resolved" },
  complaint_rejected:  { icon: "close-circle",     color: "#EF4444", label: "Complaint Rejected" },
  complaint_escalated: { icon: "arrow-up-circle",  color: "#F59E0B", label: "SLA Escalated" },
  sos_triggered:       { icon: "warning",          color: "#EF4444", label: "SOS Triggered" },
  sos_resolved:        { icon: "shield-checkmark", color: "#00A651", label: "SOS Resolved" },
  user_registered:     { icon: "person-add",       color: "#8B5CF6", label: "User Registered" },
  rti_filed:           { icon: "mail",             color: "#06B6D4", label: "RTI Filed" },
  rti_responded:       { icon: "mail-open",        color: "#00A651", label: "RTI Responded" },
  poll_voted:          { icon: "checkmark-done",   color: "#F59E0B", label: "Poll Voted" },
  petition_signed:     { icon: "pencil",           color: "#8B5CF6", label: "Petition Signed" },
  admin_login:         { icon: "log-in",           color: "#6B7280", label: "Admin Login" },
  announcement_posted: { icon: "megaphone",        color: "#FF9933", label: "Announcement" },
};

function getActionMeta(action: string) {
  return ACTION_META[action] || { icon: "ellipse" as const, color: Colors.textMuted, label: action };
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function shortHash(hash?: string) {
  if (!hash) return "N/A";
  return hash.slice(0, 8) + "..." + hash.slice(-4);
}

export default function AuditScreen() {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterAction, setFilterAction] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const actionTypes = ["all", "complaint_created", "complaint_resolved", "complaint_escalated", "sos_triggered", "rti_filed"];

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("token");
      const res = await fetch(`${getApiUrl()}api/audit`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = filterAction === "all" ? logs : logs.filter(l => l.action === filterAction);

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#00080D", Colors.bg]} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <Pressable onPress={() => router.back()} style={cs.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={cs.headerTitle}>
          <Text style={cs.headerTitleText}>Audit Trail</Text>
          <Text style={cs.headerSub}>Immutable blockchain-style log</Text>
        </View>
        <View style={cs.chainBadge}>
          <Ionicons name="git-network" size={18} color={Colors.cyan} />
        </View>
      </View>

      {/* Chain Summary */}
      <LinearGradient colors={[Colors.cyan + "22", Colors.cyan + "08"]} style={cs.chainSummary}>
        <View style={cs.chainRow}>
          <Ionicons name="shield-checkmark" size={16} color={Colors.cyan} />
          <Text style={cs.chainText}>
            {logs.length} immutable entries · Tamper-proof log
          </Text>
        </View>
        <View style={cs.chainRow}>
          <Ionicons name="lock-closed" size={13} color={Colors.green} />
          <Text style={[cs.chainSmall, { color: Colors.green }]}>All actions are cryptographically hashed</Text>
        </View>
      </LinearGradient>

      {/* Filter Chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
        {actionTypes.map(a => {
          const meta = a === "all" ? null : getActionMeta(a);
          return (
            <Pressable key={a} onPress={() => setFilterAction(a)} style={[cs.filterChip, filterAction === a && cs.filterChipActive]}>
              {meta && <Ionicons name={meta.icon} size={12} color={filterAction === a ? meta.color : Colors.textMuted} />}
              <Text style={[cs.filterChipText, filterAction === a && { color: Colors.saffron }]}>
                {a === "all" ? "All Events" : getActionMeta(a).label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.cyan} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.cyan} />}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((log, idx) => {
            const meta = getActionMeta(log.action);
            const isExpanded = expanded === log.id;
            const isFirst = idx === 0;
            const isLast = idx === filtered.length - 1;

            return (
              <Pressable key={log.id} onPress={() => setExpanded(isExpanded ? null : log.id)} style={cs.logRow}>
                {/* Timeline line */}
                <View style={cs.timeline}>
                  <View style={[cs.timelineDot, { backgroundColor: meta.color }]}>
                    <Ionicons name={meta.icon} size={10} color="#FFF" />
                  </View>
                  {!isLast && <View style={[cs.timelineLine, { backgroundColor: meta.color + "44" }]} />}
                </View>

                {/* Card */}
                <View style={[cs.logCard, isExpanded && { borderColor: meta.color + "44" }]}>
                  <View style={cs.logCardHeader}>
                    <View style={[cs.logBadge, { backgroundColor: meta.color + "22" }]}>
                      <Ionicons name={meta.icon} size={13} color={meta.color} />
                      <Text style={[cs.logBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={cs.logTime}>{timeAgo(log.timestamp)}</Text>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={Colors.textMuted} />
                  </View>
                  <Text style={cs.logDetails} numberOfLines={isExpanded ? undefined : 2}>{log.details}</Text>

                  {isExpanded && (
                    <View style={cs.logExpanded}>
                      <View style={cs.logExpandedRow}>
                        <Ionicons name="person" size={12} color={Colors.textMuted} />
                        <Text style={cs.logExpandedLabel}>Actor: </Text>
                        <Text style={cs.logExpandedValue}>{log.actorName || "System"} {log.actorPhone ? `(${log.actorPhone})` : ""}</Text>
                      </View>
                      {log.referenceId && (
                        <View style={cs.logExpandedRow}>
                          <Ionicons name="link" size={12} color={Colors.textMuted} />
                          <Text style={cs.logExpandedLabel}>Ref ID: </Text>
                          <Text style={[cs.logExpandedValue, { fontFamily: "monospace" }]}>{log.referenceId.slice(0, 16)}...</Text>
                        </View>
                      )}
                      <View style={cs.logExpandedRow}>
                        <Ionicons name="time" size={12} color={Colors.textMuted} />
                        <Text style={cs.logExpandedLabel}>Timestamp: </Text>
                        <Text style={cs.logExpandedValue}>{new Date(log.timestamp).toLocaleString("en-IN")}</Text>
                      </View>
                      <View style={[cs.hashBox, { borderColor: Colors.cyan + "33" }]}>
                        <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
                        <Text style={cs.hashLabel}>Block Hash: </Text>
                        <Text style={cs.hashValue}>{shortHash(log.hash || log.id)}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}

          {filtered.length === 0 && (
            <View style={cs.empty}>
              <Ionicons name="git-network-outline" size={48} color={Colors.textMuted} />
              <Text style={cs.emptyText}>No audit logs found</Text>
            </View>
          )}
        </ScrollView>
      )}
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
  chainBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.cyan + "22", alignItems: "center", justifyContent: "center" },

  chainSummary: { marginHorizontal: 16, borderRadius: 12, padding: 12, gap: 6, marginBottom: 12, borderWidth: 1, borderColor: Colors.cyan + "33" },
  chainRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  chainText: { fontSize: 13, color: Colors.cyan, fontWeight: "600" },
  chainSmall: { fontSize: 11 },

  filterScroll: { marginBottom: 8 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },
  filterChipText: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },

  scroll: { padding: 16, gap: 0 },

  logRow: { flexDirection: "row", gap: 0, marginBottom: 4 },
  timeline: { width: 32, alignItems: "center", paddingTop: 2 },
  timelineDot: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", zIndex: 1 },
  timelineLine: { width: 2, flex: 1, marginTop: 2 },

  logCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  logCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  logBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flex: 1 },
  logBadgeText: { fontSize: 11, fontWeight: "700" },
  logTime: { fontSize: 10, color: Colors.textMuted },
  logDetails: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  logExpanded: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, gap: 6 },
  logExpandedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  logExpandedLabel: { fontSize: 11, color: Colors.textMuted },
  logExpandedValue: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  hashBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.cyan + "11", borderRadius: 8, padding: 8, borderWidth: 1 },
  hashLabel: { fontSize: 10, color: Colors.cyan, fontWeight: "600" },
  hashValue: { fontSize: 10, color: Colors.cyan, fontFamily: "monospace" },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});
