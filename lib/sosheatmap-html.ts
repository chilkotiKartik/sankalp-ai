import { DISTRICT_CENTERS } from "./workermap-html";

export interface SosHeatEntry {
  district: string;
  total: number;
  active: number;
  womenSafety: number;
  critical: number; // P1
}

export function buildSosHeatmapHTML(entries: SosHeatEntry[]): string {
  const eJson = JSON.stringify(entries);
  const centersJson = JSON.stringify(DISTRICT_CENTERS);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin=""/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#0d1117}
  .leaflet-container{background:#0d1117}
  .leaflet-control-zoom{border:1px solid #30363d!important;border-radius:8px!important;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.5)!important}
  .leaflet-control-zoom a{background:#161b22!important;color:#c9d1d9!important;border:none!important;font-size:16px!important;width:30px!important;height:30px!important;line-height:30px!important;border-bottom:1px solid #30363d!important}
  .leaflet-control-zoom a:last-child{border-bottom:none!important}
  .leaflet-control-zoom a:hover{background:#21262d!important;color:#EF4444!important}
  .leaflet-control-attribution{background:rgba(13,17,23,0.85)!important;color:#484f58!important;font-size:9px!important;border-radius:5px!important;padding:2px 6px!important}
  .leaflet-control-attribution a{color:#6e7681!important}
  .leaflet-attribution-flag{display:none!important}
  .leaflet-popup-content-wrapper{background:#161b22;border:1px solid #30363d;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.8);padding:0}
  .leaflet-popup-content{margin:0;color:#e6edf3}
  .leaflet-popup-tip{background:#161b22}
  .leaflet-popup-tip-container{display:none}
  .leaflet-popup-close-button{color:#8b949e!important;top:6px!important;right:8px!important}
  #legend{
    position:absolute;bottom:8px;left:8px;background:rgba(13,17,23,0.92);
    border:1px solid #30363d;border-radius:8px;padding:7px 9px;
    font-family:-apple-system,sans-serif;z-index:500;min-width:100px
  }
  #legend h4{font-size:8px;color:#8b949e;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
  .lr{display:flex;align-items:center;gap:4px;margin-bottom:2px}
  .ls{width:11px;height:11px;border-radius:2px;border:1px solid rgba(255,255,255,0.1)}
  .ll{font-size:9px;color:#c9d1d9}
  .pb{padding:10px 12px;min-width:160px;font-family:-apple-system,sans-serif}
  .pt{font-weight:800;font-size:13px;color:#e6edf3;margin-bottom:3px}
  .ps{font-size:11px;color:#8b949e;line-height:1.5}
  .pc{font-size:11px;margin-top:4px;font-weight:700}
</style>
</head>
<body>
<div id="map"></div>
<div id="legend">
  <h4>SOS Density</h4>
  <div class="lr"><div class="ls" style="background:#1E3A5F;border-color:#3B82F6"></div><span class="ll">None</span></div>
  <div class="lr"><div class="ls" style="background:#003D20;border-color:#00C060"></div><span class="ll">Low</span></div>
  <div class="lr"><div class="ls" style="background:#422006;border-color:#F59E0B"></div><span class="ll">Medium</span></div>
  <div class="lr"><div class="ls" style="background:#431407;border-color:#FF9933"></div><span class="ll">High</span></div>
  <div class="lr"><div class="ls" style="background:#450a0a;border-color:#EF4444"></div><span class="ll">Critical</span></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
var entries=${eJson};
var centers=${centersJson};
var map=L.map('map',{center:[30.0668,79.0193],zoom:7,zoomControl:true,attributionControl:true,preferCanvas:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'&copy; OSM &copy; CARTO',subdomains:'abcd',maxZoom:19
}).addTo(map);

var maxTotal=Math.max.apply(null,entries.map(function(e){return e.total;})||[1]);
if(maxTotal===0)maxTotal=1;

function heatColor(e){
  var r=e.total/maxTotal;
  if(r===0) return{fill:'#1E3A5F',stroke:'#3B82F6',op:0.45};
  if(r<0.25) return{fill:'#003D20',stroke:'#00C060',op:0.5};
  if(r<0.5)  return{fill:'#422006',stroke:'#F59E0B',op:0.55};
  if(r<0.75) return{fill:'#431407',stroke:'#FF9933',op:0.65};
  return{fill:'#450a0a',stroke:'#EF4444',op:0.75};
}

entries.forEach(function(e){
  var c=centers[e.district];
  if(!c)return;
  var col=heatColor(e);
  var circle=L.circle([c[0],c[1]],{
    radius:38000,fillColor:col.fill,color:col.stroke,weight:1.5,
    opacity:col.op+0.1,fillOpacity:col.op,interactive:true
  });
  var ws=e.womenSafety>0?'<br><span style="color:#8B5CF6;font-weight:700">&#128737; '+e.womenSafety+' women safety</span>':'';
  var cr=e.critical>0?'<br><span style="color:#EF4444;font-weight:700">P1 Critical: '+e.critical+'</span>':'';
  var popup='<div class="pb"><div class="pt">'+e.district+'</div>'
    +'<div class="ps"><span style="color:#EF4444;font-weight:700">'+e.total+'</span> total SOS'
    +(e.active?' &bull; <span style="color:#FF9933;font-weight:700">'+e.active+' active</span>':'')
    +'</div>'+ws+cr+'</div>';
  circle.bindPopup(popup,{maxWidth:220});
  circle.addTo(map);
});

// Active SOS red dot markers (for districts with active SOS)
entries.forEach(function(e){
  if(e.active<=0)return;
  var c=centers[e.district];
  if(!c)return;
  var icon=L.divIcon({
    html:'<div style="background:#EF4444;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 0 rgba(239,68,68,0.6);animation:pulse 1.5s ease-in-out infinite"></div>',
    iconSize:[14,14],iconAnchor:[7,7],className:''
  });
  L.marker([c[0],c[1]],{icon:icon,zIndexOffset:500}).bindPopup(
    '<div class="pb"><div class="pt">'+e.district+'</div><div class="ps pc" style="color:#EF4444">'+e.active+' ACTIVE SOS</div></div>',
    {maxWidth:160}
  ).addTo(map);
});
</script>
<style>
@keyframes pulse{
  0%{box-shadow:0 0 0 0 rgba(239,68,68,0.6)}
  70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}
  100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}
}
</style>
</body>
</html>`;
}
