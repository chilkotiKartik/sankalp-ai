import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { stateName } from "@/constants/districts";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
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

// No invented notifications: the list starts with one welcome note and fills from real push / in-app events.
const initialNotifications = (): AppNotification[] => [{
  id: genId(), type: "system",
  title: "Welcome to SANKALP AI",
  body: `Report civic issues, track them to a verified fix and stay safe in ${stateName()}.`,
  timestamp: new Date().toISOString(), read: true,
}];

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
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
        const newNotif: AppNotification = {
          id: genId(),
          type: "system" as NotificationType,
          title: title as string,
          body: (body as string) || "",
          timestamp: new Date().toISOString(),
          read: false,
        };
        setNotifications(prev => [newNotif, ...prev].slice(0, 50));
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
