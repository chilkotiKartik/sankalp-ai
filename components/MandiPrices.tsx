import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";
import { getTenantId, onTenantChange } from "@/lib/tenant";
import { useAuth } from "@/context/AuthContext";
import { stateName } from "@/constants/districts";

/**
 * Today's mandi (market) prices from Agmarknet via data.gov.in — official Government of India data.
 * Shown only when the server has a data.gov.in key and there are prices; otherwise nothing is rendered.
 */
interface Price { commodity: string; variety: string; market: string; district: string; date: string; min: number; max: number; modal: number }
interface Result { status: "ok" | "not_configured" | "unavailable"; scope: "district" | "state" | null; items: Price[]; source: { name: string; url: string } }

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function MandiPrices() {
  const { user } = useAuth();
  const [data, setData] = useState<Result | null>(null);
  const [tid, setTid] = useState(getTenantId());
  const [all, setAll] = useState(false);
  useEffect(() => onTenantChange(setTid), []);
  useEffect(() => {
    const q = user?.district ? `?district=${encodeURIComponent(user.district)}` : "";
    fetch(new URL(`/api/public/mandi-prices${q}`, getApiUrl()).toString())
      .then(r => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, [tid, user?.district]);

  if (!data || data.status !== "ok" || !data.items.length) return null;
  const shown = all ? data.items : data.items.slice(0, 6);
  const where = data.scope === "district" && user?.district ? user.district : stateName();
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.icon}><Ionicons name="leaf" size={14} color="#047857" /></View>
        <Text style={s.title}>Mandi prices · {where}</Text>
      </View>
      <Text style={s.sub}>Price per quintal (modal = most common), latest market day</Text>
      {shown.map((p, i) => (
        <View key={`${p.market}-${p.commodity}-${p.variety}-${i}`} style={[s.row, i > 0 && s.rowBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={s.crop}>{p.commodity}{p.variety && p.variety !== "Other" ? ` · ${p.variety}` : ""}</Text>
            <Text style={s.meta}>{p.market} · {p.date}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.price}>{rupees(p.modal)}</Text>
            <Text style={s.meta}>{rupees(p.min)}–{rupees(p.max)}</Text>
          </View>
        </View>
      ))}
      {data.items.length > 6 && (
        <Pressable onPress={() => setAll(v => !v)} style={s.more} accessibilityRole="button">
          <Text style={s.moreText}>{all ? "Show less" : `Show all ${data.items.length}`}</Text>
        </Pressable>
      )}
      <Pressable onPress={() => Linking.openURL(data.source.url)} accessibilityRole="link">
        <Text style={s.source}>Source: {data.source.name}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 18, marginHorizontal: 16, marginTop: 14, padding: 14, borderWidth: 1, borderColor: "#E5E7EB" },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" },
  title: { color: "#111827", fontSize: 16, fontFamily: "Inter_700Bold", flexShrink: 1 },
  sub: { color: "#4B5563", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 6, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  crop: { color: "#111827", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { color: "#4B5563", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  price: { color: "#047857", fontSize: 15, fontFamily: "Inter_700Bold" },
  more: { alignItems: "center", paddingTop: 8 },
  moreText: { color: "#047857", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  source: { color: "#4B5563", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8, textDecorationLine: "underline" },
});
