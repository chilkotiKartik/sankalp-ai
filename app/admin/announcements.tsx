import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, Platform,
  Modal, TextInput, ScrollView, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useApp, type Announcement, type AnnouncementType } from "@/context/AppContext";
import Colors from "@/constants/colors";

const TYPE_META: Record<AnnouncementType, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  general:   { icon: "information-circle", color: Colors.blue,    label: "General" },
  scheme:    { icon: "ribbon",             color: Colors.green,   label: "Scheme" },
  emergency: { icon: "warning",            color: "#EF4444",      label: "Emergency" },
  welfare:   { icon: "heart",              color: "#8B5CF6",      label: "Welfare" },
  tender:    { icon: "document-text",      color: Colors.amber,   label: "Tender" },
  holiday:   { icon: "calendar",           color: Colors.cyan,    label: "Holiday" },
};

const PRIORITY_META = {
  normal:    { color: Colors.blue,  label: "Normal" },
  important: { color: Colors.amber, label: "Important" },
  urgent:    { color: "#EF4444",    label: "Urgent" },
};

const ANN_TYPES: AnnouncementType[] = ["general", "scheme", "emergency", "welfare", "tender", "holiday"];
const PRIORITIES = ["normal", "important", "urgent"] as const;

function PostModal({ visible, onClose, onPost }: {
  visible: boolean;
  onClose: () => void;
  onPost: (data: Partial<Announcement>) => Promise<any>;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [type, setType] = useState<AnnouncementType>("general");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState<"normal" | "important" | "urgent">("normal");
  const [isPosting, setIsPosting] = useState(false);

  const resetForm = () => { setTitle(""); setBody(""); setType("general"); setDepartment(""); setPriority("normal"); };

  const handlePost = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing Fields", "Title and message are required.");
      return;
    }
    setIsPosting(true);
    try {
      await onPost({ title: title.trim(), body: body.trim(), type, department: department.trim() || "Government of Uttarakhand", priority });
      resetForm();
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to post announcement");
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.postCard} onPress={e => e.stopPropagation?.()}>
          <View style={styles.postHeader}>
            <Ionicons name="megaphone" size={22} color={Colors.green} />
            <Text style={styles.postTitle}>New Announcement</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={Colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Free Health Camp — Rohini Sector 15"
              placeholderTextColor={Colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
              placeholder="Describe the announcement..."
              placeholderTextColor={Colors.textMuted}
              value={body}
              onChangeText={setBody}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.fieldLabel}>Department</Text>
            <TextInput
              style={styles.input}
              placeholder="Government of Uttarakhand"
              placeholderTextColor={Colors.textMuted}
              value={department}
              onChangeText={setDepartment}
            />

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.typeGrid}>
              {ANN_TYPES.map(t => {
                const meta = TYPE_META[t];
                const selected = type === t;
                return (
                  <Pressable key={t} onPress={() => setType(t)} style={[styles.typeChip, selected && { backgroundColor: meta.color + "22", borderColor: meta.color + "55" }]}>
                    <Ionicons name={meta.icon} size={14} color={selected ? meta.color : Colors.textMuted} />
                    <Text style={[styles.typeChipText, selected && { color: meta.color }]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map(p => {
                const meta = PRIORITY_META[p];
                const selected = priority === p;
                return (
                  <Pressable key={p} onPress={() => setPriority(p)} style={[styles.priChip, selected && { backgroundColor: meta.color + "22", borderColor: meta.color + "55" }]}>
                    <Text style={[styles.priChipText, selected && { color: meta.color }]}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={handlePost} disabled={isPosting} style={[styles.postBtn, !title.trim() && { opacity: 0.5 }]}>
              {isPosting
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="megaphone" size={16} color="#fff" /><Text style={styles.postBtnText}>Publish Announcement</Text></>}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AnnouncementCard({ ann, onDelete }: { ann: Announcement; onDelete: (id: string) => void }) {
  const meta = TYPE_META[ann.type] || TYPE_META.general;
  const priMeta = PRIORITY_META[ann.priority] || PRIORITY_META.normal;
  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const confirmDelete = () => {
    Alert.alert("Delete Announcement", `Delete "${ann.title}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(ann.id) },
    ]);
  };

  return (
    <View style={[styles.annCard, ann.priority === "urgent" && { borderColor: "#EF444433" }]}>
      <View style={styles.annTop}>
        <View style={[styles.typeIcon, { backgroundColor: meta.color + "22" }]}>
          <Ionicons name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <View style={[styles.typeBadge, { backgroundColor: meta.color + "22" }]}>
              <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: priMeta.color + "22" }]}>
              <Text style={[styles.typeBadgeText, { color: priMeta.color }]}>{priMeta.label}</Text>
            </View>
          </View>
          <Text style={styles.annTitle}>{ann.title}</Text>
          <Text style={styles.annDept}>{ann.department}</Text>
        </View>
        <Pressable onPress={confirmDelete} style={styles.deleteBtn} hitSlop={10}>
          <Ionicons name="trash-outline" size={16} color="#EF4444" />
        </Pressable>
      </View>
      <Text style={styles.annBody} numberOfLines={3}>{ann.body}</Text>
      <View style={styles.annFooter}>
        <Ionicons name="time-outline" size={11} color={Colors.textMuted} />
        <Text style={styles.annMeta}>{timeAgo(ann.postedAt)}</Text>
        <Ionicons name="eye-outline" size={11} color={Colors.textMuted} />
        <Text style={styles.annMeta}>{ann.views} views</Text>
        <Ionicons name="person-outline" size={11} color={Colors.textMuted} />
        <Text style={styles.annMeta}>{ann.postedBy}</Text>
      </View>
    </View>
  );
}

export default function AdminAnnouncements() {
  const insets = useSafeAreaInsets();
  const { announcements, postAnnouncement, deleteAnnouncement } = useApp();
  const [showPost, setShowPost] = useState(false);
  const [filterType, setFilterType] = useState<AnnouncementType | "all">("all");

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : 0;

  const filtered = filterType === "all" ? announcements : announcements.filter(a => a.type === filterType);

  const handleDelete = useCallback(async (id: string) => {
    try { await deleteAnnouncement(id); } catch (e: any) { Alert.alert("Error", e.message); }
  }, [deleteAnnouncement]);

  const urgentCount = announcements.filter(a => a.priority === "urgent").length;
  const totalViews = announcements.reduce((s, a) => s + a.views, 0);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={Colors.textMuted} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Announcements</Text>
          <Text style={styles.headerSub}>{announcements.length} active · {totalViews.toLocaleString()} total views</Text>
        </View>
        <Pressable onPress={() => setShowPost(true)} style={styles.fabBtn}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.fabText}>Post</Text>
        </Pressable>
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        {[
          { label: "Total", value: announcements.length, color: Colors.blue },
          { label: "Urgent", value: urgentCount, color: "#EF4444" },
          { label: "Total Views", value: `${Math.round(totalViews / 1000)}K`, color: Colors.green },
          { label: "Types", value: new Set(announcements.map(a => a.type)).size, color: Colors.cyan },
        ].map(s => (
          <View key={s.label} style={styles.summaryCard}>
            <Text style={[styles.summaryVal, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.summaryLbl}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <Pressable onPress={() => setFilterType("all")} style={[styles.filterChip, filterType === "all" && styles.filterChipActive]}>
          <Text style={[styles.filterText, filterType === "all" && styles.filterTextActive]}>All</Text>
        </Pressable>
        {ANN_TYPES.map(t => {
          const meta = TYPE_META[t];
          const selected = filterType === t;
          return (
            <Pressable key={t} onPress={() => setFilterType(t)} style={[styles.filterChip, selected && { backgroundColor: meta.color + "22", borderColor: meta.color + "55" }]}>
              <Ionicons name={meta.icon} size={12} color={selected ? meta.color : Colors.textMuted} />
              <Text style={[styles.filterText, selected && { color: meta.color, fontFamily: "Inter_600SemiBold" }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <AnnouncementCard ann={item} onDelete={handleDelete} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomInset + 30 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="megaphone-outline" size={36} color={Colors.textMuted} />
            <Text style={styles.emptyTitle}>No announcements yet</Text>
            <Text style={styles.emptySub}>Tap "Post" to publish a new announcement for Uttarakhand citizens</Text>
            <Pressable onPress={() => setShowPost(true)} style={styles.emptyBtn}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Post First Announcement</Text>
            </Pressable>
          </View>
        }
      />

      <PostModal visible={showPost} onClose={() => setShowPost(false)} onPost={postAnnouncement} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8, gap: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.textPrimary },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  fabBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.green, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  fabText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  summaryRow: { flexDirection: "row", marginHorizontal: 16, backgroundColor: Colors.bgCard, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  summaryCard: { flex: 1, alignItems: "center", padding: 12 },
  summaryVal: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLbl: { fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 2 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 6, alignItems: "center" },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.greenBg, borderColor: Colors.green + "55" },
  filterText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  filterTextActive: { color: Colors.green, fontFamily: "Inter_600SemiBold" },
  annCard: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  annTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  annTitle: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  annDept: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" },
  deleteBtn: { padding: 4 },
  annBody: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 },
  annFooter: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" },
  annMeta: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginRight: 6 },
  empty: { alignItems: "center", paddingVertical: 80, paddingHorizontal: 32, gap: 10 },
  emptyTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.green, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginTop: 8 },
  emptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  // Post modal
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  postCard: { backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: Colors.border, maxHeight: "90%" },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  postTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", flex: 1 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bg, alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: Colors.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, color: "#fff", fontSize: 13, fontFamily: "Inter_400Regular" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  typeChipText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  priorityRow: { flexDirection: "row", gap: 8 },
  priChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  priChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textMuted },
  postBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.green, borderRadius: 14, padding: 15, marginTop: 20, marginBottom: 8 },
  postBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
