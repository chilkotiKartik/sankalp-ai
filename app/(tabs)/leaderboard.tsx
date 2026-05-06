import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Animated, RefreshControl, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

interface LeaderEntry {
  rank: number;
  name: string;
  phone: string;
  district: string;
  points: number;
  level: number;
  badges: string[];
  resolvedComplaints?: number;
}

const BADGE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  new_citizen:      { icon: "person-add",         color: "#6B7280", label: "New Citizen" },
  first_report:     { icon: "flag",                color: "#3B82F6", label: "First Report" },
  active_citizen:   { icon: "people",              color: "#00A651", label: "Active Citizen" },
  civic_hero:       { icon: "shield-checkmark",    color: "#F59E0B", label: "Civic Hero" },
  city_champion:    { icon: "trophy",              color: "#EF4444", label: "City Champion" },
  super_admin:      { icon: "star",                color: "#FF9933", label: "Super Admin" },
  district_admin:   { icon: "business",            color: "#8B5CF6", label: "District Admin" },
};

const LEVEL_LABEL = (level: number) => {
  if (level >= 10) return "Legend";
  if (level >= 8) return "Champion";
  if (level >= 6) return "Hero";
  if (level >= 4) return "Active";
  if (level >= 2) return "Starter";
  return "Newbie";
};

const LEVEL_COLOR = (level: number) => {
  if (level >= 10) return "#FF9933";
  if (level >= 8) return "#EF4444";
  if (level >= 6) return "#F59E0B";
  if (level >= 4) return "#00A651";
  if (level >= 2) return "#3B82F6";
  return "#6B7280";
};

const RANK_GRADIENT: Record<number, string[]> = {
  1: ["#FFD700", "#FF9933"],
  2: ["#C0C0C0", "#A0A0A0"],
  3: ["#CD7F32", "#A0522D"],
};

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <LinearGradient colors={RANK_GRADIENT[rank] as [string, string]} style={rb.badge}>
        <Text style={rb.text}>{rank}</Text>
      </LinearGradient>
    );
  }
  return (
    <View style={[rb.badge, { backgroundColor: Colors.bgWarm }]}>
      <Text style={[rb.text, { color: Colors.textMuted }]}>{rank}</Text>
    </View>
  );
}
const rb = StyleSheet.create({
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 14, fontWeight: "800", color: "#FFF" },
});

function LeaderCard({ entry, isMe, delay }: { entry: LeaderEntry; isMe: boolean; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 400, delay, useNativeDriver: true }).start();
  }, []);

  const lColor = LEVEL_COLOR(entry.level);
  const isTop3 = entry.rank <= 3;

  return (
    <Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <View style={[cs.card, isMe && cs.cardMe, isTop3 && cs.cardTop3]}>
        {isTop3 && (
          <LinearGradient
            colors={[RANK_GRADIENT[entry.rank][0] + "22", "transparent"]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          />
        )}
        <RankBadge rank={entry.rank} />
        <View style={cs.avatar}>
          <Text style={cs.avatarText}>{entry.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={cs.info}>
          <View style={cs.nameRow}>
            <Text style={[cs.name, isMe && { color: Colors.saffron }]} numberOfLines={1}>
              {entry.name}
              {isMe ? " (You)" : ""}
            </Text>
            <View style={[cs.levelBadge, { backgroundColor: lColor + "22" }]}>
              <Text style={[cs.levelText, { color: lColor }]}>Lv.{entry.level} {LEVEL_LABEL(entry.level)}</Text>
            </View>
          </View>
          <Text style={cs.district}>{entry.district}</Text>
          <View style={cs.badgesRow}>
            {entry.badges.slice(0, 4).map(b => {
              const meta = BADGE_META[b];
              if (!meta) return null;
              return (
                <View key={b} style={[cs.badge, { backgroundColor: meta.color + "22" }]}>
                  <Ionicons name={meta.icon} size={10} color={meta.color} />
                  <Text style={[cs.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
        <View style={cs.points}>
          <Ionicons name="star" size={12} color={Colors.turmeric} />
          <Text style={cs.pointsVal}>{entry.points.toLocaleString("en-IN")}</Text>
          <Text style={cs.pointsLabel}>pts</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const TOP3_ICONS: (keyof typeof Ionicons.glyphMap)[] = ["trophy", "ribbon", "medal"];

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"all" | "district">("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("token");
      const res = await fetch(`${getApiUrl()}api/leaderboard`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLeaders(data);
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const filtered = tab === "district"
    ? leaders.filter(l => l.district === user?.district).map((l, i) => ({ ...l, rank: i + 1 }))
    : leaders;

  const myRank = filtered.findIndex(l => l.phone === user?.phone);
  const myEntry = myRank >= 0 ? filtered[myRank] : null;

  const top3 = filtered.slice(0, 3);
  const rest = filtered.slice(3);

  return (
    <View style={[cs.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#1A0E00", Colors.bg]} style={StyleSheet.absoluteFill} />

      <View style={cs.header}>
        <Pressable onPress={() => router.back()} style={cs.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
        </Pressable>
        <View style={cs.headerTitle}>
          <Text style={cs.headerTitleText}>Leaderboard</Text>
          <Text style={cs.headerSub}>Uttarakhand Civic Champions</Text>
        </View>
        <View style={cs.headerBadge}>
          <Ionicons name="trophy" size={20} color={Colors.turmeric} />
        </View>
      </View>

      {/* My Rank Banner */}
      {myEntry && (
        <LinearGradient colors={[Colors.saffron + "33", Colors.saffron + "11"]} style={cs.myRankBanner}>
          <Ionicons name="person-circle" size={28} color={Colors.saffron} />
          <View style={{ flex: 1 }}>
            <Text style={cs.myRankTitle}>Your Rank: #{myEntry.rank}</Text>
            <Text style={cs.myRankSub}>{myEntry.points.toLocaleString("en-IN")} points · Level {myEntry.level}</Text>
          </View>
          <View style={[cs.myRankLevelBox, { backgroundColor: LEVEL_COLOR(myEntry.level) + "33" }]}>
            <Text style={[cs.myRankLevel, { color: LEVEL_COLOR(myEntry.level) }]}>{LEVEL_LABEL(myEntry.level)}</Text>
          </View>
        </LinearGradient>
      )}

      {/* Tab Selector */}
      <View style={cs.tabRow}>
        {(["all", "district"] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} style={[cs.tabBtn, tab === t && cs.tabBtnActive]}>
            <Ionicons name={t === "all" ? "globe" : "location"} size={14} color={tab === t ? Colors.saffron : Colors.textMuted} />
            <Text style={[cs.tabText, tab === t && cs.tabTextActive]}>
              {t === "all" ? "All Uttarakhand" : "My District"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.saffron} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[cs.scroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.saffron} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <View style={cs.podium}>
              {top3.length >= 2 && (
                <View style={[cs.podiumPlace, cs.podiumPlace2]}>
                  <View style={cs.podiumAvatar}>
                    <Text style={cs.podiumAvatarText}>{top3[1].name.charAt(0)}</Text>
                  </View>
                  <Ionicons name={TOP3_ICONS[1]} size={20} color="#C0C0C0" />
                  <Text style={[cs.podiumName, { color: "#C0C0C0" }]} numberOfLines={1}>{top3[1].name.split(" ")[0]}</Text>
                  <Text style={cs.podiumPoints}>{top3[1].points.toLocaleString("en-IN")}</Text>
                  <View style={[cs.podiumBar, { height: 60, backgroundColor: "#C0C0C022" }]}>
                    <Text style={[cs.podiumRank, { color: "#C0C0C0" }]}>2</Text>
                  </View>
                </View>
              )}
              <View style={[cs.podiumPlace, cs.podiumPlace1]}>
                <View style={[cs.podiumAvatar, { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: "#FFD700" }]}>
                  <Text style={[cs.podiumAvatarText, { fontSize: 22 }]}>{top3[0].name.charAt(0)}</Text>
                </View>
                <Ionicons name={TOP3_ICONS[0]} size={28} color="#FFD700" />
                <Text style={[cs.podiumName, { color: "#FFD700", fontSize: 15 }]} numberOfLines={1}>{top3[0].name.split(" ")[0]}</Text>
                <Text style={[cs.podiumPoints, { fontSize: 13 }]}>{top3[0].points.toLocaleString("en-IN")}</Text>
                <LinearGradient colors={["#FFD70033", "#FF993322"]} style={[cs.podiumBar, { height: 80 }]}>
                  <Text style={[cs.podiumRank, { color: "#FFD700", fontSize: 20 }]}>1</Text>
                </LinearGradient>
              </View>
              {top3.length >= 3 && (
                <View style={[cs.podiumPlace, cs.podiumPlace3]}>
                  <View style={cs.podiumAvatar}>
                    <Text style={cs.podiumAvatarText}>{top3[2].name.charAt(0)}</Text>
                  </View>
                  <Ionicons name={TOP3_ICONS[2]} size={18} color="#CD7F32" />
                  <Text style={[cs.podiumName, { color: "#CD7F32" }]} numberOfLines={1}>{top3[2].name.split(" ")[0]}</Text>
                  <Text style={cs.podiumPoints}>{top3[2].points.toLocaleString("en-IN")}</Text>
                  <View style={[cs.podiumBar, { height: 44, backgroundColor: "#CD7F3222" }]}>
                    <Text style={[cs.podiumRank, { color: "#CD7F32" }]}>3</Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Achievement Legend */}
          <View style={cs.legendCard}>
            <Text style={cs.legendTitle}>Badges</Text>
            <View style={cs.legendGrid}>
              {Object.entries(BADGE_META).slice(0, 6).map(([key, meta]) => (
                <View key={key} style={cs.legendItem}>
                  <View style={[cs.legendIcon, { backgroundColor: meta.color + "22" }]}>
                    <Ionicons name={meta.icon} size={14} color={meta.color} />
                  </View>
                  <Text style={cs.legendLabel} numberOfLines={1}>{meta.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Rest of list */}
          <Text style={cs.sectionTitle}>All Rankings</Text>
          {rest.map((entry, i) => (
            <LeaderCard key={entry.phone} entry={entry} isMe={entry.phone === user?.phone} delay={i * 30} />
          ))}

          {filtered.length === 0 && (
            <View style={cs.empty}>
              <Ionicons name="trophy-outline" size={48} color={Colors.textMuted} />
              <Text style={cs.emptyText}>No rankings yet</Text>
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
  headerBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.turmeric + "22", alignItems: "center", justifyContent: "center" },

  myRankBanner: { marginHorizontal: 16, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.saffron + "44" },
  myRankTitle: { fontSize: 15, fontWeight: "700", color: Colors.saffron },
  myRankSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  myRankLevelBox: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  myRankLevel: { fontSize: 12, fontWeight: "700" },

  tabRow: { flexDirection: "row", marginHorizontal: 16, gap: 8, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  tabBtnActive: { backgroundColor: Colors.saffron + "22", borderColor: Colors.saffron },
  tabText: { fontSize: 13, color: Colors.textMuted, fontWeight: "500" },
  tabTextActive: { color: Colors.saffron, fontWeight: "700" },

  scroll: { padding: 16, gap: 0 },

  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 8, marginBottom: 24, paddingTop: 8 },
  podiumPlace: { alignItems: "center", flex: 1, gap: 4 },
  podiumPlace1: { flex: 1.2 },
  podiumPlace2: { flex: 1 },
  podiumPlace3: { flex: 1 },
  podiumAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.bgWarm, alignItems: "center", justifyContent: "center" },
  podiumAvatarText: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  podiumName: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  podiumPoints: { fontSize: 11, color: Colors.textMuted },
  podiumBar: { width: "100%", borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: "center", justifyContent: "center" },
  podiumRank: { fontSize: 16, fontWeight: "900" },

  legendCard: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  legendTitle: { fontSize: 13, fontWeight: "700", color: Colors.textSecondary, marginBottom: 10 },
  legendGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6, width: "30%" },
  legendIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  legendLabel: { fontSize: 10, color: Colors.textMuted, flex: 1 },

  sectionTitle: { fontSize: 14, fontWeight: "700", color: Colors.textSecondary, marginBottom: 10 },

  card: { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  cardMe: { borderColor: Colors.saffron, borderWidth: 1.5 },
  cardTop3: { borderWidth: 1.5 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgWarm, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "800", color: Colors.textPrimary },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary, flex: 1 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  levelText: { fontSize: 10, fontWeight: "700" },
  district: { fontSize: 11, color: Colors.textMuted },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: "600" },
  points: { alignItems: "center", gap: 2 },
  pointsVal: { fontSize: 16, fontWeight: "800", color: Colors.turmeric },
  pointsLabel: { fontSize: 10, color: Colors.textMuted },

  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.textMuted },
});
