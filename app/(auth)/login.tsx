import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  Animated, Image, Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

const { width: W, height: H } = Dimensions.get("window");
const PIN_DIGITS = 6;

// ── ONBOARDING SLIDES ──────────────────────────────────────────────────────────
const SLIDES = [
  {
    photo: require("@/assets/images/splash_saint.png"),
    tag: "CIVIC TECH",
    tagColor: "#E64A19",
    heading: "Report Issues,\nTransform Uttarakhand",
    desc: "File complaints for potholes, garbage, broken streetlights and more — in under 30 seconds. Track real-time resolution across 13 districts.",
    bullets: [
      { icon: "analytics" as const,        text: "AI-powered complaint routing" },
      { icon: "time" as const,             text: "Real-time status tracking" },
      { icon: "bar-chart" as const,        text: "District health scoreboard" },
    ],
    stat1: "13",    stat1Label: "Districts",
    stat2: "98%",   stat2Label: "Resolved",
  },
  {
    photo: require("@/assets/images/splash_girl.png"),
    tag: "WOMEN SAFETY",
    tagColor: "#7C3AED",
    heading: "Your Safety,\nOur Priority",
    desc: "5 panic modes: shake phone 5 times, hold button, tap 5×, volume press, side button. Nearest police auto-notified with live GPS in under 2 seconds.",
    bullets: [
      { icon: "pulse" as const,            text: "5-shake instant panic mode" },
      { icon: "shield-checkmark" as const, text: "2 nearest police auto-notified" },
      { icon: "navigate" as const,         text: "Live GPS location streaming" },
    ],
    stat1: "28",    stat1Label: "Police Stns",
    stat2: "< 2s",  stat2Label: "Response",
  },
  {
    photo: require("@/assets/images/splash_musicians.png"),
    tag: "AI POWERED",
    tagColor: "#059669",
    heading: "Uttarakhand's Smartest\nCivic Platform",
    desc: "AI scores every complaint for priority, routes to the right department, and tracks district health across Devbhoomi's 13 districts.",
    bullets: [
      { icon: "flash" as const,            text: "AI priority scoring on every report" },
      { icon: "map" as const,              text: "District-aware live monitoring" },
      { icon: "people" as const,           text: "5,000+ active Uttarakhand citizens" },
    ],
    stat1: "AQI",   stat1Label: "Live Data",
    stat2: "100%",  stat2Label: "Free",
  },
];

// ── ONBOARDING SCREEN ──────────────────────────────────────────────────────────
function OnboardingScreen({ onDone, onSignIn }: { onDone: () => void; onSignIn: () => void }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 54 : insets.top;

  const [idx, setIdx] = useState(0);
  const bottomFade = useRef(new Animated.Value(1)).current;
  const photoFade = [
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
  const photoSlide = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(40)).current,
    useRef(new Animated.Value(40)).current,
  ];
  const idxRef = useRef(0);

  const goNext = useCallback(() => {
    const cur = idxRef.current;
    if (cur >= SLIDES.length - 1) { onDone(); return; }
    const next = cur + 1;
    // Fade bottom out
    Animated.timing(bottomFade, { toValue: 0, duration: 200, useNativeDriver: false }).start(() => {
      // Cross-dissolve photo
      Animated.parallel([
        Animated.timing(photoFade[cur], { toValue: 0, duration: 350, useNativeDriver: false }),
        Animated.timing(photoFade[next], { toValue: 1, duration: 350, useNativeDriver: false }),
        Animated.timing(photoSlide[next], { toValue: 0, duration: 380, useNativeDriver: false }),
      ]).start();
      idxRef.current = next;
      setIdx(next);
      Animated.timing(bottomFade, { toValue: 1, duration: 250, useNativeDriver: false }).start();
    });
  }, [onDone]);

  const slide = SLIDES[idx];
  const orangeH = H * 0.48;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* ── ORANGE TOP SECTION ── */}
      <View style={[ob.orange, { height: orangeH }]}>
        <LinearGradient
          colors={["#D84315", "#E64A19", "#FF7043", "#FF8A65"]}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        {/* Decorative circle */}
        <View style={ob.decorCircle1} />
        <View style={ob.decorCircle2} />

        {/* Top bar */}
        <View style={[ob.topBar, { paddingTop: topPad + 10 }]}>
          <View style={ob.logoRow}>
            <View style={ob.logoIcon}><Text style={{ fontSize: 20 }}>🏛️</Text></View>
            <View>
              <Text style={ob.logoName}>SANKALP AI</Text>
              <Text style={ob.logoGov}>Govt of Uttarakhand — देवभूमि</Text>
            </View>
          </View>
          <Pressable onPress={onDone} style={ob.skipBtn}>
            <Text style={ob.skipText}>Skip</Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>

        {/* Stats row */}
        <Animated.View style={[ob.statsRow, { opacity: bottomFade }]}>
          <View style={ob.statPill}>
            <Text style={ob.statNum}>{slide.stat1}</Text>
            <Text style={ob.statLabel}>{slide.stat1Label}</Text>
          </View>
          <View style={ob.statPill}>
            <Text style={ob.statNum}>{slide.stat2}</Text>
            <Text style={ob.statLabel}>{slide.stat2Label}</Text>
          </View>
        </Animated.View>

        {/* Photo circle — all stacked, crossfaded */}
        <View style={ob.photoWrap}>
          <View style={ob.photoOuter}>
            {SLIDES.map((s, i) => (
              <Animated.View
                key={i}
                style={[
                  StyleSheet.absoluteFillObject,
                  { opacity: photoFade[i], transform: [{ translateY: photoSlide[i] }] },
                ]}
              >
                <Image source={s.photo} style={ob.photoImg} resizeMode="cover" />
              </Animated.View>
            ))}
          </View>
        </View>
      </View>

      {/* ── WHITE BOTTOM SECTION ── */}
      <View style={ob.bottom}>
        <Animated.View style={{ opacity: bottomFade, flex: 1 }}>
          {/* Tag pill */}
          <View style={[ob.tagPill, { borderColor: slide.tagColor + "55", backgroundColor: slide.tagColor + "12" }]}>
            <Text style={[ob.tagText, { color: slide.tagColor }]}>{slide.tag}</Text>
          </View>

          {/* Heading */}
          <Text style={ob.heading}>{slide.heading}</Text>
          <Text style={ob.desc}>{slide.desc}</Text>

          {/* Bullets */}
          <View style={ob.bullets}>
            {slide.bullets.map((b, i) => (
              <View key={i} style={ob.bulletRow}>
                <View style={[ob.bulletIcon, { backgroundColor: slide.tagColor + "16" }]}>
                  <Ionicons name={b.icon} size={16} color={slide.tagColor} />
                </View>
                <Text style={ob.bulletText}>{b.text}</Text>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
              </View>
            ))}
          </View>

          {/* Divider strips */}
          <View style={ob.dividerRow}>
            <View style={[ob.dividerStrip, { backgroundColor: "#FF9933", flex: 2 }]} />
            <View style={[ob.dividerStrip, { backgroundColor: "#fff", flex: 1, borderWidth: 0.5, borderColor: "#E5E7EB" }]} />
            <View style={[ob.dividerStrip, { backgroundColor: "#138808", flex: 2 }]} />
          </View>
        </Animated.View>

        {/* Bottom nav row */}
        <View style={ob.navRow}>
          <View style={ob.dotsRow}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[ob.dot, idx === i && ob.dotActive, idx === i && { backgroundColor: slide.tagColor }]} />
            ))}
          </View>
          <Pressable
            style={[ob.nextBtn, { backgroundColor: "#E64A19" }]}
            onPress={goNext}
          >
            <Text style={ob.nextText}>{idx === SLIDES.length - 1 ? "Get Started" : "Next"}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </Pressable>
        </View>

        {/* Sign in link */}
        <Pressable onPress={onSignIn} style={ob.signInRow}>
          <Text style={ob.signInPre}>Already registered? </Text>
          <Text style={ob.signInLink}>Sign In</Text>
        </Pressable>
      </View>
    </View>
  );
}

const ob = StyleSheet.create({
  orange: { overflow: "hidden" },
  decorCircle1: { position: "absolute", width: 260, height: 260, borderRadius: 130, backgroundColor: "rgba(255,255,255,0.06)", top: -80, right: -60 },
  decorCircle2: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.05)", bottom: 40, left: -40 },
  topBar: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 22, paddingBottom: 8 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  logoName: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  logoGov: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontFamily: "Inter_400Regular" },
  skipBtn: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6 },
  skipText: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: 22, marginBottom: 8 },
  statPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.18)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  statNum: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontFamily: "Inter_400Regular" },
  photoWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 0 },
  photoOuter: { width: 136, height: 136, borderRadius: 68, borderWidth: 3.5, borderColor: "#fff", overflow: "hidden", backgroundColor: "#ccc" },
  photoImg: { width: "100%", height: "100%" },
  bottom: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 24, paddingTop: 20, paddingBottom: 16 },
  tagPill: { alignSelf: "flex-start", borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 },
  tagText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2 },
  heading: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#111827", lineHeight: 33, marginBottom: 8 },
  desc: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", lineHeight: 20, marginBottom: 14 },
  bullets: { gap: 8, marginBottom: 14 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletIcon: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  bulletText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151" },
  dividerRow: { flexDirection: "row", gap: 4, height: 3, borderRadius: 2, marginBottom: 16, overflow: "hidden" },
  dividerStrip: { height: 3 },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dotsRow: { flexDirection: "row", gap: 7, alignItems: "center" },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#D1D5DB" },
  dotActive: { width: 22, borderRadius: 4 },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 12 },
  nextText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  signInRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 12 },
  signInPre: { fontSize: 13, color: "#9CA3AF", fontFamily: "Inter_400Regular" },
  signInLink: { fontSize: 13, color: "#E64A19", fontFamily: "Inter_700Bold" },
});

// ── LOGIN SCREEN ────────────────────────────────────────────────────────────────
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adminHint, setAdminHint] = useState(false);
  const logoTapCount = useRef(0);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const screenFade = useRef(new Animated.Value(0)).current;
  const topInset = Platform.OS === "web" ? 54 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  const enterLogin = useCallback(() => {
    setShowOnboarding(false);
    screenFade.setValue(0);
    Animated.timing(screenFade, { toValue: 1, duration: 450, useNativeDriver: false }).start();
  }, [screenFade]);

  const shake = () => Animated.sequence([
    Animated.timing(shakeAnim, { toValue: 14, duration: 50, useNativeDriver: false }),
    Animated.timing(shakeAnim, { toValue: -14, duration: 50, useNativeDriver: false }),
    Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: false }),
    Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: false }),
    Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: false }),
  ]).start();

  const handleLogin = async () => {
    setError("");
    if (!phone.trim()) { setError("Please enter your mobile number"); shake(); return; }
    if (phone.length !== 10) { setError("Mobile number must be 10 digits"); shake(); return; }
    if (pin.length !== PIN_DIGITS) { setError("Please enter your 6-digit PIN"); shake(); return; }
    setLoading(true);
    try {
      await login(phone.trim(), pin);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Login failed. Check credentials.");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
    } finally { setLoading(false); }
  };

  if (showOnboarding) {
    return <OnboardingScreen onDone={enterLogin} onSignIn={enterLogin} />;
  }

  return (
    <Animated.View style={{ flex: 1, backgroundColor: "#F5F3EF", opacity: screenFade }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
        >
          {/* ── HERO — inside ScrollView so it scrolls ── */}
          <LinearGradient
            colors={["#6B0F00", "#BF360C", "#E64A19", "#F57C00"]}
            style={[las.hero, { paddingTop: topInset + 12 }]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          >
            <View style={las.blob1} />
            <View style={las.blob2} />

            <Pressable
              onPress={() => { logoTapCount.current++; if (logoTapCount.current >= 5) setAdminHint(true); }}
              style={las.brand}
            >
              <View style={las.brandIcon}><Text style={{ fontSize: 24 }}>🏛️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={las.brandName}>SANKALP AI</Text>
                <Text style={las.brandGov}>Government of Uttarakhand — देवभूमि</Text>
              </View>
              <View style={las.govBadge}>
                <Ionicons name="shield-checkmark" size={10} color="#BF360C" />
                <Text style={las.govBadgeText}>VERIFIED</Text>
              </View>
            </Pressable>

            <View style={las.tristrip}>
              {["rgba(255,153,51,0.9)", "rgba(255,255,255,0.85)", "#138808"].map((c, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: c, borderRadius: 1.5 }} />
              ))}
            </View>

            {/* Photo trio */}
            <View style={las.photoRow}>
              {SLIDES.map((s, i) => {
                const isCenter = i === 1;
                const size = isCenter ? 80 : 62;
                return (
                  <View key={i} style={{ alignItems: "center", gap: 4 }}>
                    <View style={[las.photoRing, {
                      width: size + 6, height: size + 6, borderRadius: (size + 6) / 2,
                      borderColor: isCenter ? "#fff" : "rgba(255,255,255,0.5)",
                      borderWidth: isCenter ? 2.5 : 1.5,
                    }]}>
                      <Image source={s.photo} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />
                    </View>
                    <Text style={{ color: isCenter ? "#fff" : "rgba(255,255,255,0.7)", fontSize: isCenter ? 9.5 : 8, fontFamily: "Inter_600SemiBold" }}>
                      {s.bullets[0].text.split(" ")[0]}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={las.taglinePill}>
              <Text style={{ fontSize: 12 }}>🙏</Text>
              <Text style={las.taglineText}>Uttarakhand's citizens powering civic change</Text>
            </View>
          </LinearGradient>

          {/* ── LOGIN FORM ── */}
          <Animated.View style={[las.card, { transform: [{ translateX: shakeAnim }] }]}>
            {adminHint && (
              <View style={las.adminBox}>
                <Ionicons name="shield-checkmark" size={14} color={Colors.saffron} />
                <Text style={las.adminText}>Admin: 9999999999 · PIN 000000</Text>
              </View>
            )}

            <Text style={las.cardTitle}>Welcome Back 👋</Text>
            <Text style={las.cardSub}>Sign in to your SANKALP AI account</Text>

            <View style={las.field}>
              <Text style={las.label}>MOBILE NUMBER</Text>
              <View style={las.inputRow}>
                <View style={las.prefix}>
                  <Text style={{ fontSize: 16 }}>🇮🇳</Text>
                  <Text style={las.prefixCode}>+91</Text>
                </View>
                <TextInput
                  style={las.input}
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#9CA3AF"
                  value={phone}
                  onChangeText={v => { setPhone(v.replace(/\D/g, "").slice(0, 10)); setError(""); }}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>
            </View>

            <View style={las.field}>
              <View style={las.labelRow}>
                <Text style={las.label}>6-DIGIT PIN</Text>
                <Pressable onPress={() => setShowPin(!showPin)} style={las.showPinBtn}>
                  <Ionicons name={showPin ? "eye-off" : "eye"} size={14} color="#9CA3AF" />
                  <Text style={las.showPinText}>{showPin ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              {showPin ? (
                <View style={las.inputRow}>
                  <Ionicons name="lock-closed" size={16} color="#9CA3AF" style={{ marginLeft: 16 }} />
                  <TextInput style={las.input} placeholder="Enter your PIN" placeholderTextColor="#9CA3AF"
                    value={pin} onChangeText={v => { setPin(v.replace(/\D/g, "").slice(0, PIN_DIGITS)); setError(""); }}
                    keyboardType="number-pad" secureTextEntry maxLength={PIN_DIGITS} />
                </View>
              ) : (
                <View style={las.pinRow}>
                  {Array.from({ length: PIN_DIGITS }).map((_, i) => (
                    <View key={i} style={[las.pinDot, i < pin.length && las.pinDotFilled]} />
                  ))}
                  <TextInput style={las.pinHidden} value={pin}
                    onChangeText={v => { setPin(v.replace(/\D/g, "").slice(0, PIN_DIGITS)); setError(""); }}
                    keyboardType="number-pad" maxLength={PIN_DIGITS} secureTextEntry />
                </View>
              )}
            </View>

            {!!error && (
              <View style={las.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#EF4444" />
                <Text style={las.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [las.loginBtn, pressed && { opacity: 0.88 }]}
              onPress={() => {
                if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleLogin();
              }}
              disabled={loading}
            >
              <LinearGradient colors={["#6B0F00", "#BF360C", "#E64A19"]} style={las.loginGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <><Text style={las.loginText}>Sign In Securely</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></>}
              </LinearGradient>
            </Pressable>

            <View style={las.divider}>
              <View style={las.divLine} /><Text style={las.divText}>or</Text><View style={las.divLine} />
            </View>

            <Pressable style={las.registerRow} onPress={() => router.push("/(auth)/register")}>
              <Text style={las.registerPre}>New citizen? </Text>
              <Text style={las.registerLink}>Create Account →</Text>
            </Pressable>
          </Animated.View>

          <View style={las.demoBox}>
            <View style={las.demoHeader}>
              <Ionicons name="flask" size={12} color="#9CA3AF" />
              <Text style={las.demoTitle}>DEMO CREDENTIALS — TAP TO AUTO-FILL</Text>
            </View>

            <Pressable onPress={() => { setPhone("9876543210"); setPin("123456"); setError(""); }} style={las.demoRow}>
              <View style={[las.demoAv, { backgroundColor: "#E8F5E9" }]}><Text style={{ fontSize: 18 }}>👤</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={las.demoName}>Citizen</Text>
                <Text style={las.demoInfo}>9876543210 · PIN 123456</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={20} color="#22C55E" />
            </Pressable>

            <Pressable onPress={() => { setPhone("9999000001"); setPin("111111"); setError(""); }} style={[las.demoRow, { paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" }]}>
              <View style={[las.demoAv, { backgroundColor: "#EFF6FF" }]}><Text style={{ fontSize: 18 }}>🏛️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[las.demoName, { color: "#3B82F6" }]}>District Admin (DM) · Dehradun</Text>
                <Text style={las.demoInfo}>9999000001 · PIN 111111</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={20} color="#3B82F6" />
            </Pressable>

            <Pressable onPress={() => { setPhone("9999000002"); setPin("222222"); setError(""); }} style={[las.demoRow, { paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" }]}>
              <View style={[las.demoAv, { backgroundColor: "#F0FFF4" }]}><Text style={{ fontSize: 18 }}>🏔️</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[las.demoName, { color: "#22C55E" }]}>District Admin (DM) · Haridwar</Text>
                <Text style={las.demoInfo}>9999000002 · PIN 222222</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={20} color="#22C55E" />
            </Pressable>

            <Pressable onPress={() => { setPhone("9999999999"); setPin("000000"); setError(""); }} style={[las.demoRow, { paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" }]}>
              <View style={[las.demoAv, { backgroundColor: "#FFF0E6" }]}><Text style={{ fontSize: 18 }}>⚡</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[las.demoName, { color: Colors.saffron }]}>Super Admin · Uttarakhand</Text>
                <Text style={las.demoInfo}>9999999999 · PIN 000000</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={20} color={Colors.saffron} />
            </Pressable>
          </View>

          <View style={las.footer}>
            <View style={{ flexDirection: "row", gap: 5 }}>
              {["#FF9933", "#FFFFFF", "#138808"].map((c, i) => (
                <View key={i} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: c, borderWidth: c === "#FFFFFF" ? 1 : 0, borderColor: "#E5E7EB" }} />
              ))}
            </View>
            <Text style={las.footerText}>सत्यमेव जयते — Truth Alone Triumphs</Text>
            <Text style={las.footerSub}>SANKALP AI · Uttarakhand · 2025</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const las = StyleSheet.create({
  hero: { paddingHorizontal: 22, paddingBottom: 4, overflow: "hidden" },
  blob1: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.06)", top: -70, right: -50 },
  blob2: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.04)", bottom: 0, left: 10 },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  brandIcon: { width: 50, height: 50, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.38)" },
  brandName: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  brandGov: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  govBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  govBadgeText: { color: "#BF360C", fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tristrip: { height: 3.5, flexDirection: "row", gap: 3, marginBottom: 16, borderRadius: 2 },
  photoRow: { flexDirection: "row", justifyContent: "center", alignItems: "flex-end", gap: 14, marginBottom: 14 },
  photoRing: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.15)", overflow: "hidden" },
  taglinePill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, alignSelf: "center", marginBottom: 26 },
  taglineText: { color: "rgba(255,255,255,0.88)", fontSize: 12, fontFamily: "Inter_500Medium" },
  card: { backgroundColor: "#fff", borderRadius: 24, padding: 24, marginHorizontal: 16, marginTop: -18, marginBottom: 14, shadowColor: "#BF360C", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 28, elevation: 14 },
  adminBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF8E7", borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: "#FFCC80" },
  adminText: { color: "#FF8F00", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  cardTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#111827", marginBottom: 4 },
  cardSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#6B7280", marginBottom: 22 },
  field: { marginBottom: 16 },
  label: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#9CA3AF", letterSpacing: 0.8, marginBottom: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 14, backgroundColor: "#FAFAFA", overflow: "hidden" },
  prefix: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 14, borderRightWidth: 1, borderRightColor: "#E5E7EB", backgroundColor: "#F3F4F6" },
  prefixCode: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#374151" },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: "#111827" },
  showPinBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  showPinText: { fontSize: 12, color: "#9CA3AF", fontFamily: "Inter_400Regular" },
  pinRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, height: 52, backgroundColor: "#FAFAFA", borderRadius: 14, borderWidth: 1.5, borderColor: "#E5E7EB" },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#D1D5DB", backgroundColor: "transparent" },
  pinDotFilled: { backgroundColor: "#BF360C", borderColor: "#BF360C" },
  pinHidden: { position: "absolute", opacity: 0, width: "100%", height: "100%" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: "#FECACA" },
  errorText: { color: "#EF4444", fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  loginBtn: { borderRadius: 16, overflow: "hidden", marginTop: 4 },
  loginGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 16 },
  loginText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  divider: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  divLine: { flex: 1, height: 1, backgroundColor: "#F3F4F6" },
  divText: { color: "#9CA3AF", fontSize: 12, fontFamily: "Inter_400Regular" },
  registerRow: { flexDirection: "row", justifyContent: "center" },
  registerPre: { color: "#6B7280", fontSize: 14, fontFamily: "Inter_400Regular" },
  registerLink: { color: "#BF360C", fontSize: 14, fontFamily: "Inter_700Bold" },
  demoBox: { backgroundColor: "#fff", borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: "#F3F4F6" },
  demoHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  demoTitle: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#9CA3AF", letterSpacing: 1 },
  demoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  demoAv: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  demoName: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#374151", marginBottom: 2 },
  demoInfo: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#9CA3AF" },
  footer: { alignItems: "center", gap: 6, paddingHorizontal: 24, paddingBottom: 8 },
  footerText: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_500Medium" },
  footerSub: { color: "#D1D5DB", fontSize: 10, fontFamily: "Inter_400Regular" },
});
