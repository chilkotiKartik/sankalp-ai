import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * M13: session token storage. Native → OS keystore (expo-secure-store).
 * Web → localStorage via AsyncStorage (no secure keystore exists in browsers; tokens are short-lived server-side and revocable).
 */
const native = Platform.OS === "ios" || Platform.OS === "android";
/** SecureStore keys may only contain [A-Za-z0-9._-]. */
const sk = (key: string) => key.replace(/[^\w.-]/g, "_");

export async function getSecure(key: string): Promise<string | null> {
  if (native) {
    const v = await SecureStore.getItemAsync(sk(key));
    if (v !== null) return v;
    // one-time migration from the old AsyncStorage location
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) { await SecureStore.setItemAsync(sk(key), legacy); await AsyncStorage.removeItem(key); }
    return legacy;
  }
  return AsyncStorage.getItem(key);
}

export async function setSecure(key: string, value: string): Promise<void> {
  if (native) await SecureStore.setItemAsync(sk(key), value);
  else await AsyncStorage.setItem(key, value);
}

export async function deleteSecure(key: string): Promise<void> {
  if (native) await SecureStore.deleteItemAsync(sk(key));
  await AsyncStorage.removeItem(key);
}
