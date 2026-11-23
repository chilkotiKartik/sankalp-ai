import React, { useCallback, useEffect, useState } from "react";
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";

/**
 * DPDP consent (P1.9). Citizens see the tenant's privacy notice (Hindi/English) and must accept it before
 * filing complaints or RTIs. SOS keeps working without consent (rule 9) — the notice says so.
 */
interface Notice {
  version: string; controller: string; processor: string; sharing: string; sosNote: string; aiProcessing?: string | null;
  purposes: { id: string; text: string }[]; dataCollected: string[]; rights: string[];
  retention: { complaintsDays: number; mediaDaysAfterClosure: number; sosEvidenceDays: number; sosAudioDays?: number };
  grievanceOfficer: { name: string; email: string; phone: string; address: string };
}

export function ConsentGate() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const [needed, setNeeded] = useState(false);
  const [lang, setLang] = useState<"hi" | "en">("hi");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || user?.role !== "citizen") { setNeeded(false); return; }
    let alive = true;
    fetch(`${getApiUrl()}api/privacy/consent`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d && !d.accepted) setNeeded(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token, user?.role]);

  useEffect(() => {
    if (!needed) return;
    fetch(`${getApiUrl()}api/public/privacy-notice?lang=${lang}`).then(r => r.json()).then(setNotice).catch(() => setError("Could not load the notice"));
  }, [needed, lang]);

  const accept = useCallback(async () => {
    if (!notice || !token) return;
    setSaving(true);
    setError("");
    try {
      const r = await fetch(`${getApiUrl()}api/privacy/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ version: notice.version, lang, accepted: true }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || "Failed");
      setNeeded(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [notice, token, lang]);

  if (!needed) return null;
  const hi = lang === "hi";
  const years = (d: number) => Math.round(d / 365);
  return (
    <Modal visible animationType="slide" onRequestClose={() => {}}>
      <View style={[s.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={s.header}>
          <Text style={s.title} accessibilityRole="header">{hi ? "गोपनीयता सूचना" : "Privacy notice"}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={hi ? "Switch to English" : "हिन्दी में देखें"} onPress={() => setLang(hi ? "en" : "hi")} style={s.langBtn}>
            <Text style={s.langText}>{hi ? "English" : "हिन्दी"}</Text>
          </Pressable>
        </View>
        {!notice ? <ActivityIndicator style={{ marginTop: 40 }} /> : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
            <Text style={s.p}>{notice.controller}. {notice.processor}.</Text>
            <Text style={s.h}>{hi ? "हम आपका डेटा क्यों लेते हैं" : "Why we use your data"}</Text>
            {notice.purposes.map(p => <Text key={p.id} style={s.li}>• {p.text}</Text>)}
            <Text style={s.h}>{hi ? "कौन सा डेटा" : "What data"}</Text>
            {notice.dataCollected.map(d => <Text key={d} style={s.li}>• {d}</Text>)}
            <Text style={s.h}>{hi ? "कितने समय तक" : "How long"}</Text>
            <Text style={s.li}>• {hi ? `शिकायतें: ${years(notice.retention.complaintsDays)} वर्ष · फोटो: बंद होने के ${years(notice.retention.mediaDaysAfterClosure)} वर्ष बाद तक · SOS सबूत: ${years(notice.retention.sosEvidenceDays)} वर्ष · SOS आवाज़: SOS बंद होने के बाद, रिकॉर्डिंग से ${notice.retention.sosAudioDays ?? 5} दिन पर मिटा दी जाती है (पुलिस सबूत रखे तो छोड़कर)`
              : `Complaints: ${years(notice.retention.complaintsDays)} years · Photos: ${years(notice.retention.mediaDaysAfterClosure)} year after closure · SOS evidence: ${years(notice.retention.sosEvidenceDays)} year · SOS voice clips: deleted ${notice.retention.sosAudioDays ?? 5} days after recording once the SOS is closed (unless police keep them as evidence)`}</Text>
            <Text style={s.h}>{hi ? "आपके अधिकार" : "Your rights"}</Text>
            {notice.rights.map(r => <Text key={r} style={s.li}>• {r}</Text>)}
            <Text style={s.p}>{notice.sharing}</Text>
            {notice.aiProcessing ? <Text style={s.p}>{notice.aiProcessing}</Text> : null}
            <Text style={[s.p, s.sos]}>{notice.sosNote}</Text>
            <Text style={s.h}>{hi ? "शिकायत अधिकारी" : "Grievance officer"}</Text>
            <Text style={s.li}>{notice.grievanceOfficer.name} · {notice.grievanceOfficer.email} · {notice.grievanceOfficer.phone}</Text>
          </ScrollView>
        )}
        {!!error && <Text style={s.err} accessibilityRole="alert">{error}</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={hi ? "मैं सहमत हूँ" : "I agree"} disabled={!notice || saving} onPress={accept} style={[s.accept, (!notice || saving) && { opacity: 0.6 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.acceptText}>{hi ? "मैंने पढ़ लिया है और सहमत हूँ" : "I have read this and agree"}</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#111827" },
  langBtn: { minHeight: 44, minWidth: 44, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: "#D1D5DB" },
  langText: { fontSize: 14, color: "#1F2937", fontFamily: "Inter_600SemiBold" },
  h: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#111827", marginTop: 14, marginBottom: 4 },
  p: { fontSize: 14, color: "#374151", lineHeight: 21, marginTop: 8 },
  li: { fontSize: 14, color: "#374151", lineHeight: 21 },
  sos: { color: "#B91C1C", fontFamily: "Inter_600SemiBold" },
  err: { color: "#B91C1C", marginBottom: 8 },
  accept: { minHeight: 52, borderRadius: 14, backgroundColor: "#047857", alignItems: "center", justifyContent: "center" },
  acceptText: { color: "#FFFFFF", fontSize: 16, fontFamily: "Inter_700Bold" },
});
