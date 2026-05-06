import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Platform, Animated, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import UttarakhandMap, { type MapFilter } from "@/components/UttarakhandMap";
import type { GeoPoint } from "@/context/AppContext";

const FILTERS: { key: MapFilter; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }[] = [
  { key: "all",        label: "All",     icon: "apps-outline",    color: "#6B7280", bg: "#F3F4F6" },
  { key: "complaints", label: "Issues",  icon: "alert-circle",    color: "#F59E0B", bg: "#FFFBEB" },
  { key: "sos",        label: "SOS",     icon: "warning",         color: "#EF4444", bg: "#FEF2F2" },
  { key: "workers",    label: "Workers", icon: "person-outline",  color: "#06B6D4", bg: "#F0FDFF" },
  { key: "police",     label: "Police",  icon: "shield-outline",  color: "#3B82F6", bg: "#EFF6FF" },
  { key: "risks",      label: "Risks",   icon: "flame-outline",   color: "#8B5CF6", bg: "#F5F3FF" },
];

const RISK_COLORS: Record<string, string> = {
  flood: "#3B82F6", garbage: "#00A651", infrastructure: "#F59E0B", crime: "#EF4444",
};

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { complaints, sosAlerts, workers, policeStations, riskZones, getStats } = useApp();
  const { user } = useAuth();
  const [filter, setFilter] = useState<MapFilter>("all");
  const [userGeo, setUserGeo] = useState<GeoPoint | null>(null);
  const [nearestPolice, setNearestPolice] = useState<typeof policeStations>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const statsAnim = useRef(new Animated.Value(0)).current;
  const stats = getStats();

  useEffect(() => {
    Animated.timing(statsAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const getLocation = async () => {
      setGeoLoading(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") throw new Error("denied");
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const geo: GeoPoint = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setUserGeo(geo);
        const withDist = policeStations
          .map(ps => ({ ...ps, distance: parseFloat((Math.sqrt((ps.geo.lat - geo.lat) ** 2 + (ps.geo.lng - geo.lng) ** 2) * 111).toFixed(2)) }))
          .sort((a, b) => a.distance - b.distance).slice(0, 3);
        setNearestPolice(withDist);
      } catch {
        if (cancelled) return;
        if (typeof navigator !== "undefined" && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => {
              if (cancelled) return;
              const geo: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setUserGeo(geo);
              const withDist = policeStations
                .map(ps => ({ ...ps, distance: parseFloat((Math.sqrt((ps.geo.lat - geo.lat) ** 2 + (ps.geo.lng - geo.lng) ** 2) * 111).toFixed(2)) }))
                .sort((a, b) => a.distance - b.distance).slice(0, 3);
              setNearestPolice(withDist);
            },
            () => setNearestPolice(policeStations.slice(0, 3)),
            { timeout: 5000 }
          );
        } else {
          setNearestPolice(policeStations.slice(0, 3));
        }
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    };
    getLocation();
    return () => { cancelled = true; };
  }, [policeStations]);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const botInset = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={ms.container}>
      {/* Header */}
      <LinearGradient
        colors={["#1A237E", "#283593", "#3949AB"]}
        style={[ms.header, { paddingTop: topInset + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={ms.headerBg} />
        <View style={ms.headerContent}>
          <View>
            <Text style={ms.headerTitle}>{user?.district || "Uttarakhand"} Map</Text>
            <View style={ms.liveRow}>
              <View style={ms.liveDot} />
              <Text style={ms.liveText}>{complaints.length} markers · Live</Text>
            </View>
          </View>
          <Animated.View style={[ms.headerStats, { opacity: statsAnim }]}>
            {[
              { val: stats.total, label: "Issues", color: "#FCD34D" },
              { val: stats.sos,   label: "SOS",    color: "#FC8181" },
              { val: stats.resolved, label: "Fixed", color: "#68D391" },
            ].map(s => (
              <View key={s.label} style={ms.statPill}>
                <Text style={[ms.statNum, { color: s.color }]}>{s.val}</Text>
                <Text style={ms.statLbl}>{s.label}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
      </LinearGradient>

      {/* Filter row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={ms.filterScroll} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingVertical: 10 }}>
        {FILTERS.map(f => (
          <Pressable key={f.key} onPress={() => setFilter(f.key)}
            style={[ms.filterPill, filter === f.key && { backgroundColor: f.bg, borderColor: f.color }]}
          >
            <Ionicons name={f.icon} size={13} color={filter === f.key ? f.color : "#9CA3AF"} />
            <Text style={[ms.filterText, filter === f.key && { color: f.color, fontFamily: "Inter_700Bold" }]}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Map */}
      <View style={ms.mapWrap}>
        <UttarakhandMap
          complaints={complaints}
          sosAlerts={sosAlerts}
          workers={workers}
          policeStations={policeStations}
          riskZones={riskZones}
          filter={filter}
          userLocation={userGeo}
          userDistrict={user?.district}
          style={StyleSheet.absoluteFill}
        />

        {/* Location pill */}
        <View style={ms.locPill}>
          {geoLoading
            ? <ActivityIndicator size="small" color="#FF9933" />
            : <Ionicons name={userGeo ? "location" : "location-outline"} size={12} color={userGeo ? "#00A651" : "#F59E0B"} />}
          <Text style={[ms.locText, { color: userGeo ? "#00A651" : "#F59E0B" }]}>
            {geoLoading ? "Locating..." : userGeo ? `${userGeo.lat.toFixed(3)}, ${userGeo.lng.toFixed(3)}` : "Location off"}
          </Text>
        </View>
      </View>

      {/* Bottom panel */}
      <View style={[ms.bottomPanel, { paddingBottom: botInset + 85 }]}>
        <Text style={ms.bottomTitle}>Nearest Police Stations & Risk Zones</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}>
          {(nearestPolice.length > 0 ? nearestPolice : policeStations.slice(0, 3)).map((ps, i) => (
            <View key={ps.id} style={[ms.psCard, i === 0 && nearestPolice.length > 0 && { borderColor: "#FFD07777" }]}>
              <View style={ms.psIconWrap}>
                <Ionicons name="shield" size={16} color="#3B82F6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={ms.psName} numberOfLines={1}>{ps.name}</Text>
                <Text style={ms.psPhone}>{ps.phone}</Text>
              </View>
              {(ps as any).distance != null && (
                <View style={ms.distPill}>
                  <Text style={ms.distText}>{(ps as any).distance}km</Text>
                </View>
              )}
            </View>
          ))}

          {riskZones.slice(0, 3).map(rz => (
            <View key={rz.id} style={[ms.psCard, { borderColor: (RISK_COLORS[rz.type] || "#9CA3AF") + "55" }]}>
              <View style={[ms.psIconWrap, { backgroundColor: (RISK_COLORS[rz.type] || "#9CA3AF") + "18" }]}>
                <Ionicons
                  name={rz.type === "flood" ? "water" : rz.type === "crime" ? "warning" : rz.type === "garbage" ? "trash" : "construct"}
                  size={16} color={RISK_COLORS[rz.type] || "#9CA3AF"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ms.psName, { color: RISK_COLORS[rz.type] }]}>{rz.type.toUpperCase()} RISK</Text>
                <Text style={ms.psPhone} numberOfLines={1}>{rz.description}</Text>
              </View>
              <View style={[ms.distPill, { backgroundColor: (RISK_COLORS[rz.type] || "#9CA3AF") + "18" }]}>
                <Text style={[ms.distText, { color: RISK_COLORS[rz.type] || "#9CA3AF" }]}>{rz.severity}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const ms = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  header: { paddingHorizontal: 20, paddingBottom: 16, overflow: "hidden" },
  headerBg: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.06)", top: -60, right: -30 },
  headerContent: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
  liveText: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular" },
  headerStats: { flexDirection: "row", gap: 6 },
  statPill: { backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  statNum: { fontSize: 14, fontFamily: "Inter_700Bold" },
  statLbl: { color: "rgba(255,255,255,0.7)", fontSize: 8, fontFamily: "Inter_400Regular", marginTop: 1 },
  filterScroll: { flexShrink: 0, maxHeight: 54, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  filterPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB" },
  filterText: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_500Medium" },
  mapWrap: { flex: 1, overflow: "hidden" },
  locPill: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 4 },
  locText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  bottomPanel: { backgroundColor: "#fff", paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E5E7EB" },
  bottomTitle: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1, paddingHorizontal: 16, marginBottom: 8, textTransform: "uppercase" },
  psCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#E5E7EB", width: 200, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  psIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  psName: { color: "#111827", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  psPhone: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  distPill: { backgroundColor: "#FFFBEB", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  distText: { color: "#F59E0B", fontSize: 10, fontFamily: "Inter_700Bold" },
});
