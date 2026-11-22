import React, { useRef, useState } from "react";
import { Pressable, Text, View, ActivityIndicator, Platform, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { getApiUrl } from "@/lib/query-client";
import { useI18n } from "@/lib/i18n";

/**
 * P5.5 voice-first complaint: tap to speak, tap to stop → Sarvam STT (India) → the text is added to the
 * description field, where the citizen can still edit it before submitting. Audio is not stored on the server.
 */
export function VoiceInput({ token, onText }: { token: string | null; onText: (text: string) => void }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const rec = useRef<Audio.Recording | null>(null);
  const webRec = useRef<{ mr: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);

  const send = async (audioBase64: string) => {
    setState("working");
    try {
      const r = await fetch(`${getApiUrl()}api/ai/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ audioBase64, lang: lang === "en" ? "en-IN" : "hi-IN" }),
      });
      const d = await r.json();
      if (r.ok && d.transcript) { onText(String(d.transcript)); setMsg(null); } else setMsg(t("complaint.voiceUnavailable"));
    } catch {
      setMsg(t("complaint.voiceUnavailable"));
    } finally {
      setState("idle");
    }
  };

  const start = async () => {
    setMsg(null);
    try {
      if (Platform.OS === "web") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        mr.ondataavailable = e => chunks.push(e.data);
        mr.start();
        webRec.current = { mr, chunks, stream };
      } else {
        const perm = await Audio.requestPermissionsAsync();
        if (!perm.granted) { setMsg(t("complaint.voiceUnavailable")); return; }
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
        rec.current = recording;
      }
      setState("recording");
    } catch {
      setMsg(t("complaint.voiceUnavailable"));
    }
  };

  const stop = async () => {
    try {
      if (Platform.OS === "web" && webRec.current) {
        const { mr, chunks, stream } = webRec.current;
        webRec.current = null;
        await new Promise<void>(res => { mr.onstop = () => res(); mr.stop(); });
        stream.getTracks().forEach(tr => tr.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        const b64 = await new Promise<string>(res => { const fr = new FileReader(); fr.onloadend = () => res(String(fr.result).split(",")[1] ?? ""); fr.readAsDataURL(blob); });
        await send(b64);
      } else if (rec.current) {
        const r = rec.current;
        rec.current = null;
        await r.stopAndUnloadAsync();
        const uri = r.getURI();
        if (!uri) { setState("idle"); return; }
        await send(await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }));
      }
    } catch {
      setState("idle");
      setMsg(t("complaint.voiceUnavailable"));
    }
  };

  const label = state === "recording" ? t("complaint.listening") : state === "working" ? t("complaint.transcribing") : t("complaint.speak");
  return (
    <View style={{ marginVertical: 6 }}>
      <Pressable
        onPress={state === "recording" ? stop : state === "idle" ? start : undefined}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ busy: state === "working" }}
        style={[s.btn, state === "recording" && s.rec]}
      >
        {state === "working" ? <ActivityIndicator color="#fff" /> : <Ionicons name={state === "recording" ? "stop-circle" : "mic"} size={20} color="#fff" />}
        <Text style={s.txt}>{label}</Text>
      </Pressable>
      {msg && <Text style={s.msg} accessibilityLiveRegion="polite">{msg}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1f6feb", borderRadius: 10, paddingHorizontal: 14 },
  rec: { backgroundColor: "#da3633" },
  txt: { color: "#fff", fontWeight: "700", fontSize: 14 },
  msg: { color: "#e3b341", fontSize: 12, marginTop: 4 },
});
