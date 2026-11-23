import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Linking, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { BADGE_META, REASON_LABEL } from "@/constants/points";

/**
 * My Sankalp Points (D-059): points, level, rank, how to earn, badges, history and a certificate anyone can verify.
 * Points come only from real, verified results — never just for posting, never for SOS.
 */
interface Summary {
  points: number; rank: number | null; verifiedFixes: number;
  level: { n: number; name: string; en: string; min: number; progress: number; next: { name: string; en: string; min: number; need: number } | null };
  badges: { id: string; name: string; desc: string; progress: number; need: number; earned: boolean }[];
  history: { delta: number; reason: string; ref?: string; at: string }[];
  rules: { id: string; points: number; dailyCap: number | null; en: string }[];
}

export default function PointsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [certBusy, setCertBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${getApiUrl()}api/me/points`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json()); setError(false);
    } catch { setError(true); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const openCertificate = async () => {
    if (!token) return;
    setCertBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}api/me/certificate`, { headers: { Authorization: `Bearer ${token}` } });
      const j = (await r.json()) as { path: string };
      await Linking.openURL(new URL(j.path, getApiUrl()).toString());
    } catch { /* stays on screen */ } finally { setCertBusy(false); }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.top}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} accessibilityRole="button" accessibilityLabel="Back" style={s.back}>
          <Ionicons name="arrow-back" size={20} color="#111827" />
        </Pressable>
        <Text style={s.topTitle} accessibilityRole="header">My Sankalp Points</Text>
      </View>

      {!data && !error ? <ActivityIndicator color="#C2410C" style={{ marginTop: 40 }} /> : null}
      {error && !data ? (
        <Pressable onPress={load} style={s.card} accessibilityRole="button"><Text style={s.p}>Could not load your points. Tap to try again.</Text></Pressable>
      ) : null}

      {data ? (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
          {/* Summary */}
          <View style={s.hero}>
            <Text style={s.heroPts}>{data.points}</Text>
            <Text style={s.heroLabel}>Sankalp Points</Text>
            <Text style={s.level}>{data.level.name} · {data.level.en}{data.rank ? `   ·   Rank #${data.rank} in your state` : ""}</Text>
            {data.level.next ? (
              <>
                <View style={s.bar} accessibilityLabel={`${Math.round(data.level.progress * 100)} percent to ${data.level.next.name}`}>
                  <View style={[s.barFill, { width: `${Math.round(data.level.progress * 100)}%` }]} />
                </View>
                <Text style={s.next}>{data.level.next.need} more to reach {data.level.next.name} ({data.level.next.en})</Text>
              </>
            ) : <Text style={s.next}>Highest level reached — thank you!</Text>}
            <View style={s.statRow}>
              <View style={s.stat}><Text style={s.statN}>{data.verifiedFixes}</Text><Text style={s.statL}>verified fixes</Text></View>
              <View style={s.stat}><Text style={s.statN}>{data.badges.filter(b => b.earned).length}/{data.badges.length}</Text><Text style={s.statL}>badges</Text></View>
            </View>
          </View>

          {/* Certificate */}
          <Pressable onPress={openCertificate} disabled={certBusy} style={s.certBtn} accessibilityRole="button" accessibilityLabel="Open my civic contribution certificate">
            <Ionicons name="document-text" size={18} color="#fff" />
            <Text style={s.certText}>{certBusy ? "Opening…" : "My civic contribution certificate"}</Text>
            <Ionicons name="open-outline" size={16} color="#fff" />
          </Pressable>
          <Text style={s.certNote}>Anyone who opens the link sees your live, checked record — it cannot be faked. Use Print → Save as PDF to keep a copy.</Text>

          {/* How to earn */}
          <View style={s.card}>
            <Text style={s.h}>How to earn points</Text>
            <Text style={s.p}>Points come only from real results that someone checked. Posting alone earns nothing, and SOS never earns points.</Text>
            {data.rules.map(r => (
              <View key={r.id} style={s.ruleRow}>
                <Text style={s.rulePts}>+{r.points}</Text>
                <Text style={s.ruleText}>{r.en}{r.dailyCap ? ` (up to ${r.dailyCap} a day)` : ""}</Text>
              </View>
            ))}
          </View>

          {/* Badges */}
          <View style={s.card}>
            <Text style={s.h}>Badges</Text>
            <View style={s.badgeGrid}>
              {data.badges.map(b => {
                const meta = BADGE_META[b.id];
                return (
                  <View key={b.id} style={[s.badge, !b.earned && { opacity: 0.55 }]} accessibilityLabel={`${b.name}: ${b.earned ? "earned" : `${b.progress} of ${b.need}`}`}>
                    <View style={[s.badgeIcon, { backgroundColor: (meta?.color ?? "#6B7280") + (b.earned ? "22" : "11") }]}>
                      <Ionicons name={meta?.icon ?? "ribbon"} size={20} color={b.earned ? meta?.color ?? "#6B7280" : "#6B7280"} />
                    </View>
                    <Text style={s.badgeName}>{b.name}</Text>
                    <Text style={s.badgeDesc}>{b.earned ? "Earned" : `${b.progress}/${b.need}`}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Rewards — honest */}
          <View style={s.card}>
            <Text style={s.h}>Rewards</Text>
            <Text style={s.p}>Your points give you recognition: your level, badges, your place on the state leaderboard and a certificate you can show anywhere.</Text>
            <Text style={[s.p, { marginTop: 6 }]}>Sponsored rewards (for example from your municipal corporation or local partners) will appear here when your state offers them. Your points are saved until then.</Text>
          </View>

          {/* History */}
          <View style={s.card}>
            <Text style={s.h}>History</Text>
            {data.history.length === 0 ? <Text style={s.p}>No points yet. File a real problem — when the department accepts it and the fix is verified, you earn points.</Text> : null}
            {data.history.map((h, i) => (
              <View key={`${h.at}-${i}`} style={[s.histRow, i > 0 && s.histBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.histText}>{REASON_LABEL[h.reason] ?? h.reason}</Text>
                  <Text style={s.histMeta}>{new Date(h.at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{h.ref ? ` · #${h.ref.toUpperCase()}` : ""}</Text>
                </View>
                <Text style={s.histPts}>+{h.delta}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3EF" },
  top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  topTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827" },
  hero: { backgroundColor: "#9A3412", marginHorizontal: 16, borderRadius: 18, padding: 18, alignItems: "center" },
  heroPts: { color: "#fff", fontSize: 44, fontFamily: "Inter_700Bold" },
  heroLabel: { color: "#FFEDD5", fontSize: 13, fontFamily: "Inter_600SemiBold", marginTop: -4 },
  level: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 10, textAlign: "center" },
  bar: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", alignSelf: "stretch", marginTop: 12, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: "#FDBA74" },
  next: { color: "#FFEDD5", fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 6 },
  statRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  stat: { backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 16, alignItems: "center" },
  statN: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  statL: { color: "#FFEDD5", fontSize: 11, fontFamily: "Inter_500Medium" },
  certBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#1D4ED8", marginHorizontal: 16, marginTop: 14, borderRadius: 12, padding: 14 },
  certText: { flex: 1, color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  certNote: { color: "#4B5563", fontSize: 12, fontFamily: "Inter_400Regular", marginHorizontal: 18, marginTop: 6 },
  card: { backgroundColor: "#fff", marginHorizontal: 16, marginTop: 14, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#F3F4F6" },
  h: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 6 },
  p: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#374151", lineHeight: 19 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  rulePts: { width: 40, color: "#047857", fontSize: 15, fontFamily: "Inter_700Bold" },
  ruleText: { flex: 1, color: "#1F2937", fontSize: 13, fontFamily: "Inter_500Medium" },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  badge: { width: "30%", minWidth: 92, alignItems: "center", paddingVertical: 8 },
  badgeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  badgeName: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#111827", marginTop: 6, textAlign: "center" },
  badgeDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#4B5563", marginTop: 2 },
  histRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  histBorder: { borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  histText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#1F2937" },
  histMeta: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#4B5563", marginTop: 2 },
  histPts: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#047857" },
});
