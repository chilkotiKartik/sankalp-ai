/**
 * Helpers for HTML documents rendered in WebViews / iframes (M16).
 *  - scriptJson: JSON safe to embed inside <script> (no `</script>` breakout).
 *  - ESC_JS: in-page `esc()` used for every user-supplied string placed in popup HTML.
 *  - tileLayerJs: tiles only from the configured MAP_TILE_URL (no hard-coded foreign CDN).
 */
export function scriptJson(v: unknown): string {
  return JSON.stringify(v ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const ESC_JS = `function esc(s){return String(s==null?'':s).replace(/[&<>"'\\x60]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','\\x60':'&#96;'}[c];});}`;

export function tileLayerJs(tileUrl: string | null | undefined, mapVar = "map"): string {
  if (!tileUrl || !/^https:\/\/[\w.{}-]+\/[\w{}./@-]+$/.test(tileUrl)) {
    return `(function(){var d=document.createElement('div');d.textContent='Base map not configured (MAP_TILE_URL) — markers shown on blank canvas';d.style.cssText='position:absolute;bottom:6px;left:6px;z-index:999;font:11px sans-serif;background:rgba(0,0,0,.6);color:#fff;padding:3px 6px;border-radius:4px';document.body.appendChild(d);})();`;
  }
  return `L.tileLayer(${scriptJson(tileUrl)},{maxZoom:19,subdomains:'abc',attribution:'&copy; OpenStreetMap contributors'}).addTo(${mapVar});`;
}
