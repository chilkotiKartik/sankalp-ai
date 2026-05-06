import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type NotificationType = "complaint_update" | "sos_alert" | "announcement" | "achievement" | "system" | "call";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  action?: string;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  pushSystemNotification: (title: string, body: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 6);
}

function minsAgo(mins: number) {
  return new Date(Date.now() - mins * 60000).toISOString();
}

const DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: genId(), type: "achievement",
    title: "Badge Unlocked — Active Citizen",
    body: "You've earned 50+ civic points. Keep contributing to make Uttarakhand better!",
    timestamp: minsAgo(5), read: false,
  },
  {
    id: genId(), type: "complaint_update",
    title: "Complaint Resolved",
    body: "Your pothole report at Rajpur Road has been marked resolved by Nagar Nigam.",
    timestamp: minsAgo(35), read: false,
  },
  {
    id: genId(), type: "announcement",
    title: "New Govt Scheme: PM Awas Yojana",
    body: "Applications open for affordable housing. Apply before 31 March 2026 at dda.org.in.",
    timestamp: minsAgo(90), read: false,
  },
  {
    id: genId(), type: "sos_alert",
    title: "SOS Alert Resolved Nearby",
    body: "A women safety alert near Paltan Bazaar, Dehradun has been responded to and resolved.",
    timestamp: minsAgo(180), read: true,
  },
  {
    id: genId(), type: "system",
    title: "Welcome to SANKALP AI",
    body: "Uttarakhand's civic nervous system is ready. Report issues, track progress, stay safe.",
    timestamp: minsAgo(360), read: true,
  },
  {
    id: genId(), type: "announcement",
    title: "Water Supply Disruption — Haridwar",
    body: "Water supply disrupted in Haridwar Sectors 4–9 from 10 PM to 6 AM. Tankers deployed.",
    timestamp: minsAgo(480), read: true,
  },
];

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(DEMO_NOTIFICATIONS);
  const listenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    // Request permissions (non-blocking, safe to fail)
    if (Platform.OS !== "web") {
      Notifications.requestPermissionsAsync().catch(() => {});
    }

    // Listen for notifications received while app is in foreground
    listenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
      const { title, body } = notification.request.content;
      if (title) {
        setNotifications(prev => [{
          id: genId(),
          type: "system",
          title: title as string,
          body: (body as string) || "",
          timestamp: new Date().toISOString(),
          read: false,
        }, ...prev].slice(0, 50));
      }
    });

    return () => {
      listenerRef.current?.remove();
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
    const newN: AppNotification = {
      ...n,
      id: genId(),
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [newN, ...prev].slice(0, 50));
  }, []);

  const pushSystemNotification = useCallback(async (title: string, body: string) => {
    addNotification({ type: "system", title, body });
    if (Platform.OS !== "web") {
      try {
        await Notifications.scheduleNotificationAsync({
          content: { title, body, sound: true },
          trigger: null,
        });
      } catch {}
    }
  }, [addNotification]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll, pushSystemNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
