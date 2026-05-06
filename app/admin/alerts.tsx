import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, Platform, Animated,
  Linking, Modal, Vibration,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useApp, type SOSAlert } from "@/context/AppContext";

const SOS_META: Record<string, { label: string; icon: string; color: string; priority: string }> = {
  gas_leak:        { label: "Gas Leak",        icon: "🔴", color: "#F59E0B", priority: "P1-CRITICAL" },
  water_burst:     { label: "Water Burst",     icon: "💧", color: "#3B82F6", priority: "P1-HIGH" },
  electric_hazard: { label: "Electric Hazard", icon: "⚡", color: "#EF4444", priority: "P1-CRITICAL" },
  fire_risk:       { label: "Fire Risk",       icon: "🔥", color: "#EF4444", priority: "P1-CRITICAL" },
  road_accident:   { label: "Road Accident",   icon: "🚗", color: "#F59E0B", priority: "P1-HIGH" },
  women_safety:    { label: "Women Safety",    icon: "🛡️", color: "#8B5CF6", priority: "P1-CRITICAL" },
  medical:         { label: "Medical",         icon: "🏥", color: "#22C55E", priority: "P1-HIGH" },
  infrastructure:  { label: "Infrastructure",  icon: "🏗️", color: "#6B7280", priority: "P2-MEDIUM" },
};

// ── LIVE BADGE ──────────────────────────────────────────────────────────────
function LiveBadge({ updatedAt }: { updatedAt?: string }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.2, duration: 500, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  if (!updatedAt) return null;
  const sAgo = Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000);
  const isLive = sAgo < 90;
  return (
    <View style={[lbs.pill, { backgroundColor: isLive ? "#14532D" : "#1F2937" }]}>
      <Animated.View style={[lbs.dot, { opacity: isLive ? pulse : 1, backgroundColor: isLive ? "#4ADE80" : "#9CA3AF" }]} />
      <Text style={[lbs.text, { color: isLive ? "#4ADE80" : "#9CA3AF" }]}>
        {isLive ? `LIVE · ${sAgo}s` : `${Math.round(sAgo / 60)}m ago`}
      </Text>
    </View>
  );
}
const lbs = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 9, fontFamily: "Inter_700Bold" },
});

// ── FULL REPORT MODAL ────────────────────────────────────────────────────────
function ReportModal({ alert, visible, onClose, onResolve }: {
  alert: SOSAlert | null; visible: boolean; onClose: () => void; onResolve: () => void;
}) {
  if (!alert) return null;
  const meta = SOS_META[alert.category] || { label: alert.category, icon: "🚨", color: "#EF4444", priority: "P1-CRITICAL" };
  const statusColor = { active: "#EF4444", responding: "#F59E0B", resolved: "#22C55E" }[alert.status] || "#6B7280";
  const liveGeo = alert.liveGeo || alert.geo;
  const triggeredTime = new Date(alert.triggeredAt);
  const resolvedTime = alert.resolvedAt ? new Date(alert.resolvedAt) : null;
  const duration = resolvedTime
    ? Math.round((resolvedTime.getTime() - triggeredTime.getTime()) / 60000)
    : Math.round((Date.now() - triggeredTime.getTime()) / 60000);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={rm.overlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={rm.sheet}>
          <View style={rm.handle} />
          {/* Header */}
          <LinearGradient colors={["#1A0000", "#3D0000"]} style={rm.head}>
            <View style={rm.headLeft}>
              <Text style={{ fontSize: 32 }}>{meta.icon}</Text>
              <View>
                <Text style={rm.headTitle}>SOS Incident Report</Text>
                <Text style={rm.headSub}>ID: {alert.id.slice(0, 12).toUpperCase()}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={rm.closeBtn}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </Pressable>
          </LinearGradient>

          <ScrollView showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>

            {/* Status row */}
            <View style={rm.statusRow}>
              <View style={[rm.statusChip, { backgroundColor: statusColor + "22", borderColor: statusColor + "44" }]}>
                <View style={[rm.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[rm.statusText, { color: statusColor }]}>{alert.status.toUpperCase()}</Text>
              </View>
              <View style={[rm.priorityChip, { backgroundColor: meta.color + "22" }]}>
                <Text style={[rm.priorityText, { color: meta.color }]}>{meta.priority}</Text>
              </View>
              <Text style={[rm.catText, { color: meta.color }]}>{meta.label}</Text>
              {alert.isWomenSafety && (
                <View style={rm.womenChip}>
                  <Text style={rm.womenChipText}>🛡️ WOMEN SAFETY</Text>
                </View>
              )}
            </View>

            {/* Timeline */}
            <View style={rm.section}>
              <Text style={rm.sectionLabel}>TIMELINE</Text>
              <View style={rm.timelineRow}>
                <View style={rm.timelineDot} />
                <View>
                  <Text style={rm.timelineLabel}>SOS Triggered</Text>
                  <Text style={rm.timelineVal}>
                    {triggeredTime.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                  </Text>
                </View>
              </View>
              {alert.liveUpdatedAt && (
                <View style={rm.timelineRow}>
                  <View style={[rm.timelineDot, { backgroundColor: "#4ADE80" }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={rm.timelineLabel}>Last Live GPS Update</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={rm.timelineVal}>
                        {new Date(alert.liveUpdatedAt).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                      </Text>
                      <LiveBadge updatedAt={alert.liveUpdatedAt} />
                    </View>
                  </View>
                </View>
              )}
              {resolvedTime && (
                <View style={rm.timelineRow}>
                  <View style={[rm.timelineDot, { backgroundColor: "#22C55E" }]} />
                  <View>
                    <Text style={rm.timelineLabel}>Resolved</Text>
                    <Text style={rm.timelineVal}>
                      {resolvedTime.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                    </Text>
                  </View>
                </View>
              )}
              <View style={rm.durationRow}>
                <Ionicons name="time-outline" size={13} color={Colors.textMuted} />
                <Text style={rm.durationText}>
                  {resolvedTime ? `Resolved in ${duration} min` : `Active for ${duration} min`}
                </Text>
              </View>
            </View>

            {/* Description */}
            <View style={rm.section}>
              <Text style={rm.sectionLabel}>EMERGENCY DESCRIPTION</Text>
              <View style={rm.descBox}>
                <Text style={rm.descText}>{alert.description}</Text>
              </View>
            </View>

            {/* GPS / Location */}
            <View style={rm.section}>
              <Text style={rm.sectionLabel}>LOCATION & GPS</Text>
              <View style={rm.gpsBox}>
                <View style={rm.gpsCoordRow}>
                  <View style={rm.gpsDot} />
                  <Text style={rm.gpsCoordsText}>
                    {liveGeo.lat.toFixed(6)}°N, {liveGeo.lng.toFixed(6)}°E
                  </Text>
                  <LiveBadge updatedAt={alert.liveUpdatedAt || alert.triggeredAt} />
                </View>
                <Text style={rm.gpsAddrText}>{alert.location}</Text>
                <View style={rm.gpsActions}>
                  <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${liveGeo.lat},${liveGeo.lng}`)}
                    style={rm.mapsBtn}>
                    <Ionicons name="map" size={14} color="#4ADE80" />
                    <Text style={rm.mapsBtnText}>Open in Google Maps</Text>
                  </Pressable>
                  <Pressable onPress={() => Linking.openURL(`https://waze.com/ul?ll=${liveGeo.lat},${liveGeo.lng}&navigate=yes`)}
                    style={rm.wazeBtn}>
                    <Ionicons name="navigate" size={14} color="#3B82F6" />
                    <Text style={rm.wazeBtnText}>Navigate (Waze)</Text>
                  </Pressable>
                </View>
              </View>
              {/* Original vs live GPS diff */}
              {alert.liveGeo && (alert.liveGeo.lat !== alert.geo.lat || alert.liveGeo.lng !== alert.geo.lng) && (
                <View style={rm.origGpsRow}>
                  <Text style={rm.origGpsLabel}>📍 Original trigger point: </Text>
                  <Text style={rm.origGpsVal}>{alert.geo.lat.toFixed(5)}, {alert.geo.lng.toFixed(5)}</Text>
                </View>
              )}
            </View>

            {/* Notified Police Stations */}
            <View style={rm.section}>
              <Text style={rm.sectionLabel}>POLICE STATIONS NOTIFIED ({(alert.notifiedStations || []).length})</Text>
              {(alert.notifiedStations || (alert.nearestPoliceStation ? [{ name: alert.nearestPoliceStation, phone: alert.nearestPolicePhone || "100", distance: alert.policeDistance || 0, address: "" }] : [])).map((ps, i) => (
                <View key={i} style={[rm.psRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                  <View style={[rm.psRank, { backgroundColor: i === 0 ? "#EF444422" : Colors.bgCardAlt }]}>
                    <Text style={{ color: i === 0 ? "#EF4444" : Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 12 }}>#{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={rm.psName}>{ps.name}</Text>
                    {ps.address ? <Text style={rm.psAddr}>{ps.address}</Text> : null}
                    <Text style={[rm.psAddr, { color: "#F59E0B" }]}>{ps.distance} km from incident</Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6 }}>
                    <Pressable onPress={() => Linking.openURL(`tel:${ps.phone}`)} style={rm.callBtn}>
                      <Ionicons name="call" size={12} color="#fff" />
                      <Text style={rm.callBtnText}>{ps.phone}</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            {/* Reporter info */}
            {(alert.triggeredBy || alert.triggeredByPhone) && (
              <View style={rm.section}>
                <Text style={rm.sectionLabel}>REPORTER DETAILS</Text>
                <View style={rm.reporterBox}>
                  <View style={rm.reporterAvatar}>
                    <Text style={{ fontSize: 22 }}>👤</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={rm.reporterName}>{alert.triggeredBy || "Citizen"}</Text>
                    {alert.triggeredByPhone && (
                      <Text style={rm.reporterPhone}>📱 {alert.triggeredByPhone}</Text>
                    )}
                    {alert.isWomenSafety && (
                      <View style={rm.womenFlag}>
                        <Ionicons name="shield-checkmark" size={11} color="#8B5CF6" />
                        <Text style={rm.womenFlagText}>Women Safety SOS — Silent panic mode activated</Text>
                      </View>
                    )}
                  </View>
                  {alert.triggeredByPhone && (
                    <Pressable onPress={() => Linking.openURL(`tel:${alert.triggeredByPhone}`)} style={rm.callCitizenBtn}>
                      <Ionicons name="call" size={14} color="#3B82F6" />
                      <Text style={rm.callCitizenText}>Call</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Admin actions */}
            {alert.status !== "resolved" && (
              <View style={rm.section}>
                <Text style={rm.sectionLabel}>ADMIN ACTIONS</Text>
                <View style={rm.adminActions}>
                  <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${liveGeo.lat},${liveGeo.lng}`)}
                    style={rm.adminBtn}>
                    <Ionicons name="map-outline" size={16} color="#4ADE80" />
                    <Text style={[rm.adminBtnText, { color: "#4ADE80" }]}>Live Map</Text>
                  </Pressable>
                  <Pressable onPress={() => Linking.openURL(`tel:${alert.nearestPolicePhone || "100"}`)}
                    style={[rm.adminBtn, { backgroundColor: "#F59E0B22" }]}>
                    <Ionicons name="shield" size={16} color="#F59E0B" />
                    <Text style={[rm.adminBtnText, { color: "#F59E0B" }]}>Police</Text>
                  </Pressable>
                  {alert.triggeredByPhone && (
                    <Pressable onPress={() => Linking.openURL(`tel:${alert.triggeredByPhone}`)}
                      style={[rm.adminBtn, { backgroundColor: "#3B82F622" }]}>
                      <Ionicons name="person" size={16} color="#3B82F6" />
                      <Text style={[rm.adminBtnText, { color: "#3B82F6" }]}>Citizen</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={() => { onResolve(); onClose(); }}
                    style={[rm.adminBtn, { backgroundColor: "#22C55E22" }]}>
                    <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    <Text style={[rm.adminBtnText, { color: "#22C55E" }]}>Resolve</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const rm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.7)" },
  sheet: { backgroundColor: Colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  headLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  headTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  headSub: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2, letterSpacing: 0.5 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.border },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  priorityChip: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  priorityText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  catText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  womenChip: { backgroundColor: "#8B5CF622", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  womenChipText: { color: "#8B5CF6", fontSize: 10, fontFamily: "Inter_700Bold" },
  section: { paddingTop: 18 },
  sectionLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 10 },
  timelineRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#EF4444", marginTop: 3 },
  timelineLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  timelineVal: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  durationRow: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.bgCard, borderRadius: 8, padding: 8, marginTop: 4 },
  durationText: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },
  descBox: { backgroundColor: Colors.bgCard, borderRadius: 12, padding: 12 },
  descText: { color: "#D1D5DB", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  gpsBox: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14 },
  gpsCoordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  gpsDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ADE80" },
  gpsCoordsText: { color: "#4ADE80", fontSize: 13, fontFamily: "Inter_700Bold", flex: 1 },
  gpsAddrText: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 12 },
  gpsActions: { flexDirection: "row", gap: 8 },
  mapsBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#14532D", borderRadius: 10, paddingVertical: 8 },
  mapsBtnText: { color: "#4ADE80", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  wazeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#1E3A5F", borderRadius: 10, paddingVertical: 8 },
  wazeBtnText: { color: "#3B82F6", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  origGpsRow: { flexDirection: "row", alignItems: "center", marginTop: 8, backgroundColor: Colors.bgCard, borderRadius: 8, padding: 8 },
  origGpsLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  origGpsVal: { color: "#D1D5DB", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  psRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, backgroundColor: Colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 8 },
  psRank: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  psName: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  psAddr: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EF4444", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  callBtnText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  reporterBox: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14 },
  reporterAvatar: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.bgCardAlt, alignItems: "center", justifyContent: "center" },
  reporterName: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  reporterPhone: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  womenFlag: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  womenFlagText: { color: "#8B5CF6", fontSize: 10, fontFamily: "Inter_500Medium" },
  callCitizenBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#3B82F622", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  callCitizenText: { color: "#3B82F6", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  adminActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  adminBtn: { flex: 1, minWidth: 70, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#14532D", borderRadius: 12, paddingVertical: 12 },
  adminBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ── ALERT CARD ───────────────────────────────────────────────────────────────
function AlertCard({ alert, onResolve, onViewReport }: {
  alert: SOSAlert; onResolve: () => void; onViewReport: () => void;
}) {
  const meta = SOS_META[alert.category] || { label: alert.category, icon: "🚨", color: "#EF4444", priority: "P1-CRITICAL" };
  const statusColor = { active: "#EF4444", responding: "#F59E0B", resolved: "#22C55E" }[alert.status] || "#6B7280";
  const liveGeo = alert.liveGeo || alert.geo;
  const flashAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (alert.status !== "active") return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0.4, duration: 700, useNativeDriver: false }),
      Animated.timing(flashAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [alert.status]);

  const triggeredTime = new Date(alert.triggeredAt);
  return (
    <Animated.View style={[ac.card, { borderColor: meta.color + (alert.status === "active" ? "60" : "25"), opacity: alert.status === "active" ? flashAnim : 1 }]}>
      {/* Top row */}
      <View style={ac.top}>
        <View style={[ac.iconWrap, { backgroundColor: meta.color + "18" }]}>
          <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={ac.badges}>
            <View style={[ac.statusChip, { backgroundColor: statusColor + "22", borderColor: statusColor + "50", borderWidth: 1 }]}>
              <View style={[ac.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[ac.statusText, { color: statusColor }]}>{alert.status.toUpperCase()}</Text>
            </View>
            <View style={[ac.priorityChip, { backgroundColor: meta.color + "18" }]}>
              <Text style={[ac.priorityText, { color: meta.color }]}>{meta.priority}</Text>
            </View>
            {alert.isWomenSafety && <Text style={ac.womenTag}>🛡️ WOMEN</Text>}
          </View>
          <Text style={ac.catLabel}>{meta.label}</Text>
          <Text style={ac.desc} numberOfLines={1}>{alert.description}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          <Text style={ac.time}>{triggeredTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}</Text>
          <Text style={ac.date}>{triggeredTime.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
        </View>
      </View>

      {/* GPS row */}
      <View style={ac.gpsRow}>
        <View style={ac.gpsDotGreen} />
        <Text style={ac.coordText}>{liveGeo.lat.toFixed(5)}°N, {liveGeo.lng.toFixed(5)}°E</Text>
        <LiveBadge updatedAt={alert.liveUpdatedAt || alert.triggeredAt} />
      </View>

      {/* Police notified */}
      {(alert.notifiedStations || []).length > 0 && (
        <View style={ac.policeRow}>
          <Ionicons name="shield" size={12} color="#F59E0B" />
          <Text style={ac.policeText} numberOfLines={1}>
            Notified: {(alert.notifiedStations || []).map(ps => `${ps.name} (${ps.distance}km)`).join(" & ")}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={ac.actions}>
        <Pressable onPress={onViewReport} style={[ac.actionBtn, { backgroundColor: "#3B82F622" }]}>
          <Ionicons name="document-text" size={13} color="#3B82F6" />
          <Text style={[ac.actionText, { color: "#3B82F6" }]}>Full Report</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${liveGeo.lat},${liveGeo.lng}`)}
          style={[ac.actionBtn, { backgroundColor: "#14532D" }]}>
          <Ionicons name="map" size={13} color="#4ADE80" />
          <Text style={[ac.actionText, { color: "#4ADE80" }]}>Maps</Text>
        </Pressable>
        {alert.nearestPolicePhone && (
          <Pressable onPress={() => Linking.openURL(`tel:${alert.nearestPolicePhone}`)}
            style={[ac.actionBtn, { backgroundColor: "#F59E0B22" }]}>
            <Ionicons name="shield" size={13} color="#F59E0B" />
            <Text style={[ac.actionText, { color: "#F59E0B" }]}>Police</Text>
          </Pressable>
        )}
        {alert.status !== "resolved" && (
          <Pressable onPress={onResolve} style={[ac.actionBtn, { backgroundColor: "#22C55E22" }]}>
            <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
            <Text style={[ac.actionText, { color: "#22C55E" }]}>Resolve</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const ac = StyleSheet.create({
  card: { backgroundColor: Colors.bgCard, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1.5 },
  top: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 10 },
  iconWrap: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badges: { flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 4 },
  statusChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusDot: { width: 5, height: 5, borderRadius: 2.5 },
  statusText: { fontSize: 8, fontFamily: "Inter_700Bold" },
  priorityChip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  priorityText: { fontSize: 8, fontFamily: "Inter_700Bold" },
  womenTag: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#8B5CF6" },
  catLabel: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  desc: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  time: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  date: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular" },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: Colors.bg, borderRadius: 8, padding: 8, marginBottom: 8 },
  gpsDotGreen: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#4ADE80" },
  coordText: { color: "#4ADE80", fontSize: 10, fontFamily: "Inter_600SemiBold", flex: 1 },
  policeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  policeText: { color: "#F59E0B", fontSize: 11, fontFamily: "Inter_500Medium", flex: 1 },
  actions: { flexDirection: "row", gap: 7, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 8, paddingVertical: 7 },
  actionText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function AdminAlerts() {
  const insets = useSafeAreaInsets();
  const { sosAlerts, resolveSOS } = useApp();
  const [filter, setFilter] = useState<"all" | "active" | "responding" | "resolved">("all");
  const [reportAlert, setReportAlert] = useState<SOSAlert | null>(null);
  const [womenBuzzer, setWomenBuzzer] = useState(false);

  const active = sosAlerts.filter(s => s.status === "active");
  const responding = sosAlerts.filter(s => s.status === "responding");
  const resolved = sosAlerts.filter(s => s.status === "resolved");
  const liveTracking = sosAlerts.filter(s =>
    s.liveUpdatedAt && (Date.now() - new Date(s.liveUpdatedAt).getTime()) < 90000
  );
  const filtered = filter === "all" ? sosAlerts : sosAlerts.filter(s => s.status === filter);
  const womenActiveAlerts = active.filter(s => s.category === "women_safety" || s.isWomenSafety);

  const flashBadge = useRef(new Animated.Value(1)).current;
  const buzzerAnim = useRef(new Animated.Value(1)).current;
  const prevWomenCount = useRef(0);

  useEffect(() => {
    if (!active.length) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(flashBadge, { toValue: 0.2, duration: 500, useNativeDriver: false }),
      Animated.timing(flashBadge, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [active.length]);

  // Women safety buzzer — triggers when new women safety SOS comes in
  useEffect(() => {
    const cur = womenActiveAlerts.length;
    const prev = prevWomenCount.current;
    if (cur > prev) {
      // New women safety alert!
      setWomenBuzzer(true);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Vibration.vibrate([0, 400, 200, 400, 200, 800]);
      }
      const buzzerLoop = Animated.loop(Animated.sequence([
        Animated.timing(buzzerAnim, { toValue: 0.2, duration: 300, useNativeDriver: false }),
        Animated.timing(buzzerAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
      ]));
      buzzerLoop.start();
      // Auto dismiss after 10s
      const timer = setTimeout(() => { setWomenBuzzer(false); buzzerLoop.stop(); buzzerAnim.setValue(1); }, 10000);
      return () => { clearTimeout(timer); buzzerLoop.stop(); };
    }
    prevWomenCount.current = cur;
  }, [womenActiveAlerts.length]);

  return (
    <View style={[ms.root, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <ReportModal
        alert={reportAlert}
        visible={!!reportAlert}
        onClose={() => setReportAlert(null)}
        onResolve={() => { if (reportAlert) resolveSOS(reportAlert.id); setReportAlert(null); }}
      />

      {/* Women Safety Buzzer Banner */}
      {womenBuzzer && (
        <Animated.View style={[bz.banner, { opacity: buzzerAnim }]}>
          <LinearGradient colors={["#4C1D95", "#7C3AED", "#4C1D95"]} style={bz.bannerGrad}>
            <Text style={{ fontSize: 24 }}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={bz.bannerTitle}>⚡ WOMEN SAFETY SOS ACTIVE</Text>
              <Text style={bz.bannerSub}>{womenActiveAlerts.length} panic alert{womenActiveAlerts.length > 1 ? "s" : ""} — Respond immediately!</Text>
            </View>
            <Pressable onPress={() => setWomenBuzzer(false)} style={bz.bannerClose}>
              <Ionicons name="close" size={18} color="#fff" />
            </Pressable>
          </LinearGradient>
        </Animated.View>
      )}

      {/* Header */}
      <LinearGradient colors={["#1A0000", "#2D0000"]} style={ms.header}>
        <View style={ms.headerRow}>
          <Pressable onPress={() => router.back()} style={ms.backBtn}>
            <Ionicons name="arrow-back" size={18} color={Colors.textMuted} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={ms.headerTitle}>SOS Command Center</Text>
            <Text style={ms.headerSub}>Uttarakhand Emergency Response · Live GPS Tracking</Text>
          </View>
          {active.length > 0 && (
            <Animated.View style={[ms.activeBadge, { opacity: flashBadge }]}>
              <Text style={ms.activeBadgeText}>{active.length} ACTIVE</Text>
            </Animated.View>
          )}
        </View>
      </LinearGradient>

      {/* Stats */}
      <View style={ms.stats}>
        {[
          { val: active.length,       label: "Active",    color: "#EF4444", f: "active"     as const },
          { val: responding.length,   label: "Responding",color: "#F59E0B", f: "responding" as const },
          { val: resolved.length,     label: "Resolved",  color: "#22C55E", f: "resolved"   as const },
          { val: liveTracking.length, label: "Live GPS",  color: "#4ADE80", f: "all"        as const },
        ].map(st => (
          <Pressable key={st.label} onPress={() => setFilter(st.f)}
            style={[ms.statCard, { borderColor: st.color + "33" }]}>
            <Text style={[ms.statVal, { color: st.color }]}>{st.val}</Text>
            <Text style={ms.statLabel}>{st.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Filter tabs */}
      <View style={ms.filters}>
        {(["all", "active", "responding", "resolved"] as const).map(f => {
          const count = f === "all" ? sosAlerts.length : f === "active" ? active.length : f === "responding" ? responding.length : resolved.length;
          return (
            <Pressable key={f} onPress={() => setFilter(f)}
              style={[ms.filterTab, filter === f && ms.filterTabActive]}>
              <Text style={[ms.filterText, filter === f && ms.filterTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom + 20) }}>
        {filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <Text style={{ fontSize: 48 }}>✅</Text>
            <Text style={{ color: "#22C55E", fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 12 }}>All Clear</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" }}>
              {filter === "all" ? "No SOS alerts recorded" : `No ${filter} alerts`}
            </Text>
          </View>
        ) : filtered.map(alert => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onResolve={() => resolveSOS(alert.id)}
            onViewReport={() => setReportAlert(alert)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const bz = StyleSheet.create({
  banner: { zIndex: 100 },
  bannerGrad: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  bannerTitle: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  bannerSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  bannerClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
});

const ms = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  headerSub: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  activeBadge: { backgroundColor: "#EF4444", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  stats: { flexDirection: "row", paddingHorizontal: 16, gap: 8, paddingVertical: 12 },
  statCard: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1 },
  statVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  statLabel: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "center" },
  filters: { flexDirection: "row", paddingHorizontal: 16, gap: 6, marginBottom: 12 },
  filterTab: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 8, paddingVertical: 6, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  filterTabActive: { backgroundColor: "#EF444422", borderColor: "#EF444444" },
  filterText: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_600SemiBold" },
  filterTextActive: { color: "#EF4444" },
});
