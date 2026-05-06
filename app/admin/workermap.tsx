import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Modal, Dimensions, Platform,
  TextInput, Animated, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

// Lazy-import WebView only on native
let WebView: any = null;
if (Platform.OS !== "web") {
  try { WebView = require("react-native-webview").WebView; } catch {}
}

interface Worker {
  id: string;
  name: string;
  phone: string;
  ward: string;
  wardNumber: number;
  district: string;
  score: number;
  resolvedToday: number;
  totalResolved: number;
  avgRating: number;
  status: "active" | "idle" | "on_leave";
  currentTask?: string;
  geo: { lat: number; lng: number };
}

const STATUS_META = {
  active:   { color: "#00C060", bg: "#00C06022", label: "Active",   icon: "radio-button-on"  as const },
  idle:     { color: "#FFAB00", bg: "#FFAB0022", label: "Idle",     icon: "pause-circle"     as const },
  on_leave: { color: "#6B7280", bg: "#6B728022", label: "On Leave", icon: "moon"             as const },
};

const DISTRICTS = [
  "Dehradun","Haridwar","Nainital","Almora","Champawat","Pithoragarh",
  "Udham Singh Nagar","Tehri Garhwal","Pauri Garhwal","Chamoli","Rudraprayag","Uttarkashi","Bageshwar",
];

const { width: SCREEN_W } = Dimensions.get("window");
const MAP_HEIGHT = Math.round(SCREEN_W * 0.78);

function buildWorkerMapHTML(workers: Worker[], selectedId: string | null): string {
  const wData = workers.map(w => ({
    id: w.id, name: w.name, status: w.status,
    lat: w.geo?.lat ?? 30.0, lng: w.geo?.lng ?? 78.5,
    district: w.district, ward: w.ward, score: w.score,
    task: w.currentTask ?? "", resolvedToday: w.resolvedToday,
    totalResolved: w.totalResolved, avgRating: w.avgRating, phone: w.phone,
  }));
  const workersJson = JSON.stringify(wData);
  const selJson = JSON.stringify(selectedId);
  const isWeb = Platform.OS === "web";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#0d1117;overflow:hidden}
  .leaflet-container{background:#0d1117}
  .leaflet-control-zoom{border:1px solid #30363d!important;border-radius:10px!important;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.5)!important}
  .leaflet-control-zoom a{background:#161b22!important;color:#c9d1d9!important;border:none!important;font-size:18px!important;width:36px!important;height:36px!important;line-height:36px!important;border-bottom:1px solid #30363d!important}
  .leaflet-control-zoom a:last-child{border-bottom:none!important}
  .leaflet-control-zoom a:hover{background:#FF993322!important;color:#FF9933!important}
  .leaflet-attribution-flag{display:none!important}
  .leaflet-control-attribution{background:rgba(13,17,23,0.85)!important;color:#555!important;font-size:9px!important;border-radius:6px!important}
  .leaflet-control-attribution a{color:#666!important}
  .wm{width:26px;height:26px;border-radius:50%;border:2.5px solid rgba(255,255,255,0.9);
    display:flex;align-items:center;justify-content:center;
    font-size:11px;font-weight:800;color:#fff;cursor:pointer;
    box-shadow:0 2px 10px rgba(0,0,0,0.7);font-family:-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-0.5px}
  .wm.active{animation:gps 2s ease-in-out infinite}
  .wm.sel{transform:scale(1.5)!important;border-color:#FF9933!important;border-width:3px!important;z-index:1000!important;box-shadow:0 0 0 4px #FF993330,0 4px 16px rgba(0,0,0,0.8)!important}
  @keyframes gps{0%,100%{box-shadow:0 2px 10px rgba(0,0,0,0.7),0 0 0 0 rgba(0,192,96,0.5)}60%{box-shadow:0 2px 10px rgba(0,0,0,0.7),0 0 0 10px rgba(0,192,96,0)}}
  .pb{padding:10px 12px;min-width:175px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  .pt{font-weight:800;font-size:13px;color:#e6edf3;margin-bottom:2px;line-height:1.3}
  .ps{font-size:11px;color:#8b949e;margin-bottom:3px;line-height:1.5}
  .pk{font-size:10px;color:#FF9933;margin-top:3px;font-style:italic}
  .pbadge{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;margin-bottom:5px}
  .leaflet-popup-content-wrapper{background:#161b22;border:1px solid #30363d;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.7);padding:0}
  .leaflet-popup-content{margin:0;color:#e6edf3}
  .leaflet-popup-tip{background:#161b22}
  .leaflet-popup-tip-container{display:none}
  .leaflet-popup-close-button{color:#8b949e!important;font-size:16px!important;top:6px!important;right:8px!important}
  .leaflet-popup-close-button:hover{color:#c9d1d9!important;background:transparent!important}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
var workers=${workersJson};
var selectedId=${selJson};
var isWeb=${isWeb};
var map=L.map('map',{
  center:[30.0668,79.0193],zoom:7,
  zoomControl:true,attributionControl:true,preferCanvas:false
});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'&copy; OSM &copy; CARTO',subdomains:'abcd',maxZoom:19
}).addTo(map);

var SC={active:'#00C060',idle:'#FFAB00',on_leave:'#6B7280'};
var markerMap={};

function makeIcon(w,isSel){
  var col=SC[w.status]||'#6B7280';
  var cls='wm '+w.status+(isSel?' sel':'');
  return L.divIcon({
    html:'<div class="'+cls+'" style="background:'+col+'">'+w.name.charAt(0)+'</div>',
    iconSize:[26,26],iconAnchor:[13,13],popupAnchor:[0,-18],className:''
  });
}

function sendMsg(data){
  var str=JSON.stringify(data);
  if(isWeb){window.parent&&window.parent.postMessage(str,'*');}
  else{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(str);}
}

workers.forEach(function(w){
  var isSel=(w.id===selectedId);
  var col=SC[w.status]||'#6B7280';
  var slabel=w.status==='active'?'Active':w.status==='idle'?'Idle':'On Leave';
  var marker=L.marker([w.lat,w.lng],{
    icon:makeIcon(w,isSel),
    zIndexOffset:w.status==='active'?1000:0
  });
  var ph='<div class="pb">'
    +'<span class="pbadge" style="background:'+col+'22;color:'+col+'">'+slabel+'</span>'
    +'<div class="pt">'+w.name+'</div>'
    +'<div class="ps">'+w.ward+' &middot; '+w.district+'</div>'
    +'<div class="ps">Score: <b style="color:#FF9933">'+w.score+'</b> &nbsp;&#9733; '+w.avgRating.toFixed(1)+'</div>'
    +'<div class="ps">'+w.resolvedToday+' resolved today &middot; '+w.totalResolved+' total</div>'
    +(w.task?'<div class="pk">'+w.task+'</div>':'')
    +'</div>';
  marker.bindPopup(ph,{maxWidth:240});
  marker.on('click',function(){sendMsg({type:'workerTap',id:w.id});});
  marker.addTo(map);
  markerMap[w.id]=marker;
});

if(selectedId&&markerMap[selectedId]){
  map.setView(markerMap[selectedId].getLatLng(),13,{animate:false});
  setTimeout(function(){markerMap[selectedId].openPopup();},400);
}

window.updateWorkers=function(updates){
  updates.forEach(function(u){
    if(markerMap[u.id]){
      markerMap[u.id].setLatLng([u.lat,u.lng]);
      markerMap[u.id].setIcon(makeIcon(u,u.id===selectedId));
    }
  });
};
window.focusWorker=function(id){
  selectedId=id;
  if(markerMap[id]){
    map.setView(markerMap[id].getLatLng(),14,{animate:true});
    Object.keys(markerMap).forEach(function(k){
      markerMap[k].setIcon(makeIcon(workers.find(function(x){return x.id===k;})||{name:'?',status:'idle'},k===id));
    });
    setTimeout(function(){markerMap[id].openPopup();},400);
  }
};
window.resetView=function(){
  selectedId=null;
  map.setView([30.0668,79.0193],7,{animate:true});
  Object.keys(markerMap).forEach(function(k){
    var w=workers.find(function(x){return x.id===k;});
    if(w)markerMap[k].setIcon(makeIcon(w,false));
  });
};

// Listen for commands from React (web: postMessage)
window.addEventListener('message',function(e){
  try{
    var msg=JSON.parse(e.data);
    if(msg.type==='focus')window.focusWorker(msg.id);
    if(msg.type==='reset')window.resetView();
    if(msg.type==='update')window.updateWorkers(msg.updates);
  }catch(err){}
});
</script>
</body>
</html>`;
}

// ── Web Map Component ─────────────────────────────────────────────────────────
function WebMapFrame({
  html, iframeRef, onWorkerTap,
}: { html: string; iframeRef: React.RefObject<any>; onWorkerTap: (id: string) => void }) {
  const containerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;background:#0d1117";
    iframe.setAttribute("srcdoc", html);
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("title", "Worker GPS Map");
    iframeRef.current = iframe;
    el.appendChild(iframe);

    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "workerTap") onWorkerTap(msg.id);
      } catch {}
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      if (el.contains(iframe)) el.removeChild(iframe);
    };
  }, [html]);

  return (
    <View style={{ flex: 1, backgroundColor: "#0d1117" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
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

  const webViewRef = useRef<any>(null);
  const iframeRef = useRef<any>(null);
  const esRef = useRef<any>(null);
  const fallbackRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 700, useNativeDriver: false }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const pushMapUpdate = useCallback((updates: any[]) => {
    const msg = JSON.stringify({ type: "update", updates });
    if (Platform.OS === "web") {
      try { iframeRef.current?.contentWindow?.postMessage(msg, "*"); } catch {}
    } else {
      webViewRef.current?.injectJavaScript(`window.updateWorkers&&window.updateWorkers(${JSON.stringify(updates)});true;`);
    }
  }, []);

  const focusOnMap = useCallback((w: Worker) => {
    const msg = JSON.stringify({ type: "focus", id: w.id });
    if (Platform.OS === "web") {
      try { iframeRef.current?.contentWindow?.postMessage(msg, "*"); } catch {}
    } else {
      webViewRef.current?.injectJavaScript(`window.focusWorker&&window.focusWorker(${JSON.stringify(w.id)});true;`);
    }
  }, []);

  const resetMap = useCallback(() => {
    setMapFocusId(null);
    const msg = JSON.stringify({ type: "reset" });
    if (Platform.OS === "web") {
      try { iframeRef.current?.contentWindow?.postMessage(msg, "*"); } catch {}
    } else {
      webViewRef.current?.injectJavaScript(`window.resetView&&window.resetView();true;`);
    }
  }, []);

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
          pushMapUpdate(updates);
        }
      }
    } catch {}
    finally { setLoading(false); setRefreshing(false); }
  }, [pushMapUpdate]);

  useEffect(() => {
    const startStream = async () => {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      if (!tok) { load(); return; }
      const base = getApiUrl();

      if (Platform.OS === "web" && typeof EventSource !== "undefined") {
        try {
          const es = new EventSource(`${base}api/workers/stream`);
          esRef.current = es;
          es.onopen = () => { setLiveStatus("live"); setLastUpdate(new Date()); };
          es.onerror = () => {
            setLiveStatus("offline");
            es.close();
            fallbackRef.current = setInterval(() => load(true), 8000);
          };
          es.onmessage = (e: any) => {
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
          fallbackRef.current = setInterval(() => load(true), 8000);
        }
      } else {
        setLiveStatus("live");
        await load();
        fallbackRef.current = setInterval(() => load(true), 8000);
      }
    };

    startStream();
    return () => { esRef.current?.close(); clearInterval(fallbackRef.current); };
  }, [load, pushMapUpdate]);

  useEffect(() => { load(); }, []);

  const filtered = workers.filter(w => {
    if (filterStatus !== "all" && w.status !== filterStatus) return false;
    if (filterDistrict !== "all" && w.district !== filterDistrict) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        w.name.toLowerCase().includes(q) ||
        w.district.toLowerCase().includes(q) ||
        w.ward.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCount = workers.filter(w => w.status === "active").length;
  const idleCount   = workers.filter(w => w.status === "idle").length;
  const leaveCount  = workers.filter(w => w.status === "on_leave").length;

  const onWorkerTap = useCallback((id: string) => {
    const w = workers.find(x => x.id === id);
    if (w) { setSelectedWorker(w); setMapFocusId(w.id); }
  }, [workers]);

  const onWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "workerTap") onWorkerTap(msg.id);
    } catch {}
  }, [onWorkerTap]);

  const handleWorkerPress = (w: Worker) => {
    setSelectedWorker(w);
    setMapFocusId(w.id);
    setViewMode("map");
    setTimeout(() => focusOnMap(w), 100);
  };

  const liveColor = liveStatus === "live" ? "#00C060" : liveStatus === "connecting" ? "#FFAB00" : "#EF4444";
  const liveLabel = liveStatus === "live" ? "Live GPS" : liveStatus === "connecting" ? "Connecting…" : "Offline";

  const htmlContent = buildWorkerMapHTML(filtered, mapFocusId);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={["#060D18", Colors.bg]} style={StyleSheet.absoluteFill} />

      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </Pressable>
        <View style={s.headerMid}>
          <Text style={s.headerTitle}>Worker GPS Tracker</Text>
          <View style={s.liveRow}>
            <Animated.View style={[s.liveDot, { backgroundColor: liveColor, opacity: pulseAnim }]} />
            <Text style={[s.liveLabel, { color: liveColor }]}>{liveLabel}</Text>
            {lastUpdate && (
              <Text style={s.lastUpdate}>
                · {lastUpdate.getHours().toString().padStart(2, "0")}
                :{lastUpdate.getMinutes().toString().padStart(2, "0")}
                :{lastUpdate.getSeconds().toString().padStart(2, "0")}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={() => setViewMode(v => v === "map" ? "list" : "map")}
          style={[s.toggleBtn, viewMode === "list" && s.toggleBtnActive]}
        >
          <Ionicons name={viewMode === "map" ? "list" : "map"} size={16} color={viewMode === "list" ? Colors.saffron : Colors.textMuted} />
        </Pressable>
      </View>

      {/* ── Stats Row ── */}
      <View style={s.statsRow}>
        {([
          { label: "Active",  count: activeCount,    color: "#00C060", icon: "radio-button-on" as const, st: "active"   as const },
          { label: "Idle",    count: idleCount,      color: "#FFAB00", icon: "pause-circle"    as const, st: "idle"     as const },
          { label: "Leave",   count: leaveCount,     color: "#6B7280", icon: "moon"            as const, st: "on_leave" as const },
          { label: "Total",   count: workers.length, color: Colors.saffron, icon: "people"     as const, st: "all"      as const },
        ]).map(item => (
          <Pressable
            key={item.label}
            onPress={() => setFilterStatus(filterStatus === item.st ? "all" : item.st)}
            style={[s.statBox, { borderColor: item.color + "44", backgroundColor: item.color + "12" },
              filterStatus === item.st && { borderWidth: 2, borderColor: item.color }]}
          >
            <Ionicons name={item.icon} size={13} color={item.color} />
            <Text style={[s.statCount, { color: item.color }]}>{item.count}</Text>
            <Text style={s.statLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Search + District ── */}
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={14} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search name, ward, district…"
            placeholderTextColor={Colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={15} color={Colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setShowDistrictPicker(true)}
          style={[s.districtBtn, filterDistrict !== "all" && { borderColor: Colors.saffron, backgroundColor: Colors.saffronBg }]}
        >
          <Ionicons name="location" size={13} color={filterDistrict !== "all" ? Colors.saffron : Colors.textMuted} />
          <Text style={[s.districtBtnText, filterDistrict !== "all" && { color: Colors.saffron }]} numberOfLines={1}>
            {filterDistrict === "all" ? "District" : filterDistrict.split(" ")[0]}
          </Text>
          {filterDistrict !== "all" && (
            <Pressable onPress={() => setFilterDistrict("all")}>
              <Ionicons name="close-circle" size={13} color={Colors.saffron} />
            </Pressable>
          )}
        </Pressable>
      </View>

      {/* ── Status Pills ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll} contentContainerStyle={s.pillRow}>
        {(["all", "active", "idle", "on_leave"] as const).map(st => {
          const meta = st !== "all" ? STATUS_META[st] : null;
          const isActive = filterStatus === st;
          const col = meta?.color ?? Colors.saffron;
          return (
            <Pressable key={st} onPress={() => setFilterStatus(st)}
              style={[s.pill, isActive && { backgroundColor: col + "18", borderColor: col }]}>
              {meta && <Ionicons name={meta.icon} size={10} color={isActive ? col : Colors.textMuted} />}
              <Text style={[s.pillText, isActive && { color: col, fontWeight: "700" }]}>
                {st === "all"
                  ? `All (${filtered.length})`
                  : `${meta!.label} (${workers.filter(w => w.status === st).length})`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={s.loaderBox}>
          <ActivityIndicator color={Colors.green} size="large" />
          <Text style={s.loaderText}>Loading worker GPS data…</Text>
        </View>
      ) : (
        <ScrollView
          style={s.mainScroll}
          contentContainerStyle={[s.mainContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={Colors.green}
            />
          }
        >
          {/* ── Real Leaflet Map ── */}
          {viewMode === "map" && (
            <View style={s.mapWrapper}>
              {Platform.OS === "web" ? (
                <WebMapFrame html={htmlContent} iframeRef={iframeRef} onWorkerTap={onWorkerTap} />
              ) : WebView ? (
                <WebView
                  ref={webViewRef}
                  style={{ flex: 1, backgroundColor: "#0d1117" }}
                  source={{ html: htmlContent }}
                  javaScriptEnabled
                  domStorageEnabled
                  onMessage={onWebViewMessage}
                  scrollEnabled={false}
                  bounces={false}
                  originWhitelist={["*"]}
                  mixedContentMode="always"
                  allowUniversalAccessFromFileURLs
                />
              ) : (
                <View style={s.noMapBox}>
                  <Ionicons name="map-outline" size={32} color={Colors.textMuted} />
                  <Text style={s.noMapText}>Map not available</Text>
                </View>
              )}
              <View style={s.mapOverlay}>
                <View style={s.mapOverlayPill}>
                  <Ionicons name="people" size={11} color={Colors.textSecondary} />
                  <Text style={s.mapOverlayText}>{filtered.length} worker{filtered.length !== 1 ? "s" : ""}</Text>
                </View>
                {mapFocusId && (
                  <Pressable onPress={resetMap} style={s.resetBtn}>
                    <Ionicons name="expand" size={12} color={Colors.saffron} />
                    <Text style={s.resetBtnText}>Show All</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* ── Worker List ── */}
          <Text style={s.sectionTitle}>
            {viewMode === "map" ? "Tap to focus" : `${filtered.length} Worker${filtered.length !== 1 ? "s" : ""}`}
            {filterDistrict !== "all" && ` · ${filterDistrict}`}
          </Text>

          {filtered.length === 0 ? (
            <View style={s.emptyBox}>
              <Ionicons name="people-outline" size={36} color={Colors.textMuted} />
              <Text style={s.emptyText}>No workers match your filters</Text>
              <Pressable
                onPress={() => { setFilterStatus("all"); setFilterDistrict("all"); setSearchQuery(""); }}
                style={s.emptyBtn}
              >
                <Text style={s.emptyBtnText}>Clear Filters</Text>
              </Pressable>
            </View>
          ) : (
            filtered.map(w => {
              const meta = STATUS_META[w.status];
              const isSel = selectedWorker?.id === w.id;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => handleWorkerPress(w)}
                  style={[s.workerCard, isSel && s.workerCardSel]}
                >
                  <View style={[s.avatar, { borderColor: meta.color, backgroundColor: meta.color + "18" }]}>
                    <Text style={[s.avatarText, { color: meta.color }]}>{w.name.charAt(0)}</Text>
                    {w.status === "active" && <View style={[s.activePulse, { borderColor: meta.color }]} />}
                  </View>
                  <View style={s.workerInfo}>
                    <View style={s.workerNameRow}>
                      <Text style={s.workerName} numberOfLines={1}>{w.name}</Text>
                      <View style={[s.badge, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={9} color={meta.color} />
                        <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={s.workerWard} numberOfLines={1}>{w.ward} · {w.district}</Text>
                    {w.currentTask && (
                      <View style={s.taskRow}>
                        <Ionicons name="construct-outline" size={10} color={Colors.saffron} />
                        <Text style={s.taskText} numberOfLines={1}>{w.currentTask}</Text>
                      </View>
                    )}
                    <View style={s.metaRow}>
                      <View style={s.metaItem}>
                        <Ionicons name="checkmark-done" size={10} color="#00C060" />
                        <Text style={s.metaText}>{w.resolvedToday} today</Text>
                      </View>
                      <View style={s.metaItem}>
                        <Ionicons name="star" size={10} color={Colors.turmeric} />
                        <Text style={s.metaText}>{w.avgRating.toFixed(1)}</Text>
                      </View>
                      <View style={s.metaItem}>
                        <Ionicons name="navigate" size={10} color={Colors.textMuted} />
                        <Text style={s.metaText}>{w.geo?.lat?.toFixed(3)}°N</Text>
                      </View>
                    </View>
                  </View>
                  <View style={s.scoreBox}>
                    <Text style={s.scoreVal}>{w.score}</Text>
                    <Text style={s.scoreLabel}>score</Text>
                    <Ionicons name={viewMode === "map" ? "locate" : "chevron-forward"} size={13} color={isSel ? Colors.saffron : Colors.textMuted} style={{ marginTop: 3 }} />
                  </View>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}

      {/* ── Worker Detail Modal ── */}
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
                      <Text style={[s.detailAvatarText, { color: meta.color }]}>{selectedWorker.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.detailName}>{selectedWorker.name}</Text>
                      <Text style={s.detailSub}>{selectedWorker.ward} · {selectedWorker.district}</Text>
                      <View style={[s.badge, { backgroundColor: meta.bg, alignSelf: "flex-start", marginTop: 4 }]}>
                        <Ionicons name={meta.icon} size={10} color={meta.color} />
                        <Text style={[s.badgeText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                    <Pressable onPress={() => setSelectedWorker(null)} style={s.closeBtn}>
                      <Ionicons name="close" size={18} color={Colors.textMuted} />
                    </Pressable>
                  </View>

                  {selectedWorker.currentTask && (
                    <View style={s.taskBox}>
                      <Ionicons name="construct" size={13} color={Colors.saffron} />
                      <Text style={s.taskBoxText}>{selectedWorker.currentTask}</Text>
                    </View>
                  )}

                  <View style={s.statsGrid}>
                    {[
                      { label: "Today",    value: selectedWorker.resolvedToday,                icon: "today"          as const, color: "#00C060" },
                      { label: "Total",    value: selectedWorker.totalResolved,                icon: "checkmark-done" as const, color: "#3B82F6" },
                      { label: "Rating",   value: `★ ${selectedWorker.avgRating.toFixed(1)}`, icon: "star"           as const, color: Colors.turmeric },
                      { label: "Score",    value: selectedWorker.score,                        icon: "trophy"         as const, color: Colors.saffron },
                    ].map(item => (
                      <View key={item.label} style={[s.statCard, { borderColor: item.color + "30" }]}>
                        <Ionicons name={item.icon} size={17} color={item.color} />
                        <Text style={[s.statCardVal, { color: item.color }]}>{item.value}</Text>
                        <Text style={s.statCardLabel}>{item.label}</Text>
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
                    <Pressable
                      style={[s.actionBtn, { backgroundColor: "#00C06018", borderColor: "#00C060" }]}
                      onPress={() => {
                        setViewMode("map");
                        setTimeout(() => focusOnMap(selectedWorker), 80);
                        setSelectedWorker(null);
                      }}
                    >
                      <Ionicons name="locate" size={15} color="#00C060" />
                      <Text style={[s.actionBtnText, { color: "#00C060" }]}>Focus Map</Text>
                    </Pressable>
                    <Pressable
                      style={[s.actionBtn, { backgroundColor: Colors.saffronBg, borderColor: Colors.saffron }]}
                    >
                      <Ionicons name="call" size={15} color={Colors.saffron} />
                      <Text style={[s.actionBtnText, { color: Colors.saffron }]}>{selectedWorker.phone}</Text>
                    </Pressable>
                  </View>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── District Picker ── */}
      <Modal visible={showDistrictPicker} transparent animationType="slide" onRequestClose={() => setShowDistrictPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowDistrictPicker(false)}>
          <View style={[s.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={s.handle} />
            <Text style={s.pickerTitle}>Filter by District</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {["all", ...DISTRICTS].map(d => (
                <Pressable
                  key={d}
                  onPress={() => { setFilterDistrict(d); setShowDistrictPicker(false); }}
                  style={[s.pickerItem, filterDistrict === d && s.pickerItemActive]}
                >
                  <Ionicons name={d === "all" ? "earth" : "location"} size={14}
                    color={filterDistrict === d ? Colors.saffron : Colors.textMuted} />
                  <Text style={[s.pickerItemText, filterDistrict === d && { color: Colors.saffron, fontWeight: "700" }]}>
                    {d === "all" ? "All Districts" : d}
                  </Text>
                  {filterDistrict === d && <Ionicons name="checkmark-circle" size={16} color={Colors.saffron} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.bg },
  header:       { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 10 },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  headerMid:    { flex: 1 },
  headerTitle:  { fontSize: 17, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -0.3 },
  liveRow:      { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  liveDot:      { width: 7, height: 7, borderRadius: 3.5 },
  liveLabel:    { fontSize: 11, fontWeight: "700" },
  lastUpdate:   { fontSize: 10, color: Colors.textMuted },
  toggleBtn:    { width: 36, height: 36, borderRadius: 12, backgroundColor: Colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border },
  toggleBtnActive: { backgroundColor: Colors.saffronBg, borderColor: Colors.saffron },

  statsRow:   { flexDirection: "row", gap: 6, paddingHorizontal: 14, marginBottom: 10 },
  statBox:    { flex: 1, borderRadius: 12, padding: 9, alignItems: "center", gap: 2, borderWidth: 1 },
  statCount:  { fontSize: 20, fontWeight: "800" },
  statLabel:  { fontSize: 10, color: Colors.textMuted, fontWeight: "500" },

  searchRow:     { flexDirection: "row", gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  searchBox:     { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: Colors.bgCard, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, gap: 7, borderWidth: 1, borderColor: Colors.border },
  searchInput:   { flex: 1, fontSize: 13, color: Colors.textPrimary, height: 20 },
  districtBtn:   { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.bgCard, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border, maxWidth: 110 },
  districtBtnText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600", flex: 1 },

  pillScroll: { marginBottom: 8 },
  pillRow:    { flexDirection: "row", gap: 6, paddingHorizontal: 14 },
  pill:       { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  pillText:   { fontSize: 11, color: Colors.textMuted, fontWeight: "500" },

  loaderBox:  { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loaderText: { fontSize: 13, color: Colors.textMuted },

  mainScroll:   { flex: 1 },
  mainContent:  { gap: 0 },

  mapWrapper:      { marginHorizontal: 14, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: Colors.border, height: MAP_HEIGHT, marginBottom: 0, position: "relative" },
  noMapBox:        { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0d1117", gap: 8 },
  noMapText:       { fontSize: 13, color: Colors.textMuted },
  mapOverlay:      { position: "absolute", bottom: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  mapOverlayPill:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(6,13,24,0.9)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.border },
  mapOverlayText:  { fontSize: 11, color: Colors.textSecondary },
  resetBtn:        { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: Colors.saffronBg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: Colors.saffron },
  resetBtnText:    { fontSize: 11, color: Colors.saffron, fontWeight: "700" },

  sectionTitle: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },

  emptyBox:    { alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 24 },
  emptyText:   { fontSize: 14, color: Colors.textMuted, textAlign: "center" },
  emptyBtn:    { paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border },
  emptyBtnText: { fontSize: 13, color: Colors.saffron, fontWeight: "600" },

  workerCard:    { backgroundColor: Colors.bgCard, borderRadius: 14, padding: 12, marginHorizontal: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: Colors.border },
  workerCardSel: { borderColor: Colors.saffron, backgroundColor: Colors.saffronBg },
  avatar:        { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", borderWidth: 2, position: "relative" },
  avatarText:    { fontSize: 20, fontWeight: "800" },
  activePulse:   { position: "absolute", inset: -3, borderRadius: 26, borderWidth: 1.5, opacity: 0.4 },
  workerInfo:    { flex: 1, gap: 2 },
  workerNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  workerName:    { fontSize: 14, fontWeight: "700", color: Colors.textPrimary, flex: 1 },
  workerWard:    { fontSize: 11, color: Colors.textMuted },
  taskRow:       { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  taskText:      { fontSize: 11, color: Colors.saffron, fontStyle: "italic", flex: 1 },
  metaRow:       { flexDirection: "row", gap: 10, marginTop: 3 },
  metaItem:      { flexDirection: "row", alignItems: "center", gap: 3 },
  metaText:      { fontSize: 10, color: Colors.textMuted },
  badge:         { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  badgeText:     { fontSize: 10, fontWeight: "600" },
  scoreBox:      { alignItems: "center" },
  scoreVal:      { fontSize: 22, fontWeight: "800", color: Colors.saffron },
  scoreLabel:    { fontSize: 10, color: Colors.textMuted },

  overlay:    { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "flex-end" },
  sheet:      { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, gap: 14 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: "center", marginBottom: 6 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 14 },
  detailAvatar: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", borderWidth: 2.5 },
  detailAvatarText: { fontSize: 24, fontWeight: "800" },
  detailName:   { fontSize: 17, fontWeight: "800", color: Colors.textPrimary },
  detailSub:    { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.bgWarm, alignItems: "center", justifyContent: "center" },
  taskBox:      { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.saffronBg, borderRadius: 10, padding: 10 },
  taskBoxText:  { fontSize: 13, color: Colors.saffronLight, flex: 1 },
  statsGrid:    { flexDirection: "row", gap: 8 },
  statCard:     { flex: 1, backgroundColor: Colors.bgWarm, borderRadius: 12, padding: 10, alignItems: "center", gap: 3, borderWidth: 1 },
  statCardVal:  { fontSize: 17, fontWeight: "800" },
  statCardLabel: { fontSize: 10, color: Colors.textMuted },
  geoBox:       { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#001A08", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#00C06030" },
  geoDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: "#00C060" },
  geoTitle:     { fontSize: 12, color: Colors.textSecondary, fontWeight: "600", marginBottom: 2 },
  geoCoords:    { fontSize: 11, color: "#00C060", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  actionRow:    { flexDirection: "row", gap: 10 },
  actionBtn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: "700" },

  pickerSheet:    { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, maxHeight: "72%" },
  pickerTitle:    { fontSize: 16, fontWeight: "800", color: Colors.textPrimary, marginBottom: 12 },
  pickerItem:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  pickerItemActive: { backgroundColor: Colors.saffronBg, marginHorizontal: -20, paddingHorizontal: 20 },
  pickerItemText: { flex: 1, fontSize: 14, color: Colors.textSecondary, fontWeight: "500" },
});
