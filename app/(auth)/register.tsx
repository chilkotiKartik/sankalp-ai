import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated, Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

const UTTARAKHAND_DISTRICTS = [
  "Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun",
  "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh",
  "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi",
];

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [district, setDistrict] = useState("Dehradun");
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 34 : insets.bottom;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 8, delay: 150, useNativeDriver: false }),
    ]).start();
  }, []);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: false }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: false }),
    ]).start();
  };

  const handleRegister = async () => {
    setError("");
    if (!name.trim()) { setError("Please enter your full name"); shake(); return; }
    if (!phone.trim() || phone.length !== 10) { setError("Enter a valid 10-digit phone number"); shake(); return; }
    if (pin.length !== 6) { setError("PIN must be exactly 6 digits"); shake(); return; }
    if (pin !== confirmPin) { setError("PINs do not match — please try again"); shake(); return; }
    setLoading(true);
    try {
      await register(name.trim(), phone.trim(), pin, district);
      setSuccess(true);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || "Registration failed. Please try again.");
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      shake();
    } finally {
      setLoading(false);
    }
  };

  const pinStrength = pin.length === 0 ? 0 : pin.length < 3 ? 1 : pin.length < 6 ? 2 : 3;
  const strengthColors = ["transparent", "#EF4444", "#FFAB00", "#00A651"];
  const strengthLabels = ["", "Weak", "Fair", "Strong"];

  return (
    <View style={{ flex: 1, backgroundColor: "#F0FFF4" }}>
      <LinearGradient
        colors={["#006400", "#00A651", "#00E676"]}
        style={[s.hero, { paddingTop: topInset + 12 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={s.heroBg}>
          {[70, 120, 180].map((size, i) => (
            <View key={i} style={[s.heroBgCircle, { width: size, height: size, borderRadius: size / 2, opacity: 0.08, bottom: -size / 4, left: i * 60 - 20 }]} />
          ))}
        </View>

        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <View style={s.backBtnInner}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </View>
          <Text style={s.backText}>Back to Login</Text>
        </Pressable>

        <View style={s.heroContent}>
          <View style={s.charWrap}>
            <Text style={{ fontSize: 48 }}>🏔️</Text>
          </View>
          <View>
            <Text style={s.heroTitle}>Join Uttarakhand's{"\n"}Civic Community</Text>
            <Text style={s.heroSub}>Report issues & earn civic points · देवभूमि के लिए</Text>
          </View>
        </View>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: bottomInset + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[s.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { translateX: shakeAnim }] }]}>
            {success ? (
              <View style={s.successBox}>
                <LinearGradient colors={["#00A651", "#006400"]} style={s.successIcon}>
                  <Ionicons name="checkmark" size={40} color="#fff" />
                </LinearGradient>
                <Text style={s.successEmoji}>🎉</Text>
                <Text style={s.successTitle}>You're In!</Text>
                <Text style={s.successSub}>Welcome to SANKALP AI. Your citizen account is active for {district} district!</Text>
                <View style={s.successBadges}>
                  {["New Citizen", "Devbhoomi Hero", "Problem Solver"].map(b => (
                    <View key={b} style={s.successBadge}>
                      <Text style={s.successBadgeText}>⭐ {b}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <>
                <View style={s.tricolor}>
                  <View style={{ flex: 1, backgroundColor: "#FF9933" }} />
                  <View style={{ flex: 1, backgroundColor: "#fff" }} />
                  <View style={{ flex: 1, backgroundColor: "#138808" }} />
                </View>

                <Text style={s.cardTitle}>Create Account</Text>
                <Text style={s.cardSub}>Join Uttarakhand's active citizens community</Text>

                <View style={s.statsRow}>
                  {[
                    { num: "13", label: "Districts" },
                    { num: "5K+", label: "Citizens" },
                    { num: "4.8★", label: "Rating" },
                  ].map(stat => (
                    <View key={stat.label} style={s.statBox}>
                      <Text style={s.statNum}>{stat.num}</Text>
                      <Text style={s.statLabel}>{stat.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Full Name */}
                <View style={s.field}>
                  <Text style={s.label}>FULL NAME</Text>
                  <View style={s.inputRow}>
                    <Ionicons name="person" size={16} color="#9CA3AF" style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Your full name"
                      placeholderTextColor="#9CA3AF"
                      value={name}
                      onChangeText={(v) => { setName(v); setError(""); }}
                      autoCapitalize="words"
                    />
                  </View>
                </View>

                {/* Phone */}
                <View style={s.field}>
                  <Text style={s.label}>MOBILE NUMBER</Text>
                  <View style={s.inputRow}>
                    <View style={s.prefix}>
                      <Text style={{ fontSize: 14 }}>🇮🇳</Text>
                      <Text style={s.prefixCode}>+91</Text>
                    </View>
                    <TextInput
                      style={s.input}
                      placeholder="10-digit mobile number"
                      placeholderTextColor="#9CA3AF"
                      value={phone}
                      onChangeText={(v) => { setPhone(v.replace(/\D/g, "").slice(0, 10)); setError(""); }}
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                  </View>
                </View>

                {/* District Picker */}
                <View style={s.field}>
                  <Text style={s.label}>YOUR DISTRICT (जिला)</Text>
                  <Pressable style={s.inputRow} onPress={() => setShowDistrictPicker(true)}>
                    <Ionicons name="location" size={16} color="#00A651" style={s.inputIcon} />
                    <Text style={[s.input, { color: "#111827", paddingTop: 16 }]}>{district}</Text>
                    <Ionicons name="chevron-down" size={16} color="#9CA3AF" style={{ marginRight: 16 }} />
                  </Pressable>
                </View>

                {/* PIN */}
                <View style={s.field}>
                  <Text style={s.label}>CREATE 6-DIGIT PIN</Text>
                  <View style={s.inputRow}>
                    <Ionicons name="lock-closed" size={16} color="#9CA3AF" style={s.inputIcon} />
                    <TextInput
                      style={s.input}
                      placeholder="Choose a secure PIN"
                      placeholderTextColor="#9CA3AF"
                      value={pin}
                      onChangeText={(v) => { setPin(v.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={6}
                    />
                  </View>
                  {pin.length > 0 && (
                    <View style={s.strengthRow}>
                      {[1, 2, 3].map(i => (
                        <View key={i} style={[s.strengthBar, { backgroundColor: i <= pinStrength ? strengthColors[pinStrength] : "#E5E7EB" }]} />
                      ))}
                      <Text style={[s.strengthLabel, { color: strengthColors[pinStrength] }]}>{strengthLabels[pinStrength]}</Text>
                    </View>
                  )}
                </View>

                {/* Confirm PIN */}
                <View style={s.field}>
                  <Text style={s.label}>CONFIRM PIN</Text>
                  <View style={[s.inputRow, confirmPin && pin !== confirmPin && { borderColor: "#FCA5A5" }]}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={pin === confirmPin && confirmPin ? "#00A651" : "#9CA3AF"}
                      style={s.inputIcon}
                    />
                    <TextInput
                      style={s.input}
                      placeholder="Re-enter your PIN"
                      placeholderTextColor="#9CA3AF"
                      value={confirmPin}
                      onChangeText={(v) => { setConfirmPin(v.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={6}
                    />
                  </View>
                </View>

                {!!error && (
                  <View style={s.errorBox}>
                    <Ionicons name="alert-circle" size={14} color="#EF4444" />
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                )}

                <Pressable
                  style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => { if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleRegister(); }}
                  disabled={loading}
                >
                  <LinearGradient colors={["#006400", "#00A651"]} style={s.createBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={s.createBtnText}>Create My Account</Text>
                        <Ionicons name="person-add" size={18} color="#fff" />
                      </>
                    )}
                  </LinearGradient>
                </Pressable>

                <View style={s.trustRow}>
                  <Ionicons name="shield-checkmark" size={13} color="#9CA3AF" />
                  <Text style={s.trustText}>Protected under Digital India data guidelines</Text>
                </View>

                <Pressable style={s.loginRow} onPress={() => router.back()}>
                  <Text style={s.loginPre}>Already a citizen? </Text>
                  <Text style={s.loginLink}>Sign In</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* District Picker Modal */}
      <Modal visible={showDistrictPicker} transparent animationType="slide" onRequestClose={() => setShowDistrictPicker(false)}>
        <Pressable style={s.modalOverlay} onPress={() => setShowDistrictPicker(false)}>
          <Pressable style={s.districtModal} onPress={e => e.stopPropagation?.()}>
            <View style={s.districtModalHeader}>
              <Text style={s.districtModalTitle}>Select Your District</Text>
              <Text style={s.districtModalSub}>Uttarakhand — 13 जिले</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {UTTARAKHAND_DISTRICTS.map(d => (
                <Pressable key={d} style={[s.districtOption, d === district && s.districtOptionActive]}
                  onPress={() => { setDistrict(d); setShowDistrictPicker(false); }}>
                  <Ionicons name="location" size={16} color={d === district ? "#00A651" : "#9CA3AF"} />
                  <Text style={[s.districtOptionText, d === district && { color: "#00A651", fontFamily: "Inter_700Bold" }]}>{d}</Text>
                  {d === district && <Ionicons name="checkmark-circle" size={18} color="#00A651" />}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { paddingHorizontal: 24, paddingBottom: 24, overflow: "hidden" },
  heroBg: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  heroBgCircle: { position: "absolute", backgroundColor: "#fff" },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 20 },
  backBtnInner: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  backText: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontFamily: "Inter_500Medium" },
  heroContent: { flexDirection: "row", alignItems: "center", gap: 16 },
  charWrap: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, padding: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  heroTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", lineHeight: 28 },
  heroSub: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  scroll: { paddingHorizontal: 20, paddingTop: 0 },
  card: { backgroundColor: "#fff", borderRadius: 24, padding: 24, marginTop: -16, shadowColor: "#00A651", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 12, marginBottom: 20 },
  tricolor: { height: 3, flexDirection: "row", borderRadius: 2, overflow: "hidden", marginBottom: 20 },
  cardTitle: { color: "#111827", fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  cardSub: { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  statBox: { flex: 1, backgroundColor: "#F0FFF4", borderRadius: 12, padding: 10, alignItems: "center", borderWidth: 1, borderColor: "#A7F3D0" },
  statNum: { color: "#00A651", fontSize: 15, fontFamily: "Inter_700Bold" },
  statLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  field: { marginBottom: 16 },
  label: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginBottom: 8, textTransform: "uppercase" },
  inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#F9FAFB", borderRadius: 14, borderWidth: 1.5, borderColor: "#E5E7EB", overflow: "hidden" },
  inputIcon: { marginLeft: 14 },
  prefix: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 16, borderRightWidth: 1.5, borderRightColor: "#E5E7EB", backgroundColor: "#F3F4F6" },
  prefixCode: { color: "#374151", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 16, color: "#111827", fontSize: 16, fontFamily: "Inter_400Regular" },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontFamily: "Inter_500Medium", width: 42, textAlign: "right" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#FECACA" },
  errorText: { color: "#EF4444", fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  createBtn: { borderRadius: 16, overflow: "hidden", marginBottom: 12 },
  createBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 18 },
  createBtnText: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold" },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 16 },
  trustText: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular" },
  loginRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  loginPre: { color: "#6B7280", fontSize: 14, fontFamily: "Inter_400Regular" },
  loginLink: { color: "#00A651", fontSize: 14, fontFamily: "Inter_700Bold" },
  successBox: { alignItems: "center", gap: 12, paddingVertical: 20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  successEmoji: { fontSize: 36 },
  successTitle: { fontSize: 28, fontFamily: "Inter_700Bold", color: "#00A651" },
  successSub: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#6B7280", textAlign: "center", lineHeight: 22, maxWidth: 280 },
  successBadges: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  successBadge: { backgroundColor: "#F0FFF4", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#A7F3D0" },
  successBadgeText: { color: "#00A651", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  districtModal: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%", paddingBottom: 34 },
  districtModalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" },
  districtModalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#111827" },
  districtModalSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#9CA3AF", marginTop: 2 },
  districtOption: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  districtOptionActive: { backgroundColor: "#F0FFF4" },
  districtOptionText: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium", color: "#374151" },
});
