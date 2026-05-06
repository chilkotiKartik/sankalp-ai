// Shared Leaflet HTML builder for Worker GPS Map
// Used by both native (WebView) and web (iframe) versions

export interface WorkerMapData {
  id: string;
  name: string;
  status: "active" | "idle" | "on_leave";
  lat: number;
  lng: number;
  district: string;
  ward: string;
  score: number;
  task: string;
  resolvedToday: number;
  totalResolved: number;
  avgRating: number;
  phone: string;
}

export interface DistrictHeatData {
  district: string;
  lat: number;
  lng: number;
  count: number;
  active: number;
  avgScore: number;
}

export const DISTRICT_CENTERS: Record<string, [number, number]> = {
  "Dehradun":          [30.3165, 78.0322],
  "Haridwar":          [29.9457, 78.1642],
  "Tehri Garhwal":     [30.3822, 78.4800],
  "Pauri Garhwal":     [29.6864, 78.9764],
  "Rudraprayag":       [30.2846, 78.9806],
  "Chamoli":           [30.4090, 79.3206],
  "Uttarkashi":        [30.7268, 78.4354],
  "Pithoragarh":       [29.5829, 80.2178],
  "Bageshwar":         [29.8371, 79.7715],
  "Almora":            [29.5971, 79.6596],
  "Champawat":         [29.3377, 80.0914],
  "Nainital":          [29.3919, 79.4542],
  "Udham Singh Nagar": [28.9982, 79.5050],
};

export function buildWorkerMapHTML(
  workers: WorkerMapData[],
  heatData: DistrictHeatData[],
  selectedId: string | null,
  showHeat: boolean,
  isWebPlatform: boolean
): string {
  const wJson = JSON.stringify(workers);
  const hJson = JSON.stringify(heatData);
  const sJson = JSON.stringify(selectedId);
  const centersJson = JSON.stringify(DISTRICT_CENTERS);
  const showHeatJs = showHeat ? "true" : "false";
  const isWebJs = isWebPlatform ? "true" : "false";

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
  .leaflet-control-zoom a:hover{background:#21262d!important;color:#FF9933!important}
  .leaflet-attribution-flag{display:none!important}
  .leaflet-control-attribution{background:rgba(13,17,23,0.85)!important;color:#484f58!important;font-size:9px!important;border-radius:6px!important;padding:3px 8px!important}
  .leaflet-control-attribution a{color:#6e7681!important}
  .wm{
    width:28px;height:28px;border-radius:50%;border:2.5px solid rgba(255,255,255,0.85);
    display:flex;align-items:center;justify-content:center;
    font-size:12px;font-weight:800;color:#fff;cursor:pointer;
    box-shadow:0 2px 10px rgba(0,0,0,0.8);
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-0.5px;
    transition:transform 0.15s ease,box-shadow 0.15s ease
  }
  .wm.active{animation:gps 2.2s ease-in-out infinite}
  .wm.idle{opacity:0.85}
  .wm.on_leave{opacity:0.6}
  .wm.sel{
    transform:scale(1.55)!important;border-color:#FF9933!important;border-width:3px!important;
    box-shadow:0 0 0 4px rgba(255,153,51,0.25),0 4px 16px rgba(0,0,0,0.9)!important;
    z-index:1000!important
  }
  @keyframes gps{
    0%,100%{box-shadow:0 2px 10px rgba(0,0,0,0.8),0 0 0 0 rgba(0,192,96,0.6)}
    60%{box-shadow:0 2px 10px rgba(0,0,0,0.8),0 0 0 12px rgba(0,192,96,0)}
  }
  .pb{padding:11px 13px;min-width:185px;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
  .pt{font-weight:800;font-size:13px;color:#e6edf3;margin-bottom:2px;line-height:1.3}
  .ps{font-size:11px;color:#8b949e;line-height:1.5}
  .pk{font-size:10px;color:#FF9933;margin-top:3px;font-style:italic}
  .pbadge{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:4px;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.3px}
  .leaflet-popup-content-wrapper{background:#161b22;border:1px solid #30363d;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.8);padding:0}
  .leaflet-popup-content{margin:0;color:#e6edf3}
  .leaflet-popup-tip{background:#161b22}
  .leaflet-popup-tip-container{display:none}
  .leaflet-popup-close-button{color:#8b949e!important;font-size:16px!important;top:6px!important;right:8px!important;transition:color 0.15s}
  .leaflet-popup-close-button:hover{color:#e6edf3!important;background:transparent!important}
  #heat-legend{
    position:absolute;bottom:40px;left:8px;background:rgba(13,17,23,0.9);
    border:1px solid #30363d;border-radius:8px;padding:8px 10px;
    font-family:-apple-system,sans-serif;z-index:500;min-width:110px;
    display:none
  }
  #heat-legend.visible{display:block}
  #heat-legend h4{font-size:9px;color:#8b949e;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px}
  .hl-row{display:flex;align-items:center;gap:5px;margin-bottom:3px}
  .hl-swatch{width:12px;height:12px;border-radius:3px;border:1px solid rgba(255,255,255,0.1)}
  .hl-label{font-size:10px;color:#c9d1d9}
</style>
</head>
<body>
<div id="map"></div>
<div id="heat-legend">
  <h4>District Heat</h4>
  <div class="hl-row"><div class="hl-swatch" style="background:#3B82F6"></div><span class="hl-label">Sparse</span></div>
  <div class="hl-row"><div class="hl-swatch" style="background:#00C060"></div><span class="hl-label">Normal</span></div>
  <div class="hl-row"><div class="hl-swatch" style="background:#F59E0B"></div><span class="hl-label">Busy</span></div>
  <div class="hl-row"><div class="hl-swatch" style="background:#FF9933"></div><span class="hl-label">High</span></div>
  <div class="hl-row"><div class="hl-swatch" style="background:#EF4444"></div><span class="hl-label">Critical</span></div>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
<script>
var workers=${wJson};
var heatData=${hJson};
var selectedId=${sJson};
var districtCenters=${centersJson};
var showHeat=${showHeatJs};
var isWeb=${isWebJs};

var map=L.map('map',{
  center:[30.0668,79.0193],zoom:7,
  zoomControl:true,attributionControl:true,preferCanvas:false
});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
  attribution:'&copy; OSM &copy; CARTO',subdomains:'abcd',maxZoom:19
}).addTo(map);

// ── HEAT COLOR FUNCTION ──────────────────────────────────────────────────────
function heatColor(count,avgScore,maxCount){
  var density=maxCount>0?count/maxCount:0;
  var scoreNorm=avgScore/100;
  var heat=density*0.65+scoreNorm*0.35;
  if(heat<0.18)return{fill:'#1E3A5F',stroke:'#3B82F6',opacity:0.55};
  if(heat<0.35)return{fill:'#003D20',stroke:'#00C060',opacity:0.55};
  if(heat<0.55)return{fill:'#422006',stroke:'#F59E0B',opacity:0.6};
  if(heat<0.75)return{fill:'#431407',stroke:'#FF9933',opacity:0.65};
  return{fill:'#450a0a',stroke:'#EF4444',opacity:0.7};
}

var maxCount=Math.max.apply(null,heatData.map(function(d){return d.count;})||[1]);
if(maxCount===0)maxCount=1;

// ── DISTRICT HEAT CIRCLES ─────────────────────────────────────────────────────
var heatLayers=[];
if(showHeat){
  document.getElementById('heat-legend').className='visible';
}

heatData.forEach(function(d){
  var center=districtCenters[d.district];
  if(!center)return;
  var col=heatColor(d.count,d.avgScore,maxCount);
  var circle=L.circle([center[0],center[1]],{
    radius:38000,
    fillColor:col.fill,
    color:col.stroke,
    weight:1.5,
    opacity:showHeat?0.7:0,
    fillOpacity:showHeat?col.opacity:0,
    interactive:true,
    className:'heat-circle'
  });
  var label=d.district+' &mdash; <b>'+d.count+'</b> workers'
    +(d.active?' (<span style="color:#00C060">'+d.active+' active</span>)':'')
    +'<br><span style="color:#FF9933">Avg Score: '+Math.round(d.avgScore)+'</span>';
  circle.bindTooltip(label,{
    sticky:true,
    className:'',
    opacity:1,
    direction:'top',
  });
  circle.addTo(map);
  heatLayers.push(circle);
});

// ── STATUS COLORS ─────────────────────────────────────────────────────────────
var SC={active:'#00C060',idle:'#FFAB00',on_leave:'#6B7280'};

function makeIcon(w,isSel){
  var col=SC[w.status]||'#6B7280';
  var cls='wm '+w.status+(isSel?' sel':'');
  return L.divIcon({
    html:'<div class="'+cls+'" style="background:'+col+'">'+w.name.charAt(0)+'</div>',
    iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-18],className:''
  });
}

function sendMsg(data){
  var str=JSON.stringify(data);
  if(isWeb){try{window.parent&&window.parent.postMessage(str,'*');}catch(e){}}
  else{try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(str);}catch(e){}}
}

// ── WORKER MARKERS ─────────────────────────────────────────────────────────────
var markerMap={};

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
    +'<div class="ps"><span style="color:#FF9933;font-weight:700">'+w.score+'</span> score &nbsp;&#9733; '+w.avgRating.toFixed(1)+'</div>'
    +'<div class="ps">'+w.resolvedToday+' today &middot; '+w.totalResolved+' total</div>'
    +(w.task?'<div class="pk">&#9881; '+w.task+'</div>':'')
    +'</div>';
  marker.bindPopup(ph,{maxWidth:240});
  marker.on('click',function(){sendMsg({type:'workerTap',id:w.id});});
  marker.addTo(map);
  markerMap[w.id]=marker;
});

if(selectedId&&markerMap[selectedId]){
  map.setView(markerMap[selectedId].getLatLng(),13,{animate:false});
  setTimeout(function(){try{markerMap[selectedId].openPopup();}catch(e){}},500);
}

// ── COMMANDS ──────────────────────────────────────────────────────────────────
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
  Object.keys(markerMap).forEach(function(k){
    var w=workers.find(function(x){return x.id===k;});
    if(w)markerMap[k].setIcon(makeIcon(w,k===id));
  });
  if(markerMap[id]){
    map.setView(markerMap[id].getLatLng(),14,{animate:true});
    setTimeout(function(){try{markerMap[id].openPopup();}catch(e){}},450);
  }
};
window.resetView=function(){
  selectedId=null;
  Object.keys(markerMap).forEach(function(k){
    var w=workers.find(function(x){return x.id===k;});
    if(w)markerMap[k].setIcon(makeIcon(w,false));
  });
  map.setView([30.0668,79.0193],7,{animate:true});
};
window.setHeatVisible=function(vis){
  var leg=document.getElementById('heat-legend');
  heatLayers.forEach(function(c){
    if(vis){
      c.setStyle({opacity:0.7,fillOpacity:0.55});
      if(leg)leg.className='visible';
    }else{
      c.setStyle({opacity:0,fillOpacity:0});
      if(leg)leg.className='';
    }
  });
};

// Handle postMessage commands from parent (web iframe)
window.addEventListener('message',function(e){
  try{
    var msg=JSON.parse(e.data);
    if(msg.type==='focus')window.focusWorker(msg.id);
    if(msg.type==='reset')window.resetView();
    if(msg.type==='update')window.updateWorkers(msg.updates);
    if(msg.type==='heat')window.setHeatVisible(msg.visible);
  }catch(err){}
});
</script>
</body>
</html>`;
}
