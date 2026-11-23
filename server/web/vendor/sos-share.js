/* P6.1 live-location page for trusted contacts: a live map that follows the person. Token comes from data-token. */
(function () {
  "use strict";
  var T = document.body.getAttribute("data-token");
  if (!T) return;
  var tiles = document.body.getAttribute("data-tiles") || "";
  var map = null, marker = null, trail = null, last = null;

  function tileLayer() {
    var m = /^wms:(https:\/\/[\w.-]+\/[\w./-]+)\|([\w:,-]+)$/.exec(tiles);
    if (m) return L.tileLayer.wms(m[1], { layers: m[2], format: "image/png", transparent: false, tiled: true, maxZoom: 18, attribution: "&copy; ISRO Bhuvan / NRSC" });
    if (/^https:\/\//.test(tiles)) return L.tileLayer(tiles, { maxZoom: 19 });
    return null;
  }
  function ensureMap(lat, lng) {
    if (map || typeof L === "undefined") return;
    map = L.map("map", { zoomControl: true, attributionControl: true }).setView([lat, lng], 16);
    var t = tileLayer(); if (t) t.addTo(map);
    trail = L.polyline([], { color: "#DC2626", weight: 3, opacity: 0.6 }).addTo(map);
    marker = L.circleMarker([lat, lng], { radius: 11, color: "#fff", weight: 3, fillColor: "#DC2626", fillOpacity: 1 }).addTo(map);
  }
  function ago(iso) {
    var s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    return s < 60 ? s + " seconds ago" : s < 3600 ? Math.round(s / 60) + " minutes ago" : new Date(iso).toLocaleString();
  }
  function u() {
    fetch("/api/sos/shared/" + encodeURIComponent(T), { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var st = document.getElementById("st"), age = document.getElementById("age");
      if (!d) { st.textContent = "This alert has been closed or the link has expired."; st.className = "closed"; age.textContent = ""; return; }
      var closed = d.status === "resolved" || d.status === "cancelled";
      st.textContent = closed ? "The person marked this alert as " + d.status + "." : "Live: alert is " + d.status + " (" + d.state + ")";
      st.className = closed ? "closed" : "";
      age.textContent = "Position updated " + ago(d.updatedAt) + " · " + d.lat + ", " + d.lng;
      ensureMap(d.lat, d.lng);
      if (map && (!last || last[0] !== d.lat || last[1] !== d.lng)) {
        marker.setLatLng([d.lat, d.lng]); trail.addLatLng([d.lat, d.lng]); map.panTo([d.lat, d.lng]); last = [d.lat, d.lng];
      }
      document.getElementById("dir").href = "geo:" + d.lat + "," + d.lng + "?q=" + d.lat + "," + d.lng;
      var ps = document.getElementById("ps");
      if (d.nearestPoliceStation) { ps.hidden = false; ps.textContent = "Nearest police: " + d.nearestPoliceStation + (d.nearestPolicePhone ? " — call " + d.nearestPolicePhone : ""); ps.href = d.nearestPolicePhone ? "tel:" + d.nearestPolicePhone : "#"; }
    }).catch(function () {});
  }
  u();
  setInterval(u, 10000);
})();
