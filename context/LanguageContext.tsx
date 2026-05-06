import React, { createContext, useContext, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Lang = "en" | "hi";

export const TRANSLATIONS = {
  en: {
    // Navigation
    dashboard: "Dashboard",
    complaints: "Complaints",
    sos: "SOS",
    map: "Map",
    analytics: "Analytics",
    profile: "Profile",
    // Auth
    signIn: "Sign In",
    createAccount: "Create Account",
    phone: "Phone Number",
    pin: "PIN",
    name: "Full Name",
    register: "Register",
    logout: "Sign Out",
    // Dashboard
    commandCenter: "Command Center",
    civicHealth: "Civic Health",
    activeAlerts: "Active Alerts",
    todayComplaints: "Today's Reports",
    pendingIssues: "Pending Issues",
    resolved: "Resolved",
    aiEngine: "AI Engine",
    liveStatus: "LIVE",
    // Complaints
    submitComplaint: "File a Complaint",
    category: "Category",
    description: "Description",
    location: "Location",
    priority: "Priority",
    submit: "Submit",
    upvote: "Upvote",
    addProof: "Add Proof",
    rateResolution: "Rate Resolution",
    confirmResolution: "Confirm Resolved",
    rejectResolution: "Reject — Reopen",
    // SOS
    sosEmergency: "SOS Emergency",
    triggerSOS: "TRIGGER SOS",
    nearestPolice: "Nearest Police Station",
    distance: "Distance",
    category_gas_leak: "Gas Leak",
    category_water_burst: "Water Burst",
    category_electric_hazard: "Electric Hazard",
    category_fire_risk: "Fire Risk",
    category_road_accident: "Road Accident",
    category_infrastructure: "Infrastructure",
    category_women_safety: "Women Safety",
    category_medical: "Medical",
    // Map
    mapTitle: "Live City Map",
    complaints_map: "Complaints",
    workers_map: "Workers",
    police_map: "Police",
    riskZones: "Risk Zones",
    // Status
    pending: "Pending",
    in_progress: "In Progress",
    status_resolved: "Resolved",
    closed: "Closed",
    // Gamification
    points: "Points",
    badges: "Badges",
    level: "Level",
    leaderboard: "Leaderboard",
    yourRank: "Your Rank",
    // Admin
    warRoom: "War Room",
    emergencyMode: "Emergency Mode",
    workers: "Workers",
    reports: "Reports",
    alerts: "Alerts",
    // Misc
    loading: "Loading...",
    error: "Error",
    retry: "Retry",
    cancel: "Cancel",
    confirm: "Confirm",
    back: "Back",
  },
  hi: {
    // Navigation
    dashboard: "डैशबोर्ड",
    complaints: "शिकायतें",
    sos: "आपातकाल",
    map: "मानचित्र",
    analytics: "विश्लेषण",
    profile: "प्रोफ़ाइल",
    // Auth
    signIn: "साइन इन",
    createAccount: "खाता बनाएं",
    phone: "फ़ोन नंबर",
    pin: "पिन",
    name: "पूरा नाम",
    register: "पंजीकरण",
    logout: "साइन आउट",
    // Dashboard
    commandCenter: "कमांड सेंटर",
    civicHealth: "नागरिक स्वास्थ्य",
    activeAlerts: "सक्रिय अलर्ट",
    todayComplaints: "आज की रिपोर्ट",
    pendingIssues: "लंबित मुद्दे",
    resolved: "हल किया गया",
    aiEngine: "AI इंजन",
    liveStatus: "लाइव",
    // Complaints
    submitComplaint: "शिकायत दर्ज करें",
    category: "श्रेणी",
    description: "विवरण",
    location: "स्थान",
    priority: "प्राथमिकता",
    submit: "जमा करें",
    upvote: "समर्थन",
    addProof: "प्रमाण जोड़ें",
    rateResolution: "समाधान रेटिंग",
    confirmResolution: "हल हुआ पुष्टि करें",
    rejectResolution: "अस्वीकार — पुनः खोलें",
    // SOS
    sosEmergency: "आपातकालीन SOS",
    triggerSOS: "SOS भेजें",
    nearestPolice: "निकटतम पुलिस स्टेशन",
    distance: "दूरी",
    category_gas_leak: "गैस रिसाव",
    category_water_burst: "पाइप फटना",
    category_electric_hazard: "बिजली खतरा",
    category_fire_risk: "आग का खतरा",
    category_road_accident: "सड़क दुर्घटना",
    category_infrastructure: "संरचना",
    category_women_safety: "महिला सुरक्षा",
    category_medical: "चिकित्सा",
    // Map
    mapTitle: "लाइव शहर मानचित्र",
    complaints_map: "शिकायतें",
    workers_map: "कार्यकर्ता",
    police_map: "पुलिस",
    riskZones: "जोखिम क्षेत्र",
    // Status
    pending: "प्रतीक्षारत",
    in_progress: "जारी है",
    status_resolved: "हल हुआ",
    closed: "बंद",
    // Gamification
    points: "अंक",
    badges: "बैज",
    level: "स्तर",
    leaderboard: "लीडरबोर्ड",
    yourRank: "आपकी रैंक",
    // Admin
    warRoom: "वॉर रूम",
    emergencyMode: "आपातकाल मोड",
    workers: "कार्यकर्ता",
    reports: "रिपोर्ट",
    alerts: "अलर्ट",
    // Misc
    loading: "लोड हो रहा है...",
    error: "त्रुटि",
    retry: "पुनः प्रयास",
    cancel: "रद्द करें",
    confirm: "पुष्टि करें",
    back: "वापस",
  },
} as const;

type TranslationKey = keyof typeof TRANSLATIONS.en;

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LangContext = createContext<LangContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem("@sankalp_lang", l).catch(() => {});
  };

  const t = (key: TranslationKey): string => TRANSLATIONS[lang][key] as string;

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
