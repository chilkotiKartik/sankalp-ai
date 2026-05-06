// Web version — uses iframe + srcDoc (no react-native-webview needed)
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Modal, Dimensions,
  TextInput, Animated, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import {
  buildWorkerMapHTML, DISTRICT_CENTERS,
  type WorkerMapData, type DistrictHeatData,
} from "@/lib/workermap-html";

interface Worker {
  id: string; name: string; phone: string;
  ward: string; wardNumber: number; district: string;
  score: number; resolvedToday: number; totalResolved: number;
  avgRating: number; status: "active" | "idle" | "on_leave";
  currentTask?: string; geo: { lat: number; lng: number };
}

const STATUS_META = {
  active:   { color: "#00C060", bg: "#00C06022", label: "Active",   icon: "radio-button-on"  as const },
  idle:     { color: "#FFAB00", bg: "#FFAB0022", label: "Idle",     icon: "pause-circle"     as const },
  on_leave: { color: "#6B7280", bg: "#6B728022", label: "On Leave", icon: "moon"             as const },
};

const DISTRICTS = Object.keys(DISTRICT_CENTERS);
const { width: SW } = Dimensions.get("window");
const MAP_H = Math.min(Math.round(SW * 0.55), 480);

function buildHeatData(workers: Worker[]): DistrictHeatData[] {
  return DISTRICTS.map(d => {
    const dw = workers.filter(w => w.district === d);
    const active = dw.filter(w => w.status === "active").length;
    const avgScore = dw.length ? dw.reduce((s, w) => s + w.score, 0) / dw.length : 0;
    const [lat, lng] = DISTRICT_CENTERS[d];
    return { district: d, lat, lng, count: dw.length, active, avgScore };
  });
}

function toMapData(workers: Worker[]): WorkerMapData[] {
  return workers.map(w => ({
    id: w.id, name: w.name, status: w.status,
    lat: w.geo?.lat ?? 30.0, lng: w.geo?.lng ?? 78.5,
    district: w.district, ward: w.ward, score: w.score,
    task: w.currentTask ?? "", resolvedToday: w.resolvedToday,
    totalResolved: w.totalResolved, avgRating: w.avgRating, phone: w.phone,
  }));
}

// ── Web iframe map component ──────────────────────────────────────────────────
function WebMap({
  html,
  iframeRef,
  onWorkerTap,
  height,
}: {
  html: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  onWorkerTap: (id: string) => void;
  height: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.style.cssText = `width:100%;height:${height}px;border:none;display:block;background:#0d1117`;
    iframe.setAttribute("srcdoc", html);
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("title", "Worker GPS Map");
    (iframeRef as any).current = iframe;
    el.appendChild(iframe);
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string);
        if (msg.type === "workerTap") onWorkerTap(msg.id);
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (el.contains(iframe)) el.removeChild(iframe);
    };
  }, [html, height]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0d1117" }}>
      {/* @ts-ignore — web-only ref/div */}
      <div ref={containerRef} style={{ width: "100%", height: `${height}px` }} />
    </View>
  );
}

export default function WorkerMapScreen() {
  const insets = useSafeAreaInsets();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "idle" | "on_leave">("all");
  const [filterDistrict, setFilterDistrict] = useState("all");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");
  const [searchQuery, setSearchQuery] = useState("");
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapFocusId, setMapFocusId] = useState<string | null>(null);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const [htmlContent, setHtmlContent] = useState("");

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 0.25, duration: 750, useNativeDriver: false }),
      Animated.timing(pulseAnim, { toValue: 1,    duration: 750, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  const postToIframe = useCallback((msg: object) => {
    try {
      const ifr = iframeRef.current;
      if (ifr?.contentWindow) ifr.contentWindow.postMessage(JSON.stringify(msg), "*");
    } catch {}
  }, []);

  const pushMapUpdate = useCallback((updates: any[]) => {
    postToIframe({ type: "update", updates });
  }, [postToIframe]);

  const focusOnMap = useCallback((w: Worker) => {
    postToIframe({ type: "focus", id: w.id });
  }, [postToIframe]);

  const resetMap = useCallback(() => {
    setMapFocusId(null);
    postToIframe({ type: "reset" });
  }, [postToIframe]);

  const toggleHeat = () => {
    const next = !showHeat;
    setShowHeat(next);
    postToIframe({ type: "heat", visible: next });
  };

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      if (!tok) { setLoading(false); setRefreshing(false); return; }
      const base = getApiUrl();
      let res = await fetch(`${base}api/admin/workers`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) res = await fetch(`${base}api/workers`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const data = await res.json();
        const ws: Worker[] = Array.isArray(data) ? data : [];
        setWorkers(ws);
        setLastUpdate(new Date());
        if (silent) {
          const updates = ws.filter(w => w.geo).map(w => ({
            id: w.id, lat: w.geo.lat, lng: w.geo.lng, status: w.status, name: w.name,
          }));
          if (updates.length) pushMapUpdate(updates);
        }
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [pushMapUpdate]);

  useEffect(() => {
    const start = async () => {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      if (!tok) { load(); return; }
      const base = getApiUrl();
      if (typeof EventSource !== "undefined") {
        try {
          const es = new EventSource(`${base}api/workers/stream`);
          esRef.current = es;
          es.onopen = () => { setLiveStatus("live"); setLastUpdate(new Date()); };
          es.onerror = () => {
            setLiveStatus("offline"); es.close();
            fallbackRef.current = setInterval(() => load(true), 8000);
          };
          es.onmessage = (e: MessageEvent) => {
            try {
              const data = JSON.parse(e.data);
              if (data.type === "initial" && Array.isArray(data.workers)) {
                setWorkers(data.workers); setLoading(false); setLiveStatus("live"); setLastUpdate(new Date());
              } else if (data.type === "worker_geo_update" && Array.isArray(data.updates)) {
                setLastUpdate(new Date());
                setWorkers(prev => prev.map(w => {
                  const u = data.updates.find((x: any) => x.id === w.id);
                  return u ? { ...w, geo: u.geo, status: u.status } : w;
                }));
                const upd = data.updates.map((u: any) => ({
                  id: u.id, lat: u.geo.lat, lng: u.geo.lng, status: u.status, name: u.name || "",
                }));
                pushMapUpdate(upd);
              }
            } catch {}
          };
        } catch {
          setLiveStatus("offline");
          await load();
          fallbackRef.current = setInterval(() => load(true), 8000);
        }
      } else {
        setLiveStatus("live");
        await load();
        fallbackRef.current = setInterval(() => load(true), 8000);
      }
    };
    start();
    return () => { esRef.current?.close(); clearInterval(fallbackRef.current); };
  }, [load, pushMapUpdate]);

  useEffect(() => { load(); }, []);

  const filtered = workers.filter(w => {
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterDistrict !== "all" && w.district !== filterDistrict) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return w.name.toLowerCase().includes(q) || w.district.toLowerCase().includes(q) || w.ward.toLowerCase().includes(q);
    }
    return true;
  });

  // Only rebuild HTML when filtered workers, heatData, or focus changes
  useEffect(() => {
    const hd = buildHeatData(workers);
    setHtmlContent(buildWorkerMapHTML(toMapData(filtered), hd, mapFocusId, showHeat, true));
  }, [filtered.length, filterStatus, filterDistrict, searchQuery, mapFocusId, showHeat, workers.length]);

  const heatData = buildHeatData(workers);
  const activeCount = workers.filter(w => w.status === "active").length;
  const idleCount   = workers.filter(w => w.status === "idle").length;
  const leaveCount  = workers.filter(w => w.status === "on_leave").length;

  const onWorkerTap = useCallback((id: string) => {
    const w = workers.find(x => x.id === id);
    if (w) { setSelectedWorker(w); setMapFocusId(w.id); }
  }, [workers]);

  const handleWorkerPress = (w: Worker) => {
    setSelectedWorker(w); setMapFocusId(w.id); setViewMode("map");
    setTimeout(() => focusOnMap(w), 150);
  };

  const liveColor = liveStatus === "live" ? "#00C060" : liveStatus === "connecting" ? "#FFAB00" : "#EF4444";
  const liveLabel = liveStatus === "live" ? "Live SSE" : liveStatus === "connecting" ? "Connecting…" : "Polling";

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#060D18", Colors.bg]} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={s.headerMid}>
          <Text style={s.headerTitle}>Worker GPS Tracker</Text>
          <View style={s.liveRow}>
            <Animated.View style={[s.liveDot, { backgroundColor: liveColor, opacity: pulseAnim }]} />
            <Text style={[s.liveLabel, { color: liveColor }]}>{liveLabel}</Text>
            {lastUpdate && <Text style={s.ts}>· {lastUpdate.toLocaleTimeString()}</Text>}
          </View>
        </View>
        <View style={s.headerBtns}>
          <Pressable onPress={toggleHeat} style={[s.iconBtn, showHeat && s.iconBtnActive]}>
            <Ionicons name="layers" size={15} color={showHeat ? Colors.saffron : Colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setViewMode(v => v === "map" ? "list" : "map")} style={s.iconBtn}>
            <Ionicons name={viewMode === "map" ? "list" : "map"} size={15} color={Colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {/* Stats */}
      <View style={s.statsRow}>
        {([
          { label: "Active",  count: activeCount,    color: "#00C060", icon: "radio-button-on" as const, st: "active"   as const },
          { label: "Idle",    count: idleCount,      color: "#FFAB00", icon: "pause-circle"    as const, st: "idle"     as const },
          { label: "Leave",   count: leaveCount,     color: "#6B7280", icon: "moon"            as const, st: "on_leave" as const },
          { label: "Total",   count: workers.length, color: Colors.saffron, icon: "people"     as const, st: "all"      as const },
        ]).map(item => (
          <Pressable key={item.label}
            onPress={() => setFilterStatus(filterStatus === item.st && item.st !== "all" ? "all" : item.st)}
            style={[s.statBox, { borderColor: item.color + "44", backgroundColor: item.color + "12" },
              filterStatus === item.st && item.st !== "all" && { borderWidth: 2 }]}>
            <Ionicons name={item.icon} size={13} color={item.color} />
            <Text style={[s.statCount, { color: item.color }]}>{item.count}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Search + District */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={14} color={Colors.textMuted} />
          <TextInput style={s.searchInput} placeholder="Search name, ward, district…"
            placeholderTextColor={Colors.textMuted} value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setShowDistrictPicker(true)}
          style={[s.districtBtn, filterDistrict !== "all" && { borderColor: Colors.saffron, backgroundColor: Colors.saffronBg }]}>
          <Ionicons name="location" size={13} color={filterDistrict !== "all" ? Colors.saffron : Colors.textMuted} />
          <Text style={[s.districtBtnTxt, filterDistrict !== "all" && { color: Colors.saffron }]} numberOfLines={1}>
            {filterDistrict === "all" ? "District" : filterDistrict.split(" ")[0]}
          </Text>
        </Pressable>
      </View>

      {/* Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll} contentContainerStyle={s.pillRow}>
        {(["all", "active", "idle", "on_leave"] as const).map(st => {
          const meta = st !== "all" ? STATUS_META[st] : null;
          const isAct = filterStatus === st;
          const col = meta?.color ?? Colors.saffron;
          return (
            <Pressable key={st} onPress={() => setFilterStatus(st)}
              style={[s.pill, isAct && { backgroundColor: col + "18", borderColor: col }]}>
              {meta && <Ionicons name={meta.icon} size={10} color={isAct ? col : Colors.textMuted} />}
              <Text style={[s.pillTxt, isAct && { color: col, fontWeight: "700" }]}>
                {st === "all" ? `All (${filtered.length})` : `${meta!.label} (${workers.filter(w => w.status === st).length})`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={s.loaderBox}>
          <ActivityIndicator color={Colors.green} size="large" />
          <Text style={s.loaderTxt}>Loading worker GPS…</Text>
        </View>
      ) : (
        <ScrollView style={s.mainScroll}
          contentContainerStyle={[s.mainContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.green} />}>

          {/* Real Leaflet Map via iframe */}
          {viewMode === "map" && htmlContent ? (
            <View style={s.mapWrap}>
              <WebMap html={htmlContent} iframeRef={iframeRef} onWorkerTap={onWorkerTap} height={MAP_H} />
              <View style={s.mapOverlay}>
                <View style={s.mapPill}>
                  <Ionicons name="people" size={11} color={Colors.textSecondary} />
                  <Text style={s.mapPillTxt}>{filtered.length} workers</Text>
                </View>
                {mapFocusId && (
                  <Pressable onPress={resetMap} style={s.resetBtn}>
                    <Ionicons name="expand" size={12} color={Colors.saffron} />
                    <Text style={s.resetBtnTxt}>Show All</Text>
                  </Pressable>
                )}
                <Pressable onPress={toggleHeat} style={[s.heatBtn, showHeat && s.heatBtnActive]}>
                  <Ionicons name="layers" size={12} color={showHeat ? Colors.saffron : Colors.textMuted} />
                  <Text style={[s.heatBtnTxt, showHeat && { color: Colors.saffron }]}>Heatmap</Text>
                </Pressable>
              </View>
            </View>
          ) : viewMode === "map" ? (
            <View style={[s.mapWrap, { alignItems: "center", justifyContent: "center" }]}>
              <ActivityIndicator color={Colors.green} />
            </View>
          ) : null}

          {/* Section title */}
          <Text style={s.sectionTitle}>
            {viewMode === "map" ? "Tap row → focus worker on map" : `${filtered.length} Worker${filtered.length !== 1 ? "s" : ""}`}
            {filterDistrict !== "all" ? ` · ${filterDistrict}` : ""}
          </Text>

          {/* Worker list */}
          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
              <Text style={s.emptyTxt}>No workers match your filters</Text>
              <Pressable onPress={() => { setFilterStatus("all"); setFilterDistrict("all"); setSearchQuery(""); }} style={s.emptyBtn}>
                <Text style={s.emptyBtnTxt}>Clear Filters</Text>
              </Pressable>
            </View>
          ) : (
            filtered.map(w => {
              const meta = STATUS_META[w.status];
              const isSel = selectedWorker?.id === w.id;
              return (
                <Pressable key={w.id} onPress={() => handleWorkerPress(w)}
                  style={[s.card, isSel && s.cardSel]}>
                  <View style={[s.avatar, { borderColor: meta.color, backgroundColor: meta.color + "18" }]}>
                    <Text style={[s.avatarTxt, { color: meta.color }]}>{w.name.charAt(0)}</Text>
                    {w.status === "active" && <View style={[s.activePulse, { borderColor: meta.color }]} />}
                  </View>
                  <View style={s.cardInfo}>
                    <View style={s.nameRow}>
                      <Text style={s.workerName} numberOfLines={1}>{w.name}</Text>
                      <View style={[s.badge, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={9} color={meta.color} />
                        <Text style={[s.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={s.workerWard} numberOfLines={1}>{w.ward} · {w.district}</Text>
                    {w.currentTask && (
                      <View style={s.taskRow}>
                        <Ionicons name="construct-outline" size={10} color={Colors.saffron} />
                        <Text style={s.taskTxt} numberOfLines={1}>{w.currentTask}</Text>
                      </View>
                    )}
                    <View style={s.metaRow}>
                      <View style={s.metaItem}><Ionicons name="checkmark-done" size={10} color="#00C060" /><Text style={s.metaTxt}>{w.resolvedToday} today</Text></View>
                      <View style={s.metaItem}><Ionicons name="star" size={10} color={Colors.turmeric} /><Text style={s.metaTxt}>{w.avgRating.toFixed(1)}</Text></View>
                      <View style={s.metaItem}><Ionicons name="navigate" size={10} color={Colors.textMuted} /><Text style={s.metaTxt}>{w.geo?.lat?.toFixed(3)}°N</Text></View>
                    </View>
                  </View>
                  <View style={s.scoreBox}>
                    <Text style={s.scoreVal}>{w.score}</Text>
                    <Text style={s.scoreLbl}>pts</Text>
                    <Ionicons name="locate" size={13} color={isSel ? Colors.saffron : Colors.textMuted} style={{ marginTop: 4 }} />
                  </View>
                </Pressable>
              );
            })
          )}

          {/* District heatmap summary */}
          {viewMode === "list" && (
            <>
              <Text style={[s.sectionTitle, { marginTop: 8 }]}>District Overview</Text>
              <View style={s.districtGrid}>
                {heatData.filter(d => d.count > 0).map(d => {
                  const pct = d.count > 0 ? (d.active / d.count) : 0;
                  const heat = d.avgScore > 80 ? Colors.green : d.avgScore > 65 ? Colors.amber : "#EF4444";
                  return (
                    <Pressable key={d.district}
                      onPress={() => setFilterDistrict(filterDistrict === d.district ? "all" : d.district)}
                      style={[s.distCard, filterDistrict === d.district && { borderColor: Colors.saffron }]}>
                      <Text style={s.distName} numberOfLines={1}>{d.district}</Text>
                      <Text style={[s.distCount, { color: heat }]}>{d.count}</Text>
                      <View style={s.distBar}>
                        <View style={[s.distFill, { width: `${pct * 100}%`, backgroundColor: "#00C060" }]} />
                      </View>
                      <Text style={s.distMeta}>{d.active} active · {Math.round(d.avgScore)} avg</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Worker Detail Modal */}
      <Modal visible={!!selectedWorker} transparent animationType="slide" onRequestClose={() => setSelectedWorker(null)}>
        <Pressable style={s.overlay} onPress={() => setSelectedWorker(null)}>
          <Pressable style={[s.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={e => e.stopPropagation()}>
            {selectedWorker && (() => {
              const meta = STATUS_META[selectedWorker.status];
              return (
                <>
                  <View style={s.handle} />
                  <View style={s.detailHeader}>
                    <View style={[s.detailAvatar, { borderColor: meta.color, backgroundColor: meta.color + "18" }]}>
                      <Text style={[s.detailAvatarTxt, { color: meta.color }]}>{selectedWorker.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailName}>{selectedWorker.name}</Text>
                      <Text style={s.detailSub}>{selectedWorker.ward} · {selectedWorker.district}</Text>
                      <View style={[s.badge, { backgroundColor: meta.bg, alignSelf: "flex-start", marginTop: 4 }]}>
                        <Ionicons name={meta.icon} size={10} color={meta.color} />
                        <Text style={[s.badgeTxt, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Pressable onPress={() => setSelectedWorker(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={18} color={Colors.textMuted} />
                    </Pressable>
                  </View>

                  {selectedWorker.currentTask && (
                    <View style={s.taskBox}>
                      <Ionicons name="construct" size={13} color={Colors.saffron} />
                      <Text style={s.taskBoxTxt}>{selectedWorker.currentTask}</Text>
                    </View>
                  )}

                  <View style={s.statsGrid}>
                    {[
                      { label: "Today",  value: selectedWorker.resolvedToday,               icon: "today"          as const, color: "#00C060" },
                      { label: "Total",  value: selectedWorker.totalResolved,               icon: "checkmark-done" as const, color: "#3B82F6" },
                      { label: "Rating", value: `★${selectedWorker.avgRating.toFixed(1)}`, icon: "star"           as const, color: Colors.turmeric },
                      { label: "Score",  value: selectedWorker.score,                       icon: "trophy"         as const, color: Colors.saffron },
                    ].map(item => (
                      <View key={item.label} style={[s.statCard, { borderColor: item.color + "30" }]}>
                        <Ionicons name={item.icon} size={16} color={item.color} />
                        <Text style={[s.statCardVal, { color: item.color }]}>{item.value}</Text>
                        <Text style={s.statCardLbl}>{item.label}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={s.geoBox}>
                    <View style={s.geoDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.geoTitle}>Live GPS Location</Text>
                      <Text style={s.geoCoords}>
                        {selectedWorker.geo?.lat?.toFixed(6)}°N, {selectedWorker.geo?.lng?.toFixed(6)}°E
                      </Text>
                    </View>
                    <Animated.View style={{ opacity: pulseAnim }}>
                      <Ionicons name="radio" size={16} color="#00C060" />
                    </Animated.View>
                  </View>

                  <View style={s.actionRow}>
                    <Pressable style={[s.actionBtn, { backgroundColor: "#00C06018", borderColor: "#00C060" }]}
                      onPress={() => { setViewMode("map"); setTimeout(() => focusOnMap(selectedWorker), 150); setSelectedWorker(null); }}>
                      <Ionicons name="locate" size={15} color="#00C060" />
                      <Text style={[s.actionBtnTxt, { color: "#00C060" }]}>Focus Map</Text>
                    </Pressable>
                    <Pressable style={[s.actionBtn, { backgroundColor: Colors.saffronBg, borderColor: Colors.saffron }]}>
                      <Ionicons name="call" size={15} color={Colors.saffron} />
                      <Text style={[s.actionBtnTxt, { color: Colors.saffron }]}>{selectedWorker.phone}</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* District Picker */}
      <Modal visible={showDistrictPicker} transparent animationType="slide" onRequestClose={() => setShowDistrictPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowDistrictPicker(false)}>
          <View style={[s.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.handle} />
            <Text style={s.pickerTitle}>Filter by District</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {["all", ...DISTRICTS].map(d => {
                const hw = d !== "all" ? heatData.find(x => x.district === d) : null;
                return (
                  <Pressable key={d} onPress={() => { setFilterDistrict(d); setShowDistrictPicker(false); }}
                    style={[s.pickerItem, filterDistrict === d && s.pickerItemActive]}>
                    <Ionicons name={d === "all" ? "earth" : "location"} size={14}
                      color={filterDistrict === d ? Colors.saffron : Colors.textMuted} />
                    <Text style={[s.pickerItemTxt, filterDistrict === d && { color: Colors.saffron, fontWeight: "700" }]} numberOfLines={1}>
                      {d === "all" ? "All Districts" : d}
                    </Text>
                    {hw && <Text style={s.pickerCount}>{hw.count} workers · avg {Math.round(hw.avgScore)}</Text>}
                    {filterDistrict === d && <Ionicons name="checkmark-circle" size={16} color={Colors.saffron} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: Colors.bg },
  header:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  backBtn:    { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  headerMid:  { flex: 1 },
  headerTitle:{ fontSize: 17, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.3 },
  liveRow:    { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  liveDot:    { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel:  { fontSize: 11, fontWeight: "700" },
  ts:         { fontSize: 10, color: Colors.textMuted },
  headerBtns: { flexDirection: "row", gap: 6 },
  iconBtn:    { width: 34, height: 34, borderRadius: 11, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  iconBtnActive: { backgroundColor: Colors.saffronBg, borderColor: Colors.saffron },

  statsRow:  { flexDirection: "row", gap: 6, paddingHorizontal: 14, marginBottom: 10 },
  statBox:   { flex: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 2, borderWidth: 1 },
  statCount: { fontSize: 20, fontWeight: "800" },
  statLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },

  searchRow:     { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  searchBox:     { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: Colors.bgCard, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, gap: 7, borderWidth: 1, borderColor: Colors.border },
  searchInput:   { flex: 1, fontSize: 13, color: Colors.textPrimary, height: 20 },
  districtBtn:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.bgCard, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, maxWidth: 110 },
  districtBtnTxt:{ fontSize: 12, color: Colors.textMuted, fontWeight: "600", flex: 1 },

  pillScroll: { marginBottom: 8 },
  pillRow:    { flexDirection: "row", gap: 6, paddingHorizontal: 14 },
  pill:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  pillTxt:    { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },

  loaderBox:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderTxt:  { fontSize: 13, color: Colors.textMuted },

  mainScroll:   { flex: 1 },
  mainContent:  { gap: 0 },

  mapWrap:     { marginHorizontal: 14, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, height: MAP_H, marginBottom: 0, position: "relative" },
  mapOverlay:  { position: "absolute", bottom: 10, left: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  mapPill:     { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(6,13,24,0.9)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  mapPillTxt:  { fontSize: 11, color: Colors.textSecondary },
  resetBtn:    { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.saffronBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.saffron },
  resetBtnTxt: { fontSize: 11, color: Colors.saffron, fontWeight: "700" },
  heatBtn:     { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(6,13,24,0.9)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border, marginLeft: "auto" as any },
  heatBtnActive: { backgroundColor: Colors.saffronBg, borderColor: Colors.saffron },
  heatBtnTxt:  { fontSize: 11, color: Colors.textMuted },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },

  emptyBox:    { alignItems: "center", gap: 10, paddingVertical: 40 },
  emptyTxt:    { fontSize: 14, color: Colors.textMuted },
  emptyBtn:    { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  emptyBtnTxt: { fontSize: 13, color: Colors.saffron, fontWeight: "600" },

  card:       { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 12, marginHorizontal: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border },
  cardSel:    { borderColor: Colors.saffron, backgroundColor: Colors.saffronBg },
  avatar:     { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 2, position: "relative" },
  avatarTxt:  { fontSize: 20, fontWeight: "800" },
  activePulse:{ position: "absolute", inset: -3, borderRadius: 26, borderWidth: 1.5, opacity: 0.35 },
  cardInfo:   { flex: 1, gap: 2 },
  nameRow:    { flexDirection: "row", alignItems: "center", gap: 6 },
  workerName: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary, flex: 1 },
  workerWard: { fontSize: 11, color: Colors.textMuted },
  taskRow:    { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  taskTxt:    { fontSize: 11, color: Colors.saffron, fontStyle: "italic", flex: 1 },
  metaRow:    { flexDirection: "row", gap: 10, marginTop: 3 },
  metaItem:   { flexDirection: "row", alignItems: "center", gap: 3 },
  metaTxt:    { fontSize: 10, color: Colors.textMuted },
  badge:      { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeTxt:   { fontSize: 10, fontWeight: "600" },
  scoreBox:   { alignItems: "center" },
  scoreVal:   { fontSize: 22, fontWeight: "800", color: Colors.saffron },
  scoreLbl:   { fontSize: 10, color: Colors.textMuted },

  districtGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, marginBottom: 16 },
  distCard:     { backgroundColor: Colors.bgCard, borderRadius: 10, padding: 10, width: "47%", borderWidth: 1, borderColor: Colors.border, gap: 4 },
  distName:     { fontSize: 11, fontWeight: "700", color: Colors.textSecondary },
  distCount:    { fontSize: 22, fontWeight: "800" },
  distBar:      { height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  distFill:     { height: "100%", borderRadius: 2 },
  distMeta:     { fontSize: 10, color: Colors.textMuted },

  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet:      { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 6 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", borderWidth: 2.5 },
  detailAvatarTxt: { fontSize: 24, fontWeight: "800" },
  detailName:  { fontSize: 17, fontWeight: "800", color: Colors.textPrimary },
  detailSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  closeBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgWarm, alignItems: "center", justifyContent: "center" },
  taskBox:     { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.saffronBg, borderRadius: 10, padding: 10 },
  taskBoxTxt:  { fontSize: 13, color: Colors.saffronLight, flex: 1 },
  statsGrid:   { flexDirection: "row", gap: 8 },
  statCard:    { flex: 1, backgroundColor: Colors.bgWarm, borderRadius: 12, padding: 10, alignItems: "center", gap: 3, borderWidth: 1 },
  statCardVal: { fontSize: 17, fontWeight: "800" },
  statCardLbl: { fontSize: 10, color: Colors.textMuted },
  geoBox:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#001A08", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#00C06030" },
  geoDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: "#00C060" },
  geoTitle:    { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", marginBottom: 2 },
  geoCoords:   { fontSize: 11, color: "#00C060", fontFamily: "monospace" },
  actionRow:   { flexDirection: "row", gap: 10 },
  actionBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  actionBtnTxt:{ fontSize: 13, fontWeight: "700" },

  pickerSheet:    { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "72%" },
  pickerTitle:    { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, marginBottom: 12 },
  pickerItem:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerItemActive: { backgroundColor: Colors.saffronBg, marginHorizontal: -20, paddingHorizontal: 20 },
  pickerItemTxt:  { flex: 1, fontSize: 14, color: Colors.textSecondary, fontWeight: "500" },
  pickerCount:    { fontSize: 11, color: Colors.textMuted },
});
