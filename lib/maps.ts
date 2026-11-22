import { Linking, Platform } from "react-native";

/**
 * Open a location in the user's own map app (user-initiated; Sankalp sends nothing).
 * Android: geo: URI (lets the user pick any installed map app). iOS: maps: scheme.
 * Web: OpenStreetMap (open data, no ad tracking). Replaces hard-coded Google Maps / Waze links.
 */
export function openInMaps(lat: number, lng: number, label = "Location"): void {
  const q = encodeURIComponent(label);
  const url = Platform.OS === "android" ? `geo:${lat},${lng}?q=${lat},${lng}(${q})`
    : Platform.OS === "ios" ? `maps:?ll=${lat},${lng}&q=${q}`
    : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  void Linking.openURL(url);
}

export function openInMapsQuery(query: string): void {
  const q = encodeURIComponent(query);
  const url = Platform.OS === "android" ? `geo:0,0?q=${q}` : Platform.OS === "ios" ? `maps:?q=${q}` : `https://www.openstreetmap.org/search?query=${q}`;
  void Linking.openURL(url);
}
