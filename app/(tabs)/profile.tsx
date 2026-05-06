import React, { useRef, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, Animated, Alert, Image, Switch, Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";

const LEVEL_TITLES = ["", "Resident", "Active Resident", "Engaged Citizen", "Civic Advocate",
  "Community Leader", "City Guardian", "Civic Champion", "Devbhoomi Hero", "Urban Warrior", "City Legend"];

const BADGE_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; label: string; color: string }> = {
  new_citizen:    { icon: "leaf",             label: "New Citizen",   color: "#00A651" },
  active_citizen: { icon: "star",             label: "Active Citizen",color: "#F59E0B" },
  civic_hero:     { icon: "ribbon",           label: "Civic Hero",    color: "#8B5CF6" },
  city_champion:  { icon: "trophy",           label: "City Champion", color: "#EF4444" },
  first_report:   { icon: "document-text",    label: "First Report",  color: "#3B82F6" },
  system_admin:   { icon: "shield-checkmark", label: "System Admin",  color: "#06B6D4" },
};

const INDIAN_PHOTOS: Record<string, string> = {
  "9999999999": "https://randomuser.me/api/portraits/men/85.jpg",
  "9876543210": "https://randomuser.me/api/portraits/women/62.jpg",
};

function BadgeChip({ badge }: { badge: string }) {
  const cfg = BADGE_CONFIG[badge] || { icon: "medal" as const, label: badge, color: "#9CA3AF" };
  return (
    <View style={[bs.chip, { borderColor: cfg.color + "44", backgroundColor: cfg.color + "11" }]}>
      <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
      <Text style={[bs.chipText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

const bs = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  chipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
});

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { complaints, leaderboard } = useApp();
  const { notifications, unreadCount, markAllRead } = useNotifications();

  const headerAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [language, setLanguage] = useState<"EN" | "HI">("EN");
  const [showLangModal, setShowLangModal] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("app_language").then(v => { if (v === "HI" || v === "EN") setLanguage(v); });
  }, []);

  const switchLanguage = async (lang: "EN" | "HI") => {
    setLanguage(lang);
    await AsyncStorage.setItem("app_language", lang);
    setShowLangModal(false);
  };

  const myComplaints = complaints.filter(c => c.submittedByPhone === user?.phone).slice(0, 5);
  const points = user?.points || 0;
  const level = user?.level || 1;
  const badges = user?.badges || [];
  const nextLevelPoints = 100;
  const progress = Math.min((points % 100) / 100, 1);
  const levelTitle = LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length - 1)] || "Civic Legend";
  const myRank = leaderboard.findIndex(e => e.phone?.startsWith?.(user?.phone?.slice(0, 6) || "000000"));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
      Animated.timing(progressAnim, { toValue: progress, duration: 1400, delay: 500, useNativeDriver: false }),
    ]).start();
  }, [progress]);

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Sign out of SANKALP AI?\n\nAre you sure you want to sign out?")) {
        logout();
      }
      return;
    }
    Alert.alert("Sign Out", "Are you sure you want to sign out of SANKALP AI?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  };

  const initials = user?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  const citizenId = `DL-${(user?.phone || "0000000000").slice(-6)}-${level.toString().padStart(2, "0")}`;
  const photoUri = user?.phone ? INDIAN_PHOTOS[user.phone] : null;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 100 : insets.bottom + 90 }}>

        {/* CITIZEN ID CARD */}
        <Animated.View style={[styles.idCardWrap, { opacity: headerAnim }]}>
          <LinearGradient colors={["#FF6B00", "#FF9933", "#FFBA5C"]} style={styles.idCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View style={styles.tricolor}>
              <View style={{ flex: 1, backgroundColor: "#fff", opacity: 0.9 }} />
              <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
              <View style={{ flex: 1, backgroundColor: "#138808" }} />
            </View>

            <View style={styles.idHeader}>
              <Text style={styles.idGovLabel}>SANKALP AI · Government of Uttarakhand</Text>
              {user?.role === "admin" && (
                <View style={styles.adminTag}>
                  <Ionicons name="shield-checkmark" size={10} color="#FF6B00" />
                  <Text style={styles.adminTagText}>ADMIN</Text>
                </View>
              )}
            </View>

            <View style={styles.idContent}>
              <View style={styles.avatarWrap}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.avatarPhoto} />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>{initials}</Text>
                  </View>
                )}
                <View style={styles.levelDot}>
                  <Text style={styles.levelDotText}>{level}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.idName}>{user?.name || "Citizen"}</Text>
                <Text style={styles.idPhone}>+91 {user?.phone} · {levelTitle}</Text>
                <Text style={styles.idCitizenId}>ID: {citizenId}</Text>
                {myRank >= 0 && (
                  <View style={styles.rankRow}>
                    <Ionicons name="trophy-outline" size={11} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.rankText}>City Rank #{myRank + 1}</Text>
                  </View>
                )}
              </View>
              <View style={styles.pointsBox}>
                <Text style={styles.pointsVal}>{points.toLocaleString()}</Text>
                <Text style={styles.pointsLabel}>Points</Text>
              </View>
            </View>

            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Level Progress</Text>
                <Text style={styles.progressLabel}>{points % 100}/{nextLevelPoints} pts</Text>
              </View>
              <View style={styles.progressBg}>
                <Animated.View style={[styles.progressFill, {
                  width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) as any
                }]} />
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* STATS ROW */}
        <View style={styles.statsRow}>
          {[
            { val: myComplaints.length, label: "Reports Filed", color: "#FF9933", bg: "#FFF8E7" },
            { val: myComplaints.filter(c => c.status === "resolved").length, label: "Resolved", color: "#00A651", bg: "#F0FFF4" },
            { val: badges.length, label: "Badges", color: "#8B5CF6", bg: "#F5F3FF" },
          ].map((s, i) => (
            <View key={i} style={[styles.statCard, { borderColor: s.color + "20" }]}>
              <Text style={[styles.statVal, { color: s.color }]}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* QUICK SERVICES */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Services</Text>
          <View style={styles.servicesGrid}>
            {[
              { icon: "receipt-outline" as const,      label: "Pay Bills",    color: "#FF9933", nav: "/(tabs)/bills" },
              { icon: "list-outline" as const,         label: "My Reports",   color: "#3B82F6", nav: "/(tabs)/complaints" },
              { icon: "people-outline" as const,       label: "Community",    color: "#8B5CF6", nav: "/(tabs)/community" },
              { icon: "document-text-outline" as const, label: "File RTI",   color: "#00A651", nav: "/(tabs)/rti" },
              { icon: "warning-outline" as const,      label: "SOS Alert",    color: "#EF4444", nav: "/(tabs)/sos" },
              { icon: "analytics-outline" as const,    label: "Analytics",    color: "#06B6D4", nav: "/(tabs)/analytics" },
            ].map((s, i) => (
              <Pressable key={i} onPress={() => router.push(s.nav as any)}
                style={({ pressed }) => [styles.serviceCard, { borderColor: s.color + "25", opacity: pressed ? 0.75 : 1 }]}>
                <View style={[styles.serviceIcon, { backgroundColor: s.color + "15" }]}>
                  <Ionicons name={s.icon} size={22} color={s.color} />
                </View>
                <Text style={[styles.serviceLabel, { color: s.color }]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* NOTIFICATIONS */}
        {notifications.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}><Text style={styles.unreadBadgeText}>{unreadCount} new</Text></View>
              )}
              <Pressable onPress={markAllRead}>
                <Text style={styles.markRead}>Mark all read</Text>
              </Pressable>
            </View>
            {notifications.slice(0, 3).map(n => (
              <View key={n.id} style={[styles.notifRow, !n.read && styles.notifRowUnread]}>
                <View style={[styles.notifDot, { backgroundColor: n.read ? "#E5E7EB" : "#FF9933" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.notifTitle} numberOfLines={1}>{n.title}</Text>
                  <Text style={styles.notifBody} numberOfLines={1}>{n.body}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* SETTINGS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Settings</Text>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: "#FFF8E7" }]}>
              <Ionicons name="notifications-outline" size={16} color="#FF9933" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDesc}>Alerts for complaints, SOS, announcements</Text>
            </View>
            <Switch value={notifEnabled} onValueChange={setNotifEnabled} trackColor={{ true: "#FF9933" }} thumbColor="#fff" />
          </View>
          <Pressable
            style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: "#F3F4F6", marginTop: 8, paddingTop: 8 }]}
            onPress={() => setShowLangModal(true)}
          >
            <View style={[styles.settingIcon, { backgroundColor: "#F0FFF4" }]}>
              <Ionicons name="language-outline" size={16} color="#00A651" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Language</Text>
              <Text style={styles.settingDesc}>{language === "EN" ? "English" : "हिंदी (Hindi)"}</Text>
            </View>
            <View style={[styles.langPill, { flexDirection: "row", alignItems: "center", gap: 5 }]}>
              <Text style={styles.langPillText}>{language}</Text>
              <Ionicons name="chevron-down" size={10} color="#00A651" />
            </View>
          </Pressable>
        </View>

        {/* LANGUAGE MODAL */}
        <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
          <Pressable style={ls.langOverlay} onPress={() => setShowLangModal(false)}>
            <View style={ls.langCard}>
              <Text style={ls.langTitle}>Choose Language</Text>
              <Text style={ls.langSub}>Select your preferred app language</Text>
              {[
                { code: "EN" as const, label: "English", native: "English", flag: "🇬🇧", desc: "App in English" },
                { code: "HI" as const, label: "Hindi", native: "हिंदी", flag: "🇮🇳", desc: "ऐप हिंदी में" },
              ].map(lang => (
                <Pressable
                  key={lang.code}
                  style={[ls.langOption, language === lang.code && ls.langOptionActive]}
                  onPress={() => switchLanguage(lang.code)}
                >
                  <Text style={{ fontSize: 28 }}>{lang.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[ls.langOptionLabel, language === lang.code && { color: "#00A651" }]}>
                      {lang.native}
                    </Text>
                    <Text style={ls.langOptionDesc}>{lang.desc}</Text>
                  </View>
                  {language === lang.code && (
                    <Ionicons name="checkmark-circle" size={22} color="#00A651" />
                  )}
                </Pressable>
              ))}
              <Text style={ls.langNote}>
                {language === "HI"
                  ? "✓ हिंदी लागू है — नमस्ते! स्वागत है SANKALP AI में"
                  : "✓ English is active — All content displayed in English"}
              </Text>
            </View>
          </Pressable>
        </Modal>

        {/* BADGES */}
        {badges.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Achievements</Text>
            <View style={styles.badgesWrap}>
              {badges.map(b => <BadgeChip key={b} badge={b} />)}
            </View>
          </View>
        )}

        {/* EARN POINTS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How to Earn Points</Text>
          {[
            { action: "File a complaint", pts: "+10", icon: "document-text-outline" as const },
            { action: "Upvote a complaint", pts: "+2", icon: "thumbs-up-outline" as const },
            { action: "Complaint gets resolved", pts: "+25", icon: "checkmark-circle-outline" as const },
            { action: "Trigger SOS alert", pts: "+5", icon: "warning-outline" as const },
          ].map(item => (
            <View key={item.action} style={styles.earnRow}>
              <View style={styles.earnIcon}>
                <Ionicons name={item.icon} size={15} color="#00A651" />
              </View>
              <Text style={styles.earnAction}>{item.action}</Text>
              <View style={styles.earnBadge}>
                <Text style={styles.earnPts}>{item.pts}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* MY REPORTS */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>My Reports</Text>
            <Pressable onPress={() => router.push("/(tabs)/complaints")}>
              <Text style={styles.seeAll}>See All →</Text>
            </Pressable>
          </View>
          {myComplaints.length > 0 ? myComplaints.map(c => (
            <View key={c.id} style={styles.reportRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.reportId}>{c.ticketId} · {c.category}</Text>
                <Text style={styles.reportDesc} numberOfLines={1}>{c.description}</Text>
              </View>
              <View style={[styles.statusBadge, {
                backgroundColor: (c.status === "resolved" ? "#00A651" : c.status === "pending" ? "#F59E0B" : "#3B82F6") + "18"
              }]}>
                <Text style={[styles.statusText, {
                  color: c.status === "resolved" ? "#00A651" : c.status === "pending" ? "#F59E0B" : "#3B82F6"
                }]}>{c.status.replace("_", " ")}</Text>
              </View>
            </View>
          )) : (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyText}>No reports yet — tap Reports to file one</Text>
            </View>
          )}
        </View>

        {/* ADMIN SHORTCUT */}
        {user?.role === "admin" && (
          <Pressable onPress={() => router.push("/admin")} style={styles.adminCard}>
            <LinearGradient colors={["#FF6B00", "#FF9933"]} style={styles.adminGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
              <View>
                <Text style={styles.adminCardText}>Admin War Room</Text>
                <Text style={styles.adminCardSub}>City command dashboard →</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>
        )}

        {/* PAY BILLS SHORTCUT */}
        <Pressable onPress={() => router.push("/(tabs)/bills")} style={styles.billsCard}>
          <View style={styles.billsLeft}>
            <View style={[styles.billsIcon, { backgroundColor: "#EFF6FF" }]}>
              <Ionicons name="receipt-outline" size={22} color="#3B82F6" />
            </View>
            <View>
              <Text style={styles.billsTitle}>Pay Government Bills</Text>
              <Text style={styles.billsSub}>ULB Tax · UJN Water · UPCL Electricity</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </Pressable>

        {/* SIGN OUT */}
        <Pressable onPress={handleLogout} style={styles.logoutBtn}>
          <LinearGradient colors={["#DC2626", "#EF4444"]} style={styles.logoutGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
            <Text style={styles.logoutText}>Sign Out of SANKALP AI</Text>
          </LinearGradient>
        </Pressable>

        <Text style={styles.footer}>सत्यमेव जयते — Truth Alone Triumphs</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },

  idCardWrap: { marginHorizontal: 16, marginTop: 10, marginBottom: 14 },
  idCard: { borderRadius: 20, overflow: "hidden" },
  tricolor: { height: 4, flexDirection: "row" },
  idHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  idGovLabel: { color: "rgba(255,255,255,0.9)", fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  adminTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  adminTagText: { color: "#FF6B00", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  idContent: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  avatarWrap: { position: "relative" },
  avatarPhoto: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: "rgba(255,255,255,0.8)" },
  avatarCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "rgba(255,255,255,0.6)" },
  avatarText: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  levelDot: { position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FF9933" },
  levelDotText: { color: "#FF9933", fontSize: 9, fontFamily: "Inter_700Bold" },
  idName: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  idPhone: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  idCitizenId: { color: "rgba(255,255,255,0.65)", fontSize: 10, fontFamily: "Inter_400Regular", letterSpacing: 0.5, marginTop: 2 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  rankText: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  pointsBox: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 14, padding: 14, minWidth: 65, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  pointsVal: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  pointsLabel: { color: "rgba(255,255,255,0.8)", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  progressSection: { paddingHorizontal: 16, paddingBottom: 14 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontFamily: "Inter_400Regular" },
  progressBg: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#fff", borderRadius: 3 },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 10, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: "#fff", borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1 },
  statVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 4, textAlign: "center" },

  card: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  cardTitle: { color: "#111827", fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 12 },

  servicesGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  serviceCard: { width: "30%", borderRadius: 14, padding: 12, alignItems: "center", gap: 8, borderWidth: 1, backgroundColor: "#FAFAFA" },
  serviceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  serviceLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  notifRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  notifRowUnread: { backgroundColor: "#FFFBEB" },
  notifDot: { width: 8, height: 8, borderRadius: 4 },
  notifTitle: { color: "#374151", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  notifBody: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  unreadBadge: { backgroundColor: "#FFF8E7", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  unreadBadgeText: { color: "#FF9933", fontSize: 10, fontFamily: "Inter_700Bold" },
  markRead: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginLeft: "auto" },

  settingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  settingLabel: { color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  settingDesc: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  langPill: { backgroundColor: "#F0FFF4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#00A65130" },
  langPillText: { color: "#00A651", fontSize: 12, fontFamily: "Inter_700Bold" },

  badgesWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  earnRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  earnIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: "#F0FFF4", alignItems: "center", justifyContent: "center" },
  earnAction: { flex: 1, color: "#374151", fontSize: 12, fontFamily: "Inter_500Medium" },
  earnBadge: { backgroundColor: "#F0FFF4", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  earnPts: { color: "#00A651", fontSize: 13, fontFamily: "Inter_700Bold" },

  reportRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  reportId: { color: "#374151", fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  reportDesc: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "capitalize" },
  emptyState: { alignItems: "center", paddingVertical: 24, gap: 10 },
  emptyText: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },

  seeAll: { color: "#FF9933", fontSize: 12, fontFamily: "Inter_500Medium", marginLeft: "auto" },

  adminCard: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", marginBottom: 14 },
  adminGrad: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  adminCardText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  adminCardSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  billsCard: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#DBEAFE", marginBottom: 14 },
  billsLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  billsIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  billsTitle: { color: "#111827", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  billsSub: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  logoutBtn: { marginHorizontal: 16, borderRadius: 16, overflow: "hidden", marginBottom: 14 },
  logoutGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  logoutText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },

  footer: { textAlign: "center", color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 8, letterSpacing: 0.5 },
});

const ls = StyleSheet.create({
  langOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", alignItems: "center", padding: 24 },
  langCard: { backgroundColor: "#fff", borderRadius: 24, padding: 24, width: "100%", maxWidth: 360, shadowColor: "#000", shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.18, shadowRadius: 32, elevation: 20 },
  langTitle: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 4 },
  langSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", marginBottom: 18 },
  langOption: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: "#E5E7EB", marginBottom: 10 },
  langOptionActive: { borderColor: "#00A651", backgroundColor: "#F0FFF4" },
  langOptionLabel: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 2 },
  langOptionDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#6B7280" },
  langNote: { marginTop: 12, fontSize: 12, fontFamily: "Inter_500Medium", color: "#00A651", backgroundColor: "#F0FFF4", borderRadius: 10, padding: 10, textAlign: "center" },
});
