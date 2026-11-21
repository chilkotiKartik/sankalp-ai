import React, { useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Vibration, Alert, Modal } from "react-native";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { isIndianMobile, normalizeIndianMobile } from "@/lib/india";

/**
 * P6.1/P6.3 personal safety tools:
 *  - trusted contacts (≤ 5) — they get an SMS link when you send SOS or miss a check-in
 *  - check-in timer — "check on me in N minutes"; if you don't tap "I'm safe", your contacts are alerted
 *  - fake incoming call — a realistic ringing screen to leave an uncomfortable situation (works offline)
 */
type Contact = { label: string; phone: string };

export default function SafetyScreen() {
  const { token } = useAuth();
  const api = (path: string, method = "GET", body?: unknown) => fetch(`${getApiUrl()}${path.slice(1)}`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` }, body: body ? JSON.stringify(body) : undefined,
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.message || "Request failed"); return j; });

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [minutes, setMinutes] = useState("30");
  const [checkIn, setCheckIn] = useState<{ id: string; dueAt: string } | null>(null);
  const [caller, setCaller] = useState("Maa");
  const [delay, setDelay] = useState("10");
  const [ringing, setRinging] = useState(false);
  const [inCall, setInCall] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { api("/api/me/trusted-contacts").then(setContacts).catch(() => {}); }, [token]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); Vibration.cancel(); }, []);
  useEffect(() => {
    if (!inCall) return;
    const i = setInterval(() => setInCall(s => s + 1), 1000);
    return () => clearInterval(i);
  }, [inCall > 0]);

  const saveContacts = async () => {
    const clean = contacts.filter(c => c.phone.trim()).map(c => ({ label: c.label.trim() || "Contact", phone: normalizeIndianMobile(c.phone) }));
    if (clean.some(c => !isIndianMobile(c.phone))) { Alert.alert("Check the numbers", "Enter 10-digit Indian mobile numbers"); return; }
    try { await api("/api/me/trusted-contacts", "PUT", { contacts: clean }); Alert.alert("Saved", `${clean.length} trusted contact(s) saved`); } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const startCheckIn = async () => {
    let geo: { lat: number; lng: number } | undefined;
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.granted) { const pos = await Location.getCurrentPositionAsync({}); geo = { lat: pos.coords.latitude, lng: pos.coords.longitude }; }
    } catch { /* optional */ }
    try { const r = await api("/api/safety/checkins", "POST", { minutes: Number(minutes) || 30, geo }); setCheckIn(r); } catch (e: any) { Alert.alert("Could not start", e.message); }
  };
  const safe = async () => {
    if (!checkIn) return;
    try { await api(`/api/safety/checkins/${checkIn.id}/done`, "PUT", {}); setCheckIn(null); } catch (e: any) { Alert.alert("Error", e.message); }
  };

  const scheduleFakeCall = () => {
    const s = Math.max(0, Math.min(600, Number(delay) || 0));
    timer.current = setTimeout(() => { setRinging(true); Vibration.vibrate([0, 800, 600], true); }, s * 1000);
    Alert.alert("Fake call set", s ? `Your phone will ring in ${s} seconds.` : "Ringing now.");
  };
  const answer = () => { Vibration.cancel(); setRinging(false); setInCall(1); };
  const hangUp = () => { Vibration.cancel(); setRinging(false); setInCall(0); };

  return (
    <ScrollView style={st.page} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={st.back}><Ionicons name="arrow-back" size={22} color="#111" /></Pressable>
      <Text style={st.h1} accessibilityRole="header">Safety tools</Text>

      <Text style={st.h2}>Trusted contacts</Text>
      <Text style={st.p}>They get an SMS with a private live-location link when you send SOS or miss a check-in. Nothing else is shared.</Text>
      {contacts.map((c, i) => (
        <View key={i} style={st.row}>
          <TextInput style={[st.in, { flex: 1 }]} value={c.label} placeholder="Name" accessibilityLabel={`Contact ${i + 1} name`} onChangeText={v => setContacts(cs => cs.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
          <TextInput style={[st.in, { flex: 1.3 }]} value={c.phone} placeholder="Mobile" keyboardType="phone-pad" accessibilityLabel={`Contact ${i + 1} mobile number`} onChangeText={v => setContacts(cs => cs.map((x, j) => (j === i ? { ...x, phone: v } : x)))} />
          <Pressable onPress={() => setContacts(cs => cs.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove contact ${i + 1}`} style={st.icon}><Ionicons name="trash-outline" size={20} color="#B91C1C" /></Pressable>
        </View>
      ))}
      <View style={st.row}>
        {contacts.length < 5 && <Pressable style={[st.btn, st.ghost]} onPress={() => setContacts(cs => [...cs, { label: "", phone: "" }])} accessibilityRole="button"><Text style={st.ghostT}>+ Add contact</Text></Pressable>}
        <Pressable style={st.btn} onPress={saveContacts} accessibilityRole="button"><Text style={st.btnT}>Save contacts</Text></Pressable>
      </View>

      <Text style={st.h2}>Check-in timer</Text>
      {checkIn ? (
        <View>
          <Text style={st.p}>{`Due by ${new Date(checkIn.dueAt).toLocaleTimeString()}. If you do not confirm, your contacts are alerted.`}</Text>
          <Pressable style={[st.btn, { backgroundColor: "#15803D" }]} onPress={safe} accessibilityRole="button"><Text style={st.btnT}>{"✓ I am safe"}</Text></Pressable>
        </View>
      ) : (
        <View style={st.row}>
          <TextInput style={[st.in, { width: 90 }]} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" accessibilityLabel="Minutes until check-in" />
          <Text style={st.p}>minutes</Text>
          <Pressable style={st.btn} onPress={startCheckIn} accessibilityRole="button"><Text style={st.btnT}>Start check-in</Text></Pressable>
        </View>
      )}

      <Text style={st.h2}>Fake incoming call</Text>
      <Text style={st.p}>Your phone rings with a caller name you choose — an easy reason to leave. Works without internet.</Text>
      <View style={st.row}>
        <TextInput style={[st.in, { flex: 1 }]} value={caller} onChangeText={setCaller} accessibilityLabel="Caller name" />
        <TextInput style={[st.in, { width: 80 }]} value={delay} onChangeText={setDelay} keyboardType="number-pad" accessibilityLabel="Ring after seconds" />
        <Pressable style={st.btn} onPress={scheduleFakeCall} accessibilityRole="button"><Text style={st.btnT}>Set</Text></Pressable>
      </View>

      <Modal visible={ringing || inCall > 0} animationType="fade" onRequestClose={hangUp}>
        <View style={st.call}>
          <Text style={st.callName}>{caller || "Unknown"}</Text>
          <Text style={st.callSub}>{ringing ? "Incoming call…" : `${Math.floor((inCall - 1) / 60)}:${String((inCall - 1) % 60).padStart(2, "0")}`}</Text>
          <View style={st.callRow}>
            <Pressable onPress={hangUp} style={[st.round, { backgroundColor: "#DC2626" }]} accessibilityRole="button" accessibilityLabel="Decline"><Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} /></Pressable>
            {ringing && <Pressable onPress={answer} style={[st.round, { backgroundColor: "#16A34A" }]} accessibilityRole="button" accessibilityLabel="Answer"><Ionicons name="call" size={30} color="#fff" /></Pressable>}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#fff" },
  back: { minHeight: 44, minWidth: 44, justifyContent: "center" },
  h1: { fontSize: 24, fontWeight: "800", color: "#111", marginBottom: 8 },
  h2: { fontSize: 17, fontWeight: "700", color: "#111", marginTop: 22, marginBottom: 6 },
  p: { color: "#374151", fontSize: 14, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  in: { minHeight: 44, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10, paddingHorizontal: 10, color: "#111" },
  btn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center" },
  btnT: { color: "#fff", fontWeight: "700" },
  ghost: { backgroundColor: "#EFF6FF" },
  ghostT: { color: "#1D4ED8", fontWeight: "700" },
  icon: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  call: { flex: 1, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", gap: 12 },
  callName: { color: "#fff", fontSize: 34, fontWeight: "700" },
  callSub: { color: "#D1D5DB", fontSize: 18 },
  callRow: { flexDirection: "row", gap: 60, marginTop: 80 },
  round: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
});
