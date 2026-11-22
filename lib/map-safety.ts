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

/**
 * Base map. Never shows an error to the user: with no tile server configured, or when tiles stop loading
 * (offline, blocked network), the map quietly falls back to the state/district outlines drawn on top.
 */
export function tileLayerJs(tileUrl: string | null | undefined, mapVar = "map"): string {
  // Without tiles, zooming past district level shows nothing: cap it so the outlines always give context.
  const plain = `try{${mapVar}.getContainer().style.background='#EEF2F7';${mapVar}.setMaxZoom(10);}catch(e){}`;
  const wms = tileUrl?.match(/^wms:(https:\/\/[\w.-]+\/[\w./-]+)\|([\w:,-]+)$/);
  const xyzOk = !!tileUrl && /^https:\/\/[\w.{}-]+\/[\w{}./@-]+$/.test(tileUrl);
  if (!wms && !xyzOk) {
    return `${plain}if(window.console)console.info('SANKALP map: no tile server configured, showing district outlines');`;
  }
  const layer = wms
    ? `L.tileLayer.wms(${scriptJson(wms[1])},{layers:${scriptJson(wms[2])},format:'image/png',transparent:false,tiled:true,maxZoom:18,attribution:'&copy; ISRO Bhuvan / NRSC'})`
    : `L.tileLayer(${scriptJson(tileUrl)},{maxZoom:19,subdomains:'abc',attribution:'&copy; OpenStreetMap contributors'})`;
  return `(function(){var t=${layer}.addTo(${mapVar});
var bad=0,good=0;t.on('tileload',function(){good++;});
t.on('tileerror',function(ev){var img=ev&&ev.tile;
if(img&&!img.getAttribute('data-retry')){img.setAttribute('data-retry','1');var u=img.src;setTimeout(function(){img.src=u+(u.indexOf('?')<0?'?':'&')+'_r=1';},1200);return;}
bad++;if(bad>=6&&good===0){${mapVar}.removeLayer(t);${plain}if(window.console)console.info('SANKALP map: tiles unavailable, showing district outlines');}});})();`;
}
