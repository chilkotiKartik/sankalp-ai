/*
 * Shared portal runtime (M16, audit C2).
 *  - DEMO badge when the server runs DEMO_MODE
 *  - sankalpTileLayer(): base-map tiles only from the configured MAP_TILE_URL
 *  - sankalpEsc(): HTML escaping for any user text inserted via string HTML (Leaflet popups)
 *  - Staff sign-in for pages marked <meta name="sankalp-auth" content="police">; token kept in sessionStorage
 *  - Adds the token to same-origin /api fetches and EventSource streams (EventSource cannot send headers)
 */
(function () {
  "use strict";
  var cfg = window.__SANKALP__ || {};
  var KEY = "sankalp_staff_token";

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

  // ── same-origin API auth ───────────────────────────────────────────────────
  var sameOriginApi = function (u) {
    try { var url = new URL(u, location.href); return url.origin === location.origin && url.pathname.indexOf("/api/") === 0; } catch (e) { return false; }
  };
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var t = token();
      if (t && sameOriginApi(url)) {
        init = init || {};
        var h = new Headers(init.headers || (typeof input !== "string" && input.headers) || {});
        if (!h.has("Authorization")) h.set("Authorization", "Bearer " + t);
        init.headers = h;
      }
      return origFetch(input, init).then(function (res) {
        if (res.status === 401 && requiresAuth() && sameOriginApi(url) && url.indexOf("/login") === -1) {
          window.sankalpAuth.clear();
          showLogin("Your session has expired. Please sign in again.");
        }
        return res;
      });
    };
  }
  var OrigES = window.EventSource;
  if (OrigES) {
    var Patched = function (url, conf) {
      var t = token();
      if (t && sameOriginApi(url) && !/[?&]token=/.test(url)) url += (url.indexOf("?") === -1 ? "?" : "&") + "token=" + encodeURIComponent(t);
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
      '<select id="sk-dep" style="width:100%;padding:10px;border-radius:8px;margin-bottom:12px;background:#1F2937;color:#fff;border:1px solid #374151"><option value="police">Uttarakhand Police</option><option value="usdma">USDMA</option></select>' +
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
      (origFetch || fetch)(body.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body.data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (!x.ok || !x.j.token) { err.textContent = (x.j && x.j.message) || "Sign-in failed"; return; }
          if (mode.value === "admin" && x.j.user && x.j.user.role !== "admin" && x.j.user.role !== "super_admin") { err.textContent = "This account is not authorised for the command centre"; return; }
          window.sankalpAuth.set(x.j.token);
          location.reload();
        })
        .catch(function () { err.textContent = "Network error"; });
    });
  }

  function onReady() {
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
})();
