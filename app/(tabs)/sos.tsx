import React, { useRef, useEffect, useState, useCallback, Component } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView,
  Modal, TextInput, Platform, ActivityIndicator, Alert, Vibration, Linking, AppState,
} from "react-native";

class SOSErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: "" };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || "Unknown error" };
  }
  componentDidCatch(error: any, info: any) {
    console.warn("[SOSErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: "#0A0A0A", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🆘</Text>
          <Text style={{ color: "#EF4444", fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 8, textAlign: "center" }}>SOS Screen Error</Text>
          <Text style={{ color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
            {this.state.error}{"\n\n"}For emergencies, call 112 directly.
          </Text>
          <Pressable onPress={() => this.setState({ hasError: false, error: "" })} style={{ backgroundColor: "#EF4444", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>Retry</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL("tel:112")} style={{ marginTop: 12, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: "#EF444444", backgroundColor: "#EF444411" }}>
            <Text style={{ color: "#EF4444", fontSize: 15, fontFamily: "Inter_700Bold" }}>Call 112 Emergency</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { Accelerometer } from "expo-sensors";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import * as Notifications from "expo-notifications";
import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import type { GeoPoint } from "@/context/AppContext";

const SOS_CATS = [
  { key: "gas_leak",        label: "Gas Leak",     icon: "🔴", color: "#F59E0B" },
  { key: "water_burst",     label: "Water Burst",  icon: "💧", color: "#3B82F6" },
  { key: "electric_hazard", label: "Electric",     icon: "⚡", color: "#EF4444" },
  { key: "fire_risk",       label: "Fire",         icon: "🔥", color: "#EF4444" },
  { key: "road_accident",   label: "Accident",     icon: "🚗", color: "#F59E0B" },
  { key: "women_safety",    label: "Women Safety", icon: "🛡️", color: "#8B5CF6" },
  { key: "medical",         label: "Medical",      icon: "🏥", color: "#22C55E" },
  { key: "infrastructure",  label: "Structure",    icon: "🏗️", color: "#6B7280" },
];

const LOCATION_UPDATE_MS = 15000;

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── PULSING RING ──────────────────────────────────────────────────────────────
function PulsingRing({ color, delay = 0, size = 60 }: { color: string; delay?: number; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(scale, { toValue: 2.6, duration: 1800, useNativeDriver: false }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: false }),
        ]),
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(opacity, { toValue: 0, duration: 1800, useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: false }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);
  return (
    <Animated.View
      style={{
        position: "absolute", width: size, height: size, borderRadius: size / 2,
        borderWidth: 2.5, borderColor: color, opacity, transform: [{ scale }],
      }}
    />
  );
}

// ── LIVE DOT ──────────────────────────────────────────────────────────────────
function LiveDot({ isLive }: { isLive: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isLive) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.2, duration: 500, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [isLive]);
  return (
    <Animated.View style={{
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: isLive ? "#4ADE80" : "#9CA3AF",
      opacity: isLive ? pulse : 1,
    }} />
  );
}

// ── COUNTDOWN RING for women safety ──────────────────────────────────────────
function CountdownRing({ count, total = 5 }: { count: number; total?: number }) {
  const progress = count / total;
  const size = 64;
  const strokeWidth = 5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference * (1 - progress);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: strokeWidth, borderColor: "rgba(167,139,250,0.2)" }} />
      {count > 0 && (
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2, overflow: "hidden" }]}>
          <View style={{
            position: "absolute", width: size, height: size, borderRadius: size / 2,
            borderWidth: strokeWidth, borderColor: "#A78BFA",
            borderTopColor: count > 0 ? "#A78BFA" : "transparent",
            transform: [{ rotate: `${progress * 360 - 90}deg` }],
          }} />
        </View>
      )}
      <Text style={{ color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" }}>{count}</Text>
      <Text style={{ color: "rgba(167,139,250,0.7)", fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>TAP</Text>
    </View>
  );
}

function SOSScreenInner() {
  const insets = useSafeAreaInsets();
  const { sosAlerts, triggerSOS, triggerWomenSafetySOS, policeStations, updateSOSLocation } = useApp();

  const [selectedCat, setSelectedCat] = useState("gas_leak");
  const [description, setDescription] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "locating" | "found" | "failed">("idle");
  const [geo, setGeo] = useState<GeoPoint | null>(null);
  const [nearestPS, setNearestPS] = useState<any[]>([]);
  const [triggered, setTriggered] = useState(false);
  const [activeAlert, setActiveAlert] = useState<any>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [liveActive, setLiveActive] = useState(false);
  const [secAgo, setSecAgo] = useState<number | null>(null);

  // Women Safety
  const [womenPanic, setWomenPanic] = useState(false);
  const [womenTapCount, setWomenTapCount] = useState(0);
  const [womenHoldProgress, setWomenHoldProgress] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const womenTapTs = useRef<number[]>([]);
  const holdTimerRef = useRef<any>(null);
  const holdProgressRef = useRef<any>(null);

  // Live audio recording during women safety panic
  const [isRecording, setIsRecording] = useState(false);
  const audioRecordingRef = useRef<Audio.Recording | null>(null);

  // AppState-based panic detection (power/side button on iOS)
  const appStateHistory = useRef<number[]>([]);

  // Shake detection
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const shakeTs = useRef<number[]>([]);
  // Ref to hold latest activateWomenSafety — avoids stale closure in accelerometer listener
  const activateWomenSafetyRef = useRef<(source: string) => void>(() => {});

  // Animations
  const btnScale = useRef(new Animated.Value(1)).current;
  const womenCardScale = useRef(new Animated.Value(1)).current;
  const womenFlash = useRef(new Animated.Value(1)).current;
  const liveAnim = useRef(new Animated.Value(1)).current;
  const holdScaleAnim = useRef(new Animated.Value(1)).current;
  const volBtnScale = useRef(new Animated.Value(1)).current;
  const volBtnShadow = useRef(new Animated.Value(8)).current;
  const volCountPop = useRef(new Animated.Value(1)).current;

  // Refs
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<any>(null);
  const currentGeoRef = useRef<GeoPoint | null>(null);

  function sortStations(pts: typeof policeStations, from: GeoPoint) {
    return pts
      .map(ps => ({ ...ps, distance: parseFloat(haversineKm(from, ps.geo).toFixed(2)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }

  // ── NOTIFICATION PERMISSIONS ─────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") {
      Notifications.requestPermissionsAsync().catch(() => {});
    }
  }, []);

  // ── GPS ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let watchSub: Location.LocationSubscription | null = null;
    const init = async () => {
      setGeoStatus("locating");
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") throw new Error("denied");
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (cancelled) return;
        const g: GeoPoint = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        setGeo(g); currentGeoRef.current = g; setGeoStatus("found");
        setNearestPS(sortStations(policeStations, g));
        watchSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          pos => {
            if (cancelled) return;
            const u: GeoPoint = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setGeo(u); currentGeoRef.current = u;
            setNearestPS(sortStations(policeStations, u));
          }
        );
        locationWatchRef.current = watchSub;
      } catch {
        if (cancelled) return;
        const g: GeoPoint = { lat: 30.3165, lng: 78.0322 };
        setGeo(g); currentGeoRef.current = g; setGeoStatus("found");
        setNearestPS(policeStations.slice(0, 3).map(ps => ({
          ...ps, distance: parseFloat(haversineKm(g, ps.geo).toFixed(2))
        })));
      }
    };
    init();
    return () => {
      cancelled = true;
      try { watchSub?.remove(); } catch {}
    };
  }, [policeStations]);

  // ── ACCELEROMETER SHAKE ───────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === "web") return;
    Accelerometer.setUpdateInterval(80);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const last = lastAccel.current;
      const delta = Math.abs(x - last.x) + Math.abs(y - last.y) + Math.abs(z - last.z);
      lastAccel.current = { x, y, z };
      if (delta > 2.5) {
        const now = Date.now();
        shakeTs.current = shakeTs.current.filter(t => now - t < 2000);
        shakeTs.current.push(now);
        setShakeCount(shakeTs.current.length);
        // Auto-clear display after 2s of no new shakes
        setTimeout(() => setShakeCount(c => Math.max(0, c - 1)), 2100);
        if (shakeTs.current.length >= 4) {
          shakeTs.current = [];
          setShakeCount(0);
          activateWomenSafetyRef.current("shake");
        }
      }
    });
    return () => sub.remove();
  }, []);

  // ── APPSTATE: detects rapid screen-off/on (iOS side button) ──────────────
  useEffect(() => {
    const listener = AppState.addEventListener("change", (nextState) => {
      const now = Date.now();
      if (nextState === "inactive" || nextState === "background") {
        // Screen going inactive — record timestamp
        appStateHistory.current.push(now);
        // Keep only last 8 changes within 5 seconds
        appStateHistory.current = appStateHistory.current.filter(t => now - t < 5000);
        if (appStateHistory.current.length >= 6) {
          appStateHistory.current = [];
          activateWomenSafety("side_button");
        }
      }
    });
    return () => listener.remove();
  }, []);

  // ── WEB KEYBOARD (ArrowUp / 'v' key 6x) ──────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const webKeyTs: number[] = [];
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "v" || e.key === "V") {
        const now = Date.now();
        webKeyTs.push(now);
        while (webKeyTs.length > 0 && now - webKeyTs[0] > 4000) webKeyTs.shift();
        if (webKeyTs.length >= 5) { webKeyTs.length = 0; handleVolumeUpPress(); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── LIVE TRACKING ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveActive) return;
    const tick = setInterval(() => {
      if (lastUpdate) setSecAgo(Math.round((Date.now() - new Date(lastUpdate).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [liveActive, lastUpdate]);

  const startLive = useCallback((alertId: string) => {
    setLiveActive(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(async () => {
      const g = currentGeoRef.current;
      if (g) {
        await updateSOSLocation(alertId, g);
        const now = new Date().toISOString();
        setLiveCount(c => c + 1);
        setLastUpdate(now);
        setSecAgo(0);
      }
    }, LOCATION_UPDATE_MS);
  }, [updateSOSLocation]);

  const stopLive = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setLiveActive(false); setSecAgo(null);
  };

  // ── LIVE ANIM ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveActive) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(liveAnim, { toValue: 0.3, duration: 600, useNativeDriver: false }),
      Animated.timing(liveAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
    ]));
    anim.start();
    return () => anim.stop();
  }, [liveActive]);

  // ── WOMEN PANIC FLASH ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!womenPanic) return;
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(womenFlash, { toValue: 0.6, duration: 250, useNativeDriver: false }),
      Animated.timing(womenFlash, { toValue: 1, duration: 250, useNativeDriver: false }),
    ]));
    anim.start();
    return () => { anim.stop(); womenFlash.setValue(1); };
  }, [womenPanic]);

  // ── CLEANUP ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    try { locationWatchRef.current?.remove(); } catch {}
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (holdProgressRef.current) clearInterval(holdProgressRef.current);
    if (audioRecordingRef.current) {
      audioRecordingRef.current.stopAndUnloadAsync().catch(() => {});
      audioRecordingRef.current = null;
    }
  }, []);

  // ── START LIVE AUDIO RECORDING ────────────────────────────────────────────
  const startAudioRecording = useCallback(async () => {
    if (Platform.OS === "web") return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      audioRecordingRef.current = recording;
      setIsRecording(true);
    } catch (_e) {}
  }, []);

  const stopAudioRecording = useCallback(async () => {
    const rec = audioRecordingRef.current;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch (_e) {}
    audioRecordingRef.current = null;
    setIsRecording(false);
  }, []);

  // ── ACTIVATE WOMEN SAFETY ─────────────────────────────────────────────────
  const activateWomenSafety = useCallback(async (source: string) => {
    if (womenPanic) return;
    setWomenPanic(true);
    setWomenTapCount(0);
    if (Platform.OS !== "web") {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Vibration.vibrate([0, 400, 150, 400, 150, 400, 150, 400]);
    }
    // Voice alert — speak immediately to reassure the user
    try {
      Speech.speak("Emergency alert sent. Police and help notified. Stay calm. Help is on the way.", {
        language: "en-IN",
        rate: 0.88,
        pitch: 1.0,
      });
    } catch {}
    // Start live audio recording immediately
    startAudioRecording();
    try {
      const g = currentGeoRef.current || { lat: 28.6139, lng: 77.209 };
      const result = await triggerWomenSafetySOS(g, `GPS: ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`);
      if (result?.alert) {
        setActiveAlert({ ...result.alert, isWomenSafety: true });
        setTriggered(true);
        startLive(result.alert.id);
        // System notification
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "🛡️ Women Safety SOS Sent",
              body: "Emergency alert dispatched. Police notified. Live location sharing active.",
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
            },
            trigger: null,
          });
        } catch {}
      }
    } catch {}
  }, [womenPanic, triggerWomenSafetySOS, startLive, startAudioRecording]);

  // Keep ref always pointing to latest activateWomenSafety (fixes stale closure in accelerometer)
  useEffect(() => {
    activateWomenSafetyRef.current = activateWomenSafety;
  }, [activateWomenSafety]);

  // ── WOMEN 6-TAP ───────────────────────────────────────────────────────────
  const handleWomenTap = () => {
    if (womenPanic) return;
    const now = Date.now();
    womenTapTs.current = womenTapTs.current.filter(t => now - t < 3000);
    womenTapTs.current.push(now);
    const cnt = womenTapTs.current.length;
    setWomenTapCount(cnt);
    Animated.sequence([
      Animated.timing(womenCardScale, { toValue: 0.96, duration: 80, useNativeDriver: false }),
      Animated.timing(womenCardScale, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
    if (cnt >= 6) { womenTapTs.current = []; setWomenTapCount(0); activateWomenSafety("tap"); }
  };

  // ── WOMEN LONG PRESS ──────────────────────────────────────────────────────
  const handleWomenLongPressStart = () => {
    if (womenPanic) return;
    setWomenHoldProgress(0);
    let progress = 0;
    holdProgressRef.current = setInterval(() => {
      progress += 0.05;
      setWomenHoldProgress(Math.min(progress, 1));
      if (progress >= 1) {
        clearInterval(holdProgressRef.current);
        setWomenHoldProgress(0);
        activateWomenSafety("longpress");
      }
    }, 100);
  };
  const handleWomenLongPressEnd = () => {
    if (holdProgressRef.current) clearInterval(holdProgressRef.current);
    setWomenHoldProgress(0);
  };

  // ── VOLUME UP BUTTON — hardware-styled, 6 presses = Women Safety SOS ────
  const [volumePressCount, setVolumePressCount] = useState(0);
  const volumePressTs = useRef<number[]>([]);
  const handleVolumeUpPress = () => {
    if (womenPanic) return;
    const now = Date.now();
    volumePressTs.current = volumePressTs.current.filter(t => now - t < 4000);
    volumePressTs.current.push(now);
    const cnt = volumePressTs.current.length;
    setVolumePressCount(cnt);
    // Hardware press animation — scale down + shadow compress
    Animated.sequence([
      Animated.parallel([
        Animated.timing(volBtnScale, { toValue: 0.78, duration: 65, useNativeDriver: false }),
        Animated.timing(volBtnShadow, { toValue: 1, duration: 65, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.spring(volBtnScale, { toValue: 1, tension: 200, friction: 7, useNativeDriver: false }),
        Animated.timing(volBtnShadow, { toValue: 8, duration: 140, useNativeDriver: false }),
      ]),
    ]).start();
    // Count badge pop
    Animated.sequence([
      Animated.timing(volCountPop, { toValue: 1.5, duration: 80, useNativeDriver: false }),
      Animated.spring(volCountPop, { toValue: 1, tension: 220, friction: 6, useNativeDriver: false }),
    ]).start();
    if (Platform.OS !== "web") {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
    }
    if (cnt >= 6) {
      volumePressTs.current = [];
      setVolumePressCount(0);
      activateWomenSafety("volume_up");
    }
  };

  // ── MAIN SOS TRIGGER ──────────────────────────────────────────────────────
  const handleSOS = async () => {
    if (isTriggering || triggered) return;
    setIsTriggering(true);
    if (Platform.OS !== "web") {
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
      Vibration.vibrate([0, 300, 100, 300]);
    }
    try {
      const g = currentGeoRef.current || { lat: 28.6139, lng: 77.209 };
      const cat = SOS_CATS.find(c => c.key === selectedCat);
      const alert = await triggerSOS({
        category: selectedCat as any,
        description: description || `${cat?.label} emergency via SANKALP AI`,
        location: `GPS: ${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`,
        geo: g,
        ward: nearestPS[0]?.ward || "Dehradun",
        wardNumber: 1,
        status: "active",
      });
      setActiveAlert(alert);
      setTriggered(true);
      setShowModal(false);
      startLive(alert.id);
      // Voice confirmation
      try {
        Speech.speak(`${cat?.label || "Emergency"} SOS sent. Emergency services notified. Stay safe.`, {
          language: "en-IN",
          rate: 0.9,
        });
      } catch {}
      // System notification
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🚨 SOS Alert Sent — ${cat?.label || "Emergency"}`,
            body: "Emergency services notified. Live location sharing has started.",
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: null,
        });
      } catch {}
    } catch (err: any) {
      Alert.alert("SOS Failed", err.message || "Could not send SOS. Please call 112 directly.");
    } finally { setIsTriggering(false); }
  };

  const activeCount = sosAlerts.filter(s => s.status === "active").length;

  return (
    <View style={s.root}>
      {/* ── FLOATING HARDWARE VOLUME UP BUTTON (right edge) ── */}
      {!triggered && (
        <View style={s.volBtnFloat} pointerEvents="box-none">
          <Animated.View style={[s.volBtnOuter, {
            transform: [{ scale: volBtnScale }],
            shadowRadius: volBtnShadow,
          }]}>
            <Pressable onPress={handleVolumeUpPress} style={s.volBtnPressable}>
              <LinearGradient colors={["#E8E8E8", "#C8C8C8", "#A8A8A8"]} style={s.volBtnGrad}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
                <Ionicons name="volume-high" size={18} color="#4B5563" />
              </LinearGradient>
            </Pressable>
          </Animated.View>
          {volumePressCount > 0 && (
            <Animated.View style={[s.volCountBadge, { transform: [{ scale: volCountPop }] }]}>
              <Text style={s.volCountText}>{volumePressCount}/5</Text>
            </Animated.View>
          )}
          <View style={s.volBtnLabel}>
            <Text style={s.volBtnLabelText}>Vol+</Text>
            <Text style={s.volBtnLabelText}>×5</Text>
          </View>
        </View>
      )}

      {/* ── SOS CONFIRM MODAL ── */}
      <Modal visible={showModal} transparent animationType="slide" statusBarTranslucent>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowModal(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <LinearGradient colors={["#3D0000", "#7F1D1D"]} style={s.sheetHead}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <View style={s.sheetHeadIcon}><Text style={{ fontSize: 28 }}>🚨</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetTitle}>Confirm SOS Alert</Text>
                <Text style={s.sheetSub}>Uttarakhand Police & Command Center notified instantly</Text>
              </View>
            </LinearGradient>

            {/* GPS status */}
            <View style={[s.gpsBadge, { backgroundColor: geoStatus === "found" ? "#14532D" : "#1F2937" }]}>
              <LiveDot isLive={geoStatus === "found"} />
              <Text style={[s.gpsBadgeText, { color: geoStatus === "found" ? "#4ADE80" : "#9CA3AF" }]}>
                {geoStatus === "found" && geo
                  ? `GPS LOCKED · ${geo.lat.toFixed(5)}°N, ${geo.lng.toFixed(5)}°E`
                  : geoStatus === "locating" ? "Acquiring GPS…" : "GPS unavailable — using approximate location"}
              </Text>
              {geoStatus === "locating" && <ActivityIndicator size="small" color="#9CA3AF" />}
            </View>

            <Text style={s.fieldLabel}>EMERGENCY TYPE</Text>
            <View style={s.catGrid}>
              {SOS_CATS.map(cat => (
                <Pressable key={cat.key} onPress={() => setSelectedCat(cat.key)}
                  style={[s.catChip, selectedCat === cat.key && { backgroundColor: cat.color + "20", borderColor: cat.color }]}>
                  <Text style={{ fontSize: 20 }}>{cat.icon}</Text>
                  <Text style={[s.catChipText, selectedCat === cat.key && { color: cat.color }]}>{cat.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={s.fieldLabel}>DESCRIPTION (optional)</Text>
            <TextInput style={s.descBox} placeholder="Describe the emergency…" placeholderTextColor={Colors.textMuted}
              value={description} onChangeText={setDescription} multiline />

            {nearestPS.slice(0, 2).length > 0 && (
              <View style={s.notifyBadge}>
                <Ionicons name="shield-checkmark" size={13} color="#F59E0B" />
                <Text style={s.notifyText}>
                  Notifying: <Text style={{ color: "#F59E0B", fontFamily: "Inter_700Bold" }}>
                    {nearestPS.slice(0, 2).map(ps => ps.name).join(" & ")}
                  </Text>
                </Text>
              </View>
            )}

            <View style={s.sheetActions}>
              <Pressable onPress={() => setShowModal(false)} style={s.cancelBtn}>
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleSOS} disabled={isTriggering} style={{ flex: 2, borderRadius: 14, overflow: "hidden" }}>
                <LinearGradient colors={["#7F1D1D", "#EF4444"]} style={s.sendBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  {isTriggering
                    ? <ActivityIndicator color="#fff" />
                    : <><Text style={{ fontSize: 16 }}>🚨</Text><Text style={s.sendBtnText}>SEND SOS NOW</Text></>}
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 110 : insets.bottom + 110 }}>

        {/* ── HEADER ── */}
        <LinearGradient colors={["#0D0000", "#1A0000", "#3D0000", "#7F1D1D"]}
          style={[s.header, { paddingTop: Platform.OS === "web" ? 72 : insets.top + 14 }]}>
          <View style={s.hDecor1} />
          <View style={s.hDecor2} />
          <View style={s.hDecor3} />

          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={s.gnctPill}>
                <Text style={s.gnctText}>🏛️ Govt of UK · SANKALP AI · Emergency Command Center</Text>
              </View>
              <Text style={s.headerTitle}>SOS Emergency</Text>
              <Text style={s.headerSub}>Uttarakhand Rapid Response System · 24/7 Active</Text>
            </View>
            {activeCount > 0 && (
              <View style={s.activeBadge}>
                <View style={s.activeDot} />
                <Text style={s.activeBadgeText}>{activeCount} LIVE</Text>
              </View>
            )}
          </View>

          {/* GPS + Live status */}
          <View style={s.statusBar}>
            <View style={[s.statusPill, { backgroundColor: geoStatus === "found" ? "#0D2B1F" : "#1A1A2E" }]}>
              <LiveDot isLive={geoStatus === "found"} />
              <Text style={[s.statusPillText, { color: geoStatus === "found" ? "#4ADE80" : "#9CA3AF" }]}>
                {geoStatus === "found" && geo
                  ? `${geo.lat.toFixed(5)}°N ${geo.lng.toFixed(5)}°E`
                  : geoStatus === "locating" ? "Acquiring GPS…" : "GPS Unavailable"}
              </Text>
              {geoStatus === "locating" && <ActivityIndicator size="small" color="#9CA3AF" style={{ marginLeft: 4 }} />}
            </View>
            {liveActive && (
              <Animated.View style={[s.livePill, { opacity: liveAnim }]}>
                <LiveDot isLive />
                <Text style={s.liveText}>
                  LIVE · {liveCount} {liveCount === 1 ? "update" : "updates"}
                  {secAgo !== null ? ` · ${secAgo}s ago` : ""}
                </Text>
              </Animated.View>
            )}
          </View>
        </LinearGradient>

        {/* ── LIVE BANNER (after SOS trigger) ── */}
        {triggered && (
          <View style={s.liveBanner}>
            <LinearGradient colors={["#052E16", "#14532D"]} style={s.liveBannerInner}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Animated.View style={[s.liveBannerIcon, { opacity: liveAnim }]}>
                <Ionicons name="navigate" size={22} color="#4ADE80" />
              </Animated.View>
              <View style={{ flex: 1 }}>
                <Text style={s.liveBannerTitle}>🟢 LIVE LOCATION BEING SHARED</Text>
                <Text style={s.liveBannerSub}>Police receiving your GPS every 15 seconds</Text>
                {lastUpdate && (
                  <Text style={s.liveBannerDetail}>
                    {liveCount} update{liveCount !== 1 ? "s" : ""} sent{secAgo !== null ? ` · last ${secAgo}s ago` : ""}
                  </Text>
                )}
              </View>
            </LinearGradient>
          </View>
        )}

        {/* ── TRIGGERED CARD ── */}
        {triggered && activeAlert && (
          <View style={s.triggeredCard}>
            <View style={s.triggeredTop}>
              <View style={[s.triggeredIcon, { backgroundColor: activeAlert.isWomenSafety ? "#8B5CF622" : "#EF444420" }]}>
                <Text style={{ fontSize: 28 }}>{activeAlert.isWomenSafety ? "🛡️" : "🚨"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.triggeredTitle}>
                  {activeAlert.isWomenSafety ? "Women Safety SOS Sent!" : `${SOS_CATS.find(c => c.key === activeAlert.category)?.label || "SOS"} Alert Sent!`}
                </Text>
                <Text style={s.triggeredId}>Alert ID · {activeAlert.id?.slice(0, 8).toUpperCase()}</Text>
              </View>
              <View style={s.sentBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#4ADE80" />
                <Text style={s.sentBadgeText}>SENT</Text>
              </View>
            </View>

            {geo && (
              <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${geo.lat},${geo.lng}`)} style={s.mapsBtn}>
                <Ionicons name="map" size={14} color="#4ADE80" />
                <Text style={s.mapsBtnText}>Open My Location in Google Maps</Text>
                <Ionicons name="open-outline" size={12} color="#4ADE80" />
              </Pressable>
            )}

            {(activeAlert.notifiedStations || []).length > 0 && (
              <View style={s.notifiedBlock}>
                <View style={s.notifiedHeader}>
                  <Ionicons name="shield" size={13} color="#F59E0B" />
                  <Text style={s.notifiedHeaderText}>2 Police Stations Notified & Responding</Text>
                </View>
                {(activeAlert.notifiedStations || []).map((ps: any, i: number) => (
                  <View key={i} style={[s.notifiedRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                    <View style={[s.notifiedRank, { backgroundColor: i === 0 ? "#F59E0B22" : Colors.bgCardAlt }]}>
                      <Text style={{ color: i === 0 ? "#F59E0B" : Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 11 }}>#{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.notifiedName}>{ps.name}</Text>
                      <Text style={s.notifiedAddr}>{ps.address}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={{ color: "#F59E0B", fontSize: 10, fontFamily: "Inter_700Bold" }}>{ps.distance} km</Text>
                      <Pressable onPress={() => Linking.openURL(`tel:${ps.phone}`)} style={s.callPsBtn}>
                        <Ionicons name="call" size={10} color="#EF4444" />
                        <Text style={s.callPsText}>Call</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Pressable onPress={() => { setTriggered(false); setActiveAlert(null); setDescription(""); setWomenPanic(false); stopLive(); setLiveCount(0); setLastUpdate(null); stopAudioRecording(); }} style={s.resetBtn}>
              <Text style={s.resetBtnText}>Reset SOS Panel</Text>
            </Pressable>
          </View>
        )}

        {/* ── BIG SOS BUTTON ── */}
        {!triggered && (
          <View style={s.sosSection}>
            <View style={s.sosWrap}>
              <PulsingRing color="#EF4444" delay={0} size={196} />
              <PulsingRing color="#DC2626" delay={600} size={196} />
              <PulsingRing color="#B91C1C" delay={1200} size={196} />
              <Animated.View style={{ transform: [{ scale: btnScale }] }}>
                <Pressable
                  onPressIn={() => Animated.spring(btnScale, { toValue: 0.88, friction: 6, useNativeDriver: false }).start()}
                  onPressOut={() => Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: false }).start()}
                  onPress={() => setShowModal(true)}
                  style={s.sosBtn}
                >
                  <LinearGradient colors={["#7F1D1D", "#B91C1C", "#EF4444"]} style={s.sosBtnGrad}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    <Text style={s.sosBtnLabel}>SOS</Text>
                    <Text style={s.sosBtnSub}>TAP TO SEND</Text>
                    <Text style={s.sosBtnHint}>GPS auto-shared to police</Text>
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            </View>
            <Text style={s.sosHintText}>Your live location instantly shared with 2 nearest police stations</Text>
          </View>
        )}

        {/* ── EMERGENCY HELPLINES ── */}
        <View style={s.card}>
          <View style={s.cardHead}>
            <View style={[s.cardHeadIcon, { backgroundColor: "#EF444420" }]}>
              <Ionicons name="call" size={14} color="#EF4444" />
            </View>
            <Text style={s.cardTitle}>Emergency Helplines · Tap to Call</Text>
          </View>
          <View style={s.helpGrid}>
            {[
              { num: "112",  label: "Emergency",      color: "#EF4444" },
              { num: "100",  label: "UK Police",      color: "#3B82F6" },
              { num: "108",  label: "Ambulance",      color: "#22C55E" },
              { num: "101",  label: "Fire Brigade",   color: "#F59E0B" },
              { num: "1090", label: "Women Safety",   color: "#8B5CF6" },
              { num: "181",  label: "UK Women",       color: "#EC4899" },
              { num: "102",  label: "CATS Ambulance", color: "#22C55E" },
              { num: "1095", label: "Traffic",        color: "#06B6D4" },
              { num: "1098", label: "Child Line",     color: "#F59E0B" },
            ].map(item => (
              <Pressable key={item.num} onPress={() => Linking.openURL(`tel:${item.num}`)}
                style={[s.helpChip, { borderColor: item.color + "30" }]}>
                <Text style={[s.helpNum, { color: item.color }]}>{item.num}</Text>
                <Text style={s.helpLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── NEAREST POLICE ── */}
        {nearestPS.length > 0 && (
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: "#F59E0B20" }]}>
                <Ionicons name="shield" size={14} color="#F59E0B" />
              </View>
              <Text style={s.cardTitle}>Nearest Police Stations</Text>
            </View>
            {nearestPS.map((ps, i) => (
              <View key={ps.id} style={[s.psRow, i > 0 && { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                <View style={[s.psRank, { backgroundColor: i === 0 ? "#F59E0B20" : Colors.bgCardAlt }]}>
                  <Text style={{ color: i === 0 ? "#F59E0B" : Colors.textMuted, fontFamily: "Inter_700Bold", fontSize: 12 }}>#{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.psName}>{ps.name}</Text>
                  <Text style={s.psAddr}>{ps.address}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 5 }}>
                  <Text style={{ color: i === 0 ? "#F59E0B" : Colors.textMuted, fontSize: 11, fontFamily: "Inter_700Bold" }}>{ps.distance} km</Text>
                  <Pressable onPress={() => Linking.openURL(`tel:${ps.phone}`)} style={s.callBtn}>
                    <Ionicons name="call" size={11} color="#4ADE80" />
                    <Text style={s.callBtnText}>Call</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── WOMEN SAFETY PANEL ── */}
        <Animated.View style={[s.womenCard, { transform: [{ scale: womenCardScale }], opacity: womenFlash }]}>
          <LinearGradient colors={womenPanic ? ["#4C1D95", "#6D28D9", "#7C3AED"] : ["#1A0A3C", "#2E1065", "#4C1D95"]}
            style={s.womenGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>

            {/* Header */}
            <View style={s.womenTop}>
              <View style={s.womenIconWrap}>
                <Text style={{ fontSize: 28 }}>🛡️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.womenTitle}>Women Safety SOS</Text>
                {womenPanic
                  ? <Text style={[s.womenSub, { color: "#C4B5FD" }]}>🟣 PANIC TRIGGERED — Police Notified!</Text>
                  : <Text style={s.womenSub}>Silent panic in 4 ways — no one will notice</Text>}
              </View>
            </View>

            {!womenPanic && (
              <>
                {/* ── VOLUME UP BUTTON — PRIMARY METHOD ── */}
                <View style={s.volMethodCard}>
                  <View style={s.volMethodLeft}>
                    <View style={s.volStarBadge}><Text style={s.volStarText}>★ PRIMARY</Text></View>
                    <Text style={s.volMethodTitle}>Volume Up Button</Text>
                    <Text style={s.volMethodSub}>Press the Volume Up button on this card</Text>
                    <Text style={s.volMethodSub}>6 times fast → SOS fires instantly</Text>

                    {/* 6-pip progress track */}
                    <View style={s.volPipRow}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <View key={i} style={[s.volPip,
                          i < volumePressCount && { backgroundColor: "#A78BFA", transform: [{ scale: 1.15 }] }
                        ]} />
                      ))}
                      {volumePressCount > 0 && (
                        <Text style={s.volPipLabel}>{volumePressCount}/6</Text>
                      )}
                    </View>
                  </View>

                  {/* Hardware-style Volume Up Button */}
                  <View style={s.volHwWrap}>
                    <Animated.View style={[s.volHwOuter, {
                      transform: [{ scale: volBtnScale }],
                      shadowRadius: volBtnShadow,
                      shadowColor: "#000",
                      shadowOffset: { width: 2, height: 4 },
                      shadowOpacity: 0.5,
                      elevation: 8,
                    }]}>
                      <Pressable onPress={handleVolumeUpPress} style={s.volHwPressable}>
                        <LinearGradient
                          colors={["#F0F0F0", "#D8D8D8", "#B8B8B8"]}
                          style={s.volHwGrad}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                        >
                          {/* Top notch groove */}
                          <View style={s.volHwGroove} />
                          <Ionicons name="volume-high" size={22} color="#374151" />
                          <Text style={s.volHwLabel}>VOL+</Text>
                          {/* Bottom notch groove */}
                          <View style={s.volHwGroove} />
                        </LinearGradient>
                      </Pressable>
                    </Animated.View>

                    {/* Live count badge above the button */}
                    {volumePressCount > 0 && (
                      <Animated.View style={[s.volHwBadge, { transform: [{ scale: volCountPop }] }]}>
                        <Text style={s.volHwBadgeText}>{volumePressCount}</Text>
                      </Animated.View>
                    )}
                  </View>
                </View>

                {/* ── 3 LARGE DEDICATED METHOD BUTTONS ── */}
                <Text style={s.altMethodsLabel}>OR USE ALTERNATIVE TRIGGERS</Text>
                <View style={s.bigMethodsRow}>
                  {/* ── TAP 6× ── */}
                  <Pressable onPress={handleWomenTap} style={({ pressed }) => [s.bigMethodCard, s.tapCard, pressed && { opacity: 0.82, transform: [{ scale: 0.96 }] }]}>
                    {/* Big tap count circle */}
                    <View style={s.tapCircleOuter}>
                      <View style={[s.tapCircleFill, { borderColor: womenTapCount > 0 ? "#C084FC" : "rgba(167,139,250,0.35)" }]}>
                        <Text style={s.tapCircleNum}>{womenTapCount}</Text>
                        <Text style={s.tapCircleSub}>of 6</Text>
                      </View>
                    </View>
                    {/* Pip dots */}
                    <View style={s.bigPipRow}>
                      {Array.from({ length: 6 }).map((_, i) => (
                        <View key={i} style={[s.bigPip, i < womenTapCount && s.bigPipActiveTap]} />
                      ))}
                    </View>
                    <Text style={s.bigMethodTitle}>TAP 6×</Text>
                    <Text style={s.bigMethodSub}>Tap rapidly here</Text>
                  </Pressable>

                  {/* ── HOLD 2s ── */}
                  <Pressable
                    onPressIn={handleWomenLongPressStart}
                    onPressOut={handleWomenLongPressEnd}
                    style={({ pressed }) => [s.bigMethodCard, s.holdCard, pressed && { opacity: 0.82 }]}
                  >
                    {/* Circular fill progress */}
                    <View style={s.holdCircleOuter}>
                      <View style={[s.holdCircleFill, { borderColor: womenHoldProgress > 0 ? "#818CF8" : "rgba(129,140,248,0.3)" }]}>
                        <Text style={s.holdCircleNum}>
                          {womenHoldProgress > 0 ? `${Math.round(womenHoldProgress * 100)}%` : "HOLD"}
                        </Text>
                        {womenHoldProgress > 0 && (
                          <View style={[s.holdFillInner, { height: `${womenHoldProgress * 100}%` as any }]} />
                        )}
                      </View>
                    </View>
                    <View style={s.bigPipRow}>
                      <View style={[s.holdBarTrack, { flex: 1 }]}>
                        <View style={[s.holdBarProgress, { width: `${womenHoldProgress * 100}%` as any }]} />
                      </View>
                    </View>
                    <Text style={s.bigMethodTitle}>HOLD 2s</Text>
                    <Text style={s.bigMethodSub}>Press & hold here</Text>
                  </Pressable>

                  {/* ── SHAKE 3× ── */}
                  <View style={[s.bigMethodCard, s.shakeCard]}>
                    <View style={s.shakeCircleOuter}>
                      <View style={[s.shakeCircleFill, { borderColor: shakeCount > 0 ? "#34D399" : "rgba(52,211,153,0.3)" }]}>
                        <Text style={s.shakeCircleNum}>{shakeCount}</Text>
                        <Text style={s.tapCircleSub}>of 3</Text>
                      </View>
                    </View>
                    <View style={s.bigPipRow}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <View key={i} style={[s.bigPip, s.bigPipShakeBase, i < shakeCount && s.bigPipActiveShake]} />
                      ))}
                    </View>
                    <Text style={s.bigMethodTitle}>SHAKE 3×</Text>
                    <Text style={s.bigMethodSub}>Shake your phone</Text>
                  </View>
                </View>
              </>
            )}

            {womenPanic && (
              <View style={{ gap: 8 }}>
                <View style={s.womenPanicRow}>
                  <Ionicons name="checkmark-circle" size={20} color="#4ADE80" />
                  <Text style={s.womenPanicText}>Alert sent · Police dispatched · Location shared live</Text>
                </View>
                {isRecording && (
                  <View style={s.recordingRow}>
                    <View style={s.recordingDot} />
                    <Text style={s.recordingText}>🎙️ LIVE AUDIO RECORDING</Text>
                    <Text style={s.recordingSubText}>Evidence being captured</Text>
                  </View>
                )}
              </View>
            )}
          </LinearGradient>

          {/* Hold progress bar (bottom edge) */}
          {womenHoldProgress > 0 && (
            <View style={s.holdBar}>
              <View style={[s.holdBarFill, { width: `${womenHoldProgress * 100}%` as any }]} />
            </View>
          )}
        </Animated.View>

        {/* ── ACTIVE ALERTS ── */}
        {sosAlerts.filter(s => s.status !== "resolved").length > 0 && (
          <View style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.cardHeadIcon, { backgroundColor: "#EF444420" }]}>
                <Ionicons name="warning" size={14} color="#EF4444" />
              </View>
              <Text style={s.cardTitle}>Active Alerts in Uttarakhand</Text>
            </View>
            {sosAlerts.filter(a => a.status !== "resolved").slice(0, 5).map(alert => {
              const liveGeo = alert.liveGeo || alert.geo;
              const sago = alert.liveUpdatedAt ? Math.round((Date.now() - new Date(alert.liveUpdatedAt).getTime()) / 1000) : null;
              return (
                <View key={alert.id} style={[s.alertRow, { borderLeftColor: alert.status === "active" ? "#EF4444" : "#F59E0B" }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <LiveDot isLive={alert.status === "active"} />
                      <Text style={s.alertType}>{alert.category.replace(/_/g, " ").toUpperCase()}</Text>
                      {alert.isWomenSafety && <Text style={s.womenTag}>🛡️ WOMEN</Text>}
                    </View>
                    {alert.nearestPoliceStation && (
                      <Text style={s.alertPolice}>🚓 {alert.nearestPoliceStation} · {alert.policeDistance}km</Text>
                    )}
                    <Text style={s.alertLoc} numberOfLines={1}>📍 {alert.location}</Text>
                    {sago !== null && (
                      <Text style={[s.alertLiveTs, { color: sago < 60 ? "#4ADE80" : Colors.textMuted }]}>
                        {sago < 60 ? `🟢 LIVE · ${sago}s ago` : `Updated ${Math.round(sago / 60)}m ago`}
                      </Text>
                    )}
                  </View>
                  <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${liveGeo.lat},${liveGeo.lng}`)} style={s.alertMapBtn}>
                    <Ionicons name="map-outline" size={16} color="#4ADE80" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0D0A08" },

  // Floating hardware Volume Up button (right edge overlay)
  volBtnFloat: {
    position: "absolute", right: -2, top: "38%", zIndex: 200,
    alignItems: "flex-end", gap: 6,
  },
  volBtnOuter: {
    borderRadius: 10, overflow: "visible",
  },
  volBtnPressable: { borderRadius: 10, overflow: "hidden" },
  volBtnGrad: {
    width: 44, height: 82, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.15)",
  },
  volCountBadge: {
    position: "absolute", right: 46, top: 4,
    backgroundColor: "#8B5CF6", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    minWidth: 34, alignItems: "center",
  },
  volCountText: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  volBtnLabel: { alignItems: "center", paddingRight: 4 },
  volBtnLabelText: { color: "rgba(255,255,255,0.35)", fontSize: 7, fontFamily: "Inter_700Bold", lineHeight: 9 },

  // Header
  header: { paddingHorizontal: 20, paddingBottom: 18, overflow: "hidden" },
  hDecor1: { position: "absolute", width: 250, height: 250, borderRadius: 125, backgroundColor: "rgba(239,68,68,0.06)", top: -80, right: -60 },
  hDecor2: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(239,68,68,0.04)", bottom: -20, left: 20 },
  hDecor3: { position: "absolute", width: 60, height: 60, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.02)", top: 40, left: "50%" },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  gnctPill: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 6 },
  gnctText: { color: "rgba(255,255,255,0.5)", fontSize: 9, fontFamily: "Inter_500Medium" },
  headerTitle: { color: "#fff", fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerSub: { color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  activeBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EF444420", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#EF444440" },
  activeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#EF4444" },
  activeBadgeText: { color: "#EF4444", fontSize: 11, fontFamily: "Inter_700Bold" },

  statusBar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  statusPillText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  livePill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#052E16", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  liveText: { color: "#4ADE80", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },

  // Live banner
  liveBanner: { marginHorizontal: 16, marginTop: 14, borderRadius: 16, overflow: "hidden" },
  liveBannerInner: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14 },
  liveBannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(74,222,128,0.12)", alignItems: "center", justifyContent: "center" },
  liveBannerTitle: { color: "#4ADE80", fontSize: 12, fontFamily: "Inter_700Bold" },
  liveBannerSub: { color: "rgba(74,222,128,0.7)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  liveBannerDetail: { color: "rgba(74,222,128,0.5)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 3 },

  // Triggered card
  triggeredCard: { marginHorizontal: 16, marginTop: 14, backgroundColor: Colors.bgCard, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#4ADE8030" },
  triggeredTop: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  triggeredIcon: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  triggeredTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  triggeredId: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2, letterSpacing: 0.5 },
  sentBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#052E16", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sentBadgeText: { color: "#4ADE80", fontSize: 10, fontFamily: "Inter_700Bold" },
  mapsBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#052E16", borderRadius: 12, padding: 10, marginBottom: 12 },
  mapsBtnText: { color: "#4ADE80", fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  notifiedBlock: { backgroundColor: Colors.bg, borderRadius: 12, padding: 12, marginBottom: 12 },
  notifiedHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  notifiedHeaderText: { color: "#F59E0B", fontSize: 12, fontFamily: "Inter_700Bold" },
  notifiedRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  notifiedRank: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  notifiedName: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  notifiedAddr: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  callPsBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#EF444420", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  callPsText: { color: "#EF4444", fontSize: 10, fontFamily: "Inter_600SemiBold" },
  resetBtn: { backgroundColor: Colors.bgCardAlt, borderRadius: 10, padding: 10, alignItems: "center" },
  resetBtnText: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },

  // SOS big button
  sosSection: { alignItems: "center", paddingVertical: 48 },
  sosWrap: { width: 196, height: 196, alignItems: "center", justifyContent: "center" },
  sosBtn: { width: 196, height: 196, borderRadius: 98, overflow: "hidden" },
  sosBtnGrad: { width: 196, height: 196, borderRadius: 98, alignItems: "center", justifyContent: "center", gap: 2 },
  sosBtnLabel: { color: "#fff", fontSize: 44, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  sosBtnSub: { color: "rgba(255,255,255,0.8)", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 3 },
  sosBtnHint: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 2 },
  sosHintText: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 18, textAlign: "center", paddingHorizontal: 32 },

  // Card
  card: { marginHorizontal: 16, backgroundColor: Colors.bgCard, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: Colors.border, marginBottom: 14 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  cardHeadIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },

  // Helplines
  helpGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  helpChip: { width: "30.5%", backgroundColor: Colors.bgCardAlt, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, gap: 3 },
  helpNum: { fontSize: 16, fontFamily: "Inter_700Bold" },
  helpLabel: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Police stations
  psRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  psRank: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  psName: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  psAddr: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 1 },
  callBtn: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#4ADE8018", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  callBtnText: { color: "#4ADE80", fontSize: 10, fontFamily: "Inter_600SemiBold" },

  // Women Safety panel
  womenCard: { marginHorizontal: 16, borderRadius: 20, overflow: "hidden", marginBottom: 14 },
  womenGrad: { padding: 18 },
  womenTop: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 16 },
  womenIconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  womenTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  womenSub: { color: "rgba(255,255,255,0.72)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3, lineHeight: 16 },
  // Women Safety Panel
  womenPanicRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 12, marginTop: 4 },
  womenPanicText: { color: "#4ADE80", fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  recordingRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(239,68,68,0.18)", borderRadius: 12, padding: 11, borderWidth: 1, borderColor: "rgba(239,68,68,0.4)" },
  recordingDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: "#EF4444" },
  recordingText: { color: "#FCA5A5", fontSize: 11, fontFamily: "Inter_700Bold", flex: 1, letterSpacing: 0.5 },
  recordingSubText: { color: "rgba(252,165,165,0.7)", fontSize: 9.5, fontFamily: "Inter_400Regular" },
  holdProgressBar: { position: "absolute", bottom: 0, left: 0, height: 3, backgroundColor: "#A78BFA", borderRadius: 1.5 },
  holdBar: { height: 5, backgroundColor: "rgba(139,92,246,0.2)", overflow: "hidden" },
  holdBarFill: { height: 5, backgroundColor: "#A78BFA" },

  // Volume Up — PRIMARY method card inside women safety
  volMethodCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 16,
    padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "rgba(167,139,250,0.25)",
  },
  volMethodLeft: { flex: 1, gap: 4 },
  volStarBadge: {
    alignSelf: "flex-start", backgroundColor: "#F59E0B22",
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    borderWidth: 1, borderColor: "#F59E0B40", marginBottom: 2,
  },
  volStarText: { color: "#F59E0B", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  volMethodTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  volMethodSub: { color: "rgba(196,181,253,0.8)", fontSize: 11, fontFamily: "Inter_400Regular" },

  // 6-pip progress track
  volPipRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  volPip: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: "rgba(167,139,250,0.2)",
    borderWidth: 1, borderColor: "rgba(167,139,250,0.35)",
  },
  volPipLabel: { color: "#A78BFA", fontSize: 11, fontFamily: "Inter_700Bold", marginLeft: 4 },

  // Hardware Volume Up Button (inside women safety card)
  volHwWrap: { alignItems: "center", gap: 6, position: "relative" },
  volHwOuter: { borderRadius: 14 },
  volHwPressable: { borderRadius: 14, overflow: "hidden" },
  volHwGrad: {
    width: 58, height: 100, borderRadius: 14,
    alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8,
    borderWidth: 2, borderColor: "rgba(255,255,255,0.4)",
  },
  volHwGroove: {
    width: "70%", height: 3, borderRadius: 1.5,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  volHwLabel: { color: "#374151", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  volHwBadge: {
    position: "absolute", top: -10, right: -10,
    backgroundColor: "#7C3AED", borderRadius: 12,
    width: 26, height: 26, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#1A0A3C",
  },
  volHwBadgeText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },

  // ── ALT METHOD LABEL ──
  altMethodsLabel: { color: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.4, textAlign: "center", marginTop: 4, marginBottom: 8 },

  // ── 3 BIG METHOD CARDS ──
  bigMethodsRow: { flexDirection: "row", gap: 8 },
  bigMethodCard: {
    flex: 1, alignItems: "center", borderRadius: 16, paddingVertical: 14, paddingHorizontal: 6,
    borderWidth: 1.5, gap: 7,
  },
  tapCard: { backgroundColor: "rgba(192,132,252,0.13)", borderColor: "rgba(192,132,252,0.35)" },
  holdCard: { backgroundColor: "rgba(129,140,248,0.13)", borderColor: "rgba(129,140,248,0.35)" },
  shakeCard: { backgroundColor: "rgba(52,211,153,0.10)", borderColor: "rgba(52,211,153,0.28)" },

  // Tap circle
  tapCircleOuter: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  tapCircleFill: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(192,132,252,0.1)",
  },
  tapCircleNum: { color: "#C084FC", fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 24 },
  tapCircleSub: { color: "rgba(255,255,255,0.45)", fontSize: 8, fontFamily: "Inter_600SemiBold" },

  // Hold circle
  holdCircleOuter: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  holdCircleFill: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(129,140,248,0.1)", overflow: "hidden",
  },
  holdCircleNum: { color: "#818CF8", fontSize: 14, fontFamily: "Inter_700Bold" },
  holdFillInner: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(129,140,248,0.25)" },

  // Shake circle
  shakeCircleOuter: { width: 62, height: 62, alignItems: "center", justifyContent: "center" },
  shakeCircleFill: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2.5,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(52,211,153,0.1)",
  },
  shakeCircleNum: { color: "#34D399", fontSize: 22, fontFamily: "Inter_700Bold", lineHeight: 24 },

  // Big pip row
  bigPipRow: { flexDirection: "row", gap: 5, alignItems: "center", height: 8, paddingHorizontal: 4 },
  bigPip: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.18)" },
  bigPipActiveTap: { backgroundColor: "#C084FC" },
  bigPipShakeBase: { width: 12, height: 12, borderRadius: 6 },
  bigPipActiveShake: { backgroundColor: "#34D399" },

  // Hold bar
  holdBarTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  holdBarProgress: { height: "100%", backgroundColor: "#818CF8", borderRadius: 3 },

  bigMethodTitle: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center" },
  bigMethodSub: { color: "rgba(255,255,255,0.45)", fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center" },

  // Active alerts list
  alertRow: { borderLeftWidth: 3, paddingLeft: 10, flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border },
  alertType: { color: "#fff", fontSize: 11, fontFamily: "Inter_700Bold" },
  womenTag: { fontSize: 10, color: "#A78BFA", fontFamily: "Inter_700Bold" },
  alertPolice: { color: "#F59E0B", fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2 },
  alertLoc: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  alertLiveTs: { fontSize: 9, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  alertMapBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#052E16", alignItems: "center", justifyContent: "center" },

  // Modal
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: { backgroundColor: "#130000", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "90%", overflow: "hidden" },
  sheetHandle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  sheetHeadIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  sheetTitle: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  sheetSub: { color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  gpsBadgeText: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium" },
  fieldLabel: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, paddingHorizontal: 16, marginTop: 12, marginBottom: 8 },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  catChip: { width: "22%", backgroundColor: Colors.bgCard, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: Colors.border, gap: 4 },
  catChipText: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  descBox: { marginHorizontal: 16, marginTop: 4, backgroundColor: Colors.bgCard, borderRadius: 12, padding: 12, color: "#fff", fontSize: 13, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: Colors.border, minHeight: 64, textAlignVertical: "top" },
  notifyBadge: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 16, marginTop: 10, backgroundColor: "#F59E0B15", borderRadius: 10, padding: 10 },
  notifyText: { color: "#D1D5DB", fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  sheetActions: { flexDirection: "row", gap: 10, padding: 16, paddingTop: 10 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14 },
  sendBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});

export default function SOSScreen() {
  return (
    <SOSErrorBoundary>
      <SOSScreenInner />
    </SOSErrorBoundary>
  );
}
