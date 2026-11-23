import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getTenantId, onTenantChange } from "@/lib/tenant";
import { useAuth } from "@/context/AuthContext";
import { stateName } from "@/constants/districts";

/**
 * Official disaster and weather alerts from NDMA's SACHET (IMD, CWC, State Disaster Management Authorities).
 * Rendered only when there is a current alert for the user's district or state — never invented, never a placeholder.
 */
interface Alert { id: string; title: string; category: string; issuer: string; link: string; publishedAt: string }
interface Result { status: "ok" | "stale" | "unavailable"; scope: "district" | "state"; items: Alert[]; source: { name: string; url: string } }

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString("en-IN");
};

export function OfficialAlerts() {
  const { user } = useAuth();
  const [data, setData] = useState<Result | null>(null);
  const [tid, setTid] = useState(getTenantId());
  const [open, setOpen] = useState(false);
  useEffect(() => onTenantChange(setTid), []);
  useEffect(() => {
    const load = () => {
      const q = user?.district ? `?district=${encodeURIComponent(user.district)}` : "";
      fetch(new URL(`/api/public/alerts${q}`, getApiUrl()).toString()).then(r => (r.ok ? r.json() : null)).then(setData).catch(() => {});
    };
    load();
    const t = setInterval(load, 10 * 60 * 1000); // alerts change quickly: refresh every 10 minutes
    return () => clearInterval(t);
  }, [tid, user?.district]);

  if (!data || !data.items.length) return null;
  const shown = open ? data.items : data.items.slice(0, 2);
  const where = data.scope === "district" && user?.district ? user.district : stateName();
  return (
    <View style={s.card} accessibilityRole="alert">
      <View style={s.head}>
        <Ionicons name="warning" size={18} color="#B45309" />
        <Text style={s.title}>Official alerts · {where}</Text>
      </View>
      {shown.map((a, i) => (
        <Pressable key={a.id} onPress={() => Linking.openURL(a.link)} style={[s.row, i > 0 && s.rowBorder]} accessibilityRole="link" accessibilityLabel={`${a.issuer}: ${a.title}`}>
          <Text style={s.text}>{a.title}</Text>
          <Text style={s.meta}>{a.issuer} · {ago(a.publishedAt)}</Text>
        </Pressable>
      ))}
      {data.items.length > 2 ? (
        <Pressable onPress={() => setOpen(v => !v)} accessibilityRole="button"><Text style={s.more}>{open ? "Show less" : `Show all ${data.items.length} alerts`}</Text></Pressable>
      ) : null}
      <Text style={s.source}>Source: {data.source.name}{data.status === "stale" ? " · refreshing" : ""}. In an emergency call 112.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFBEB", borderRadius: 16, marginHorizontal: 16, marginTop: 14, padding: 14, borderWidth: 1, borderColor: "#FCD34D" },
  head: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  title: { color: "#78350F", fontSize: 15, fontFamily: "Inter_700Bold", flexShrink: 1 },
  row: { paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#FDE68A" },
  text: { color: "#1F2937", fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 19 },
  meta: { color: "#92400E", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 3 },
  more: { color: "#92400E", fontSize: 13, fontFamily: "Inter_700Bold", paddingTop: 6 },
  source: { color: "#78350F", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8 },
});
