/**
 * Clutter-free places on the in-app Leaflet maps (StateMap web + native WebView).
 * Hospitals, fire stations and police stations that sit close together on screen merge into one count bubble
 * ("🏥 48"); tapping it zooms in. Single places get a small clean icon with the marker's own popup.
 * Same behaviour as window.sankalpPlaceLayer in server/web/vendor/sankalp-common.js (portals).
 * Injected as plain JS into the map page. Usage inside the page: placeCluster(L, map, [{lat,lng,kind,marker}]).
 */
export const PLACE_CLUSTER_JS = `
function placeCluster(L,map,items){
  var STYLE={hospital:{c:'#DB2777',e:'🏥'},fire:{c:'#EA580C',e:'🔥'},police:{c:'#1D4ED8',e:'🚓'}};
  var CELL=96,layer=L.layerGroup().addTo(map);
  function draw(){
    layer.clearLayers();
    var z=map.getZoom(),cells={},b=map.getBounds().pad(0.2);
    items.forEach(function(it){
      if(!b.contains([it.lat,it.lng]))return;
      var p=map.project([it.lat,it.lng],z),k=it.kind+':'+Math.floor(p.x/CELL)+':'+Math.floor(p.y/CELL);
      (cells[k]=cells[k]||[]).push(it);
    });
    Object.keys(cells).forEach(function(k){
      var g=cells[k],s=STYLE[g[0].kind]||STYLE.hospital;
      if(g.length===1||z>=17){
        g.forEach(function(it){
          var icon=L.divIcon({className:'',iconSize:[22,22],iconAnchor:[11,11],
            html:'<div style="width:22px;height:22px;background:#fff;border:2px solid '+s.c+';border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.25)">'+s.e+'</div>'});
          var mk=L.marker([it.lat,it.lng],{icon:icon});
          var pop=it.marker&&it.marker.getPopup&&it.marker.getPopup();
          if(pop)mk.bindPopup(pop.getContent(),pop.options);
          mk.addTo(layer);
        });
        return;
      }
      var lat=0,lng=0;g.forEach(function(it){lat+=it.lat;lng+=it.lng;});
      var n=g.length,size=n<10?34:n<100?40:46;
      var bubble=L.divIcon({className:'',iconSize:[size,size],iconAnchor:[size/2,size/2],
        html:'<div style="width:'+size+'px;height:'+size+'px;border-radius:50%;background:'+s.c+';color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;gap:2px;font:700 12px system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3)">'+s.e+n+'</div>'});
      var cm=L.marker([lat/n,lng/n],{icon:bubble}).addTo(layer);
      cm.on('click',function(){map.fitBounds(L.latLngBounds(g.map(function(it){return [it.lat,it.lng];})).pad(0.3),{maxZoom:17});});
    });
  }
  draw();map.on('zoomend moveend',draw);
}
`;
