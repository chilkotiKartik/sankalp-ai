/*
 * Shared portal runtime (M16, audit C2).
 *  - DEMO badge when the server runs DEMO_MODE
 *  - sankalpTileLayer(): base-map tiles only from the configured MAP_TILE_URL
 *  - sankalpEsc(): HTML escaping for any user text inserted via string HTML (Leaflet popups)
 *  - Staff sign-in for pages marked <meta name="sankalp-auth" content="police">; token kept in sessionStorage
 *  - Adds the token to same-origin /api fetches and EventSource streams (EventSource cannot send headers)
 *  - P9: every portal works for every state. The server injects the selected state's config
 *    (window.__SANKALP__.tenant); the choice is kept in localStorage and sent as X-Tenant / ?tenant=.
 */
(function () {
  "use strict";
  var cfg = window.__SANKALP__ || {};
  var KEY = "sankalp_staff_token";
  var TKEY = "sankalp_tenant";
  var T = cfg.tenant || null;

  // ── state (tenant) selection ───────────────────────────────────────────────
  (function syncTenant() {
    var qs = new URLSearchParams(location.search);
    var fromUrl = qs.get("tenant");
    var stored = null;
    try { stored = localStorage.getItem(TKEY); } catch (e) {}
    if (fromUrl) { try { localStorage.setItem(TKEY, fromUrl); } catch (e) {} return; }
    if (stored && T && stored !== T.id) { qs.set("tenant", stored); location.replace(location.pathname + "?" + qs.toString() + location.hash); }
  })();
  window.sankalpTenant = T;
  // Portal-wide state data (read by the page scripts): name, districts, map view, departments, category owners.
  var SK = window.SK = { id: T ? T.id : "", state: T ? (T.stateLabel || T.name) : "your state", stateLocal: T ? (T.nameLocal || T.name) : "",
    districts: [], centers: {}, center: [22.9734, 78.6569], zoom: 5, depts: {}, catDept: {}, helplines: (T && T.helplines) || {} };
  if (T) {
    (T.districts || []).forEach(function (d) { SK.districts.push(d.name); SK.centers[d.name] = [d.center.lat, d.center.lng]; });
    if (T.mapBounds && T.mapBounds.center) { SK.center = [T.mapBounds.center.lat, T.mapBounds.center.lng]; SK.zoom = T.mapBounds.zoom || 7; }
    (T.departments || []).forEach(function (d) {
      SK.depts[d.id] = { id: d.id, name: d.name, nameHindi: d.nameLocal || d.name, icon: d.icon || "🏛️", color: d.color || "#F59E0B", categories: d.categories || [],
        helpline: d.helpline || "", helpline2: "", sla: d.slaHours || 48, head: "", address: "", email: "" };
      (d.categories || []).forEach(function (c) { SK.catDept[c] = d.id; });
    });
  }
  /** Approximate square around a district centre (r degrees) for heat overlays — real boundaries need a GeoJSON import. */
  SK.box = function (name, r) {
    var c = SK.centers[name]; r = r || 0.25; if (!c) return null;
    return [[c[0] + r, c[1] - r], [c[0] + r, c[1] + r], [c[0] - r, c[1] + r], [c[0] - r, c[1] - r]];
  };
  window.sankalpSetTenant = function (id) {
    try { localStorage.setItem(TKEY, id); } catch (e) {}
    window.sankalpAuth && window.sankalpAuth.clear(); // a staff token is valid for one state only
    var qs = new URLSearchParams(location.search); qs.set("tenant", id);
    location.href = location.pathname + "?" + qs.toString();
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"'`]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" }[c];
    });
  }
  window.sankalpEsc = esc;

  function token() {
    try {
      var t = sessionStorage.getItem(KEY) || sessionStorage.getItem("dept_token");
      if (t) return t;
      var p = JSON.parse(localStorage.getItem("portal_session") || "null");
      return (p && (p.token || p.deptToken)) || null;
    } catch (e) { return null; }
  }
  window.sankalpAuth = {
    get: token,
    set: function (t) { try { sessionStorage.setItem(KEY, t); } catch (e) {} },
    clear: function () { try { sessionStorage.removeItem(KEY); } catch (e) {} },
  };

  window.sankalpTileLayer = function (L, map) {
    if (!cfg.mapTileUrl) {
      var n = document.createElement("div");
      n.textContent = "Base map not configured (MAP_TILE_URL) — markers shown without background tiles";
      n.style.cssText = "position:fixed;bottom:8px;left:8px;z-index:10000;font:12px sans-serif;background:rgba(0,0,0,.7);color:#fff;padding:4px 8px;border-radius:6px";
      document.body.appendChild(n);
      return null;
    }
    return L.tileLayer(cfg.mapTileUrl, { maxZoom: 19, subdomains: "abc", attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  };

  /** P9.2: outline the selected state's districts (boundaries © OpenStreetMap contributors, ODbL). */
  window.sankalpDistrictLayer = function (L, map, fit) {
    if (!L || !L.geoJSON || !origFetchForGeo) return;
    origFetchForGeo("/api/public/geo/districts", { headers: T ? { "X-Tenant": T.id } : {} })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (g) {
        if (!g || !g.features || !g.features.length) return;
        var layer = L.geoJSON(g, {
          style: function () { return { color: "#FF9933", weight: 1.2, opacity: 0.85, fillColor: "#FF9933", fillOpacity: 0.04 }; },
          onEachFeature: function (f, l) { l.bindTooltip(esc(f.properties && f.properties.name), { sticky: true }); },
        }).addTo(map);
        layer.bringToBack();
        if (fit) { try { map.fitBounds(layer.getBounds(), { padding: [8, 8] }); } catch (e) {} }
      })
      .catch(function () {});
  };

  // ── same-origin API auth ───────────────────────────────────────────────────
  var sameOriginApi = function (u) {
    try { var url = new URL(u, location.href); return url.origin === location.origin && url.pathname.indexOf("/api/") === 0; } catch (e) { return false; }
  };
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  var origFetchForGeo = origFetch;

  // ── access-token refresh (review P1-H4) ────────────────────────────────────
  // Access tokens live 15 min. On a 401 we rotate the refresh token once, store the new pair
  // wherever this page keeps its session, and replay the request. Stale tokens a page still
  // holds in its own state are transparently swapped for the current one.
  var replaced = {};
  function refreshToken() {
    try {
      var r = localStorage.getItem("sankalp_refresh");
      if (r) return r;
      var p = JSON.parse(localStorage.getItem("portal_session") || "null");
      return (p && p.refreshToken) || null;
    } catch (e) { return null; }
  }
  function storeRefreshed(oldTok, j) {
    replaced[oldTok] = j.accessToken;
    try {
      localStorage.setItem("sankalp_refresh", j.refreshToken);
      var p = JSON.parse(localStorage.getItem("portal_session") || "null");
      if (p && p.refreshToken) { p.token = p.accessToken = j.accessToken; p.refreshToken = j.refreshToken; localStorage.setItem("portal_session", JSON.stringify(p)); }
      if (localStorage.getItem("sankalp_token")) localStorage.setItem("sankalp_token", j.accessToken);
      if (sessionStorage.getItem(KEY)) sessionStorage.setItem(KEY, j.accessToken);
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent("sankalp:token", { detail: j.accessToken })); } catch (e) {}
  }
  var inflight = null;
  function doRefresh(oldTok) {
    var rt = refreshToken();
    if (!rt || !origFetch) return Promise.resolve(null);
    if (!inflight) {
      inflight = origFetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.accessToken) { storeRefreshed(oldTok, j); return j.accessToken; } return null; })
        .catch(function () { return null; })
        .then(function (t) { inflight = null; return t; });
    }
    return inflight;
  }
  window.sankalpAuth_refresh = doRefresh;

  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (!sameOriginApi(url)) return origFetch(input, init);
      init = init || {};
      var h = new Headers(init.headers || (typeof input !== "string" && input.headers) || {});
      var t = token();
      if (T && !h.has("X-Tenant")) h.set("X-Tenant", T.id);
      if (t && !h.has("Authorization")) h.set("Authorization", "Bearer " + t);
      var sent = (h.get("Authorization") || "").replace(/^Bearer\s+/, "");
      if (sent && replaced[sent]) { sent = replaced[sent]; h.set("Authorization", "Bearer " + sent); }
      init.headers = h;
      var isAuthCall = url.indexOf("/api/auth/") !== -1 || url.indexOf("/login") !== -1;
      return origFetch(input, init).then(function (res) {
        if (res.status !== 401 || isAuthCall) return res;
        return doRefresh(sent).then(function (fresh) {
          if (fresh) {
            var h2 = new Headers(init.headers); h2.set("Authorization", "Bearer " + fresh);
            return origFetch(input, Object.assign({}, init, { headers: h2 }));
          }
          if (requiresAuth()) { window.sankalpAuth.clear(); showLogin("Your session has expired. Please sign in again."); }
          return res;
        });
      });
    };
  }
  var OrigES = window.EventSource;
  if (OrigES) {
    var Patched = function (url, conf) {
      var t = token();
      if (t && sameOriginApi(url) && !/[?&]token=/.test(url)) url += (url.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(t);
      if (T && sameOriginApi(url) && !/[?&]tenant=/.test(url)) url += (url.indexOf("?") === -1 ? "?" : "&") + "tenant=" + encodeURIComponent(T.id);
      return new OrigES(url, conf);
    };
    Patched.prototype = OrigES.prototype;
    Patched.CONNECTING = 0; Patched.OPEN = 1; Patched.CLOSED = 2;
    window.EventSource = Patched;
  }

  // ── staff sign-in overlay ──────────────────────────────────────────────────
  function requiresAuth() {
    var m = document.querySelector('meta[name="sankalp-auth"]');
    return !!m && m.getAttribute("content") === "police";
  }

  /** Control-room units of the selected state: its police and disaster-management departments. */
  function unitOptions() {
    var deps = (T && T.departments) || [];
    var units = deps.filter(function (d) { return d.id === "police" || (d.categories || []).indexOf("disaster") !== -1 || (d.categories || []).indexOf("noise") !== -1; });
    if (!units.length) units = [{ id: "police", name: "State Police" }];
    return units.map(function (d) { return '<option value="' + esc(d.id) + '">' + esc(d.name) + "</option>"; }).join("");
  }

  function showLogin(msg) {
    if (document.getElementById("sankalp-login")) return;
    var o = document.createElement("div");
    o.id = "sankalp-login";
    o.setAttribute("role", "dialog");
    o.setAttribute("aria-modal", "true");
    o.style.cssText = "position:fixed;inset:0;z-index:20000;background:rgba(5,10,20,.92);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif";
    o.innerHTML =
      '<form style="background:#111827;color:#F9FAFB;border:1px solid #374151;border-radius:14px;padding:24px;width:min(380px,92vw)">' +
      '<h1 style="font-size:18px;margin:0 0 6px">Police / CPR command sign-in</h1>' +
      '<p style="font-size:13px;color:#9CA3AF;margin:0 0 16px">' + esc(msg || "This console shows live SOS locations. Authorised staff only.") + "</p>" +
      '<label style="display:block;font-size:12px;margin-bottom:4px" for="sk-mode">Sign in with</label>' +
      '<select id="sk-mode" style="width:100%;padding:10px;border-radius:8px;margin-bottom:12px;background:#1F2937;color:#fff;border:1px solid #374151">' +
      '<option value="dept">Control-room access code</option><option value="admin">Admin phone + PIN</option></select>' +
      '<div id="sk-dept"><label style="display:block;font-size:12px;margin-bottom:4px" for="sk-dep">Unit</label>' +
      '<select id="sk-dep" style="width:100%;padding:10px;border-radius:8px;margin-bottom:12px;background:#1F2937;color:#fff;border:1px solid #374151">' + unitOptions() + '</select>' +
      '<label style="display:block;font-size:12px;margin-bottom:4px" for="sk-code">Access code</label>' +
      '<input id="sk-code" type="password" autocomplete="off" required style="width:100%;padding:10px;border-radius:8px;margin-bottom:12px;background:#1F2937;color:#fff;border:1px solid #374151"></div>' +
      '<div id="sk-admin" style="display:none"><label style="display:block;font-size:12px;margin-bottom:4px" for="sk-phone">Phone</label>' +
      '<input id="sk-phone" inputmode="numeric" style="width:100%;padding:10px;border-radius:8px;margin-bottom:12px;background:#1F2937;color:#fff;border:1px solid #374151">' +
      '<label style="display:block;font-size:12px;margin-bottom:4px" for="sk-pin">PIN</label>' +
      '<input id="sk-pin" type="password" inputmode="numeric" style="width:100%;padding:10px;border-radius:8px;margin-bottom:12px;background:#1F2937;color:#fff;border:1px solid #374151"></div>' +
      '<div id="sk-err" role="alert" style="color:#FCA5A5;font-size:13px;min-height:18px;margin-bottom:8px"></div>' +
      '<button type="submit" style="width:100%;padding:12px;border-radius:8px;border:0;background:#DC2626;color:#fff;font-weight:700;cursor:pointer">Sign in</button></form>';
    document.body.appendChild(o);
    var mode = o.querySelector("#sk-mode");
    mode.addEventListener("change", function () {
      o.querySelector("#sk-dept").style.display = mode.value === "dept" ? "" : "none";
      o.querySelector("#sk-admin").style.display = mode.value === "admin" ? "" : "none";
      o.querySelector("#sk-code").required = mode.value === "dept";
    });
    o.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var err = o.querySelector("#sk-err");
      err.textContent = "";
      var body = mode.value === "dept"
        ? { url: "/api/dept/login", data: { departmentId: o.querySelector("#sk-dep").value, accessCode: o.querySelector("#sk-code").value } }
        : { url: "/api/auth/login", data: { phone: o.querySelector("#sk-phone").value, pin: o.querySelector("#sk-pin").value } };
      (origFetch || fetch)(body.url, { method: "POST", headers: T ? { "Content-Type": "application/json", "X-Tenant": T.id } : { "Content-Type": "application/json" }, body: JSON.stringify(body.data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok || !x.j.token) { err.textContent = (x.j && x.j.message) || "Sign-in failed"; return; }
          if (mode.value === "admin" && x.j.user && x.j.user.role !== "admin" && x.j.user.role !== "super_admin") { err.textContent = "This account is not authorised for the command centre"; return; }
          window.sankalpAuth.set(x.j.token);
          try { if (x.j.refreshToken) localStorage.setItem("sankalp_refresh", x.j.refreshToken); } catch (e2) {}
          location.reload();
        })
        .catch(function () { err.textContent = "Network error"; });
    });
  }

  function onReady() {
    // P5.7 (WCAG 1.4.1): links inside text blocks must not rely on colour alone (e.g. Leaflet attribution).
    var st = document.createElement("style");
    st.textContent = ".leaflet-control-attribution a{text-decoration:underline}";
    document.head.appendChild(st);
    if (cfg.demoMode) {
      var b = document.createElement("div");
      b.textContent = "DEMO · simulated data";
      b.setAttribute("aria-label", "Demo mode: data shown is simulated");
      b.style.cssText = "position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:30000;background:#B45309;color:#fff;font:700 11px system-ui,sans-serif;letter-spacing:1px;padding:4px 12px;border-radius:999px;pointer-events:none";
      document.body.appendChild(b);
    }
    if (requiresAuth() && !token()) showLogin();
    if (requiresAuth()) {
      var out = document.createElement("button");
      out.textContent = "Sign out";
      out.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:10001;font:12px system-ui;padding:6px 10px;border-radius:6px;border:1px solid #374151;background:#111827;color:#E5E7EB;cursor:pointer";
      out.onclick = function () { window.sankalpAuth.clear(); location.reload(); };
      document.body.appendChild(out);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", onReady);
  else onReady();

  // ── state switcher (every portal) ──────────────────────────────────────────
  function mountStateSwitcher() {
    if (!T || document.getElementById("sankalp-state")) return;
    var box = document.createElement("div");
    box.id = "sankalp-state";
    box.style.cssText = "position:fixed;right:10px;bottom:10px;z-index:15000;background:#111827;color:#F9FAFB;border:1px solid #374151;border-radius:10px;padding:6px 8px;font:12px system-ui,sans-serif;display:flex;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(0,0,0,.35)";
    box.innerHTML = '<label for="sankalp-state-sel" style="color:#D1D5DB">State</label><select id="sankalp-state-sel" style="background:#1F2937;color:#fff;border:1px solid #4B5563;border-radius:6px;padding:4px 6px;font:12px system-ui,sans-serif;max-width:190px"><option value="' + esc(T.id) + '">' + esc(T.name) + "</option></select>";
    document.body.appendChild(box);
    var sel = box.querySelector("select");
    var loaded = false;
    function load() {
      if (loaded) return; loaded = true;
      (origFetch || fetch)("/api/public/tenants").then(function (r) { return r.json(); }).then(function (list) {
        if (!Array.isArray(list)) return;
        sel.innerHTML = list.map(function (s) { return '<option value="' + esc(s.id) + '"' + (s.id === T.id ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("");
      }).catch(function () { loaded = false; });
    }
    sel.addEventListener("focus", load);
    sel.addEventListener("mousedown", load);
    sel.addEventListener("change", function () { if (sel.value && sel.value !== T.id) window.sankalpSetTenant(sel.value); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountStateSwitcher); else mountStateSwitcher();
})();
