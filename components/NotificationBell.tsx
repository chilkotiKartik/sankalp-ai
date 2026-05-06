import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView,
  Modal, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useNotifications, AppNotification, NotificationType } from "@/context/NotificationContext";

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TYPE_CONFIG: Record<NotificationType, { icon: string; color: string; bg: string }> = {
  complaint_update: { icon: "document-text", color: Colors.blue, bg: Colors.blueBg },
  sos_alert:        { icon: "warning",       color: Colors.red,  bg: Colors.redBg },
  announcement:     { icon: "megaphone",     color: Colors.saffron, bg: Colors.saffronBg },
  achievement:      { icon: "trophy",        color: Colors.amber, bg: Colors.amberBg },
  system:           { icon: "information-circle", color: Colors.cyan, bg: Colors.cyanBg },
  call:             { icon: "call",          color: Colors.green, bg: Colors.greenBg },
};

function NotifItem({ notif, onPress }: { notif: AppNotification; onPress: () => void }) {
  const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
  const scale = useRef(new Animated.Value(0.96)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: false }).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.notifItem, !notif.read && styles.notifUnread, pressed && { opacity: 0.7 }]}
      >
        <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
          <Ionicons name={cfg.icon as any} size={18} color={cfg.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.notifTitle, !notif.read && { color: "#fff" }]} numberOfLines={1}>{notif.title}</Text>
          <Text style={styles.notifBody} numberOfLines={2}>{notif.body}</Text>
          <Text style={styles.notifTime}>{timeAgo(notif.timestamp)}</Text>
        </View>
        {!notif.read && <View style={[styles.unreadDot, { backgroundColor: cfg.color }]} />}
      </Pressable>
    </Animated.View>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bellPulse = useRef(new Animated.Value(1)).current;
  const panelSlide = useRef(new Animated.Value(-40)).current;
  const panelFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (unreadCount > 0) {
      const anim = Animated.loop(Animated.sequence([
        Animated.timing(bellPulse, { toValue: 1.2, duration: 300, useNativeDriver: false }),
        Animated.timing(bellPulse, { toValue: 1, duration: 300, useNativeDriver: false }),
        Animated.delay(2000),
      ]));
      anim.start();
      return () => anim.stop();
    }
  }, [unreadCount]);

  const openPanel = () => {
    setVisible(true);
    panelSlide.setValue(-40);
    panelFade.setValue(0);
    Animated.parallel([
      Animated.spring(panelSlide, { toValue: 0, friction: 8, useNativeDriver: false }),
      Animated.timing(panelFade, { toValue: 1, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  const closePanel = () => {
    Animated.parallel([
      Animated.timing(panelSlide, { toValue: -40, duration: 200, useNativeDriver: false }),
      Animated.timing(panelFade, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start(() => setVisible(false));
  };

  return (
    <>
      <Pressable onPress={openPanel} style={styles.bellBtn} testID="notification-bell">
        <Animated.View style={{ transform: [{ scale: bellPulse }] }}>
          <Ionicons name="notifications" size={22} color={unreadCount > 0 ? Colors.saffron : Colors.textMuted} />
        </Animated.View>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={visible} transparent animationType="none" onRequestClose={closePanel}>
        <Pressable style={styles.overlay} onPress={closePanel} />
        <Animated.View style={[
          styles.panel,
          { top: topInset + 56, opacity: panelFade, transform: [{ translateY: panelSlide }] }
        ]}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.panelTitle}>Notifications</Text>
              <Text style={styles.panelSub}>सूचनाएं</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              {unreadCount > 0 && (
                <Pressable onPress={markAllRead} style={styles.markAllBtn}>
                  <Text style={styles.markAllText}>Mark all read</Text>
                </Pressable>
              )}
              <Pressable onPress={closePanel} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={Colors.textMuted} />
              </Pressable>
            </View>
          </View>
          <View style={styles.tricolorStripe}>
            <View style={[styles.stripeBar, { backgroundColor: Colors.saffron }]} />
            <View style={[styles.stripeBar, { backgroundColor: "#FFFFFF" }]} />
            <View style={[styles.stripeBar, { backgroundColor: Colors.nationalGreen }]} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            {notifications.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-off-outline" size={40} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No notifications</Text>
              </View>
            ) : notifications.map(n => (
              <NotifItem key={n.id} notif={n} onPress={() => markRead(n.id)} />
            ))}
          </ScrollView>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.bgCard,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.border,
  },
  badge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: Colors.saffron, borderRadius: 8,
    minWidth: 16, height: 16, paddingHorizontal: 3,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: Colors.bg,
  },
  badgeText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold" },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  panel: {
    position: "absolute", left: 16, right: 16,
    backgroundColor: Colors.bgCard, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 20, elevation: 20,
    zIndex: 999, overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  panelTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  panelSub: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  markAllBtn: { backgroundColor: Colors.saffronBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  markAllText: { color: Colors.saffron, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  closeBtn: { padding: 4 },
  tricolorStripe: { flexDirection: "row", height: 3, marginHorizontal: 16, marginBottom: 6, borderRadius: 2, overflow: "hidden" },
  stripeBar: { flex: 1 },
  notifItem: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  notifUnread: { backgroundColor: "rgba(255,107,0,0.04)" },
  notifIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  notifTitle: { color: Colors.textSecondary, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  notifBody: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  notifTime: { color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 4 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginTop: 4 },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
});
