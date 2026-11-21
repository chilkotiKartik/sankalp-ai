import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Linking, Platform } from "react-native";

/**
 * P6.1 offline SOS fallback: when the server cannot be reached, open the phone's own SMS app addressed to the
 * user's trusted contacts with the last known GPS position. Works with no data connection (SMS only).
 * The contacts are cached on the device whenever they are saved or loaded (Safety tools screen).
 */
const KEY = "sankalp_sos_contacts_v1";

export async function cacheTrustedContacts(phones: string[]) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(phones.slice(0, 5))); } catch { /* best effort */ }
}

export async function cachedTrustedContacts(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || "[]") as string[]; } catch { return []; }
}

export async function openSosSms(): Promise<boolean> {
  const phones = await cachedTrustedContacts();
  let where = "";
  try {
    const pos = (await Location.getLastKnownPositionAsync()) ?? (await Promise.race([Location.getCurrentPositionAsync({}), new Promise<null>(r => setTimeout(() => r(null), 4000))]));
    // Plain coordinates: readable on any phone and pasteable into any map app (no foreign link service).
    if (pos) where = ` My location (lat, long): ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
  } catch { /* no location */ }
  const body = encodeURIComponent(`SOS! I need help.${where} Please call me or call 112.`);
  const to = phones.map(p => `+91${p}`).join(Platform.OS === "ios" ? "," : ";");
  const url = Platform.OS === "ios" ? `sms:${to}&body=${body}` : `sms:${to}?body=${body}`;
  try { await Linking.openURL(url); return true; } catch { return false; }
}
