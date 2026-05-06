import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getApiUrl } from "@/lib/query-client";
import { useAuth } from "@/context/AuthContext";

interface Msg { id: string; role: "user" | "ai"; text: string; ts: Date }

const QUICK_PROMPTS = [
  { label: "Report pothole 🕳️", text: "How do I report a pothole near my house?" },
  { label: "SOS Help 🆘", text: "What do I do in case of a women safety emergency?" },
  { label: "Govt Schemes 📋", text: "What government schemes am I eligible for in Uttarakhand?" },
  { label: "Track complaint 📍", text: "How do I track my complaint status?" },
  { label: "Water issue 💧", text: "There is no water supply in my area. What can I do?" },
  { label: "Air quality 🌫️", text: "What is the current AQI in Dehradun?" },
];

function TypingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const bounce = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: -6, duration: 300, useNativeDriver: false }),
        Animated.timing(v, { toValue: 0, duration: 300, useNativeDriver: false }),
        Animated.delay(400),
      ]));
    bounce(dot1, 0).start();
    bounce(dot2, 160).start();
    bounce(dot3, 320).start();
  }, []);
  return (
    <View style={t.dots}>
      {[dot1, dot2, dot3].map((d, i) => (
        <Animated.View key={i} style={[t.dot, { transform: [{ translateY: d }] }]} />
      ))}
    </View>
  );
}

export default function AIChatScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "ai",
      text: `Namaste ${user?.name?.split(" ")[0] || "Citizen"}! 🙏\n\nI am SANKALP AI, your Uttarakhand civic assistant. I can help you:\n\n• File and track civic complaints\n• Access government schemes & helplines\n• Find hospitals, bus stations & services\n• Get real-time district and pollution data\n\nHow can I assist you today?`,
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (text: string) => {
    const txt = text.trim();
    if (!txt || loading) return;
    setInput("");
    const userMsg: Msg = { id: Date.now().toString(), role: "user", text: txt, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const url = new URL("/api/ai/chat", getApiUrl());
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: txt, userId: user?.id }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: "ai",
        text: data.reply || "I could not process that. Please try again.", ts: new Date(),
      }]);
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: "ai",
        text: "Connection error. Please check your internet and try again.", ts: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const fmt = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <View style={t.container}>
      {/* Header */}
      <LinearGradient
        colors={["#FF6B00", "#FF9933", "#FFBA5C"]}
        style={[t.header, { paddingTop: Platform.OS === "web" ? 80 : insets.top + 16 }]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      >
        <View style={t.headerBg1} />
        <View style={t.headerBg2} />
        <View style={t.headerContent}>
          <View style={t.aiAvatarWrap}>
            <Text style={{ fontSize: 28 }}>🤖</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={t.headerTitle}>SANKALP AI</Text>
            <View style={t.onlineRow}>
              <View style={t.onlineDot} />
              <Text style={t.onlineText}>Online · Uttarakhand Civic Intelligence</Text>
            </View>
          </View>
          <View style={t.govVerified}>
            <Ionicons name="shield-checkmark" size={11} color="#FF9933" />
            <Text style={t.govVerifiedText}>GOV VERIFIED</Text>
          </View>
        </View>
        <View style={t.tricolor}>
          <View style={{ flex: 1, backgroundColor: "#fff", opacity: 0.9 }} />
          <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
          <View style={{ flex: 1, backgroundColor: "#138808" }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          style={t.msgList}
          contentContainerStyle={t.msgContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 1 && (
            <View style={t.quickSection}>
              <Text style={t.quickLabel}>QUICK QUESTIONS</Text>
              <View style={t.quickRow}>
                {QUICK_PROMPTS.map(q => (
                  <Pressable key={q.label} onPress={() => send(q.text)} style={t.quickChip}>
                    <Text style={t.quickChipText}>{q.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {messages.map(msg => (
            <View key={msg.id} style={[t.msgRow, msg.role === "user" && t.msgRowUser]}>
              {msg.role === "ai" && (
                <View style={t.aiAvatar}><Text style={{ fontSize: 14 }}>🤖</Text></View>
              )}
              <View style={[t.bubble, msg.role === "user" ? t.bubbleUser : t.bubbleAI]}>
                <Text style={[t.bubbleText, msg.role === "user" ? t.bubbleTextUser : t.bubbleTextAI]}>
                  {msg.text}
                </Text>
                <Text style={[t.bubbleTime, msg.role === "user" ? t.bubbleTimeUser : t.bubbleTimeAI]}>
                  {fmt(msg.ts)}
                </Text>
              </View>
            </View>
          ))}

          {loading && (
            <View style={t.msgRow}>
              <View style={t.aiAvatar}><Text style={{ fontSize: 14 }}>🤖</Text></View>
              <View style={t.bubbleAI}><TypingDots /></View>
            </View>
          )}
        </ScrollView>

        {messages.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={t.chipBar}>
            {QUICK_PROMPTS.map(q => (
              <Pressable key={q.label} onPress={() => send(q.text)} style={t.chipBarChip}>
                <Text style={t.chipBarText}>{q.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={[t.inputBar, { paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 8 }]}>
          <TextInput
            style={t.input}
            placeholder="Ask me anything about Uttarakhand..."
            placeholderTextColor="#9CA3AF"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || loading}
            style={[t.sendBtn, (!input.trim() || loading) && t.sendBtnDisabled]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const t = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  header: { paddingHorizontal: 20, paddingBottom: 16, overflow: "hidden" },
  headerBg1: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.08)", top: -40, right: -30 },
  headerBg2: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.06)", bottom: 0, left: 20 },
  headerContent: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  aiAvatarWrap: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  headerTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  onlineRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#4ADE80" },
  onlineText: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontFamily: "Inter_400Regular" },
  govVerified: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  govVerifiedText: { color: "#FF9933", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  tricolor: { height: 3, flexDirection: "row", gap: 2, borderRadius: 1 },
  msgList: { flex: 1 },
  msgContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { flexDirection: "row-reverse" },
  aiAvatar: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "#FFF8E7", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#FFD0A0",
  },
  bubble: { maxWidth: "80%", borderRadius: 16, padding: 12, gap: 4 },
  bubbleAI: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: "#FF9933", borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 21 },
  bubbleTextAI: { color: "#111827", fontFamily: "Inter_400Regular" },
  bubbleTextUser: { color: "#fff", fontFamily: "Inter_400Regular" },
  bubbleTime: { fontSize: 9, fontFamily: "Inter_400Regular", alignSelf: "flex-end" },
  bubbleTimeAI: { color: "#9CA3AF" },
  bubbleTimeUser: { color: "rgba(255,255,255,0.75)" },
  dots: { flexDirection: "row", gap: 5, alignItems: "center", paddingVertical: 4, paddingHorizontal: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF9933" },
  quickSection: { marginBottom: 8 },
  quickLabel: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 8 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickChip: {
    backgroundColor: "#fff", borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: "#FFD0A0",
  },
  quickChipText: { color: "#FF9933", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chipBar: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, backgroundColor: "#F8F9FA" },
  chipBarChip: {
    backgroundColor: "#fff", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  chipBarText: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_500Medium" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#E5E7EB",
    paddingHorizontal: 16, paddingTop: 12,
  },
  input: {
    flex: 1, backgroundColor: "#F9FAFB",
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1.5, borderColor: "#E5E7EB",
    color: "#111827", fontSize: 14, fontFamily: "Inter_400Regular", maxHeight: 100,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: "#FF9933", alignItems: "center", justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
