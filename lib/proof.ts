import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { compressPhoto } from "./photo";

/**
 * Capture a proof photo for "mark fixed" (rule 4: proof before closure).
 * Native: camera only (no gallery) so the proof is taken on site. Web: file picker.
 * Returns a data URL (JPEG, compressed) or null if cancelled.
 */
export async function captureProofPhoto(): Promise<string | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const r = new FileReader();
        r.onloadend = () => { if (typeof r.result !== "string") return resolve(null); compressPhoto(r.result).then(resolve, () => resolve(r.result as string)); };
        r.readAsDataURL(f);
      };
      input.click();
    });
  }
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Camera permission is required to capture proof");
  const r = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, exif: false, allowsEditing: false });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  return compressPhoto(a.uri, a.width, a.height, a.base64 ?? undefined); // m16
}

/** P3.1: device GPS at the moment of capture (best effort, never blocks the upload for more than ~6 s). */
export async function proofLocation(): Promise<{ lat: number; lng: number } | undefined> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return undefined;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>(r => setTimeout(() => r(null), 6000)),
    ]);
    return pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : undefined;
  } catch {
    return undefined;
  }
}
