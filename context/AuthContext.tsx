import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import { getSecure, setSecure, deleteSecure } from "@/lib/secure-session";

export type UserRole = "citizen" | "worker" | "officer" | "dept_admin" | "district_admin" | "admin" | "police" | "state_admin" | "super_admin";

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
  /** Phone OTP sign-in (P1.5): request a code, then verify (name/district needed for new numbers). */
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string, name?: string, district?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Exchange the refresh token for a new access token. Returns the new token or null (then the user is signed out). */
  refreshSession: () => Promise<string | null>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "@sankalp_token";
const REFRESH_KEY = "@sankalp_refresh";
const USER_KEY = "@sankalp_user";
/** Access tokens live 15 minutes; renew a little earlier. */
const REFRESH_EVERY_MS = 12 * 60 * 1000;

// No hard-coded offline accounts. Demo accounts exist only on a server running DEMO_MODE=true.

interface SessionPayload { user: AuthUser; token: string; refreshToken?: string }

async function postJson(path: string, body: unknown, token?: string | null): Promise<Response> {
  return fetch(new URL(path, getApiUrl()).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try { const e = await res.json(); return e.message || fallback; } catch { return fallback; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const refreshing = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(async () => {
    setUser(null);
    setToken(null);
    await deleteSecure(TOKEN_KEY);
    await deleteSecure(REFRESH_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  }, []);

  const saveSession = useCallback(async (data: SessionPayload) => {
    setUser(data.user);
    setToken(data.token);
    await setSecure(TOKEN_KEY, data.token);
    if (data.refreshToken) await setSecure(REFRESH_KEY, data.refreshToken);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }, []);

  const refreshSession = useCallback(async (): Promise<string | null> => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      const rt = await getSecure(REFRESH_KEY);
      if (!rt) return null;
      try {
        const res = await postJson("/api/auth/refresh", { refreshToken: rt });
        if (res.status === 401) { await clearSession(); return null; }
        if (!res.ok) return null; // server unreachable: keep the current session (SOS still works within the grace window)
        const data = (await res.json()) as SessionPayload;
        await saveSession(data);
        return data.token;
      } catch {
        return null;
      }
    })();
    try { return await refreshing.current; } finally { refreshing.current = null; }
  }, [clearSession, saveSession]);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([getSecure(TOKEN_KEY), AsyncStorage.getItem(USER_KEY)]);
        if (storedToken && storedUser) {
          try {
            let active = storedToken;
            let res = await fetch(new URL("/api/auth/me", getApiUrl()).toString(), { headers: { Authorization: `Bearer ${active}` } });
            if (res.status === 401) {
              const renewed = await refreshSession();
              if (renewed) {
                active = renewed;
                res = await fetch(new URL("/api/auth/me", getApiUrl()).toString(), { headers: { Authorization: `Bearer ${active}` } });
              }
            }
            if (res.ok) {
              const fresh = await res.json();
              setToken(active);
              setUser(fresh);
              await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
            } else if (res.status === 401) {
              await clearSession();
            } else {
              setToken(active);
              setUser(JSON.parse(storedUser));
            }
          } catch {
            // Offline: keep the stored session so SOS can still be attempted.
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
          }
        }
      } catch {}
      setIsLoading(false);
    })();
  }, [refreshSession, clearSession]);

  // Keep the short-lived access token fresh while the app is open.
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => { void refreshSession(); }, REFRESH_EVERY_MS);
    // Timers do not run while the app is backgrounded: refresh as soon as it returns (review P1-H4).
    const sub = AppState.addEventListener("change", st => { if (st === "active") void refreshSession(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [token, refreshSession]);

  const login = async (phone: string, pin: string) => {
    let res: Response;
    try {
      res = await postJson("/api/auth/login", { phone, pin });
    } catch {
      throw new Error("Network error — check your connection and try again.");
    }
    if (!res.ok) throw new Error(await errorMessage(res, `Login failed (${res.status})`));
    await saveSession(await res.json());
  };

  const register = async (name: string, phone: string, pin: string, district: string) => {
    const res = await postJson("/api/auth/register", { name, phone, pin, district });
    if (!res.ok) throw new Error(await errorMessage(res, "Registration failed"));
    await saveSession(await res.json());
  };

  const requestOtp = async (phone: string) => {
    const res = await postJson("/api/auth/otp/request", { phone });
    if (!res.ok) throw new Error(await errorMessage(res, "Could not send the code"));
  };

  const verifyOtp = async (phone: string, code: string, name?: string, district?: string) => {
    const res = await postJson("/api/auth/otp/verify", { phone, code, ...(name ? { name } : {}), ...(district ? { district } : {}) });
    if (!res.ok) throw new Error(await errorMessage(res, "Invalid or expired code"));
    await saveSession(await res.json());
  };

  const logout = async () => {
    try {
      const refreshToken = (await getSecure(REFRESH_KEY)) || undefined;
      if (token || refreshToken) await postJson("/api/auth/logout", { refreshToken }, token);
    } catch {}
    await clearSession();
  };

  const isAdmin = !!user && ["admin", "district_admin", "state_admin", "super_admin"].includes(user.role);

  return (
    <AuthContext.Provider value={{
      user, token, isLoading, login, register, requestOtp, verifyOtp, logout, refreshSession,
      isAdmin,
      isSuperAdmin: user?.role === "super_admin" || user?.role === "state_admin",
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
