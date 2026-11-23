import React, { useState } from "react";
import { Pressable, Text, StyleSheet, Share, Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiUrl } from "@/lib/query-client";

/**
 * Lets the person in an SOS send their own live-location link to family (WhatsApp, SMS, any app) — it works
 * even when the SMS gateway is not set up. The link opens a page on our server that shows the live position
 * and expires in 24 hours; the message itself carries no location.
 */
export function ShareLiveLocation({ alertId, token }: { alertId: string; token: string | null }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);

  const share = async () => {
    setState("busy");
    try {
      let link = url;
      if (!link) {
        const r = await fetch(new URL(`/api/sos/${alertId}/share-link`, getApiUrl()).toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { path: string };
        link = new URL(j.path, getApiUrl()).toString();
        setUrl(link);
      }
      const message = `🆘 I need help. Follow my live location here (works for 24 hours): ${link}  — Call 112 if you cannot reach me.`;
      if (Platform.OS === "web") {
        const nav = globalThis.navigator as Navigator | undefined;
        if (nav?.share) { await nav.share({ title: "SANKALP SOS", text: message, url: link }); setState("idle"); return; }
        await nav?.clipboard?.writeText(message);
        setState("copied");
        return;
      }
      await Share.share({ message });
      setState("idle");
    } catch {
      setState(url ? "idle" : "error");
    }
  };

  return (
    <View style={{ gap: 6 }}>
      <Pressable onPress={share} disabled={state === "busy"} style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}
        accessibilityRole="button" accessibilityLabel="Share my live location with family">
        <Ionicons name="share-social" size={16} color="#fff" />
        <Text style={s.text}>{state === "busy" ? "Preparing link…" : "Share live location with family"}</Text>
      </Pressable>
      {state === "copied" ? <Text style={s.note}>Link copied — paste it into WhatsApp or SMS.</Text> : null}
      {state === "error" ? <Text style={s.note}>Could not create the link. Call 112, or try again.</Text> : null}
      {url && Platform.OS === "web" ? <Text style={s.link} selectable>{url}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1D4ED8", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  text: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  note: { color: "#E5E7EB", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  link: { color: "#BFDBFE", fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center" },
});
