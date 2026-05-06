import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";

/**
 * Gets the base URL for the Express API server
 */
export function getWsUrl(): string {
  // Browser — always use same host (works in dev and prod)
  if (typeof window !== "undefined") {
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${window.location.host}/ws`;
  }
  // Native Expo app — use explicit domain
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `wss://${process.env.EXPO_PUBLIC_DOMAIN}/ws`;
  }
  return "ws://localhost:5000/ws";
}

export function getApiUrl(): string {
  // Browser context — always use same origin so dev & prod work without config
  if (typeof window !== "undefined") {
    return window.location.origin + "/";
  }

  // Native Expo app — use explicit domain (required for Expo Go)
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}/`;
  }

  const host =
    (Constants.expoConfig as any)?.extra?.EXPO_PUBLIC_DOMAIN ??
    (Constants.manifest as any)?.extra?.EXPO_PUBLIC_DOMAIN;

  if (host) {
    return `https://${host}/`;
  }

  return "http://localhost:5000/";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await globalThis.fetch(url.toString(), {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

export const getQueryFn =
  <T>({ on401 }: { on401: UnauthorizedBehavior }): QueryFunction<T> =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await globalThis.fetch(url.toString());

    if (on401 === "returnNull" && res.status === 401) {
      return null as T;
    }

    await throwIfResNotOk(res);
    return (await res.json()) as T;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
