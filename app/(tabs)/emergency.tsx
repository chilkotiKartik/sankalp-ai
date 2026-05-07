import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView, Linking,
  Platform, ActivityIndicator, Modal, FlatList, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

const QUICK_DIAL = [
  { number: "112", label: "All Emergency", icon: "🆘", color: "#EF4444", bg: "#7F1D1D" },
  { number: "100", label: "Police", icon: "🚔", color: "#3B82F6", bg: "#1E3A5F" },
  { number: "108", label: "Ambulance", icon: "🚑", color: "#10B981", bg: "#064E3B" },
  { number: "101", label: "Fire Brigade", icon: "🔥", color: "#F59E0B", bg: "#78350F" },
  { number: "1070", label: "Disaster", icon: "🆘", color: "#DC2626", bg: "#7F1D1D" },
  { number: "1091", label: "Women Help", icon: "🛡️", color: "#8B5CF6", bg: "#4C1D95" },
];

const TYPE_FILTERS = [
  { key: "all",       label: "All",       icon: "apps",           color: "#9CA3AF" },
  { key: "hospital",  label: "Hospitals", icon: "medical",        color: "#EF4444" },
  { key: "fire",      label: "Fire",      icon: "flame",          color: "#F59E0B" },
  { key: "ambulance", label: "Ambulance", icon: "car",            color: "#10B981" },
  { key: "police",    label: "Police",    icon: "shield",         color: "#3B82F6" },
  { key: "disaster",  label: "Disaster",  icon: "warning",        color: "#DC2626" },
];

const TYPE_COLORS: Record<string, string> = {
  hospital: "#EF4444", fire: "#F59E0B", ambulance: "#10B981",
  police: "#3B82F6", disaster: "#DC2626",
};
const TYPE_ICONS: Record<string, string> = {
  hospital: "🏥", fire: "🔥", ambulance: "🚑", police: "🚔", disaster: "🆘",
};

interface Service {
  id: string; type: string; name: string; district: string;
  address: string; phone: string; phone2?: string;
  beds?: number; available?: boolean;
  geo: { lat: number; lng: number };
}

export default function EmergencyScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Service | null>(null);

  const load = useCallback(async () => {
    try {
      const t = token || await AsyncStorage.getItem("@sankalp_token");
      const base = getApiUrl();
      const res = await fetch(`${base}api/emergency-services`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (res.ok) { const d = await res.json(); setServices(Array.isArray(d) ? d : []); }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const filtered = services.filter(s => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.district.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const call = (num: string) => {
    Linking.openURL(`tel:${num}`).catch(() => {});
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 0 : insets.top }]}>
      {/* HEADER */}
      <LinearGradient colors={["#7F1D1D", "#991B1B", "#B91C1C"]} style={styles.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={styles.headerTitle}>🆘 Emergency Services</Text>
        <Text style={styles.headerSub}>Uttarakhand · Quick dial & nearest services</Text>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}>
        {/* QUICK DIAL */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>QUICK DIAL</Text>
          <View style={styles.quickGrid}>
            {QUICK_DIAL.map(qd => (
              <Pressable key={qd.number} onPress={() => call(qd.number)}
                style={[styles.quickCard, { backgroundColor: qd.bg + "DD", borderColor: qd.color + "44" }]}>
                <Text style={styles.quickIcon}>{qd.icon}</Text>
                <Text style={[styles.quickNum, { color: qd.color }]}>{qd.number}</Text>
                <Text style={styles.quickLabel}>{qd.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* IMPORTANT INFO */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={16} color="#93C5FD" />
          <Text style={styles.infoText}>
            <Text style={{ color: "#93C5FD", fontFamily: "Inter_700Bold" }}>112</Text> is the unified emergency number for all services in Uttarakhand.
          </Text>
        </View>

        {/* SERVICE DIRECTORY */}
        <View style={styles.sectionWrap}>
          <Text style={styles.sectionLabel}>SERVICE DIRECTORY</Text>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={16} color="#6B7280" />
            <TextInput style={styles.searchInput} placeholder="Search hospitals, fire stations…"
              placeholderTextColor="#6B7280" value={search} onChangeText={setSearch} />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={16} color="#6B7280" />
              </Pressable>
            )}
          </View>

          {/* Type Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
            {TYPE_FILTERS.map(f => (
              <Pressable key={f.key} onPress={() => setTypeFilter(f.key)}
                style={[styles.filterChip, typeFilter === f.key && { backgroundColor: f.color + "22", borderColor: f.color }]}>
                <Ionicons name={f.icon as any} size={13} color={typeFilter === f.key ? f.color : "#6B7280"} />
                <Text style={[styles.filterChipText, typeFilter === f.key && { color: f.color }]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator color="#EF4444" style={{ marginTop: 32 }} />
          ) : (
            <View style={{ gap: 10, marginTop: 10 }}>
              {filtered.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={{ fontSize: 36 }}>🏥</Text>
                  <Text style={styles.emptyText}>No services found</Text>
                </View>
              ) : (
                filtered.map(s => (
                  <Pressable key={s.id} onPress={() => setSelected(s)} style={styles.serviceCard}>
                    <View style={[styles.serviceIcon, { backgroundColor: (TYPE_COLORS[s.type] || "#6B7280") + "18" }]}>
                      <Text style={{ fontSize: 22 }}>{TYPE_ICONS[s.type] || "🏢"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Text style={styles.serviceName} numberOfLines={1}>{s.name}</Text>
                        {s.available === false && (
                          <View style={styles.unavailBadge}><Text style={styles.unavailText}>UNAVAIL</Text></View>
                        )}
                        {s.available === true && s.type === "hospital" && (
                          <View style={styles.availBadge}><Text style={styles.availText}>OPEN</Text></View>
                        )}
                      </View>
                      <Text style={styles.serviceDistrict}>{s.district}</Text>
                      {s.beds && <Text style={styles.serviceDetail}>🛏️ {s.beds} beds</Text>}
                      <Text style={styles.serviceAddress} numberOfLines={1}>{s.address}</Text>
                    </View>
                    <View style={styles.serviceActions}>
                      <Pressable onPress={() => call(s.phone)} style={styles.callBtn}>
                        <Ionicons name="call" size={14} color="#10B981" />
                      </Pressable>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
      </ScrollView>

      {/* SERVICE DETAIL MODAL */}
      {selected && (
        <Modal visible animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setSelected(null)} />
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <LinearGradient
                colors={[(TYPE_COLORS[selected.type] || "#6B7280") + "22", (TYPE_COLORS[selected.type] || "#6B7280") + "08"]}
                style={styles.modalHeader}>
                <View style={[styles.modalIcon, { backgroundColor: (TYPE_COLORS[selected.type] || "#6B7280") + "18" }]}>
                  <Text style={{ fontSize: 32 }}>{TYPE_ICONS[selected.type] || "🏢"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalType}>{selected.type.toUpperCase()}</Text>
                  <Text style={styles.modalName}>{selected.name}</Text>
                  <Text style={styles.modalDistrict}>{selected.district}</Text>
                </View>
              </LinearGradient>

              <View style={styles.modalBody}>
                <View style={styles.modalRow}>
                  <Ionicons name="location-outline" size={16} color="#9CA3AF" />
                  <Text style={styles.modalRowText}>{selected.address}</Text>
                </View>
                {selected.beds && (
                  <View style={styles.modalRow}>
                    <Ionicons name="bed-outline" size={16} color="#9CA3AF" />
                    <Text style={styles.modalRowText}>{selected.beds} beds capacity</Text>
                  </View>
                )}
                {selected.available !== undefined && (
                  <View style={styles.modalRow}>
                    <Ionicons name="checkmark-circle-outline" size={16}
                      color={selected.available ? "#10B981" : "#EF4444"} />
                    <Text style={[styles.modalRowText, { color: selected.available ? "#10B981" : "#EF4444" }]}>
                      {selected.available ? "Currently operational" : "Currently unavailable"}
                    </Text>
                  </View>
                )}
                <View style={styles.modalRow}>
                  <Ionicons name="navigate-outline" size={16} color="#9CA3AF" />
                  <Text style={styles.modalRowText}>
                    {selected.geo.lat.toFixed(4)}°N, {selected.geo.lng.toFixed(4)}°E
                  </Text>
                </View>

                <View style={styles.modalBtns}>
                  <Pressable style={[styles.modalCallBtn, { flex: 1 }]} onPress={() => call(selected.phone)}>
                    <Ionicons name="call" size={18} color="#fff" />
                    <Text style={styles.modalCallText}>Call {selected.phone}</Text>
                  </Pressable>
                  {selected.phone2 && (
                    <Pressable style={[styles.modalCallBtn, { flex: 1, backgroundColor: "#1E3A5F" }]}
                      onPress={() => call(selected.phone2!)}>
                      <Ionicons name="call-outline" size={18} color="#93C5FD" />
                      <Text style={[styles.modalCallText, { color: "#93C5FD" }]}>{selected.phone2}</Text>
                    </Pressable>
                  )}
                </View>
                <Pressable style={styles.mapsBtn}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${selected.geo.lat},${selected.geo.lng}`)}>
                  <Ionicons name="map-outline" size={16} color="#FF9933" />
                  <Text style={styles.mapsBtnText}>Open in Maps</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0F1C" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionWrap: { paddingHorizontal: 16, paddingTop: 18 },
  sectionLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginBottom: 12, textTransform: "uppercase" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickCard: {
    width: "30.5%", borderRadius: 14, padding: 14, alignItems: "center", gap: 4,
    borderWidth: 1,
  },
  quickIcon: { fontSize: 24 },
  quickNum: { fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 24 },
  quickLabel: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_500Medium", textAlign: "center" },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: "#1E3A5F", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#1E40AF30",
  },
  infoText: { flex: 1, color: "#93C5FD", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#1F2937", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "#374151", marginBottom: 12,
  },
  searchInput: { flex: 1, color: "#F9FAFB", fontSize: 14, fontFamily: "Inter_400Regular" },
  filterRow: { marginBottom: 4 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 14,
    borderWidth: 1, borderColor: "#374151", backgroundColor: "#1F2937", marginRight: 6,
  },
  filterChipText: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { color: "#6B7280", fontSize: 14, fontFamily: "Inter_500Medium" },
  serviceCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#111827", borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: "#1F2937",
  },
  serviceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  serviceName: { color: "#F9FAFB", fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  serviceDistrict: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  serviceDetail: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular" },
  serviceAddress: { color: "#4B5563", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  serviceActions: { flexShrink: 0 },
  callBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#064E3B", borderWidth: 1, borderColor: "#10B98130",
    alignItems: "center", justifyContent: "center",
  },
  availBadge: { backgroundColor: "#064E3B", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  availText: { color: "#10B981", fontSize: 8, fontFamily: "Inter_700Bold" },
  unavailBadge: { backgroundColor: "#450A0A", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unavailText: { color: "#EF4444", fontSize: 8, fontFamily: "Inter_700Bold" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.75)" },
  modalCard: { backgroundColor: "#111827", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  modalHandle: { width: 40, height: 4, backgroundColor: "#374151", borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 2 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20 },
  modalIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  modalType: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  modalName: { color: "#F9FAFB", fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
  modalDistrict: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" },
  modalBody: { padding: 20, gap: 12 },
  modalRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  modalRowText: { flex: 1, color: "#D1D5DB", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  modalCallBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#1B3D1B", borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16, justifyContent: "center",
    borderWidth: 1, borderColor: "#10B98130",
  },
  modalCallText: { color: "#10B981", fontSize: 14, fontFamily: "Inter_700Bold" },
  mapsBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
    backgroundColor: "#1F2937", borderRadius: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: "#374151",
  },
  mapsBtnText: { color: "#FF9933", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
