import React, { useRef, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated,
  Dimensions, FlatList, Image, Platform,
  NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

const { width: W, height: H } = Dimensions.get("window");

// Indian citizen avatar with real photo
function IndianAvatar({ name, role, photo, size = 160 }: {
  name: string; role: string; photo: string; size?: number;
}) {
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[avs.outer, { width: size + 28, height: size + 28, borderRadius: (size + 28) / 2 }]}>
        <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      </View>
      <View style={avs.namePill}>
        <Text style={avs.nameText}>{name}</Text>
        <Text style={avs.roleText}>{role}</Text>
      </View>
    </View>
  );
}

const avs = StyleSheet.create({
  outer: { borderWidth: 4, borderColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  namePill: { marginTop: 12, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, alignItems: "center" },
  nameText: { color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold" },
  roleText: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
});

const SLIDES = [
  {
    id: "0",
    gradients: ["#BF360C", "#E64A19", "#FF8F00"] as const,
    bgImage: "https://images.unsplash.com/photo-1587474260584-136574528ed5?w=800&h=600&fit=crop",
    avatar: { name: "Rahul Kumar", role: "Block Officer, Uttarakhand", photo: "https://randomuser.me/api/portraits/men/32.jpg" },
    badge: "🏛️",
    pill: "CIVIC TECH",
    title: "Report Issues,\nTransform Uttarakhand",
    sub: "File complaints for potholes, garbage, broken streetlights and more — in under 30 seconds. Track real-time resolution across 13 districts.",
    features: ["AI-powered complaint routing", "Real-time status tracking", "Ward health scoreboard"],
    featureIcons: ["hardware-chip", "navigate-circle", "bar-chart"] as const,
  },
  {
    id: "1",
    gradients: ["#1A237E", "#283593", "#3949AB"] as const,
    bgImage: "https://images.unsplash.com/photo-1537944434965-cf4679d1a598?w=800&h=600&fit=crop",
    avatar: { name: "Priya Sharma", role: "Tech Officer, Govt of UK", photo: "https://randomuser.me/api/portraits/women/62.jpg" },
    badge: "🤖",
    pill: "AI POWERED",
    title: "Your Personal\nAI Civic Assistant",
    sub: "SANKALP AI answers civic questions 24/7 — from government schemes to emergency helplines, all in plain English.",
    features: ["Instant scheme eligibility", "24/7 helpline directory", "Smart complaint suggestions"],
    featureIcons: ["chatbubble-ellipses", "call", "bulb"] as const,
  },
  {
    id: "2",
    gradients: ["#1B5E20", "#2E7D32", "#43A047"] as const,
    bgImage: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=800&h=600&fit=crop",
    avatar: { name: "Sunita Verma", role: "Citizen, Uttarakhand", photo: "https://randomuser.me/api/portraits/women/44.jpg" },
    badge: "🛡️",
    pill: "ALWAYS SAFE",
    title: "Women Safety\n& Emergency SOS",
    sub: "One-tap SOS sends your location to police and family. Access Uttarakhand emergency services — police 100, women helpline 1090.",
    features: ["One-tap SOS broadcast", "Women helpline 1090", "Nearest police locator"],
    featureIcons: ["warning", "shield-checkmark", "location"] as const,
  },
];

type Slide = typeof SLIDES[0];

function SlideView({ slide }: { slide: Slide }) {
  return (
    <View style={[sv.container, { width: W }]}>
      <Image source={{ uri: slide.bgImage }} style={sv.bgImage} resizeMode="cover" />
      <LinearGradient
        colors={[slide.gradients[0] + "CC", slide.gradients[1] + "E5", slide.gradients[2] + "F5"]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      />
      {/* Decorative circles */}
      <View style={[sv.deco1, { borderColor: "rgba(255,255,255,0.12)" }]} />
      <View style={[sv.deco2, { borderColor: "rgba(255,255,255,0.08)" }]} />

      {/* Indian Avatar */}
      <View style={sv.avatarWrap}>
        <IndianAvatar
          name={slide.avatar.name}
          role={slide.avatar.role}
          photo={slide.avatar.photo}
          size={160}
        />
        <View style={sv.badgeCircle}>
          <Text style={{ fontSize: 20 }}>{slide.badge}</Text>
        </View>
      </View>

      {/* Float stats */}
      <View style={sv.floatCard1}>
        <Text style={sv.floatNum}>12K+</Text>
        <Text style={sv.floatLabel}>Citizens</Text>
      </View>
      <View style={sv.floatCard2}>
        <Text style={sv.floatNum}>98%</Text>
        <Text style={sv.floatLabel}>Resolved</Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<FlatList>(null);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    if (idx >= 0 && idx < SLIDES.length) setActiveIdx(idx);
  };

  const goTo = useCallback((idx: number) => {
    scrollRef.current?.scrollToIndex({ index: idx, animated: true });
    setActiveIdx(idx);
  }, []);

  const handleNext = async () => {
    if (activeIdx < SLIDES.length - 1) {
      goTo(activeIdx + 1);
    } else {
      await AsyncStorage.setItem("@sankalp_onboarded", "true");
      router.replace("/(auth)/login");
    }
  };

  const handleSkip = async () => {
    await AsyncStorage.setItem("@sankalp_onboarded", "true");
    router.replace("/(auth)/login");
  };

  const slide = SLIDES[activeIdx];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar style="light" />

      <FlatList
        ref={scrollRef}
        data={SLIDES}
        keyExtractor={i => i.id}
        horizontal pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        renderItem={({ item }) => <SlideView slide={item} />}
        style={sv.list}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
      />

      {/* Top bar */}
      <View style={[ob.topBar, { top: Platform.OS === "web" ? 80 : insets.top + 20 }]}>
        <View style={ob.brand}>
          <View style={ob.brandIcon}><Text style={{ fontSize: 22 }}>🏛️</Text></View>
          <View>
            <Text style={ob.brandName}>SANKALP AI</Text>
            <Text style={ob.brandGov}>Government of Uttarakhand</Text>
          </View>
        </View>
        <Pressable onPress={handleSkip} style={ob.skipBtn}>
          <Text style={ob.skipText}>Skip</Text>
          <Ionicons name="chevron-forward" size={12} color="rgba(255,255,255,0.8)" />
        </Pressable>
      </View>

      {/* Bottom card */}
      <View style={[ob.bottomCard, { paddingBottom: Platform.OS === "web" ? 24 : insets.bottom + 20 }]}>
        <View style={ob.handle} />

        <View style={[ob.pill, { backgroundColor: slide.gradients[1] + "18", borderColor: slide.gradients[1] + "55" }]}>
          <Text style={[ob.pillText, { color: slide.gradients[1] }]}>{slide.pill}</Text>
        </View>

        <Text style={ob.title}>{slide.title}</Text>
        <Text style={ob.sub}>{slide.sub}</Text>

        <View style={ob.features}>
          {slide.features.map((f, i) => (
            <View key={i} style={ob.featureRow}>
              <View style={[ob.featureIcon, { backgroundColor: slide.gradients[1] + "18" }]}>
                <Ionicons name={slide.featureIcons[i]} size={14} color={slide.gradients[1]} />
              </View>
              <Text style={ob.featureText}>{f}</Text>
              <Ionicons name="checkmark-circle" size={14} color="#00A651" />
            </View>
          ))}
        </View>

        {/* Tricolor */}
        <View style={ob.tricolor}>
          <View style={{ flex: 1, backgroundColor: "#FF9933" }} />
          <View style={{ flex: 1, backgroundColor: "#fff" }} />
          <View style={{ flex: 1, backgroundColor: "#138808" }} />
        </View>

        <View style={ob.bottomRow}>
          <View style={ob.dots}>
            {SLIDES.map((_, i) => (
              <Pressable key={i} onPress={() => goTo(i)}>
                <View style={[ob.dot, i === activeIdx && [ob.dotActive, { backgroundColor: slide.gradients[1] }]]} />
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [ob.nextBtn, pressed && { opacity: 0.85 }, { backgroundColor: slide.gradients[1] }]}
          >
            <Text style={ob.nextBtnText}>
              {activeIdx === SLIDES.length - 1 ? "Start" : "Next"}
            </Text>
            <Ionicons name={activeIdx === SLIDES.length - 1 ? "rocket" : "arrow-forward"} size={16} color="#fff" />
          </Pressable>
        </View>

        <Pressable style={ob.loginRow} onPress={async () => {
          await AsyncStorage.setItem("@sankalp_onboarded", "true");
          router.replace("/(auth)/login");
        }}>
          <Text style={ob.loginPre}>Already registered? </Text>
          <Text style={ob.loginLink}>Sign In</Text>
        </Pressable>
      </View>
    </View>
  );
}

const sv = StyleSheet.create({
  list: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  container: { height: H, alignItems: "center", justifyContent: "center" },
  bgImage: { ...StyleSheet.absoluteFillObject },
  deco1: { position: "absolute", width: 260, height: 260, borderRadius: 130, borderWidth: 1, top: H * 0.08, right: -60 },
  deco2: { position: "absolute", width: 180, height: 180, borderRadius: 90, borderWidth: 1, bottom: H * 0.30, left: -40 },
  avatarWrap: { alignItems: "center", marginBottom: 8 },
  badgeCircle: {
    position: "absolute", bottom: 44, right: -8,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 6,
  },
  floatCard1: {
    position: "absolute", top: H * 0.18, left: 24,
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, padding: 10,
    alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  floatCard2: {
    position: "absolute", top: H * 0.18, right: 24,
    backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, padding: 10,
    alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  floatNum: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  floatLabel: { color: "rgba(255,255,255,0.85)", fontSize: 10, fontFamily: "Inter_400Regular" },
});

const ob = StyleSheet.create({
  topBar: {
    position: "absolute", left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  brandName: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  brandGov: { color: "rgba(255,255,255,0.7)", fontSize: 9, fontFamily: "Inter_400Regular" },
  skipBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  skipText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: "Inter_500Medium" },
  bottomCard: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff", borderTopLeftRadius: 32, borderTopRightRadius: 32,
    paddingHorizontal: 28, paddingTop: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 24,
  },
  handle: { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  pill: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, marginBottom: 12 },
  pillText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 26, fontFamily: "Inter_700Bold", lineHeight: 34, marginBottom: 8 },
  sub: { color: "#6B7280", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20, marginBottom: 14 },
  features: { gap: 8, marginBottom: 14 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  featureText: { flex: 1, color: "#374151", fontSize: 13, fontFamily: "Inter_500Medium" },
  tricolor: { height: 3, flexDirection: "row", borderRadius: 2, overflow: "hidden", marginBottom: 16 },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E5E7EB" },
  dotActive: { width: 28, borderRadius: 4 },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 20, paddingHorizontal: 24, paddingVertical: 14 },
  nextBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  loginRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 4 },
  loginPre: { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_400Regular" },
  loginLink: { color: "#FF9933", fontSize: 13, fontFamily: "Inter_700Bold" },
});
