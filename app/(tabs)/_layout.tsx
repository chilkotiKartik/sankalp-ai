import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useApp } from "@/context/AppContext";
import { useI18n } from "@/lib/i18n";

export default function TabLayout() {
  const { t } = useI18n();
  const { getStats } = useApp();
  const stats = getStats();
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#FF9933",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          backgroundColor: "#0A0F1C",
          borderTopWidth: 1,
          borderTopColor: "#1F2937",
          elevation: 0,
          height: isWeb ? 84 : 64,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 16,
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#0A0F1C" }]} />
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_600SemiBold",
          marginBottom: isWeb ? 8 : 3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tab.home"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="complaints"
        options={{
          title: t("tab.reports"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "document-text" : "document-text-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sos"
        options={{
          title: t("tab.sos"),
          tabBarBadge: stats.sos > 0 ? stats.sos : undefined,
          tabBarBadgeStyle: { backgroundColor: "#EF4444", fontSize: 9 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "shield-checkmark" : "shield-checkmark-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t("tab.map"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "map" : "map-outline"} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("tab.profile"),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "person-circle" : "person-circle-outline"} size={22} color={color} />
          ),
        }}
      />
      {/* Hidden from tab bar */}
      <Tabs.Screen name="ai" options={{ href: null }} />
      <Tabs.Screen name="announcements" options={{ href: null }} />
      <Tabs.Screen name="community" options={{ href: null }} />
      <Tabs.Screen name="bills" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="wards" options={{ href: null }} />
      <Tabs.Screen name="rti" options={{ href: null }} />
      <Tabs.Screen name="budget" options={{ href: null }} />
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
      <Tabs.Screen name="emergency" options={{ href: null }} />
    </Tabs>
  );
}
