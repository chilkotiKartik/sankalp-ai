import React, { useRef, useEffect } from "react";
import { View, StyleSheet, Platform } from "react-native";
import WebView from "react-native-webview";
import { buildSosHeatmapHTML, SosHeatEntry } from "@/lib/sosheatmap-html";
import type { SOSAlert } from "@/context/AppContext";

interface Props {
  sosAlerts: SOSAlert[];
  height?: number;
}

function buildEntries(sosAlerts: SOSAlert[]): SosHeatEntry[] {
  const map: Record<string, SosHeatEntry> = {};
  for (const a of sosAlerts) {
    const d = (a as any).district || "Dehradun";
    if (!map[d]) map[d] = { district: d, total: 0, active: 0, womenSafety: 0, critical: 0 };
    map[d].total++;
    if (a.status === "active") map[d].active++;
    if (a.category === "women_safety") map[d].womenSafety++;
    if ((a as any).priority === "P1") map[d].critical++;
  }
  return Object.values(map);
}

export default function SosHeatmapCard({ sosAlerts, height = 200 }: Props) {
  const entries = buildEntries(sosAlerts);
  const html = buildSosHeatmapHTML(entries);
  return (
    <View style={[s.wrap, { height }]}>
      <WebView
        source={{ html }}
        style={s.map}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 12, overflow: "hidden" },
  map: { flex: 1, backgroundColor: "#0d1117" },
});
