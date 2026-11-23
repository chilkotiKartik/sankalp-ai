import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, AppState, Pressable } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { REASON_LABEL } from "@/constants/points";

/**
 * Coin burst when the person has really earned Sankalp Points since they last looked (D-059).
 * Driven only by the server's points ledger — never shown for nothing, never for SOS.
 */
const COINS = 9;

export function PointsCelebration() {
  const { user, token } = useAuth();
  const [gain, setGain] = useState<{ delta: number; reason: string } | null>(null);
  const coins = useRef([...Array(COINS)].map(() => new Animated.Value(0))).current;
  const toast = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user || !token || user.role !== "citizen") return;
    const key = `@sankalp_points_seen_${user.id}`;
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch(`${getApiUrl()}api/me/points`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || !alive) return;
        const d = (await r.json()) as { points: number; history: { delta: number; reason: string }[] };
        const seenRaw = await AsyncStorage.getItem(key);
        await AsyncStorage.setItem(key, String(d.points));
        if (seenRaw === null) return; // first visit on this device: remember, don't celebrate old points
        const delta = d.points - Number(seenRaw);
        const latest = d.history.find(h => h.reason !== "earlier_activity");
        if (delta > 0 && latest) setGain({ delta, reason: latest.reason });
      } catch { /* offline: try next time */ }
    };
    check();
    const t = setInterval(check, 60_000);
    const sub = AppState.addEventListener("change", s => { if (s === "active") check(); });
    return () => { alive = false; clearInterval(t); sub.remove(); };
  }, [user?.id, token]);

  useEffect(() => {
    if (!gain) return;
    coins.forEach(c => c.setValue(0));
    toast.setValue(0);
    Animated.parallel([
      Animated.stagger(70, coins.map(c => Animated.timing(c, { toValue: 1, duration: 1300, easing: Easing.out(Easing.cubic), useNativeDriver: false }))),
      Animated.sequence([
        Animated.spring(toast, { toValue: 1, friction: 6, useNativeDriver: false }),
        Animated.delay(3200),
        Animated.timing(toast, { toValue: 0, duration: 300, useNativeDriver: false }),
      ]),
    ]).start(() => setGain(null));
  }, [gain]);

  if (!gain) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {coins.map((c, i) => {
        const x = (i - (COINS - 1) / 2) * 34;
        return (
          <Animated.Text key={i} accessibilityElementsHidden style={[s.coin, {
            opacity: c.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: c.interpolate({ inputRange: [0, 1], outputRange: [0, x] }) },
              { translateY: c.interpolate({ inputRange: [0, 1], outputRange: [0, -220 - (i % 3) * 40] }) },
              { rotate: c.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${(i % 2 ? 1 : -1) * 360}deg`] }) },
            ],
          }]}>🪙</Animated.Text>
        );
      })}
      <Animated.View style={[s.toast, { opacity: toast, transform: [{ scale: toast.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }]}>
        <Pressable onPress={() => router.push("/points")} accessibilityRole="button" accessibilityLiveRegion="polite"
          accessibilityLabel={`You earned ${gain.delta} Sankalp Points. ${REASON_LABEL[gain.reason] ?? ""}`}>
          <Text style={s.toastPts}>+{gain.delta} Sankalp Points</Text>
          <Text style={s.toastWhy}>{REASON_LABEL[gain.reason] ?? "Thank you for helping"}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  coin: { position: "absolute", bottom: 160, alignSelf: "center", fontSize: 30 },
  toast: { position: "absolute", bottom: 110, alignSelf: "center", backgroundColor: "#9A3412", borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, elevation: 8 },
  toastPts: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  toastWhy: { color: "#FFEDD5", fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 2 },
});
