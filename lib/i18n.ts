import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import hi from "../locales/hi.json";
import gbm from "../locales/gbm.json";
import kfy from "../locales/kfy.json";

/**
 * P5.4 i18n. Strings live in locales/<code>.json (keys from en.json). Missing keys fall back to Hindi, then English.
 * Garhwali (gbm) and Kumaoni (kfy) are marked needs_review (locales/meta.json) until native speakers sign off.
 */
export type Lang = "en" | "hi" | "gbm" | "kfy";
export type Key = keyof typeof en;
const TABLES: Record<Lang, Partial<Record<Key, string>>> = { en, hi, gbm, kfy };
export const LANGUAGES: Array<{ code: Lang; native: string; label: string; needsReview?: boolean }> = [
  { code: "en", native: "English", label: "English" },
  { code: "hi", native: "हिंदी", label: "Hindi" },
  { code: "gbm", native: "गढ़वळि", label: "Garhwali", needsReview: true },
  { code: "kfy", native: "कुमाउँनी", label: "Kumaoni", needsReview: true },
];

const STORAGE_KEY = "app_language";
let current: Lang = "en";
const listeners = new Set<(l: Lang) => void>();

const normalise = (v: string | null): Lang | null => {
  const x = (v ?? "").toLowerCase();
  return x === "en" || x === "hi" || x === "gbm" || x === "kfy" ? x : null; // also accepts the old "EN"/"HI" values
};

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const raw = TABLES[current][key] ?? TABLES.hi[key] ?? en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export const getLanguage = () => current;

export async function setLanguage(l: Lang) {
  current = l;
  listeners.forEach(fn => fn(l));
  try { await AsyncStorage.setItem(STORAGE_KEY, l); } catch { /* best effort */ }
}

export async function loadLanguage() {
  try {
    const v = normalise(await AsyncStorage.getItem(STORAGE_KEY));
    if (v && v !== current) await setLanguage(v);
  } catch { /* default en */ }
}

/** Re-renders the component when the language changes. */
export function useI18n() {
  const [lang, setLang] = useState<Lang>(current);
  useEffect(() => {
    listeners.add(setLang);
    void loadLanguage();
    return () => { listeners.delete(setLang); };
  }, []);
  return { lang, t, setLanguage };
}
