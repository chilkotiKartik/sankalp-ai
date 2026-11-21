import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

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
        r.onloadend = () => resolve(typeof r.result === "string" ? r.result : null);
        r.readAsDataURL(f);
      };
      input.click();
    });
  }
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error("Camera permission is required to capture proof");
  const r = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true, exif: false, allowsEditing: false });
  if (r.canceled || !r.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${r.assets[0].base64}`;
}
