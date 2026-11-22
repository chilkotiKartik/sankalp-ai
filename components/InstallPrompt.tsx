import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSegments } from "expo-router";

/**
 * Web app only: offers to install SANKALP to the home screen.
 *  - Android / desktop Chrome: one-tap "Install" (the browser's own prompt, captured by /pwa/register.js).
 *  - iPhone / iPad Safari: iOS has no install API, so we show the two steps (Share → Add to Home Screen).
 * Hidden inside the installed app, after "Not now" (remembered for 14 days), and on native builds.
 */
const KEY = "sankalp_install_dismissed_at";
type Mode = "android" | "ios" | null;

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
declare global { interface Window { __sankalpInstallPrompt?: InstallEvent } }

function standalone(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}
function dismissedRecently(): boolean {
  try { const t = Number(localStorage.getItem(KEY) || 0); return Date.now() - t < 14 * 86400000; } catch { return false; }
}

export function InstallPrompt() {
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const [mode, setMode] = useState<Mode>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || standalone() || dismissedRecently()) return;
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS) timer = setTimeout(() => setMode("ios"), 4000);
    const onReady = () => setMode("android");
    if (window.__sankalpInstallPrompt) onReady();
    window.addEventListener("sankalp:installable", onReady);
    const onInstalled = () => setMode(null);
    window.addEventListener("appinstalled", onInstalled);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("sankalp:installable", onReady); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  // Not over the sign-in/onboarding screens (it would cover their buttons); fine on the state list and in the app.
  if (!mode || (segments[0] === "(auth)" && segments[1] !== "state")) return null;
  const dismiss = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* private mode */ } setMode(null); };
  const install = async () => {
    const ev = window.__sankalpInstallPrompt;
    if (!ev) return;
    await ev.prompt();
    try { await ev.userChoice; } catch { /* ignore */ }
    window.__sankalpInstallPrompt = undefined;
    setMode(null);
  };

  return (
    <View style={[s.wrap, { bottom: insets.bottom + 92 }]} accessibilityRole="alert">
      <View style={s.icon}><Ionicons name="phone-portrait-outline" size={20} color="#FF9933" /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Install SANKALP AI</Text>
        {mode === "android" ? (
          <Text style={s.body}>Add it to your home screen — opens like an app, works on slow networks.</Text>
        ) : (
          <Text style={s.body}>
            Tap <Ionicons name="share-outline" size={13} color="#FFF8F0" /> Share, then “Add to Home Screen”.
          </Text>
        )}
      </View>
      {mode === "android" && (
        <Pressable onPress={install} style={s.btn} accessibilityRole="button" accessibilityLabel="Install the app">
          <Text style={s.btnText}>Install</Text>
        </Pressable>
      )}
      <Pressable onPress={dismiss} style={s.close} accessibilityRole="button" accessibilityLabel="Not now">
        <Ionicons name="close" size={18} color="#BFA88A" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 12, right: 12, zIndex: 9000, flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#1F1814", borderColor: "#FF993355", borderWidth: 1, borderRadius: 14, padding: 12,
    shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,153,51,0.12)", alignItems: "center", justifyContent: "center" },
  title: { color: "#FFF8F0", fontSize: 14, fontFamily: "Inter_700Bold" },
  body: { color: "#E5D5C0", fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  btn: { backgroundColor: "#C2410C", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  btnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  close: { padding: 4 },
});
