import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";

export type UserRole = "citizen" | "worker" | "admin" | "super_admin";

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  district: string;
  points?: number;
  badges?: string[];
  level?: number;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, pin: string) => Promise<void>;
  register: (name: string, phone: string, pin: string, district: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "@sankalp_token";
const USER_KEY = "@sankalp_user";

// Demo users — these work without a backend. Credentials match server seed data.
const DEMO_USERS: Record<string, { user: AuthUser; pin: string }> = {
  "9876543210": {
    pin: "123456",
    user: { id: "demo-citizen-arjun", name: "Arjun", phone: "9876543210", role: "citizen", district: "Champawat", points: 350, badges: ["first_report", "active_citizen"], level: 4 },
  },
  "9999000003": {
    pin: "333333",
    user: { id: "demo-admin-champawat", name: "Champawat Admin", phone: "9999000003", role: "admin", district: "Champawat", points: 500, badges: ["district_admin"], level: 50 },
  },
  "9999000002": {
    pin: "222222",
    user: { id: "demo-admin-haridwar", name: "Haridwar Admin", phone: "9999000002", role: "admin", district: "Haridwar", points: 500, badges: ["district_admin"], level: 50 },
  },
  "9999999999": {
    pin: "000000",
    user: { id: "demo-super-admin", name: "SANKALP Super Admin", phone: "9999999999", role: "super_admin", district: "Uttarakhand", points: 9999, badges: [], level: 99 },
  },
};
const DEMO_TOKEN_PREFIX = "demo-offline-token-";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          try {
            const baseUrl = getApiUrl();
            const validateRes = await fetch(new URL("/api/complaints", baseUrl).toString(), {
              headers: { Authorization: `Bearer ${storedToken}` },
            });
            if (validateRes.ok || validateRes.status !== 401) {
              setToken(storedToken);
              setUser(JSON.parse(storedUser));
            } else {
              await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
            }
          } catch {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const login = async (phone: string, pin: string) => {
    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/login", baseUrl);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin }),
      });
    } catch (_networkErr: any) {
      // Network unreachable — fall back to offline demo users
      const demo = DEMO_USERS[phone];
      if (demo && demo.pin === pin) {
        const demoToken = DEMO_TOKEN_PREFIX + phone;
        setUser(demo.user);
        setToken(demoToken);
        await AsyncStorage.setItem(TOKEN_KEY, demoToken);
        await AsyncStorage.setItem(USER_KEY, JSON.stringify(demo.user));
        return;
      }
      throw new Error("Network error — check your connection or use a demo account.");
    }
    if (!res.ok) {
      let msg = `Login failed (${res.status})`;
      try { const e = await res.json(); msg = e.message || msg; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  };

  const register = async (name: string, phone: string, pin: string, district: string) => {
    const baseUrl = getApiUrl();
    const url = new URL("/api/auth/register", baseUrl);
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, pin, district }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Registration failed" }));
      throw new Error(err.message || "Registration failed");
    }
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  };

  const logout = async () => {
    try {
      if (token) {
        const baseUrl = getApiUrl();
        const url = new URL("/api/auth/logout", baseUrl);
        await fetch(url.toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    setUser(null);
    setToken(null);
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoading,
      login,
      register,
      logout,
      isAdmin: user?.role === "admin" || user?.role === "super_admin",
      isSuperAdmin: user?.role === "super_admin",
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
