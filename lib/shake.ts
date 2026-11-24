import { Platform } from "react-native";
import { Accelerometer } from "expo-sensors";

/**
 * Shake-to-SOS detector shared by the whole citizen app (Android/iOS app and the phone browser).
 * Counts real shakes (strong jolts at least SHAKE_GAP_MS apart); SHAKES_NEEDED within SHAKE_WINDOW_MS fires once.
 */
export const SHAKES_NEEDED = 5;
const SHAKE_WINDOW_MS = 3500;
const SHAKE_GAP_MS = 250;
const JOLT_G = 1.15;      // how far the total acceleration must move away from 1 g (gravity) to count
const COOLDOWN_MS = 8000; // never fire twice in a row from one long shake

type CountListener = (n: number) => void;
type TriggerListener = () => void;
const countListeners = new Set<CountListener>();
const triggerListeners = new Set<TriggerListener>();
let hits: number[] = [];
let lastHit = 0;
let lastFire = -Infinity;
let stopSensor: (() => void) | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

const emitCount = (n: number) => countListeners.forEach(l => l(n));

/** Feed one reading in g (gravity included). Exported for tests. */
export function feedAcceleration(x: number, y: number, z: number, now = Date.now()) {
  const g = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(g) || Math.abs(g - 1) < JOLT_G || now - lastHit < SHAKE_GAP_MS) return;
  lastHit = now;
  hits = hits.filter(t => now - t < SHAKE_WINDOW_MS);
  hits.push(now);
  emitCount(hits.length);
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => { hits = []; emitCount(0); }, SHAKE_WINDOW_MS);
  if (hits.length >= SHAKES_NEEDED && now - lastFire > COOLDOWN_MS) {
    lastFire = now;
    hits = [];
    emitCount(0);
    triggerListeners.forEach(l => l());
  }
}

/** Test hook: forget earlier shakes. */
export function resetShakeState() { hits = []; lastHit = 0; lastFire = -Infinity; if (clearTimer) clearTimeout(clearTimer); clearTimer = null; }

type MotionCtor = { requestPermission?: () => Promise<"granted" | "denied"> };
const motionCtor = (): MotionCtor | undefined => (globalThis as unknown as { DeviceMotionEvent?: MotionCtor }).DeviceMotionEvent;

/** "on" = listening; "needs_tap" = iPhone Safari asks permission on a tap; "unsupported" = no motion sensor here. */
export type ShakeStatus = "on" | "needs_tap" | "unsupported";
let webGranted = false;
let webGotEvents = false; // motion readings are arriving, so no permission step is needed
const isIOS = () => /iPad|iPhone|iPod/.test((globalThis as unknown as { navigator?: Navigator }).navigator?.userAgent ?? "");

export function shakeStatus(): ShakeStatus {
  if (Platform.OS !== "web") return "on";
  const M = motionCtor();
  if (!M) return "unsupported";
  if (webGotEvents || webGranted) return "on";
  if (typeof M.requestPermission === "function" && isIOS()) return "needs_tap";
  return "on";
}

function startWeb() {
  const w = globalThis as unknown as Window;
  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    webGotEvents = true;
    feedAcceleration(a.x / 9.81, a.y / 9.81, a.z / 9.81);
  };
  w.addEventListener("devicemotion", onMotion);
  // Newer Chrome also has requestPermission (granted silently on a tap). Ask once on the first tap anywhere;
  // iPhone shows a system prompt, so there we wait for the "Tap to turn on" button on the SOS screen instead.
  const M = motionCtor();
  const onFirstTap = () => {
    w.removeEventListener("pointerdown", onFirstTap);
    if (typeof M?.requestPermission === "function" && !isIOS()) M.requestPermission().then(r => { webGranted = r === "granted"; }).catch(() => {});
  };
  w.addEventListener("pointerdown", onFirstTap);
  return () => { w.removeEventListener("devicemotion", onMotion); w.removeEventListener("pointerdown", onFirstTap); };
}

function startSensor() {
  if (stopSensor) return;
  if (Platform.OS === "web") {
    if (!motionCtor()) return;
    stopSensor = startWeb(); // always listen: readings arrive at once where no permission is needed
    return;
  }
  Accelerometer.setUpdateInterval(60);
  const sub = Accelerometer.addListener(({ x, y, z }) => feedAcceleration(x, y, z));
  stopSensor = () => sub.remove();
}

/** iPhone Safari: must be called from a tap. Returns true when shake SOS is now on. */
export async function enableShakeOnTap(): Promise<boolean> {
  const M = motionCtor();
  if (Platform.OS !== "web" || !M) return Platform.OS !== "web";
  if (typeof M.requestPermission === "function") {
    try { webGranted = (await M.requestPermission()) === "granted"; } catch { webGranted = false; }
    if (!webGranted) return false;
  }
  if (stopSensor) { stopSensor(); stopSensor = null; }
  startSensor();
  return true;
}

/** Fires when the person shakes the phone SHAKES_NEEDED times. Starts the sensor on first use. */
export function onShakeSOS(l: TriggerListener) {
  triggerListeners.add(l);
  startSensor();
  return () => {
    triggerListeners.delete(l);
    if (!triggerListeners.size && stopSensor) { stopSensor(); stopSensor = null; }
  };
}

/** Live shake count for the on-screen counter. */
export function onShakeCount(l: CountListener) {
  countListeners.add(l);
  return () => { countListeners.delete(l); };
}
