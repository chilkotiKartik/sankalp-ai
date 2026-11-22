import { useEffect, useState } from "react";
import { getApiUrl } from "@/lib/query-client";
import { getTenantId } from "@/lib/tenant";

/**
 * P9.2 district boundaries of the selected state (GeoJSON from /api/public/geo/districts; boundaries
 * © OpenStreetMap contributors, ODbL). Cached per state for the session; maps work without them.
 */
export interface DistrictGeo { type: "FeatureCollection"; features: { type: "Feature"; properties: { name: string }; geometry: unknown }[] }
const cache = new Map<string, DistrictGeo>();
const pending = new Map<string, Promise<DistrictGeo | null>>();

export function loadDistrictGeo(): Promise<DistrictGeo | null> {
  const id = getTenantId() ?? "_default";
  if (cache.has(id)) return Promise.resolve(cache.get(id)!);
  if (!pending.has(id)) {
    pending.set(id, fetch(new URL("/api/public/geo/districts", getApiUrl()).toString())
      .then(r => (r.ok ? r.json() : null))
      .then((g: DistrictGeo | null) => { if (g?.features) cache.set(id, g); return g; })
      .catch(() => null)
      .finally(() => pending.delete(id)));
  }
  return pending.get(id)!;
}

export function useDistrictGeo(): DistrictGeo | null {
  const [g, setG] = useState<DistrictGeo | null>(() => cache.get(getTenantId() ?? "_default") ?? null);
  useEffect(() => { let alive = true; loadDistrictGeo().then(x => { if (alive) setG(x); }); return () => { alive = false; }; }, []);
  return g;
}

/** Leaflet snippet: draw the district outlines with name tooltips; optionally fit the view to the state. Needs esc(). */
export function districtLayerJs(geoJson: string, fit: boolean, mapVar = "map"): string {
  return `(function(){try{var g=${geoJson};if(!g||!g.features||!g.features.length)return;
var dl=L.geoJSON(g,{style:function(){return{color:'#FF9933',weight:1.2,opacity:0.85,fillColor:'#FF9933',fillOpacity:0.04};},
onEachFeature:function(f,l){l.bindTooltip(esc(f.properties&&f.properties.name),{sticky:true,direction:'top'});}}).addTo(${mapVar});
dl.bringToBack();${fit ? `${mapVar}.fitBounds(dl.getBounds(),{padding:[8,8]});` : ""}}catch(e){}})();`;
}
