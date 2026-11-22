import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import en from "../locales/en.json";
import hi from "../locales/hi.json";
import gbm from "../locales/gbm.json";
import kfy from "../locales/kfy.json";
import ta from "../locales/ta.json";
import te from "../locales/te.json";
import bn from "../locales/bn.json";
import mr from "../locales/mr.json";
import gu from "../locales/gu.json";
import kn from "../locales/kn.json";
import ml from "../locales/ml.json";
import pa from "../locales/pa.json";
import or from "../locales/or.json";
import as_ from "../locales/as.json";

/**
 * P5.4 i18n. Strings live in locales/<code>.json (keys from en.json). Missing keys fall back to Hindi, then English.
 * Every language except en/hi is marked needs_review (locales/meta.json) until native speakers sign off.
 */
export type Lang = "en" | "hi" | "gbm" | "kfy" | "ta" | "te" | "bn" | "mr" | "gu" | "kn" | "ml" | "pa" | "or" | "as";
export type Key = keyof typeof en;
const TABLES: Record<Lang, Partial<Record<Key, string>>> = { en, hi, gbm, kfy, ta, te, bn, mr, gu, kn, ml, pa, or, as: as_ };
export const LANGUAGES: Array<{ code: Lang; native: string; label: string; needsReview?: boolean }> = [
  { code: "en", native: "English", label: "English" },
  { code: "hi", native: "हिंदी", label: "Hindi" },
  { code: "gbm", native: "गढ़वळि", label: "Garhwali", needsReview: true },
  { code: "kfy", native: "कुमाउँनी", label: "Kumaoni", needsReview: true },
  { code: "ta", native: "தமிழ்", label: "Tamil", needsReview: true },
  { code: "te", native: "తెలుగు", label: "Telugu", needsReview: true },
  { code: "bn", native: "বাংলা", label: "Bengali", needsReview: true },
  { code: "mr", native: "मराठी", label: "Marathi", needsReview: true },
  { code: "gu", native: "ગુજરાતી", label: "Gujarati", needsReview: true },
  { code: "kn", native: "ಕನ್ನಡ", label: "Kannada", needsReview: true },
  { code: "ml", native: "മലയാളം", label: "Malayalam", needsReview: true },
  { code: "pa", native: "ਪੰਜਾਬੀ", label: "Punjabi", needsReview: true },
  { code: "or", native: "ଓଡ଼ିଆ", label: "Odia", needsReview: true },
  { code: "as", native: "অসমীয়া", label: "Assamese", needsReview: true },
];

const STORAGE_KEY = "app_language";
let current: Lang = "en";
const listeners = new Set<(l: Lang) => void>();

const normalise = (v: string | null): Lang | null => {
  const x = (v ?? "").toLowerCase();
  return (Object.keys(TABLES) as Lang[]).includes(x as Lang) ? (x as Lang) : null; // also accepts the old "EN"/"HI" values
};

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  // Garhwali/Kumaoni drafts fall back to Hindi; every other language falls back to English.
  const raw = TABLES[current][key] ?? (current === "gbm" || current === "kfy" ? TABLES.hi[key] : undefined) ?? en[key] ?? key;
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
