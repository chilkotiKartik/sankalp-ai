import React, { useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const entries = buildEntries(sosAlerts);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://sankalp-ai.replit.app";
  const html = buildSosHeatmapHTML(entries, origin);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  }, [html]);

  return (
    <View style={[s.wrap, { height }]}>
      <iframe
        ref={iframeRef as any}
        style={{ width: "100%", height: "100%", border: "none", backgroundColor: "#0d1117", display: "block" }}
        title="SOS Heatmap"
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", borderRadius: 12, overflow: "hidden" as const },
});
