import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, SectionList, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useTenant, type TenantSummary } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";

/** P9 state picker: every Indian state and UT comes from the server; "Use my location" picks the one you are in. */
function containing(list: TenantSummary[], lat: number, lng: number): TenantSummary | undefined {
  const hits = list.filter(t => t.bounds && lat >= t.bounds.south && lat <= t.bounds.north && lng >= t.bounds.west && lng <= t.bounds.east);
  // Bounding boxes overlap at borders: prefer the smallest box (a UT inside a larger state's box, e.g. Chandigarh).
  const area = (t: TenantSummary) => (t.bounds!.north - t.bounds!.south) * (t.bounds!.east - t.bounds!.west);
  hits.sort((a, b) => area(a) - area(b));
  if (hits.length) return hits[0];
  // Outside every box (e.g. at sea): nearest centre.
  return [...list].sort((a, b) => Math.hypot(a.center.lat - lat, a.center.lng - lng) - Math.hypot(b.center.lat - lat, b.center.lng - lng))[0];
}

export default function StatePicker() {
  const insets = useSafeAreaInsets();
  const { tenants, refreshTenants, loadingTenants, error, selectState, tenantId } = useTenant();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const { user, logout } = useAuth();

  useEffect(() => { if (!tenants.length) refreshTenants(); }, []);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = tenants.filter(t => !needle || t.name.toLowerCase().includes(needle) || t.nameLocal.toLowerCase().includes(needle) || t.capital.toLowerCase().includes(needle));
    return [
      { title: "States", data: f.filter(t => t.type === "state") },
      { title: "Union Territories", data: f.filter(t => t.type === "ut") },
    ].filter(s => s.data.length);
  }, [tenants, q]);

  const choose = async (id: string) => {
    setBusy(id);
    try {
      // Accounts belong to one state: a signed-in user switching state is signed out first.
      if (user && id !== tenantId) await logout();
      if (!(await selectState(id))) { setLocMsg("Could not load that state's settings. Check your connection and try again."); return; }
      const onboarded = await AsyncStorage.getItem("@sankalp_onboarded");
      router.replace(onboarded === "true" ? "/(auth)/login" : "/(auth)/onboarding");
    } finally { setBusy(null); }
  };

  const useLocation = async () => {
    setLocMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocMsg("Location permission denied — please pick your state from the list."); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const hit = containing(tenants, pos.coords.latitude, pos.coords.longitude);
      if (hit) await choose(hit.id); else setLocMsg("Could not tell which state you are in — please pick from the list.");
    } catch { setLocMsg("Could not read your location — please pick your state from the list."); }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 16 }]}>
      <Text style={s.title} accessibilityRole="header">Choose your state</Text>
      <Text style={s.sub}>SANKALP works in every Indian state and union territory. Your complaints go to your state&apos;s departments; your data stays in India.</Text>

      <Pressable style={s.locBtn} onPress={useLocation} accessibilityRole="button" accessibilityLabel="Use my location to choose my state" disabled={!tenants.length}>
        <Ionicons name="locate" size={18} color="#fff" />
        <Text style={s.locText}>Use my location</Text>
      </Pressable>
      {locMsg ? <Text style={s.note}>{locMsg}</Text> : null}

      <View style={s.search}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search state, UT or capital" placeholderTextColor={Colors.textMuted} style={s.input} accessibilityLabel="Search states" autoCorrect={false} />
      </View>

      {loadingTenants && !tenants.length ? <ActivityIndicator color={Colors.saffron} style={{ marginTop: 32 }} /> : null}
      {error && !tenants.length ? (
        <Pressable onPress={refreshTenants} style={s.retry} accessibilityRole="button"><Text style={s.retryText}>{error} Tap to retry.</Text></Pressable>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={t => t.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={s.section}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable onPress={() => choose(item.id)} style={({ pressed }) => [s.row, (pressed || tenantId === item.id) && s.rowActive]}
            accessibilityRole="button" accessibilityLabel={`${item.name}${item.coverage === "full" ? "" : ", state-level setup"}`}>
            <View style={s.badge}><Text style={s.badgeText}>{item.ticketPrefix}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}{item.nameLocal && item.nameLocal !== item.name ? <Text style={s.local}>  {item.nameLocal}</Text> : null}</Text>
              <Text style={s.meta}>{item.capital}{item.districtCount ? ` · ${item.districtCount} districts` : ""}{item.coverage === "full" ? " · Full setup" : ""}</Text>
            </View>
            {busy === item.id ? <ActivityIndicator color={Colors.saffron} /> : <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 16 },
  title: { color: Colors.textPrimary, fontSize: 26, fontFamily: "Inter_700Bold" },
  sub: { color: Colors.textSecondary, fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 20 },
  locBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.saffronDark, borderRadius: 12, paddingVertical: 12, marginTop: 16 },
  locText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  note: { color: Colors.textSecondary, fontSize: 13, marginTop: 8, fontFamily: "Inter_400Regular" },
  search: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.bgCard, borderColor: Colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, marginTop: 14, height: 44 },
  input: { flex: 1, color: Colors.textPrimary, fontSize: 15, fontFamily: "Inter_400Regular", ...(Platform.OS === "web" ? { outlineStyle: "none" as never } : {}) },
  section: { color: Colors.saffron, fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 1, textTransform: "uppercase", marginTop: 18, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
  rowActive: { borderColor: Colors.saffron },
  badge: { width: 40, height: 40, borderRadius: 10, backgroundColor: Colors.saffronBg, alignItems: "center", justifyContent: "center" },
  badgeText: { color: Colors.saffron, fontFamily: "Inter_700Bold", fontSize: 13 },
  name: { color: Colors.textPrimary, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  local: { color: Colors.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular" },
  meta: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  retry: { marginTop: 24, padding: 12, borderRadius: 10, backgroundColor: Colors.bgCard },
  retryText: { color: Colors.textPrimary, textAlign: "center" },
});
