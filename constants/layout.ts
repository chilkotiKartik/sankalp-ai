import { Dimensions, Platform } from "react-native";

/**
 * The app is designed for phones. On the web, wide screens show it in a centred phone-width column
 * (see WebFrame in app/_layout.tsx), so screens that size themselves from the window use this width.
 */
export const APP_MAX_WIDTH = 480;

export function appWidth(): number {
  const w = Dimensions.get("window").width;
  return Platform.OS === "web" ? Math.min(w, APP_MAX_WIDTH) : w;
}
