import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/query-client";
import { getSecure, setSecure, deleteSecure } from "@/lib/secure-session";

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

// M13/M6: no hard-coded offline accounts. Demo accounts exist only on a server running DEMO_MODE=true.

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          getSecure(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          try {
            const baseUrl = getApiUrl();
            const validateRes = await fetch(new URL("/api/auth/me", baseUrl).toString(), {
              headers: { Authorization: `Bearer ${storedToken}` },
            });
            if (validateRes.ok) {
              const fresh = await validateRes.json();
              setToken(storedToken);
              setUser(fresh);
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
            } else if (validateRes.status === 401) {
              await deleteSecure(TOKEN_KEY);
              await AsyncStorage.removeItem(USER_KEY);
            } else {
              setToken(storedToken);
              setUser(JSON.parse(storedUser));
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
    } catch {
      throw new Error("Network error — check your connection and try again.");
    }
    if (!res.ok) {
      let msg = `Login failed (${res.status})`;
      try { const e = await res.json(); msg = e.message || msg; } catch {}
      throw new Error(msg);
    }
    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    await setSecure(TOKEN_KEY, data.token);
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
    await setSecure(TOKEN_KEY, data.token);
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
    await deleteSecure(TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
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
