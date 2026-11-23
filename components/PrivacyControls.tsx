import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, Platform, Share, Linking, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

/** DPDP data-principal rights in the app (P1.9): view notice, download my data, delete my account. */
export function PrivacyControls() {
  const { token, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  // Separate, optional consent: complaint photos may help train SANKALP's own AI (off unless the person turns it on).
  const [training, setTraining] = useState<boolean | null>(null);
  useEffect(() => {
    if (!token) return;
    fetch(`${getApiUrl()}api/privacy/training-consent`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null)).then(d => setTraining(d ? !!d.allow : null)).catch(() => {});
  }, [token]);
  const setTrainingConsent = async (allow: boolean) => {
    if (!token) return;
    const prev = training;
    setTraining(allow);
    try {
      const r = await fetch(`${getApiUrl()}api/privacy/training-consent`, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ allow }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch { setTraining(prev); }
  };

  const download = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch(`${getApiUrl()}api/privacy/my-data`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Could not export your data");
      const text = JSON.stringify(await r.json(), null, 2);
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        a.download = "sankalp-my-data.json";
        a.click();
      } else {
        await Share.share({ title: "SANKALP — my data", message: text });
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const erase = async () => {
    const go = async () => {
      setBusy(true);
      try {
        const r = await fetch(`${getApiUrl()}api/privacy/erasure`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }),
        });
        const d = await r.json();
        Alert.alert(d.status === "completed" ? "Account deleted" : "Request received", d.message);
        if (d.status === "completed") await logout();
      } catch {
        Alert.alert("Error", "Could not submit the request");
      } finally {
        setBusy(false);
      }
    };
    if (Platform.OS === "web") { if (window.confirm("Delete your SANKALP account and personal data? This cannot be undone.")) void go(); return; }
    Alert.alert("Delete account?", "Your account and personal data will be erased. Complaints stay on record without your name. SOS records may be kept by law.", [
      { text: "Cancel", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => void go() },
    ]);
  };

  const Row = ({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void; danger?: boolean }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={busy} onPress={onPress} style={s.row}>
      <Ionicons name={icon} size={18} color={danger ? "#B91C1C" : "#1F2937"} />
      <Text style={[s.label, danger && { color: "#B91C1C" }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
    </Pressable>
  );

  return (
    <View style={s.card}>
      <Text style={s.title} accessibilityRole="header">Privacy & my data</Text>
      <Row icon="document-text-outline" label="Privacy notice (हिन्दी / English)" onPress={() => Linking.openURL(`${getApiUrl()}web/privacy`)} />
      <Row icon="download-outline" label="Download my data" onPress={download} />
      {training !== null ? (
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Help improve SANKALP&apos;s AI with my complaint photos</Text>
            <Text style={s.hint}>Optional. Only photos (location data removed) and the confirmed problem type are used, on servers in India. You can turn this off at any time.</Text>
          </View>
          <Switch value={training} onValueChange={setTrainingConsent} accessibilityLabel="Allow my complaint photos to train SANKALP AI" trackColor={{ true: "#C2410C" }} thumbColor="#fff" />
        </View>
      ) : null}
      <Row icon="trash-outline" label="Delete my account" onPress={erase} danger />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: "#F3F4F6" },
  title: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  label: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: "#1F2937" },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#4B5563", marginTop: 2, lineHeight: 16 },
});
