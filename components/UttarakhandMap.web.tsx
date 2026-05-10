import React, { useEffect, useRef, useMemo } from "react";
import { View, StyleSheet } from "react-native";
import type { Complaint, SOSAlert, Worker, PoliceStation, RiskZone, GeoPoint } from "@/context/AppContext";

export type MapFilter = "all" | "complaints" | "sos" | "workers" | "police" | "risks" | "hospitals" | "fire";

export interface EmergencyServiceMarker {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  phone?: string;
  address?: string;
  district?: string;
}

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
  type: "complaint" | "sos" | "worker" | "police" | "risk" | "hospital" | "fire";
  title: string;
  subtitle: string;
  radius: number;
  ringRadius?: number;
  phone?: string;
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
  html,body,#map{width:100%;height:100%;background:#0d1117}
  .leaflet-container{background:#0d1117}
  .leaflet-popup-content-wrapper{background:#1a1f2e;border:1px solid #2d3347;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);padding:0}
  .leaflet-popup-content{margin:0;color:#e6edf3}
  .leaflet-popup-tip{background:#1a1f2e}
  .leaflet-popup-tip-container{display:none}
  .leaflet-control-zoom{border:1px solid #2d3347!important;border-radius:10px!important;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.4)!important}
  .leaflet-control-zoom a{background:#1a1f2e!important;color:#e6edf3!important;border:none!important;font-size:16px!important;width:32px!important;height:32px!important;line-height:32px!important;border-bottom:1px solid #2d3347!important}
  .leaflet-control-zoom a:last-child{border-bottom:none!important}
  .leaflet-control-zoom a:hover{background:#252b3e!important;color:#fff!important}
  .leaflet-attribution-flag{display:none!important}
  .leaflet-control-attribution{background:rgba(13,17,23,0.85)!important;color:#6B7280!important;font-size:9px!important;border-radius:6px!important;border:1px solid #2d3347!important;padding:2px 6px!important}
  .leaflet-control-attribution a{color:#9CA3AF!important}
  .popup-box{padding:10px 12px;min-width:180px}
  .popup-title{font-weight:700;font-size:12px;color:#e6edf3;margin-bottom:4px;font-family:sans-serif;line-height:1.3}
  .popup-sub{font-size:11px;color:#9CA3AF;font-family:sans-serif;line-height:1.4}
  .popup-type{display:inline-block;font-size:9px;font-weight:700;letter-spacing:0.5px;padding:2px 7px;border-radius:4px;margin-bottom:6px;text-transform:uppercase}
  .popup-call{background:#22C55E;color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-top:6px}
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

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  subdomains:'abcd',
  maxZoom:19
}).addTo(map);

var typeLabels={
  complaint:'ISSUE',sos:'SOS',worker:'WORKER',police:'POLICE',risk:'RISK',hospital:'HOSPITAL',fire:'FIRE'
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
      fillOpacity:0.15,
      interactive:false
    }).addTo(map);
  }

  var marker;
  if(m.type==='hospital'){
    var hIcon=L.divIcon({className:'',html:'<div style="width:24px;height:24px;background:'+m.color+';border:2px solid #fff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 10px '+m.color+'88;">🏥</div>',iconSize:[24,24],iconAnchor:[12,12]});
    marker=L.marker([m.lat,m.lng],{icon:hIcon}).addTo(map);
  } else if(m.type==='fire'){
    var fIcon=L.divIcon({className:'',html:'<div style="width:24px;height:24px;background:'+m.color+';border:2px solid #fff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 10px '+m.color+'88;">🔥</div>',iconSize:[24,24],iconAnchor:[12,12]});
    marker=L.marker([m.lat,m.lng],{icon:fIcon}).addTo(map);
  } else if(m.type==='police'){
    var pIcon=L.divIcon({className:'',html:'<div style="width:24px;height:24px;background:'+m.color+';border:2px solid #fff;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 10px '+m.color+'88;">🚓</div>',iconSize:[24,24],iconAnchor:[12,12]});
    marker=L.marker([m.lat,m.lng],{icon:pIcon}).addTo(map);
  } else {
    marker=L.circleMarker([m.lat,m.lng],{
      radius:m.radius,
      fillColor:m.color,
      color:'#ffffff',
      weight:2,
      opacity:1,
      fillOpacity:0.92
    }).addTo(map);
  }

  var popupHTML='<div class="popup-box">'
    +'<span class="popup-type" style="background:'+m.color+'28;color:'+m.color+'">'+(typeLabels[m.type]||m.type.toUpperCase())+'</span>'
    +'<div class="popup-title">'+m.title+'</div>'
    +'<div class="popup-sub">'+m.subtitle+'</div>';
  if(m.phone&&(m.type==='police'||m.type==='hospital'||m.type==='fire')){
    popupHTML+='<div><button class="popup-call" onclick="window.open(\'tel:'+m.phone+'\',\'_self\')">📞 '+m.phone+'</button></div>';
  }
  popupHTML+='</div>';
  marker.bindPopup(popupHTML,{maxWidth:260,closeButton:false});
});

var userLoc=${userJson};
if(userLoc){
  L.circle([userLoc.lat,userLoc.lng],{
    radius:300,
    fillColor:'#FF9933',
    color:'#FF9933',
    weight:1.5,
    opacity:0.4,
    fillOpacity:0.12,
    interactive:false
  }).addTo(map);

  L.circleMarker([userLoc.lat,userLoc.lng],{
    radius:10,
    fillColor:'#FF9933',
    color:'#ffffff',
    weight:2.5,
    fillOpacity:1
  }).addTo(map)
    .bindPopup('<div class="popup-box"><span class="popup-type" style="background:#FF993328;color:#FF9933">YOU</span><div class="popup-title">Your Location</div><div class="popup-sub">'+userLoc.lat.toFixed(5)+'\u00B0N, '+userLoc.lng.toFixed(5)+'\u00B0E</div></div>',{maxWidth:200,closeButton:false});

  map.setView([userLoc.lat,userLoc.lng],${cZoom > 10 ? cZoom : 13},{animate:false});
}

window.addEventListener('message',function(e){
  try{
    var msg=JSON.parse(e.data);
    if(msg.type==='panTo') map.setView([msg.lat,msg.lng],msg.zoom||12,{animate:true});
    if(msg.type==='recenter') map.setView([${cLat},${cLng}],${cZoom},{animate:true});
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
  emergencyServices?: EmergencyServiceMarker[];
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
  emergencyServices = [],
  filter = "all",
  userLocation,
  userDistrict,
  style,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const show = (type: "complaints" | "sos" | "workers" | "police" | "risks" | "hospitals" | "fire") =>
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
            color: "#F59E0B", type: "police", radius: 10,
            title: ps.name,
            subtitle: ps.phone,
            phone: ps.phone,
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

    if (show("hospitals")) {
      (emergencyServices || []).filter(s => s.type === "hospital").forEach(s => {
        if (s.lat && s.lng) {
          result.push({
            lat: s.lat, lng: s.lng,
            color: "#EF4444", type: "hospital", radius: 9,
            title: `🏥 ${s.name}`,
            subtitle: s.address || s.district || "Hospital",
            phone: s.phone,
          });
        }
      });
    }

    if (show("fire")) {
      (emergencyServices || []).filter(s => s.type === "fire").forEach(s => {
        if (s.lat && s.lng) {
          result.push({
            lat: s.lat, lng: s.lng,
            color: "#F59E0B", type: "fire", radius: 9,
            title: `🔥 ${s.name}`,
            subtitle: s.address || s.district || "Fire Station",
            phone: s.phone,
          });
        }
      });
    }

    return result;
  }, [complaints, sosAlerts, workers, policeStations, riskZones, emergencyServices, filter]);

  const center = useMemo(() => {
    if (userLocation?.lat && userLocation?.lng) {
      return { lat: userLocation.lat, lng: userLocation.lng, zoom: 13 };
    }
    if (userDistrict && userDistrict !== "Uttarakhand" && DISTRICT_CENTERS[userDistrict]) {
      return DISTRICT_CENTERS[userDistrict];
    }
    return { lat: 30.0668, lng: 79.0193, zoom: 8 };
  }, [userLocation, userDistrict]);

  const html = useMemo(() =>
    buildLeafletHTML(
      markers,
      center,
      userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null
    ),
    [markers, center, userLocation]
  );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;display:block;background:#0d1117;";
    iframe.setAttribute("title", "Uttarakhand District Map");
    iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");

    while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
    wrapper.appendChild(iframe);
    iframeRef.current = iframe;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }

    return () => {
      iframeRef.current = null;
      try {
        while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild);
      } catch {}
    };
  }, [html]);

  return (
    <View style={[styles.container, style]}>
      <div
        ref={wrapperRef}
        style={{ width: "100%", height: "100%", background: "#0d1117" } as any}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
    overflow: "hidden",
  },
});
