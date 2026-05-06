import React, { useEffect, useRef, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import type { Complaint, SOSAlert, Worker, PoliceStation, RiskZone, GeoPoint } from "@/context/AppContext";

export type MapFilter = "all" | "complaints" | "sos" | "workers" | "police" | "risks";

const DISTRICT_CENTERS: Record<string, { lat: number; lng: number; zoom: number }> = {
  "Dehradun":          { lat: 30.3165, lng: 78.0322, zoom: 11 },
  "Haridwar":          { lat: 29.9457, lng: 78.1642, zoom: 11 },
  "Tehri Garhwal":     { lat: 30.3822, lng: 78.4800, zoom: 10 },
  "Pauri Garhwal":     { lat: 29.6864, lng: 78.9764, zoom: 10 },
  "Rudraprayag":       { lat: 30.2846, lng: 78.9806, zoom: 10 },
  "Chamoli":           { lat: 30.4090, lng: 79.3206, zoom: 10 },
  "Uttarkashi":        { lat: 30.7268, lng: 78.4354, zoom: 10 },
  "Pithoragarh":       { lat: 29.5829, lng: 80.2178, zoom: 10 },
  "Bageshwar":         { lat: 29.8371, lng: 79.7715, zoom: 11 },
  "Almora":            { lat: 29.5971, lng: 79.6596, zoom: 11 },
  "Champawat":         { lat: 29.3377, lng: 80.0914, zoom: 11 },
  "Nainital":          { lat: 29.3919, lng: 79.4542, zoom: 11 },
  "Udham Singh Nagar": { lat: 28.9982, lng: 79.5050, zoom: 11 },
};

const PRIORITY_COLORS: Record<string, string> = {
  P1: "#EF4444", P2: "#F59E0B", P3: "#3B82F6", P4: "#6B7280",
};
const RISK_COLORS: Record<string, string> = {
  flood: "#3B82F6", garbage: "#22C55E", infrastructure: "#F59E0B", crime: "#EF4444",
};

interface MarkerData {
  lat: number;
  lng: number;
  color: string;
  type: "complaint" | "sos" | "worker" | "police" | "risk";
  title: string;
  subtitle: string;
  radius: number;
  ringRadius?: number;
}

function buildLeafletHTML(
  markers: MarkerData[],
  center: { lat: number; lng: number; zoom: number },
  userLoc: { lat: number; lng: number } | null
): string {
  const markersJson = JSON.stringify(markers);
  const userJson = JSON.stringify(userLoc);
  const cLat = center.lat;
  const cLng = center.lng;
  const cZoom = center.zoom;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#f8f9fa}
  .leaflet-container{background:#f8f9fa}
  .leaflet-popup-content-wrapper{background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);padding:0}
  .leaflet-popup-content{margin:0;color:#111827}
  .leaflet-popup-tip{background:#ffffff}
  .leaflet-popup-tip-container{display:none}
  .leaflet-control-zoom{border:1px solid #d1d5db!important;border-radius:10px!important;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)!important}
  .leaflet-control-zoom a{background:#ffffff!important;color:#374151!important;border:none!important;font-size:16px!important;width:32px!important;height:32px!important;line-height:32px!important;border-bottom:1px solid #e5e7eb!important}
  .leaflet-control-zoom a:last-child{border-bottom:none!important}
  .leaflet-control-zoom a:hover{background:#f3f4f6!important;color:#111827!important}
  .leaflet-attribution-flag{display:none!important}
  .leaflet-control-attribution{background:rgba(255,255,255,0.9)!important;color:#9CA3AF!important;font-size:9px!important;border-radius:6px!important;border:1px solid #e5e7eb!important;padding:2px 6px!important}
  .leaflet-control-attribution a{color:#6B7280!important}
  .popup-box{padding:10px 12px;min-width:180px}
  .popup-title{font-weight:700;font-size:12px;color:#111827;margin-bottom:4px;font-family:sans-serif;line-height:1.3}
  .popup-sub{font-size:11px;color:#6B7280;font-family:sans-serif;line-height:1.4}
  .popup-type{display:inline-block;font-size:9px;font-weight:700;letter-spacing:0.5px;padding:2px 7px;border-radius:4px;margin-bottom:6px;text-transform:uppercase}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
var map=L.map('map',{
  center:[${cLat},${cLng}],
  zoom:${cZoom},
  zoomControl:true,
  attributionControl:true,
  preferCanvas:true
});

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains:'abcd',
  maxZoom:19
}).addTo(map);

var typeLabels={
  complaint:'ISSUE',sos:'SOS',worker:'WORKER',police:'POLICE',risk:'RISK'
};

var markersData=${markersJson};

markersData.forEach(function(m){
  if(m.type==='risk'){
    L.circle([m.lat,m.lng],{
      radius:m.ringRadius||2000,
      fillColor:m.color,
      color:m.color,
      weight:2,
      opacity:0.5,
      fillOpacity:0.12,
      interactive:false
    }).addTo(map);
  }

  var marker=L.circleMarker([m.lat,m.lng],{
    radius:m.radius,
    fillColor:m.color,
    color:'#ffffff',
    weight:2,
    opacity:1,
    fillOpacity:0.92
  }).addTo(map);

  var popupHTML='<div class="popup-box">'
    +'<span class="popup-type" style="background:'+m.color+'18;color:'+m.color+'">'+typeLabels[m.type]+'</span>'
    +'<div class="popup-title">'+m.title+'</div>'
    +'<div class="popup-sub">'+m.subtitle+'</div>'
    +'</div>';
  marker.bindPopup(popupHTML,{maxWidth:240,closeButton:false});
});

var userLoc=${userJson};
if(userLoc){
  L.circle([userLoc.lat,userLoc.lng],{
    radius:400,
    fillColor:'#FF9933',
    color:'#FF9933',
    weight:1.5,
    opacity:0.4,
    fillOpacity:0.1,
    interactive:false
  }).addTo(map);

  L.circleMarker([userLoc.lat,userLoc.lng],{
    radius:9,
    fillColor:'#FF9933',
    color:'#ffffff',
    weight:2.5,
    fillOpacity:1
  }).addTo(map)
    .bindPopup('<div class="popup-box"><span class="popup-type" style="background:#FF993318;color:#FF9933">YOU</span><div class="popup-title">Your Location</div><div class="popup-sub">'+userLoc.lat.toFixed(5)+'°N, '+userLoc.lng.toFixed(5)+'°E</div></div>',{maxWidth:200,closeButton:false});
}

window.addEventListener('message',function(e){
  try{
    var msg=JSON.parse(e.data);
    if(msg.type==='panTo'){
      map.setView([msg.lat,msg.lng],msg.zoom||12,{animate:true});
    }
  }catch(err){}
});
</script>
</body>
</html>`;
}

interface Props {
  complaints?: Complaint[];
  sosAlerts?: SOSAlert[];
  workers?: Worker[];
  policeStations?: PoliceStation[];
  riskZones?: RiskZone[];
  filter?: MapFilter;
  userLocation?: GeoPoint | null;
  userDistrict?: string;
  style?: any;
}

export default function UttarakhandMap({
  complaints = [],
  sosAlerts = [],
  workers = [],
  policeStations = [],
  riskZones = [],
  filter = "all",
  userLocation,
  userDistrict,
  style,
}: Props) {
  const containerRef = useRef<any>(null);

  const show = (type: "complaints" | "sos" | "workers" | "police" | "risks") =>
    filter === "all" || filter === type;

  const markers = useMemo<MarkerData[]>(() => {
    const result: MarkerData[] = [];

    if (show("complaints")) {
      complaints.slice(0, 100).forEach(c => {
        if (c.geo?.lat && c.geo?.lng) {
          result.push({
            lat: c.geo.lat, lng: c.geo.lng,
            color: PRIORITY_COLORS[c.priority] || "#6B7280",
            type: "complaint", radius: 7,
            title: `${c.ticketId} — ${c.category.toUpperCase()}`,
            subtitle: `${c.priority} · ${c.status} · ${c.location}`,
          });
        }
      });
    }

    if (show("sos")) {
      sosAlerts.filter(s => s.status !== "resolved").forEach(s => {
        if (s.geo?.lat && s.geo?.lng) {
          result.push({
            lat: s.geo.lat, lng: s.geo.lng,
            color: s.category === "women_safety" ? "#8B5CF6" : "#EF4444",
            type: "sos", radius: 11,
            title: `SOS: ${s.category.replace(/_/g, " ").toUpperCase()}`,
            subtitle: `${s.status.toUpperCase()} · ${s.location}`,
          });
        }
      });
    }

    if (show("workers")) {
      workers.filter(w => w.geo && w.status === "active").forEach(w => {
        if (w.geo?.lat && w.geo?.lng) {
          result.push({
            lat: w.geo!.lat, lng: w.geo!.lng,
            color: "#06B6D4", type: "worker", radius: 8,
            title: w.name,
            subtitle: w.currentTask || "On duty",
          });
        }
      });
    }

    if (show("police")) {
      policeStations.forEach(ps => {
        if (ps.geo?.lat && ps.geo?.lng) {
          result.push({
            lat: ps.geo.lat, lng: ps.geo.lng,
            color: "#F59E0B", type: "police", radius: 9,
            title: ps.name,
            subtitle: ps.phone,
          });
        }
      });
    }

    if (show("risks")) {
      riskZones.filter(rz => rz.geo).forEach(rz => {
        if (rz.geo?.lat && rz.geo?.lng) {
          result.push({
            lat: rz.geo.lat, lng: rz.geo.lng,
            color: RISK_COLORS[rz.type] || "#8B5CF6",
            type: "risk", radius: 10,
            ringRadius: (rz.radius || 2) * 600,
            title: `${rz.type.toUpperCase()} RISK`,
            subtitle: `Severity: ${rz.severity} · ${rz.description}`,
          });
        }
      });
    }

    return result;
  }, [complaints, sosAlerts, workers, policeStations, riskZones, filter]);

  const center = useMemo(() => {
    if (userDistrict && userDistrict !== "Uttarakhand" && DISTRICT_CENTERS[userDistrict]) {
      return DISTRICT_CENTERS[userDistrict];
    }
    return { lat: 30.0668, lng: 79.0193, zoom: 8 };
  }, [userDistrict]);

  const html = useMemo(() =>
    buildLeafletHTML(
      markers,
      center,
      userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null
    ),
    [markers, center, userLocation]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;";
    iframe.setAttribute("srcdoc", html);
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
    iframe.setAttribute("title", "Uttarakhand District Map");

    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(iframe);

    return () => {
      if (el.contains(iframe)) {
        while (el.firstChild) el.removeChild(el.firstChild);
      }
    };
  }, [html]);

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
    overflow: "hidden",
  },
});
