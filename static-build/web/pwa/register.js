/* Registers the SANKALP service worker (web app). Kept as a file: the CSP allows no inline scripts on the app. */
(function () {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () { /* the app works without it */ });
  });
  // Android/desktop Chrome: keep the install prompt so the app can offer an "Install" button.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    window.__sankalpInstallPrompt = e;
    window.dispatchEvent(new Event("sankalp:installable"));
  });
})();
