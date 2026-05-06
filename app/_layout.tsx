import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { View, StyleSheet, Animated, Text, Pressable } from "react-native";

// KeyboardProvider requires native code unavailable in Expo Go — use a safe fallback
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }>;
try {
  KeyboardProvider = require("react-native-keyboard-controller").KeyboardProvider;
} catch {
  KeyboardProvider = ({ children }) => <>{children}</>;
}
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider, useApp } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { StatusBar } from "expo-status-bar";
import { LogoAnimation } from "@/components/LogoAnimation";
import Colors from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      // Check if onboarded before
      AsyncStorage.getItem("@sankalp_onboarded").then(v => {
        if (v === "true") {
          router.replace("/(auth)/login");
        } else {
          router.replace("/(auth)/onboarding");
        }
      });
    } else if (user && inAuthGroup) {
      if (user.role === "admin" || user.role === "super_admin") {
        router.replace("/admin");
      } else {
        router.replace("/(tabs)");
      }
    }
  }, [user, isLoading, segments]);

  if (isLoading) {
    return (
      <Animated.View style={[styles.splash, { opacity: fadeOut }]}>
        <LogoAnimation size="lg" showText onAnimationEnd={() => {
          Animated.timing(fadeOut, { toValue: 0, duration: 400, delay: 800, useNativeDriver: true }).start();
        }} />
      </Animated.View>
    );
  }

  return <Slot />;
}

function EmergencyBuzzer() {
  const { emergencyAlert, clearEmergency } = useApp();
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(-120)).current;
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (emergencyAlert) {
      Animated.spring(slideY, { toValue: 0, friction: 8, useNativeDriver: false }).start();
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 400, useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0.3, duration: 400, useNativeDriver: false }),
      ]));
      anim.start();
      const t = setTimeout(clearEmergency, 30000);
      return () => { anim.stop(); clearTimeout(t); };
    } else {
      Animated.timing(slideY, { toValue: -120, duration: 300, useNativeDriver: false }).start();
      flash.setValue(0);
    }
  }, [emergencyAlert]);

  if (!emergencyAlert) return null;

  return (
    <Animated.View style={[
      styles.emergencyBuzzer,
      { top: insets.top, transform: [{ translateY: slideY }] },
    ]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#EF4444", opacity: flash, borderRadius: 16, pointerEvents: "none" }]} />
      <View style={styles.emergencyBuzzerContent}>
        <View style={styles.emergencyBuzzerIcon}>
          <Ionicons name="warning" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.emergencyBuzzerTitle}>CITY EMERGENCY ALERT</Text>
          <Text style={styles.emergencyBuzzerMsg} numberOfLines={2}>{emergencyAlert?.message}</Text>
        </View>
        <Pressable onPress={clearEmergency} style={styles.emergencyBuzzerClose}>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

function RootLayoutNav() {
  return (
    <View style={{ flex: 1 }}>
      <AuthGate />
      <EmergencyBuzzer />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [fontTimeout, setFontTimeout] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 4500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError || fontTimeout) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, fontTimeout]);

  if (!fontsLoaded && !fontError && !fontTimeout) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppProvider>
              <LanguageProvider>
                <NotificationProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    <KeyboardProvider>
                      <StatusBar style="light" />
                      <RootLayoutNav />
                    </KeyboardProvider>
                  </GestureHandlerRootView>
                </NotificationProvider>
              </LanguageProvider>
            </AppProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyBuzzer: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#7F1D1D",
    borderWidth: 1,
    borderColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 20,
  },
  emergencyBuzzerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  emergencyBuzzerIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  emergencyBuzzerTitle: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 3,
  },
  emergencyBuzzerMsg: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  emergencyBuzzerClose: {
    padding: 6,
  },
});
