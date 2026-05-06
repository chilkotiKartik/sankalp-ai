import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, RefreshControl, Linking, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

interface EmergencyService {
  id: string;
  type: "police" | "hospital" | "fire" | "ambulance" | "disaster";
  name: string;
  district: string;
  address: string;
  phone: string;
  phone2?: string;
  beds?: number;
  available?: boolean;
  distance?: number;
  geo: { lat: number; lng: number };
}

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; bg: string }> = {
  police:    { icon: "shield",      color: "#3B82F6", label: "Police",    bg: "#EFF6FF" },
  hospital:  { icon: "medkit",      color: "#EF4444", label: "Hospital",  bg: "#FEF2F2" },
  fire:      { icon: "flame",       color: "#F97316", label: "Fire Stn",  bg: "#FFF7ED" },
  ambulance: { icon: "car",         color: "#8B5CF6", label: "Ambulance", bg: "#F5F3FF" },
  disaster:  { icon: "warning",     color: "#F59E0B", label: "SDRF/NDRF", bg: "#FFFBEB" },
};

const EMERGENCY_NUMBERS = [
  { label: "Police",      number: "100", icon: "shield" as const,       color: "#3B82F6" },
  { label: "Ambulance",   number: "108", icon: "car" as const,           color: "#EF4444" },
  { label: "Fire",        number: "101", icon: "flame" as const,         color: "#F97316" },
  { label: "Disaster",    number: "1070", icon: "warning" as const,      color: "#F59E0B" },
  { label: "Women Help",  number: "1090", icon: "female" as const,       color: "#EC4899" },
  { label: "Child Help",  number: "1098", icon: "happy" as const,        color: "#8B5CF6" },
  { label: "Water Emrg.", number: "1916", icon: "water" as const,        color: "#06B6D4" },
  { label: "COVID Help",  number: "104",  icon: "medical" as const,      color: "#00A651" },
];

function callNumber(phone: string) {
  Linking.openURL(`tel:${phone}`).catch(() => Alert.alert("Cannot make call", phone));
}

function ServiceCard({ service }: { service: EmergencyService }) {
  const meta = TYPE_META[service.type];
  return (
    <View style={cs.serviceCard}>
      <View style={[cs.serviceIconBox, { backgroundColor: meta.color + "22" }]}>
        <Ionicons name={meta.icon} size={22} color={meta.color} />
      </View>
      <View style={cs.serviceInfo}>
        <Text style={cs.serviceName} numberOfLines={1}>{service.name}</Text>
        <View style={cs.serviceRow}>
          <Ionicons name="location" size={11} color={Colors.textMuted} />
          <Text style={cs.serviceAddr} numberOfLines={1}>{service.address}, {service.district}</Text>
        </View>
        {service.beds !== undefined && (
          <View style={cs.serviceRow}>
            <Ionicons name="bed" size={11} color={Colors.textMuted} />
            <Text style={cs.serviceAddr}>{service.beds} beds</Text>
            {service.available !== undefined && (
              <View style={[cs.availBadge, { backgroundColor: service.available ? Colors.green + "22" : Colors.red + "22" }]}>
                <Text style={[cs.availText, { color: service.available ? Colors.green : Colors.red }]}>
                  {service.available ? "Available" : "Full"}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      <Pressable onPress={() => callNumber(service.phone)} style={[cs.callBtn, { backgroundColor: meta.color }]}>
        <Ionicons name="call" size={16} color="#FFF" />
      </Pressable>
    </View>
  );
}

export default function EmergencyScreen() {
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState<EmergencyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterDistrict, setFilterDistrict] = useState("all");

  const types = ["all", "police", "hospital", "fire", "ambulance", "disaster"];
  const districts = ["all", ...Array.from(new Set(services.map(s => s.district))).sort()];

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("token");
      const res = await fetch(`${getApiUrl()}api/emergency-services`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setServices(data);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = services.filter(s => {
    if (filterType !== "all" && s.type !== filterType) return false;
    if (filterDistrict !== "all" && s.district !== filterDistrict) return false;
    return true;
  });

  const grouped: Record<string, EmergencyService[]> = {};
  filtered.forEach(s => {
    if (!grouped[s.type]) grouped[s.type] = [];
    grouped[s.type].push(s);
  });

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#0D0008", Colors.bg]} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <Pressable onPress={() => router.back()} style={cs.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={cs.headerTitle}>
          <Text style={cs.headerTitleText}>Emergency Services</Text>
          <Text style={cs.headerSub}>Uttarakhand Directory</Text>
        </View>
        <View style={cs.emergencyBadge}>
          <Ionicons name="medkit" size={18} color={Colors.red} />
        </View>
      </View>

      {/* Quick Dial Numbers */}
      <View style={cs.quickDial}>
        <Text style={cs.quickDialTitle}>Quick Dial</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cs.quickDialRow}>
          {EMERGENCY_NUMBERS.map(n => (
            <Pressable key={n.number} onPress={() => callNumber(n.number)} style={cs.dialChip}>
              <LinearGradient colors={[n.color + "33", n.color + "11"]} style={cs.dialGradient}>
                <Ionicons name={n.icon} size={18} color={n.color} />
                <Text style={[cs.dialNumber, { color: n.color }]}>{n.number}</Text>
                <Text style={cs.dialLabel}>{n.label}</Text>
              </LinearGradient>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Type Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.filterScroll} contentContainerStyle={cs.filterRow}>
        {types.map(t => {
          const meta = t === "all" ? null : TYPE_META[t];
          return (
            <Pressable key={t} onPress={() => setFilterType(t)} style={[cs.filterChip, filterType === t && cs.filterChipActive]}>
              {meta && <Ionicons name={meta.icon} size={12} color={filterType === t ? meta.color : Colors.textMuted} />}
              <Text style={[cs.filterChipText, filterType === t && { color: Colors.saffron }]}>
                {t === "all" ? "All" : (meta?.label || t)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* District Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={[cs.filterRow, { paddingHorizontal: 16 }]}>
        {districts.slice(0, 8).map(d => (
          <Pressable key={d} onPress={() => setFilterDistrict(d)} style={[cs.districtChip, filterDistrict === d && cs.districtChipActive]}>
            <Text style={[cs.districtChipText, filterDistrict === d && cs.districtChipTextActive]}>
              {d === "all" ? "All Districts" : d}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={Colors.red} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.red} />}
          showsVerticalScrollIndicator={false}
        >
          {Object.entries(grouped).map(([type, svcs]) => {
            const meta = TYPE_META[type];
            if (!meta) return null;
            return (
              <View key={type} style={cs.section}>
                <View style={cs.sectionHeader}>
                  <View style={[cs.sectionIconBox, { backgroundColor: meta.color + "22" }]}>
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                  </View>
                  <Text style={[cs.sectionTitle, { color: meta.color }]}>{meta.label}s</Text>
                  <View style={[cs.countBadge, { backgroundColor: meta.color + "22" }]}>
                    <Text style={[cs.countText, { color: meta.color }]}>{svcs.length}</Text>
                  </View>
                </View>
                {svcs.map(s => <ServiceCard key={s.id} service={s} />)}
              </View>
            );
          })}

          {filtered.length === 0 && !loading && (
            <View style={cs.empty}>
              <Ionicons name="medical-outline" size={48} color={Colors.textMuted} />
              <Text style={cs.emptyText}>No services found</Text>
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
  emergencyBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.red + "22", alignItems: "center", justifyContent: "center" },

  quickDial: { paddingHorizontal: 16, marginBottom: 12 },
  quickDialTitle: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 },
  quickDialRow: { flexDirection: "row", gap: 8 },
  dialChip: { borderRadius: 12, overflow: "hidden" },
  dialGradient: { padding: 12, alignItems: "center", gap: 4, width: 76, borderRadius: 12, borderWidth: 1, borderColor: "transparent" },
  dialNumber: { fontSize: 16, fontWeight: "800" },
  dialLabel: { fontSize: 10, color: Colors.textMuted, textAlign: "center" },

  filterScroll: { marginBottom: 4 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },
  filterChipText: { fontSize: 12, color: Colors.textMuted, fontWeight: "500" },

  districtChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  districtChipActive: { backgroundColor: Colors.peacock + "22", borderColor: Colors.peacock },
  districtChipText: { fontSize: 11, color: Colors.textMuted },
  districtChipTextActive: { color: Colors.peacock, fontWeight: "700" },

  scroll: { padding: 16, gap: 0 },

  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionIconBox: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: "700" },
  countBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: "700" },

  serviceCard: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border },
  serviceIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  serviceInfo: { flex: 1, gap: 4 },
  serviceName: { fontSize: 13, fontWeight: "700", color: Colors.textPrimary },
  serviceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  serviceAddr: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  availBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  availText: { fontSize: 10, fontWeight: "600" },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});
