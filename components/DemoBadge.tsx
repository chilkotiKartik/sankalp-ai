import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRuntimeConfig } from "@/lib/runtime-config";

/** Rule 3: whenever the server runs DEMO_MODE, every screen shows a visible DEMO badge. */
export function DemoBadge() {
  const cfg = useRuntimeConfig();
  const insets = useSafeAreaInsets();
  if (!cfg?.demoMode) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 4 }]} accessibilityRole="text" accessibilityLabel="Demo mode: data shown is simulated">
      <Text style={styles.text}>DEMO · simulated data</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", alignSelf: "center", zIndex: 9999, backgroundColor: "#B45309", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  text: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1 },
});
