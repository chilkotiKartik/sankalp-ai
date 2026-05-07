import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
  ActivityIndicator, Linking, Modal, ScrollView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";

interface Announcement {
  id: string;
  title: string;
  body: string;
  type: "general" | "scheme" | "emergency" | "welfare" | "tender" | "holiday";
  department: string;
  postedAt: string;
  expiresAt?: string;
  postedBy: string;
  priority: "normal" | "important" | "urgent";
  targetWards?: number[];
  targetDistrict?: string;
  link?: string;
  views: number;
}

const TYPE_META: Record<string, { icon: string; color: string; label: string; bg: string }> = {
  general:   { icon: "information-circle",  color: "#3B82F6", label: "General",   bg: "#3B82F615" },
  scheme:    { icon: "ribbon",              color: "#22C55E", label: "Scheme",    bg: "#22C55E15" },
  emergency: { icon: "warning",             color: "#EF4444", label: "Emergency", bg: "#EF444415" },
  welfare:   { icon: "heart",               color: "#8B5CF6", label: "Welfare",   bg: "#8B5CF615" },
  tender:    { icon: "document-text",       color: "#F59E0B", label: "Tender",    bg: "#F59E0B15" },
  holiday:   { icon: "calendar",            color: "#06B6D4", label: "Holiday",   bg: "#06B6D415" },
};

const PRIORITY_META: Record<string, { color: string; label: string; icon: string }> = {
  normal:    { color: "#6B7280", label: "Normal",    icon: "ellipse-outline" },
  important: { color: "#F59E0B", label: "Important", icon: "alert-circle-outline" },
  urgent:    { color: "#EF4444", label: "Urgent",    icon: "warning" },
};

const FILTER_TYPES = ["all", "emergency", "scheme", "welfare", "general", "holiday", "tender"] as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function AnnouncementDetailModal({ ann, onClose }: { ann: Announcement; onClose: () => void }) {
  const typeMeta = TYPE_META[ann.type] || TYPE_META.general;
  const priorityMeta = PRIORITY_META[ann.priority] || PRIORITY_META.normal;
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={det.overlay}>
        <View style={det.sheet}>
          <View style={[det.typeBanner, { backgroundColor: typeMeta.bg, borderBottomColor: typeMeta.color + "40" }]}>
            <Ionicons name={typeMeta.icon as any} size={22} color={typeMeta.color} />
            <Text style={[det.typeLabel, { color: typeMeta.color }]}>{typeMeta.label.toUpperCase()}</Text>
            <View style={{ flex: 1 }} />
            <View style={[det.priorityBadge, { backgroundColor: priorityMeta.color + "20", borderColor: priorityMeta.color + "50" }]}>
              <Ionicons name={priorityMeta.icon as any} size={10} color={priorityMeta.color} />
              <Text style={[det.priorityTxt, { color: priorityMeta.color }]}>{priorityMeta.label}</Text>
            </View>
            <Pressable onPress={onClose} style={det.closeBtn}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={det.body} showsVerticalScrollIndicator={false}>
            <Text style={det.title}>{ann.title}</Text>

            <View style={det.metaRow}>
              <Ionicons name="business-outline" size={12} color="#6B7280" />
              <Text style={det.metaTxt}>{ann.department}</Text>
            </View>
            <View style={det.metaRow}>
              <Ionicons name="time-outline" size={12} color="#6B7280" />
              <Text style={det.metaTxt}>{new Date(ann.postedAt).toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
            {ann.targetDistrict && ann.targetDistrict !== "all" && (
              <View style={det.metaRow}>
                <Ionicons name="location-outline" size={12} color="#6B7280" />
                <Text style={det.metaTxt}>{ann.targetDistrict}</Text>
              </View>
            )}

            <View style={det.divider} />
            <Text style={det.bodyText}>{ann.body}</Text>

            {ann.link && (
              <Pressable style={det.linkBtn} onPress={() => Linking.openURL(ann.link!)}>
                <Ionicons name="open-outline" size={14} color="#FF9933" />
                <Text style={det.linkTxt}>Learn More / Apply</Text>
              </Pressable>
            )}

            {ann.expiresAt && (
              <View style={det.expiry}>
                <Ionicons name="calendar-outline" size={12} color="#EF4444" />
                <Text style={det.expiryTxt}>
                  Valid until: {new Date(ann.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </Text>
              </View>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>

          <Pressable style={det.closeFull} onPress={onClose}>
            <Text style={det.closeFullTxt}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const det = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { backgroundColor: "#0F172A", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%", borderWidth: 1, borderColor: "#1F2937" },
  typeBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16, borderBottomWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  typeLabel: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  priorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  priorityTxt: { fontSize: 9, fontFamily: "Inter_700Bold" },
  closeBtn: { padding: 4 },
  body: { padding: 20 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#F1F5F9", lineHeight: 26, marginBottom: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 },
  metaTxt: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7280" },
  divider: { height: 1, backgroundColor: "#1F2937", marginVertical: 14 },
  bodyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#CBD5E1", lineHeight: 22 },
  linkBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, backgroundColor: "rgba(255,153,51,0.1)", borderWidth: 1, borderColor: "rgba(255,153,51,0.3)", borderRadius: 10, padding: 12 },
  linkTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FF9933" },
  expiry: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, backgroundColor: "#EF444410", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: "#EF444430" },
  expiryTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#EF4444" },
  closeFull: { margin: 16, backgroundColor: "#1F2937", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  closeFullTxt: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#9CA3AF" },
});

export default function AnnouncementsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Announcement | null>(null);
  const intervalRef = useRef<any>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${getApiUrl()}/api/announcements`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 60000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const filtered = announcements.filter(a =>
    filter === "all" || a.type === filter
  );

  const urgentCount = announcements.filter(a => a.priority === "urgent").length;

  const renderItem = ({ item }: { item: Announcement }) => {
    const typeMeta = TYPE_META[item.type] || TYPE_META.general;
    const priorityMeta = PRIORITY_META[item.priority] || PRIORITY_META.normal;
    const isUrgent = item.priority === "urgent";
    const isImportant = item.priority === "important";

    return (
      <Pressable
        style={[
          styles.card,
          isUrgent && styles.cardUrgent,
          isImportant && styles.cardImportant,
        ]}
        onPress={() => setSelected(item)}
      >
        {isUrgent && (
          <View style={styles.urgentBanner}>
            <Ionicons name="warning" size={10} color="#EF4444" />
            <Text style={styles.urgentBannerTxt}>URGENT NOTICE</Text>
          </View>
        )}

        <View style={styles.cardHeader}>
          <View style={[styles.typeChip, { backgroundColor: typeMeta.bg, borderColor: typeMeta.color + "40" }]}>
            <Ionicons name={typeMeta.icon as any} size={11} color={typeMeta.color} />
            <Text style={[styles.typeChipTxt, { color: typeMeta.color }]}>{typeMeta.label}</Text>
          </View>
          <View style={[styles.priorityChip, { backgroundColor: priorityMeta.color + "18", borderColor: priorityMeta.color + "40" }]}>
            <Text style={[styles.priorityChipTxt, { color: priorityMeta.color }]}>{priorityMeta.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.timeAgo}>{timeAgo(item.postedAt)}</Text>
        </View>

        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.cardBody} numberOfLines={3}>{item.body}</Text>

        <View style={styles.cardFooter}>
          <View style={styles.deptRow}>
            <Ionicons name="business-outline" size={11} color="#4B5563" />
            <Text style={styles.deptTxt} numberOfLines={1}>{item.department}</Text>
          </View>
          <View style={styles.viewsRow}>
            <Ionicons name="eye-outline" size={11} color="#4B5563" />
            <Text style={styles.viewsTxt}>{item.views.toLocaleString()}</Text>
          </View>
          {item.link && (
            <View style={styles.linkIndicator}>
              <Ionicons name="open-outline" size={10} color="#FF9933" />
              <Text style={styles.linkIndicatorTxt}>Link</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={["#0A0F1C", "#0D1117"]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Announcements</Text>
          <Text style={styles.headerSub}>Government notices & schemes</Text>
        </View>
        {urgentCount > 0 && (
          <View style={styles.urgentBadge}>
            <Ionicons name="warning" size={12} color="#EF4444" />
            <Text style={styles.urgentBadgeTxt}>{urgentCount} Urgent</Text>
          </View>
        )}
      </View>

      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {FILTER_TYPES.map(f => {
          const count = f === "all" ? announcements.length : announcements.filter(a => a.type === f).length;
          const meta = f === "all" ? null : TYPE_META[f];
          const isActive = filter === f;
          return (
            <Pressable
              key={f}
              style={[
                styles.filterChip,
                isActive && styles.filterChipActive,
                isActive && meta && { borderColor: meta.color + "80", backgroundColor: meta.color + "15" },
              ]}
              onPress={() => setFilter(f)}
            >
              {meta && <Ionicons name={meta.icon as any} size={11} color={isActive ? meta.color : "#6B7280"} />}
              <Text style={[styles.filterChipTxt, isActive && meta && { color: meta.color }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
              {count > 0 && (
                <Text style={[styles.filterCount, isActive && meta && { color: meta.color }]}>{count}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#FF9933" />
          <Text style={styles.loadingTxt}>Fetching notices…</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📢</Text>
          <Text style={styles.emptyTitle}>No {filter === "all" ? "" : filter} notices</Text>
          <Text style={styles.emptyBody}>
            {filter === "all"
              ? "Department announcements will appear here."
              : "Try a different filter to see more notices."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF9933"
              colors={["#FF9933"]}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      {selected && (
        <AnnouncementDetailModal ann={selected} onClose={() => setSelected(null)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0F1C" },
  header: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
  },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#F1F5F9" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#4B5563", marginTop: 2 },
  urgentBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#EF444418", borderWidth: 1, borderColor: "#EF444445",
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
  },
  urgentBadgeTxt: { fontSize: 11, fontFamily: "Inter_700Bold", color: "#EF4444" },
  filterBar: { flexShrink: 0 },
  filterBarContent: { paddingHorizontal: 16, paddingBottom: 10, gap: 8, flexDirection: "row" },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 16,
    backgroundColor: "#0F172A", borderWidth: 1, borderColor: "#1F2937",
  },
  filterChipActive: { borderColor: "#FF993340", backgroundColor: "#FF993315" },
  filterChipTxt: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#6B7280" },
  filterCount: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#4B5563" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  loadingTxt: { marginTop: 12, fontSize: 13, fontFamily: "Inter_400Regular", color: "#4B5563" },
  emptyTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#374151", marginBottom: 8 },
  emptyBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151", textAlign: "center", lineHeight: 20 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: "#0F172A", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#1F2937",
  },
  cardUrgent: { borderColor: "#EF444440", backgroundColor: "#EF444408" },
  cardImportant: { borderColor: "#F59E0B30" },
  urgentBanner: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#EF444418", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: "flex-start", marginBottom: 8,
  },
  urgentBannerTxt: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#EF4444", letterSpacing: 0.5 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" },
  typeChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
  },
  typeChipTxt: { fontSize: 10, fontFamily: "Inter_700Bold" },
  priorityChip: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
  },
  priorityChipTxt: { fontSize: 9, fontFamily: "Inter_700Bold" },
  timeAgo: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#374151" },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#F1F5F9", lineHeight: 22, marginBottom: 6 },
  cardBody: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 18, marginBottom: 10 },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  deptRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  deptTxt: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#374151", flex: 1 },
  viewsRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewsTxt: { fontSize: 10, fontFamily: "Inter_400Regular", color: "#374151" },
  linkIndicator: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FF993318", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  linkIndicatorTxt: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#FF9933" },
});
