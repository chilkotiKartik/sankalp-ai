import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getTenantId, onTenantChange } from "@/lib/tenant";
import { stateName } from "@/constants/districts";

/**
 * Official news on the home screen: the selected state's regional news (Akashvani / All India Radio)
 * and national press releases (PIB). Real headlines with links to the original; nothing is written by us.
 */
export interface FeedItem { id: string; title: string; summary: string; link: string; publishedAt: string | null; source: string }
interface Feed { items: FeedItem[]; status: "ok" | "stale" | "unavailable"; fetchedAt: string | null; sources: { name: string; url: string }[] }

export function relTime(iso: string | null): string {
  if (!iso) return "Latest";
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : m < 43200 ? `${Math.round(m / 1440)}d ago` : new Date(iso).toLocaleDateString("en-IN");
}

export function OfficialNews({ onOpen }: { onOpen: (item: FeedItem) => void }) {
  const [scope, setScope] = useState<"state" | "national">("state");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [loading, setLoading] = useState(true);
  const [tid, setTid] = useState(getTenantId());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => onTenantChange(setTid), []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(new URL(`/api/public/news?scope=${scope}`, getApiUrl()).toString());
      setFeed(r.ok ? ((await r.json()) as Feed) : { items: [], status: "unavailable", fetchedAt: null, sources: [] });
    } catch { setFeed({ items: [], status: "unavailable", fetchedAt: null, sources: [] }); }
    finally { setLoading(false); }
  }, [scope, tid]);
  useEffect(() => { load(); setShowAll(false); }, [load]);

  const items = feed?.items ?? [];
  const shown = showAll ? items : items.slice(0, 5);
  const source = feed?.sources?.[0]?.name ?? (scope === "state" ? "Akashvani News (All India Radio)" : "Press Information Bureau");

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.titleWrap}>
          <View style={s.icon}><Ionicons name="newspaper" size={14} color="#1D4ED8" /></View>
          <Text style={s.title}>News</Text>
        </View>
        <View style={s.tabs} accessibilityRole="tablist">
          {(["state", "national"] as const).map(k => (
            <Pressable key={k} onPress={() => setScope(k)} style={[s.tab, scope === k && s.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: scope === k }}>
              <Text style={[s.tabText, scope === k && s.tabTextOn]}>{k === "state" ? stateName() : "India"}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={s.source}>{`Source: ${source}${feed?.status === "stale" ? " · refreshing" : ""}`}</Text>

      {loading && !feed ? <ActivityIndicator color="#1D4ED8" style={{ paddingVertical: 16 }} /> : null}
      {!loading && feed?.status === "unavailable" && (
        <Pressable onPress={load} accessibilityRole="button"><Text style={s.empty}>News could not be loaded right now. Tap to try again.</Text></Pressable>
      )}
      {!loading && feed?.status !== "unavailable" && items.length === 0 && (
        <Text style={s.empty}>{scope === "state" ? `No recent official news mentions ${stateName()}.` : "No recent press releases."}</Text>
      )}

      {shown.map((it, i) => (
        <Pressable key={it.id} onPress={() => onOpen(it)} style={[s.row, i > 0 && s.rowBorder]} accessibilityRole="button" accessibilityLabel={it.title}>
          <View style={{ flex: 1 }}>
            <Text style={s.headline} numberOfLines={2}>{it.title}</Text>
            <Text style={s.meta}>{relTime(it.publishedAt)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color="#93C5FD" />
        </Pressable>
      ))}
      {items.length > 5 && (
        <Pressable onPress={() => setShowAll(v => !v)} style={s.more} accessibilityRole="button">
          <Text style={s.moreText}>{showAll ? "Show less" : `Show all ${items.length}`}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 18, marginHorizontal: 16, marginTop: 14, padding: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  title: { color: "#111827", fontSize: 16, fontFamily: "Inter_700Bold" },
  tabs: { flexDirection: "row", backgroundColor: "#F3F4F6", borderRadius: 10, padding: 2 },
  tab: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, maxWidth: 140 },
  tabOn: { backgroundColor: "#fff" },
  tabText: { color: "#4B5563", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  tabTextOn: { color: "#1D4ED8" },
  source: { color: "#4B5563", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 4 },
  empty: { color: "#4B5563", fontSize: 13, fontFamily: "Inter_400Regular", paddingVertical: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  headline: { color: "#111827", fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 19 },
  meta: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  more: { alignItems: "center", paddingTop: 8 },
  moreText: { color: "#1D4ED8", fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
