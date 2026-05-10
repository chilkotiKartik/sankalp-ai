import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated, FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";
import Colors from "@/constants/colors";

interface Msg { id: string; role: "user" | "ai"; text: string; ts: Date; model?: string }

const QUICK_PROMPTS = [
  { label: "🕳️ Report Pothole", text: "How do I report a pothole near my house?" },
  { label: "🆘 SOS Help", text: "What do I do in case of a women safety emergency?" },
  { label: "📋 Govt Schemes", text: "What government schemes am I eligible for in Uttarakhand?" },
  { label: "📍 Track Complaint", text: "How do I track my complaint status?" },
  { label: "💧 Water Issue", text: "There is no water supply in my area. What can I do?" },
  { label: "🌫️ Air Quality", text: "What is the current AQI in Dehradun?" },
  { label: "🏥 Nearest Hospital", text: "What are the nearest hospitals to me in Uttarakhand?" },
  { label: "⚡ Power Cut", text: "There is a power cut in my area. How to file complaint?" },
];

const FOLLOW_UP_MAP: { keywords: string[]; suggestions: string[] }[] = [
  { keywords: ["pothole", "road", "repair", "pavement"], suggestions: ["Track pothole complaint", "PWD department contact", "Road damage helpline"] },
  { keywords: ["water", "supply", "pipeline", "tap", "bore"], suggestions: ["File water complaint", "Jal Sansthan helpline", "Check water quality"] },
  { keywords: ["emergency", "sos", "safety", "women", "danger"], suggestions: ["Trigger SOS now", "Police helpline 100", "USDMA helpline 1070"] },
  { keywords: ["scheme", "yojana", "government", "eligible", "subsidy"], suggestions: ["PM Awas eligibility", "Kisan scheme details", "Student scholarships"] },
  { keywords: ["hospital", "health", "medical", "doctor", "ambulance"], suggestions: ["Nearest hospital", "Dial 108 ambulance", "Health card scheme"] },
  { keywords: ["garbage", "waste", "trash", "sanitation", "clean"], suggestions: ["Report garbage issue", "Nagar Nigam contact", "Cleanliness helpline"] },
  { keywords: ["electricity", "power", "light", "streetlight", "blackout"], suggestions: ["File electricity complaint", "UPCL helpline", "Streetlight issue"] },
];

function getFollowUps(text: string): string[] {
  const lower = text.toLowerCase();
  for (const item of FOLLOW_UP_MAP) {
    if (item.keywords.some(k => lower.includes(k))) return item.suggestions;
  }
  return ["Track complaint status", "File a new complaint", "Emergency helplines"];
}

function TypingDots() {
  const d1 = useRef(new Animated.Value(0)).current;
  const d2 = useRef(new Animated.Value(0)).current;
  const d3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bounce = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: -5, duration: 280, useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: 280, useNativeDriver: false }),
        Animated.delay(350),
      ]));
    bounce(d1, 0).start();
    bounce(d2, 140).start();
    bounce(d3, 280).start();
  }, []);
  return (
    <View style={s.dots}>
      {[d1, d2, d3].map((d, i) => (
        <Animated.View key={i} style={[s.dot, { transform: [{ translateY: d }] }]} />
      ))}
    </View>
  );
}

function AIBubble({ msg, isLast, onFollowUp }: { msg: Msg; isLast: boolean; onFollowUp: (t: string) => void }) {
  const slideY = useRef(new Animated.Value(12)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 0, duration: 280, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: false }),
    ]).start();
  }, []);
  const followUps = getFollowUps(msg.text);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY: slideY }] }}>
      <View style={s.msgRow}>
        <LinearGradient colors={["#FF9933", "#E07000"]} style={s.aiAvatar}>
          <Text style={{ fontSize: 13 }}>🤖</Text>
        </LinearGradient>
        <View style={s.aiMsgWrap}>
          <View style={s.bubbleAI}>
            <Text style={s.bubbleTextAI}>{msg.text}</Text>
            <View style={s.bubbleMeta}>
              {msg.model && (
                <View style={s.modelBadge}>
                  <Ionicons name="hardware-chip" size={9} color={Colors.saffron} />
                  <Text style={s.modelText}>{msg.model}</Text>
                </View>
              )}
              <Text style={s.bubbleTime}>{msg.ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Text>
            </View>
          </View>
          {isLast && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }} contentContainerStyle={{ gap: 6, paddingRight: 16 }}>
              {followUps.map((f, i) => (
                <Pressable key={i} onPress={() => onFollowUp(f)} style={s.followChip}>
                  <Text style={s.followChipText}>{f}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

function UserBubble({ msg }: { msg: Msg }) {
  const slideY = useRef(new Animated.Value(10)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 0, duration: 200, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[s.msgRowUser, { opacity, transform: [{ translateY: slideY }] }]}>
      <View style={s.bubbleUser}>
        <Text style={s.bubbleTextUser}>{msg.text}</Text>
        <Text style={s.bubbleTimeUser}>{msg.ts.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</Text>
      </View>
    </Animated.View>
  );
}

export default function AIChatScreen() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "ai",
      text: `Namaste ${user?.name?.split(" ")[0] || "Citizen"}! 🙏\n\nMain SANKALP AI hoon — aapka Uttarakhand civic assistant.\n\nMain aapki help kar sakta hoon:\n• Civic complaints file aur track karna\n• Government schemes & helplines dhundna\n• Hospitals, buses & local services locate karna\n• Real-time district data aur pollution info\n\nAaj main aapki kya seva kar sakta hoon?`,
      ts: new Date(),
      model: "SANKALP AI",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const send = useCallback(async (text: string) => {
    const txt = text.trim();
    if (!txt || loading) return;
    setInput("");
    const userMsg: Msg = { id: Date.now().toString(), role: "user", text: txt, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    scrollToEnd();
    try {
      const url = new URL("/api/ai/chat", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ message: txt, userId: user?.id }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        text: data.reply || "Mujhe samajh nahi aaya. Kripaya dobara try karein.",
        ts: new Date(),
        model: data.powered_by || "SANKALP AI",
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "ai",
        text: "Connection error. Kripaya internet check karein aur dobara try karein.",
        ts: new Date(),
      }]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }, [loading, token, user, scrollToEnd]);

  const topPad = Platform.OS === "web" ? 72 : insets.top;
  const botPad = Platform.OS === "web" ? 24 : insets.bottom;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: topPad + 10 }]}>
        <LinearGradient
          colors={["#FF9933", "#E07000"]}
          style={s.headerAccent}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        />
        <View style={s.headerContent}>
          <View style={s.botIconWrap}>
            <Text style={{ fontSize: 24 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>SANKALP AI</Text>
            <View style={s.onlineRow}>
              <View style={s.onlineDot} />
              <Text style={s.onlineText}>Online · Uttarakhand Civic Intelligence</Text>
            </View>
          </View>
          <View style={s.govBadge}>
            <Ionicons name="shield-checkmark" size={10} color={Colors.saffron} />
            <Text style={s.govBadgeText}>GOV</Text>
          </View>
        </View>
        <View style={s.tricolor}>
          <View style={[s.triSlice, { backgroundColor: "#FF9933" }]} />
          <View style={[s.triSlice, { backgroundColor: "#fff", opacity: 0.15 }]} />
          <View style={[s.triSlice, { backgroundColor: "#138808" }]} />
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={s.msgList}
          contentContainerStyle={[s.msgContent, { paddingBottom: botPad + 16 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {/* Welcome quick prompts */}
          {messages.length === 1 && (
            <View style={s.quickSection}>
              <Text style={s.quickLabel}>● QUICK QUESTIONS</Text>
              <View style={s.quickGrid}>
                {QUICK_PROMPTS.map(q => (
                  <Pressable key={q.label} onPress={() => send(q.text)} style={s.quickCard}>
                    <Text style={s.quickCardText}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Messages */}
          {messages.map((msg, idx) =>
            msg.role === "ai" ? (
              <AIBubble
                key={msg.id}
                msg={msg}
                isLast={idx === messages.length - 1 && !loading}
                onFollowUp={send}
              />
            ) : (
              <UserBubble key={msg.id} msg={msg} />
            )
          )}

          {loading && (
            <View style={s.msgRow}>
              <LinearGradient colors={["#FF9933", "#E07000"]} style={s.aiAvatar}>
                <Text style={{ fontSize: 13 }}>🤖</Text>
              </LinearGradient>
              <View style={s.bubbleAI}><TypingDots /></View>
            </View>
          )}
        </ScrollView>

        {/* Persistent chip bar (after first message) */}
        {messages.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipBar}
            style={s.chipBarWrap}
          >
            {QUICK_PROMPTS.map(q => (
              <Pressable key={q.label} onPress={() => send(q.text)} style={s.chipBarChip}>
                <Text style={s.chipBarText}>{q.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Input Bar */}
        <View style={[s.inputBar, { paddingBottom: Platform.OS === "ios" ? botPad + 8 : 12 }]}>
          <TextInput
            ref={inputRef}
            style={s.input}
            placeholder="Kuch bhi poochein Uttarakhand ke baare mein..."
            placeholderTextColor={Colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={() => { if (Platform.OS !== "web") send(input); }}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnOff]}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={17} color="#fff" />
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    backgroundColor: Colors.bgCard,
    paddingHorizontal: 18,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    overflow: "hidden",
  },
  headerAccent: {
    position: "absolute", top: 0, right: 0,
    width: 180, height: 180, borderRadius: 90,
    opacity: 0.07,
  },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  botIconWrap: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: Colors.saffronBg,
    borderWidth: 1, borderColor: Colors.saffron + "40",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: Colors.textPrimary, fontSize: 19, fontFamily: "Inter_700Bold" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
  onlineText: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_400Regular" },
  govBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.saffronBg,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.saffron + "30",
  },
  govBadgeText: { color: Colors.saffron, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  tricolor: { height: 3, flexDirection: "row", gap: 1, borderRadius: 1, marginBottom: 0, opacity: 0.7 },
  triSlice: { flex: 1 },

  msgList: { flex: 1 },
  msgContent: { paddingHorizontal: 14, paddingTop: 14, gap: 14 },

  msgRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  msgRowUser: { flexDirection: "row", justifyContent: "flex-end" },

  aiAvatar: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
  aiMsgWrap: { flex: 1, gap: 0 },

  bubbleAI: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 16, borderTopLeftRadius: 4,
    padding: 12, maxWidth: "90%",
    gap: 6,
  },
  bubbleTextAI: { color: Colors.textPrimary, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modelBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: Colors.saffronBg, borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  modelText: { color: Colors.saffron, fontSize: 9, fontFamily: "Inter_600SemiBold" },
  bubbleTime: { color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular" },

  bubbleUser: {
    backgroundColor: Colors.saffron,
    borderRadius: 16, borderBottomRightRadius: 4,
    padding: 12, maxWidth: "80%", gap: 4,
  },
  bubbleTextUser: { color: "#fff", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTimeUser: { color: "rgba(255,255,255,0.6)", fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "right" },

  followChip: {
    backgroundColor: Colors.bgCardAlt,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  followChipText: { color: Colors.saffron, fontSize: 11, fontFamily: "Inter_500Medium" },

  dots: { flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 6, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.saffron },

  quickSection: { marginBottom: 4 },
  quickLabel: {
    color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_700Bold",
    letterSpacing: 1, marginBottom: 10,
  },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  quickCardText: { color: Colors.textSecondary, fontSize: 12, fontFamily: "Inter_500Medium" },

  chipBarWrap: {
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  chipBar: {
    paddingHorizontal: 12, paddingVertical: 8, gap: 6,
  },
  chipBarChip: {
    backgroundColor: Colors.bgCardAlt,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  chipBarText: { color: Colors.textSecondary, fontSize: 11, fontFamily: "Inter_500Medium" },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    backgroundColor: Colors.bgCard,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 14, paddingTop: 10,
  },
  input: {
    flex: 1, backgroundColor: Colors.bg,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: Colors.border,
    color: Colors.textPrimary, fontSize: 14, fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: Colors.saffron,
    alignItems: "center", justifyContent: "center",
    shadowColor: Colors.saffron, shadowRadius: 8, shadowOpacity: 0.4, elevation: 4,
  },
  sendBtnOff: { opacity: 0.35, shadowOpacity: 0 },
});
