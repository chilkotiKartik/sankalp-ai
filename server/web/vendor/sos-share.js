/* P6.1 live-location page for trusted contacts. Token comes from data-token on <body>. */
(function () {
  "use strict";
  var T = document.body.getAttribute("data-token");
  if (!T) return;
  function u() {
    fetch("/api/sos/shared/" + encodeURIComponent(T)).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var s = document.getElementById("st");
      if (!d) { s.textContent = "This alert has been closed."; return; }
      s.textContent = "Status: " + d.status + " · updated " + new Date(d.updatedAt).toLocaleTimeString() + " · " + d.lat + ", " + d.lng;
      document.getElementById("map").href = "geo:" + d.lat + "," + d.lng + "?q=" + d.lat + "," + d.lng;
      if (d.nearestPoliceStation) document.getElementById("ps").textContent = "Nearest police: " + d.nearestPoliceStation + (d.nearestPolicePhone ? " (" + d.nearestPolicePhone + ")" : "");
    }).catch(function () {});
  }
  u();
  setInterval(u, 20000);
})();
