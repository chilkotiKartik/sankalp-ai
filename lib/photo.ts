import { Platform } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";

/**
 * m16: photos are resized on the device before upload — longest side ≤ 1600 px, JPEG ≈ 0.7.
 * A 12 MP phone photo (≈ 4 MB) becomes ≈ 200–400 KB: faster on 2G and lighter for the offline outbox.
 * Returns a data URL. On failure the original data is returned (the server also enforces size limits).
 */
export const MAX_SIDE = 1600;

export async function compressPhoto(uri: string, width?: number, height?: number, fallbackBase64?: string): Promise<string> {
  try {
    if (Platform.OS === "web") return await compressOnWeb(uri);
    const long = Math.max(width ?? 0, height ?? 0);
    const resize = long > MAX_SIDE ? [{ resize: (width ?? 0) >= (height ?? 0) ? { width: MAX_SIDE } : { height: MAX_SIDE } }] : [];
    const r = await ImageManipulator.manipulateAsync(uri, resize, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    return `data:image/jpeg;base64,${r.base64}`;
  } catch {
    return fallbackBase64 ? `data:image/jpeg;base64,${fallbackBase64}` : uri;
  }
}

async function compressOnWeb(src: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.7);
}
