import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Platform, Animated, RefreshControl, Modal, Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { NotificationBell } from "@/components/NotificationBell";

const CATEGORY_META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  pothole:     { label: "Pothole",     icon: "alert-circle",        color: "#F59E0B", bg: "#FFF8E7" },
  garbage:     { label: "Garbage",     icon: "trash",               color: "#EF4444", bg: "#FEF2F2" },
  streetlight: { label: "Streetlight", icon: "bulb",                color: "#F59E0B", bg: "#FFF8E7" },
  water:       { label: "Water",       icon: "water",               color: "#3B82F6", bg: "#EFF6FF" },
  drain:       { label: "Drain",       icon: "git-network",         color: "#06B6D4", bg: "#F0FDFF" },
  electricity: { label: "Electricity", icon: "flash",               color: "#8B5CF6", bg: "#F5F3FF" },
  tree:        { label: "Tree",        icon: "leaf",                color: "#00A651", bg: "#F0FFF4" },
  other:       { label: "Other",       icon: "ellipsis-horizontal", color: "#6B7280", bg: "#F9FAFB" },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: "Pending",     color: "#F59E0B", bg: "#FFF8E7" },
  in_progress: { label: "In Progress", color: "#3B82F6", bg: "#EFF6FF" },
  resolved:    { label: "Resolved",    color: "#00A651", bg: "#F0FFF4" },
  closed:      { label: "Closed",      color: "#6B7280", bg: "#F9FAFB" },
};

const UK_NEWS = [
  {
    id: "n1", tag: "GOVERNMENT", headline: "CM launches ₹2,000 Cr Char Dham Road Widening Project", time: "2h ago",
    icon: "car-outline" as const, color: "#3B82F6", bg: "#EFF6FF",
    source: "Uttarakhand Govt Press Release", readTime: "3 min read",
    body: "Chief Minister Pushkar Singh Dhami today inaugurated the ambitious ₹2,000 crore Char Dham Road Widening Project, aimed at improving all-weather connectivity to Badrinath, Kedarnath, Gangotri, and Yamunotri — the four sacred pilgrimage destinations of Uttarakhand.\n\nThe project will widen approximately 825 km of national highways to four lanes, incorporating modern safety features including crash barriers, proper drainage systems, and retaining walls. The work is expected to be completed before the 2027 Char Dham Yatra season.\n\nKey highlights:\n• ₹2,000 crore total project cost\n• 825 km of highway widening across 4 routes\n• 15,000 local employment opportunities created\n• Covers Rishikesh-Rudraprayag, Rishikesh-Gangotri, Rishikesh-Yamunotri, and Rudraprayag-Badrinath routes\n• Estimated 5 lakh additional pilgrims per year benefiting\n\nThe CM urged contractors to ensure quality construction and maintain zero tolerance for sub-standard materials. NHAI officials confirmed that 40% of the work has already been completed.",
  },
  {
    id: "n2", tag: "ENVIRONMENT", headline: "Uttarakhand ranks 1st in India for forest cover increase 2025", time: "5h ago",
    icon: "leaf" as const, color: "#22C55E", bg: "#F0FFF4",
    source: "Forest Survey of India (FSI)", readTime: "2 min read",
    body: "The Forest Survey of India's latest report has ranked Uttarakhand as the top-performing state in India for forest cover increase in 2025. The state added 1,200 sq km of forest cover in a single year — a historic achievement.\n\nThe 'Mission Vriksharopan' initiative, launched under the state's green economy plan, involved planting 35 crore saplings across 13 districts. More than 8 lakh citizens participated in the plantation drive.\n\nKey findings:\n• Forest cover increased from 71.2% to 73.8% of total geographical area\n• 1,200 sq km new forest area added in 2024-25\n• 35 crore saplings planted under Mission Vriksharopan\n• Van Panchayats (community forests) now cover 12,089 villages\n• ₹450 crore allocated for forest protection and fire prevention\n\nForest Department officials noted that community participation played a crucial role, with 8 lakh residents enrolled as 'Van Mitras'. Uttarakhand is now targeting 75% forest cover by 2030.",
  },
  {
    id: "n3", tag: "SAFETY", headline: "New 112 emergency centers opened in Pithoragarh & Champawat", time: "1d ago",
    icon: "shield-checkmark" as const, color: "#8B5CF6", bg: "#F5F3FF",
    source: "Uttarakhand Police Headquarters", readTime: "2 min read",
    body: "Two new 112 emergency response centers have been inaugurated in Pithoragarh and Champawat districts, significantly improving emergency response times in the remote hill districts of eastern Uttarakhand.\n\nThe centers are equipped with state-of-the-art dispatch systems, GPS-tracked patrol vehicles, and trained personnel available 24/7. Response time is expected to drop from the current average of 28 minutes to under 12 minutes.\n\nCenter features:\n• 24/7 dispatch center with 15 trained operators each\n• Fleet of 8 GPS-equipped emergency response vehicles per center\n• Direct integration with district hospitals and fire stations\n• Women's helpline 1090 routed through the centers\n• Mountain rescue equipment for remote terrain emergencies\n• Real-time SANKALP AI integration for complaint tracking\n\nThe centers will serve a combined population of approximately 3.5 lakh residents across the two border districts. The DGP confirmed plans to open 4 more centers in Chamoli, Rudraprayag, Uttarkashi, and Bageshwar by June 2026.",
  },
  {
    id: "n4", tag: "INFRASTRUCTURE", headline: "Rishikesh-Karnaprayag rail project 62% complete, on track for 2026", time: "1d ago",
    icon: "train-outline" as const, color: "#F59E0B", bg: "#FFFBEB",
    source: "National Capital Region Transport Corporation", readTime: "3 min read",
    body: "The Rishikesh-Karnaprayag Railway Project, one of India's most challenging infrastructure endeavors, has crossed the 62% completion mark and remains on track for its 2026 deadline. The project will be a game-changer for Uttarakhand's connectivity and pilgrimage tourism.\n\nThe 125 km rail line passes through extremely difficult Himalayan terrain with 17 tunnels totalling 105 km — making it one of the most tunnel-intensive railway projects in the world.\n\nProject highlights:\n• Total length: 125 km (Rishikesh to Karnaprayag)\n• 17 tunnels totalling 105 km — world record density\n• 35 stations across 5 districts\n• ₹16,216 crore total project cost\n• Travel time: 3.5 hours vs current 8+ hours by road\n• Will serve as base for Char Dham connectivity extension\n• Estimated to boost Uttarakhand's GDP by ₹8,000 crore annually\n\nWith 62% construction complete, NCRTC officials expressed confidence in the 2026 deadline. Once operational, the train will run at 100 km/h even through mountain terrain, connecting Devprayag, Srinagar, Rudraprayag, and Gauchar.",
  },
  {
    id: "n5", tag: "HEALTH", headline: "50 mobile health vans deployed to remote hill districts of UK", time: "2d ago",
    icon: "medkit" as const, color: "#EF4444", bg: "#FEF2F2",
    source: "Uttarakhand Health Department", readTime: "2 min read",
    body: "The state government has deployed 50 new mobile health vans under the 'Mukhyamantri Svastha Uttarakhand' initiative, targeting the most remote and medically underserved villages in the hill districts.\n\nEach van is equipped with essential diagnostic equipment, a trained doctor, nurse, and pharmacist, with the ability to conduct basic surgeries and deliver emergency care. The vans are specially designed for mountain terrain and can navigate even unpaved village roads.\n\nVan specifications:\n• Equipped with: ECG machine, ultrasound, X-ray portable unit\n• Carries 3 months' medicine supply including emergency drugs\n• Each van serves 15-20 villages per month\n• Telemedicine link to AIIMS Rishikesh for specialist consultation\n• Dental chair and vision testing equipment included\n• Ayushman Bharat card scanning for cashless services\n\nDistrict-wise deployment:\n• Pithoragarh: 8 vans (border area priority)\n• Chamoli: 7 vans\n• Uttarkashi: 7 vans  \n• Bageshwar: 6 vans\n• Other districts: 22 vans\n\nThe initiative is expected to benefit 4 lakh residents who currently have to travel 50+ km to reach the nearest hospital.",
  },
  {
    id: "n6", tag: "DISASTER", headline: "SDRF teams on alert: Pre-monsoon preparedness drive begins", time: "2d ago",
    icon: "warning" as const, color: "#6B7280", bg: "#F9FAFB",
    source: "State Disaster Response Force, Uttarakhand", readTime: "2 min read",
    body: "The State Disaster Response Force (SDRF) has launched its annual pre-monsoon preparedness drive across all 13 districts, with teams on heightened alert ahead of the June-September monsoon season. Uttarakhand receives some of India's heaviest rainfall and is highly susceptible to landslides, flash floods, and glacial lake outburst floods (GLOFs).\n\nThis year, NDRF has also deployed additional battalions to the state following the 2023 and 2024 incidents in Joshimath and Kedarnath.\n\nPreparedness measures:\n• 24 SDRF teams (1,200 personnel) deployed across 13 districts\n• 2 NDRF battalions stationed in Dehradun and Haridwar\n• 48 disaster control rooms activated\n• Early warning systems upgraded with AI-based flood prediction\n• 850 vulnerable villages identified and evacuation routes mapped\n• 45 relief camps with 2 lakh person capacity readied\n• SANKALP AI SOS system integrated with SDRF dispatch\n\nHigh-risk districts include: Chamoli, Uttarkashi, Rudraprayag, Pithoragarh, and Bageshwar. Residents in these areas are urged to download the SANKALP AI app and enable SOS notifications.\n\nHelpline: 1070 (State Emergency Operations Center) · Operational 24x7",
  },
];

const SCHEMES_DATA = [
  {
    key: "swarojgar",
    title: "CM Swarojgar Yojana",
    sub: "Self-employment loans for hill residents",
    tag: "EMPLOYMENT",
    color: "#3B82F6",
    icon: "briefcase" as const,
    fullTitle: "Mukhyamantri Swarojgar Yojana — Uttarakhand",
    tagline: "Empowering mountain entrepreneurs with financial support",
    eligibility: [
      "Uttarakhand resident aged 18–45 years",
      "Annual household income below ₹3 lakh",
      "Valid Aadhaar card and bank account mandatory",
      "Preference given to residents of hilly/remote areas",
      "Can be a first-time or existing entrepreneur",
    ],
    benefits: [
      "Subsidy of 25% on loans up to ₹2 lakh (₹50,000 max subsidy)",
      "Loan available from ₹25,000 to ₹10 lakh",
      "Covers manufacturing, services, trading and agriculture sectors",
      "Special relaxation for SC/ST/women/ex-servicemen applicants",
      "No collateral required for loans up to ₹1 lakh",
    ],
    howToApply: "Visit District Industries Centre (DIC) in your district or apply online at cm.uk.gov.in. Required documents: Aadhaar, bank passbook, income certificate, project report, residence proof.",
    helpline: "1905",
    website: "cm.uk.gov.in",
  },
  {
    key: "ayushman",
    title: "Ayushman Bharat",
    sub: "₹5 lakh health coverage per family",
    tag: "HEALTH",
    color: "#EF4444",
    icon: "medkit" as const,
    fullTitle: "Ayushman Bharat — Pradhan Mantri Jan Arogya Yojana (AB-PMJAY)",
    tagline: "World's largest government-funded health assurance scheme",
    eligibility: [
      "Identified as beneficiary per SECC-2011 census data",
      "Must be from rural deprived families or urban occupational categories",
      "No cap on family size or age",
      "Existing illness (pre-conditions) are also covered",
      "Not having any existing health insurance from Govt",
    ],
    benefits: [
      "₹5 lakh annual health coverage per family — fully cashless",
      "Covers 1,500+ hospital procedures including cancer, heart surgery, dialysis",
      "Empanelled with AIIMS Rishikesh, Doon Medical College & all district hospitals",
      "No premium payment — 100% government funded",
      "Includes pre and post-hospitalisation costs (3 days before, 15 days after)",
    ],
    howToApply: "Visit nearest Jan Seva Kendra, Uttarakhand or empanelled hospital. Search eligibility at pmjay.gov.in. Carry Aadhaar and ration card. Free Ayushman card issued on-spot.",
    helpline: "14555",
    website: "pmjay.gov.in",
  },
  {
    key: "gaura",
    title: "Gaura Devi Kanya Dhan",
    sub: "₹51,000 grant for girl students",
    tag: "EDUCATION",
    color: "#00A651",
    icon: "school" as const,
    fullTitle: "Gaura Devi Kanya Dhan Yojana — Uttarakhand",
    tagline: "Empowering girl children from Uttarakhand's hills",
    eligibility: [
      "Girl student who has passed Class 12 from Uttarakhand board",
      "Family annual income below ₹72,000 (rural) or ₹96,000 (urban)",
      "Must be an unmarried Uttarakhand resident",
      "SC/ST girls get additional preference",
      "Must have Aadhaar-linked bank account",
    ],
    benefits: [
      "₹51,000 fixed deposit in beneficiary's name",
      "FD matures when the girl turns 21 years of age",
      "Can be used for higher education or marriage expenses",
      "Motivates families to educate girl children",
      "Helps reduce child marriage in hill districts",
    ],
    howToApply: "Apply through the school principal or block education officer (BEO) in your district. Form available at samajkalyan.uk.gov.in. Required: Class 12 marksheet, Aadhaar, bank passbook, income certificate.",
    helpline: "0135-2669764",
    website: "samajkalyan.uk.gov.in",
  },
  {
    key: "paryatan",
    title: "Veer CS Garhwali Yojana",
    sub: "Eco-tourism homestay grants",
    tag: "TOURISM",
    color: "#8B5CF6",
    icon: "home" as const,
    fullTitle: "Veer Chandra Singh Garhwali Paryatan Vikas Yojana",
    tagline: "Develop Uttarakhand villages as eco-tourism destinations",
    eligibility: [
      "Any Uttarakhand resident owning a home in rural/hilly area",
      "Property must be habitable with basic amenities",
      "Willing to register as a homestay with UK Tourism",
      "Preference for SC/ST/women/ex-servicemen",
      "Must complete homestay training from UK Tourism",
    ],
    benefits: [
      "Grant of ₹5 lakh for homestay development",
      "Annual subsidy of ₹30,000 for 3 years after registration",
      "Listed on uttarakhandtourism.gov.in for tourist bookings",
      "Free training in hospitality, cuisine and local culture",
      "Income through tourism: ₹1,500–₹3,000 per tourist per night",
    ],
    howToApply: "Apply at District Tourism Development Officer's office or online at uttarakhandtourism.gov.in. Required: Land documents, house photos, Aadhaar, bank passbook. Visit Itbp Road, Dehradun for more info.",
    helpline: "1364",
    website: "uttarakhandtourism.gov.in",
  },
];

function PulsingDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.6, duration: 700, useNativeDriver: false }),
      Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: false }),
    ])).start();
  }, []);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, transform: [{ scale }] }} />;
}

function HealthBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 1200, delay: 300, useNativeDriver: false }).start();
  }, [pct]);
  return (
    <View style={{ height: 8, backgroundColor: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
      <Animated.View style={{
        height: 8, borderRadius: 4, backgroundColor: color,
        width: anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) as any,
      }} />
    </View>
  );
}

function SchemeModal({ scheme, onClose }: { scheme: typeof SCHEMES_DATA[0] | null; onClose: () => void }) {
  if (!scheme) return null;
  return (
    <Modal visible animationType="slide" transparent>
      <View style={ms.overlay}>
        <Pressable style={ms.backdrop} onPress={onClose} />
        <View style={ms.card}>
          <View style={ms.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Header */}
            <LinearGradient colors={[scheme.color + "22", scheme.color + "08"]} style={ms.header}>
              <View style={[ms.headerIcon, { backgroundColor: scheme.color + "18", borderColor: scheme.color + "30" }]}>
                <Ionicons name={scheme.icon} size={28} color={scheme.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={[ms.tagPill, { backgroundColor: scheme.color + "18" }]}>
                  <Text style={[ms.tagText, { color: scheme.color }]}>{scheme.tag}</Text>
                </View>
                <Text style={ms.modalTitle}>{scheme.fullTitle}</Text>
                <Text style={ms.modalTagline}>{scheme.tagline}</Text>
              </View>
            </LinearGradient>

            {/* Eligibility */}
            <View style={ms.section}>
              <View style={ms.sectionHeader}>
                <View style={[ms.sectionIcon, { backgroundColor: "#FFF8E7" }]}>
                  <Ionicons name="person-circle" size={16} color="#F59E0B" />
                </View>
                <Text style={ms.sectionTitle}>Who Can Apply?</Text>
              </View>
              {scheme.eligibility.map((e, i) => (
                <View key={i} style={ms.bullet}>
                  <View style={[ms.bulletDot, { backgroundColor: scheme.color }]} />
                  <Text style={ms.bulletText}>{e}</Text>
                </View>
              ))}
            </View>

            {/* Benefits */}
            <View style={ms.section}>
              <View style={ms.sectionHeader}>
                <View style={[ms.sectionIcon, { backgroundColor: "#F0FFF4" }]}>
                  <Ionicons name="gift" size={16} color="#00A651" />
                </View>
                <Text style={ms.sectionTitle}>Key Benefits</Text>
              </View>
              {scheme.benefits.map((b, i) => (
                <View key={i} style={ms.bullet}>
                  <Ionicons name="checkmark-circle" size={16} color="#00A651" />
                  <Text style={ms.bulletText}>{b}</Text>
                </View>
              ))}
            </View>

            {/* How to Apply */}
            <View style={ms.section}>
              <View style={ms.sectionHeader}>
                <View style={[ms.sectionIcon, { backgroundColor: "#EFF6FF" }]}>
                  <Ionicons name="document-text" size={16} color="#3B82F6" />
                </View>
                <Text style={ms.sectionTitle}>How to Apply</Text>
              </View>
              <View style={[ms.howBox, { borderLeftColor: scheme.color }]}>
                <Text style={ms.howText}>{scheme.howToApply}</Text>
              </View>
            </View>

            {/* Contact */}
            <View style={ms.contactRow}>
              <Pressable style={[ms.contactBtn, { backgroundColor: scheme.color + "12", borderColor: scheme.color + "30" }]}
                onPress={() => Linking.openURL(`tel:${scheme.helpline}`)}>
                <Ionicons name="call" size={18} color={scheme.color} />
                <Text style={[ms.contactBtnText, { color: scheme.color }]}>Helpline: {scheme.helpline}</Text>
              </Pressable>
              <Pressable style={[ms.contactBtn, { backgroundColor: "#F9FAFB", borderColor: "#E5E7EB" }]}
                onPress={() => Linking.openURL(`https://${scheme.website}`)}>
                <Ionicons name="globe" size={18} color="#6B7280" />
                <Text style={[ms.contactBtnText, { color: "#6B7280" }]}>Website</Text>
              </Pressable>
            </View>

            <Pressable style={ms.closeBtn} onPress={onClose}>
              <Text style={ms.closeBtnText}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function NewsDetailModal({ news, onClose }: { news: any; onClose: () => void }) {
  if (!news) return null;
  return (
    <Modal visible animationType="slide" transparent>
      <View style={ms.overlay}>
        <Pressable style={ms.backdrop} onPress={onClose} />
        <View style={ms.card}>
          <View style={ms.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <LinearGradient colors={[news.color + "22", news.color + "08"]} style={ms.header}>
              <View style={[ms.headerIcon, { backgroundColor: news.color + "18", borderColor: news.color + "30" }]}>
                <Ionicons name={news.icon} size={28} color={news.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <View style={[ms.tagPill, { backgroundColor: news.color + "18" }]}>
                    <Text style={[ms.tagText, { color: news.color }]}>{news.tag}</Text>
                  </View>
                  <Text style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular" }}>{news.readTime}</Text>
                </View>
                <Text style={ms.modalTitle}>{news.headline}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <Ionicons name="newspaper-outline" size={12} color="#9CA3AF" />
                  <Text style={ms.modalTagline}>{news.source} · {news.time}</Text>
                </View>
              </View>
            </LinearGradient>
            <View style={ms.section}>
              <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 }}>{news.body}</Text>
            </View>
            <View style={[ms.contactRow, { flexDirection: "column", gap: 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F0FFF4", borderRadius: 10, padding: 10 }}>
                <Ionicons name="information-circle" size={16} color="#00A651" />
                <Text style={{ flex: 1, color: "#065F46", fontSize: 12, fontFamily: "Inter_500Medium" }}>
                  This article is sourced from official Uttarakhand government press releases and verified news agencies.
                </Text>
              </View>
            </View>
            <Pressable style={ms.closeBtn} onPress={onClose}>
              <Text style={ms.closeBtnText}>Close</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function NoticeModal({ notice, onClose }: { notice: any; onClose: () => void }) {
  if (!notice) return null;
  const date = new Date(notice.createdAt || Date.now());
  const dateStr = date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  return (
    <Modal visible animationType="slide" transparent>
      <View style={ms.overlay}>
        <Pressable style={ms.backdrop} onPress={onClose} />
        <View style={ms.card}>
          <View style={ms.handle} />
          <View style={[ms.header, { flexDirection: "column", gap: 10 }]}>
            {notice.priority === "urgent" && (
              <View style={nm.urgentBanner}>
                <Ionicons name="warning" size={14} color="#DC2626" />
                <Text style={nm.urgentText}>URGENT NOTICE</Text>
              </View>
            )}
            <View style={[ms.tagPill, { backgroundColor: "#FFF8E7" }]}>
              <Text style={[ms.tagText, { color: "#FF9933" }]}>{notice.department?.toUpperCase() || "GOVERNMENT"}</Text>
            </View>
            <Text style={ms.modalTitle}>{notice.title}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="calendar-outline" size={13} color="#9CA3AF" />
              <Text style={ms.modalTagline}>{dateStr}</Text>
            </View>
          </View>
          <View style={ms.section}>
            <Text style={nm.body}>{notice.content || notice.body || "This is an official government notice from the Uttarakhand Administration. Please read carefully and take any required action promptly. For queries, contact your nearest government office or helpline."}</Text>
          </View>
          {notice.actionLabel && (
            <Pressable style={[ms.contactBtn, { backgroundColor: "#FF9933", borderColor: "#FF9933", margin: 16 }]}>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
              <Text style={[ms.contactBtnText, { color: "#fff" }]}>{notice.actionLabel}</Text>
            </Pressable>
          )}
          <Pressable style={ms.closeBtn} onPress={onClose}>
            <Text style={ms.closeBtnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const HI = {
  greeting: (h: number) => h < 12 ? "सुप्रभात" : h < 17 ? "नमस्कार" : "शुभ संध्या",
  liveCmd: "लाइव · उत्तराखंड कमांड सेंटर",
  cityHealth: "शहर स्वास्थ्य स्कोर",
  blocksMonitored: (n: number) => `उत्तराखंड · ${n} क्षेत्र निगरानी में`,
  quickAccess: "त्वरित पहुँच",
  myActivity: "मेरी नागरिक गतिविधि",
  seeAll: "सभी देखें",
  filed: "दर्ज",
  pending: "लंबित",
  resolved: "हल",
  citySos: "SOS अलर्ट",
  todayComplaints: "आज की शिकायतें",
  news: "उत्तराखंड समाचार",
  schemes: "सरकारी योजनाएं",
  notices: "सूचनाएं",
  aiChat: "AI चैट",
  liveMap: "लाइव मानचित्र",
  payBills: "बिल भुगतान",
  sosAlert: "SOS अलर्ट",
  reports: "रिपोर्ट",
  analytics: "विश्लेषण",
  myProfile: "मेरी प्रोफ़ाइल",
  noticesNav: "सूचनाएं",
};

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { complaints, sosAlerts, wards, isLoading, refresh, getStats, announcements, emergencyAlert, clearEmergency } = useApp();
  const { user } = useAuth();

  const headerAnim = useRef(new Animated.Value(0)).current;
  const cardsAnim = useRef(new Animated.Value(0)).current;

  const [selectedScheme, setSelectedScheme] = useState<typeof SCHEMES_DATA[0] | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<any>(null);
  const [selectedNews, setSelectedNews] = useState<typeof UK_NEWS[0] | null>(null);
  const [lang, setLang] = useState<"EN" | "HI">("EN");

  useEffect(() => {
    AsyncStorage.getItem("app_language").then(v => { if (v === "HI" || v === "EN") setLang(v as "EN" | "HI"); });
  }, []);

  const t = useCallback((en: string, hi: string) => lang === "HI" ? hi : en, [lang]);

  const stats = getStats();
  const activeAlerts = sosAlerts.filter(s => s.status === "active");
  const todayComplaints = complaints.filter(c => {
    const d = new Date(c.submittedAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const avgHealth = stats.avgHealth;
  const healthColor = avgHealth >= 70 ? "#00A651" : avgHealth >= 50 ? "#F59E0B" : "#EF4444";
  const total = complaints.length || 1;

  const catBreakdown = Object.entries(CATEGORY_META).map(([key, meta]) => ({
    key, ...meta,
    count: complaints.filter(c => c.category === key).length,
    pct: Math.round((complaints.filter(c => c.category === key).length / total) * 100),
  })).sort((a, b) => b.count - a.count).slice(0, 5);

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(headerAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
      Animated.timing(cardsAnim, { toValue: 1, duration: 700, delay: 100, useNativeDriver: false }),
    ]).start();
  }, []);

  const greet = () => {
    const h = new Date().getHours();
    if (lang === "HI") return HI.greeting(h);
    if (h < 12) return "Good Morning";
    if (h < 17) return "Good Afternoon";
    return "Good Evening";
  };

  const initials = user?.name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <View style={styles.container}>
      <SchemeModal scheme={selectedScheme} onClose={() => setSelectedScheme(null)} />
      <NoticeModal notice={selectedNotice} onClose={() => setSelectedNotice(null)} />
      <NewsDetailModal news={selectedNews} onClose={() => setSelectedNews(null)} />

      <ScrollView
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} tintColor="#FF9933" colors={["#FF9933"]} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 100 }}
      >
        {/* HEADER */}
        <LinearGradient
          colors={["#FF6B00", "#FF9933", "#FFBA5C"]}
          style={[styles.header, { paddingTop: Platform.OS === "web" ? 80 : insets.top + 16 }]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <View style={styles.headerBgCircle1} />
          <View style={styles.headerBgCircle2} />

          <Animated.View style={{ opacity: headerAnim }}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.greeting}>{greet()},</Text>
                <Text style={styles.userName}>{user?.name?.split(" ")[0] || "Citizen"} 👋</Text>
                <View style={styles.livePill}>
                  <PulsingDot color="#fff" />
                  <Text style={styles.liveText}>{t("Live · Uttarakhand Command Center", HI.liveCmd)}</Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                <NotificationBell />
                <Pressable onPress={() => router.push("/(tabs)/profile")} style={styles.avatarBtn}>
                  <Text style={styles.avatarBtnText}>{initials}</Text>
                </Pressable>
                {(user?.role === "admin" || user?.role === "super_admin") && (
                  <Pressable onPress={() => router.push("/admin")} style={styles.adminBtn}>
                    <Ionicons name="shield-checkmark" size={18} color="#FF9933" />
                  </Pressable>
                )}
              </View>
            </View>

            <View style={styles.tricolor}>
              <View style={{ flex: 1, backgroundColor: "#fff", opacity: 0.9 }} />
              <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.4)" }} />
              <View style={{ flex: 1, backgroundColor: "#138808" }} />
            </View>

            <View style={styles.healthCard}>
              <View style={styles.healthCardLeft}>
                <Text style={styles.healthCardLabel}>{t("City Health Score", HI.cityHealth)}</Text>
                <Text style={styles.healthCardSub}>{lang === "HI" ? HI.blocksMonitored(wards.length) : `Uttarakhand · ${wards.length} Blocks Monitored`}</Text>
                <HealthBar pct={avgHealth} color={healthColor} />
              </View>
              <View style={[styles.healthScoreBubble, { borderColor: healthColor + "44" }]}>
                <Text style={[styles.healthScore, { color: healthColor }]}>{avgHealth}</Text>
                <Text style={styles.healthScoreOf}>/100</Text>
              </View>
            </View>
          </Animated.View>
        </LinearGradient>

        {/* SOS ALERT BANNER */}
        {activeAlerts.length > 0 && (
          <Pressable onPress={() => router.push("/(tabs)/sos")} style={styles.sosBanner}>
            <LinearGradient colors={["#7F1D1D", "#DC2626"]} style={styles.sosBannerInner}>
              <View style={styles.sosIconWrap}>
                <Ionicons name="warning" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sosBannerTitle}>{activeAlerts.length} ACTIVE SOS ALERT{activeAlerts.length > 1 ? "S" : ""}</Text>
                <Text style={styles.sosBannerSub}>{activeAlerts[0]?.location} · Tap to respond</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>
        )}

        {/* ADMIN EMERGENCY BROADCAST BANNER */}
        {!!emergencyAlert && (
          <Pressable onPress={clearEmergency} style={{ marginHorizontal: 16, marginTop: 14, borderRadius: 14, overflow: "hidden" }}>
            <LinearGradient colors={["#4C1D95", "#7C3AED", "#6D28D9"]} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 20 }}>🚨</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>
                  ⚡ CITY-WIDE EMERGENCY ALERT
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }} numberOfLines={2}>
                  {emergencyAlert.message}
                </Text>
              </View>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>
        )}

        {/* MY ACTIVITY SECTION */}
        <Animated.View style={{ opacity: cardsAnim, marginHorizontal: 16, marginTop: 14 }}>
          <View style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <View style={styles.activityTitleRow}>
                <View style={[styles.kpiIconWrap, { backgroundColor: "#FFF0E6" }]}>
                  <Ionicons name="person-circle" size={16} color="#FF9933" />
                </View>
                <Text style={styles.activityTitle}>{t("My Civic Activity", HI.myActivity)}</Text>
              </View>
              <Pressable onPress={() => router.push("/(tabs)/complaints")} style={styles.activitySeeAll}>
                <Text style={styles.activitySeeAllText}>{t("See All", HI.seeAll)}</Text>
                <Ionicons name="chevron-forward" size={12} color="#FF9933" />
              </Pressable>
            </View>
            <View style={styles.activityStats}>
              {(() => {
                const myC = complaints.filter(c => c.submittedByPhone === user?.phone);
                const myR = myC.filter(c => c.status === "resolved");
                const myP = myC.filter(c => c.status === "pending" || c.status === "in_progress");
                return [
                  { label: t("Filed",    HI.filed),    value: myC.length,  color: "#FF9933", icon: "document-text" as const, bg: "#FFF8E7" },
                  { label: t("Pending",  HI.pending),  value: myP.length,  color: "#F59E0B", icon: "time" as const,          bg: "#FFFBEB" },
                  { label: t("Resolved", HI.resolved), value: myR.length,  color: "#00A651", icon: "checkmark-circle" as const, bg: "#F0FFF4" },
                  { label: t("City SOS", HI.citySos),  value: activeAlerts.length, color: "#EF4444", icon: "warning" as const, bg: "#FEF2F2" },
                ];
              })().map((item, i) => (
                <View key={i} style={[styles.activityStatItem, { backgroundColor: item.bg, borderColor: item.color + "28" }]}>
                  <View style={[styles.kpiIconWrap, { backgroundColor: item.color + "18" }]}>
                    <Ionicons name={item.icon} size={16} color={item.color} />
                  </View>
                  <Text style={[styles.activityStatNum, { color: item.color }]}>{item.value}</Text>
                  <Text style={styles.activityStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
            {/* Motivational row */}
            <View style={styles.motivRow}>
              <Text style={{ fontSize: 18 }}>🌟</Text>
              <Text style={styles.motivText}>
                {user?.level && user.level >= 3
                  ? `Level ${user.level} Civic Advocate — keep making Uttarakhand better!`
                  : "File your first complaint to start earning civic points!"}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* QUICK NAV */}
        <View style={styles.quickNav}>
          <Text style={styles.sectionLabel}>{t("QUICK ACCESS", HI.quickAccess)}</Text>
          <View style={styles.quickGrid}>
            {[
              { icon: "chatbubbles" as const,         label: t("AI Chat",    HI.aiChat),    color: "#FF9933", bg: "#FFF8E7", nav: "/(tabs)/ai" },
              { icon: "map" as const,               label: t("Live Map",   HI.liveMap),   color: "#3B82F6", bg: "#EFF6FF", nav: "/(tabs)/map" },
              { icon: "receipt-outline" as const,   label: t("Pay Bills",  HI.payBills),  color: "#8B5CF6", bg: "#F5F3FF", nav: "/(tabs)/bills" },
              { icon: "warning-outline" as const,   label: t("SOS Alert",  HI.sosAlert),  color: "#EF4444", bg: "#FEF2F2", nav: "/(tabs)/sos" },
              { icon: "document-text" as const,     label: t("Reports",    HI.reports),   color: "#00A651", bg: "#F0FFF4", nav: "/(tabs)/complaints" },
              { icon: "people" as const,            label: "Community",                   color: "#6366F1", bg: "#EEF2FF", nav: "/(tabs)/community" },
              { icon: "document-lock" as const,     label: "File RTI",                    color: "#059669", bg: "#ECFDF5", nav: "/(tabs)/rti" },
              { icon: "analytics" as const,         label: t("Analytics",  HI.analytics), color: "#06B6D4", bg: "#F0FDFF", nav: "/(tabs)/analytics" },
              { icon: "bar-chart" as const,         label: "Budget",                      color: "#F59E0B", bg: "#FFFBEB", nav: "/(tabs)/budget" },
              { icon: "trophy" as const,            label: "Leaderboard",                 color: "#FFD700", bg: "#FFFEF0", nav: "/(tabs)/leaderboard" },
            ].map(item => (
              <Pressable key={item.label} onPress={() => router.push(item.nav as any)} style={[styles.quickCard, { backgroundColor: item.bg, borderColor: item.color + "30" }]}>
                <View style={[styles.quickCardIcon, { backgroundColor: item.color + "18" }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={[styles.quickCardLabel, { color: item.color }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* AI BANNER */}
        <Pressable onPress={() => router.push("/(tabs)/ai")} style={styles.aiBanner}>
          <LinearGradient
            colors={["#FF6B00", "#FF9933", "#FFBA5C"]}
            style={styles.aiBannerGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <View style={styles.aiBannerLeft}>
              <View style={styles.aiBannerIcon}>
                <Text style={{ fontSize: 28 }}>🤖</Text>
              </View>
              <View>
                <Text style={styles.aiBannerTitle}>SANKALP AI Assistant</Text>
                <Text style={styles.aiBannerSub}>Ask anything about Uttarakhand civic services</Text>
              </View>
            </View>
            <View style={styles.aiBannerStats}>
              <Text style={styles.aiBannerStatNum}>{Math.round(complaints.reduce((s, c) => s + c.aiScore, 0) / Math.max(complaints.length, 1))}%</Text>
              <Text style={styles.aiBannerStatLabel}>AI Score</Text>
            </View>
            <View style={styles.aiBannerArrow}>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        {/* UTTARAKHAND WEATHER + AQI */}
        <View style={styles.aqiCard}>
          <LinearGradient colors={["#0C4A6E", "#075985", "#0369A1"]} style={styles.aqiGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <View style={styles.aqiLeft}>
              <View style={styles.aqiIconWrap}><Text style={{ fontSize: 22 }}>🏔️</Text></View>
              <View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.aqiTitle}>Dehradun</Text>
                  <View style={styles.aqiLivePill}>
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#4ADE80" }} />
                    <Text style={styles.aqiLiveText}>LIVE</Text>
                  </View>
                </View>
                <Text style={styles.aqiSub}>AQI 68 · Satisfactory</Text>
                <Text style={[styles.aqiAdvice, { color: "#86EFAC" }]}>✓ Clean Himalayan air today</Text>
              </View>
            </View>
            <View style={styles.aqiRight}>
              <Text style={styles.aqiNum}>24°</Text>
              <Text style={[styles.aqiCategory, { color: "#7DD3FC" }]}>SUNNY</Text>
              <View style={[styles.aqiBar, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
                <View style={[styles.aqiBarFill, { width: "25%", backgroundColor: "#4ADE80" }]} />
              </View>
            </View>
          </LinearGradient>
          <View style={styles.aqiBreakdown}>
            {[
              { label: "AQI",    val: "68",   color: "#22C55E" },
              { label: "Humid",  val: "42%",  color: "#3B82F6" },
              { label: "Wind",   val: "12km", color: "#8B5CF6" },
              { label: "UV",     val: "Med",  color: "#F59E0B" },
            ].map(m => (
              <View key={m.label} style={styles.aqiMetric}>
                <Text style={[styles.aqiMetricVal, { color: m.color }]}>{m.val}</Text>
                <Text style={styles.aqiMetricLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* UTTARAKHAND NEWS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <View style={[styles.kpiIconWrap, { backgroundColor: "#EFF6FF" }]}>
                <Ionicons name="newspaper" size={14} color="#3B82F6" />
              </View>
              <Text style={styles.sectionTitle}>{t("Uttarakhand News", HI.news)}</Text>
            </View>
            <View style={styles.livePill}>
              <PulsingDot color="#3B82F6" />
              <Text style={[styles.liveText, { color: "#3B82F6" }]}>Today</Text>
            </View>
          </View>
          {UK_NEWS.map((item, idx) => (
            <Pressable key={item.id} onPress={() => setSelectedNews(item)} style={[styles.newsRow, idx > 0 && { borderTopWidth: 1, borderTopColor: "#F3F4F6" }]}>
              <View style={[styles.newsIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={15} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <View style={[styles.newsTag, { backgroundColor: item.color + "18" }]}>
                    <Text style={[styles.newsTagText, { color: item.color }]}>{item.tag}</Text>
                  </View>
                  <Text style={styles.newsTime}>{item.time}</Text>
                  <Text style={[styles.newsTime, { marginLeft: "auto" }]}>{item.readTime}</Text>
                </View>
                <Text style={styles.newsHeadline} numberOfLines={2}>{item.headline}</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={item.color + "88"} />
            </Pressable>
          ))}
        </View>

        {/* EMERGENCY CONTACTS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <View style={[styles.kpiIconWrap, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="call" size={14} color="#EF4444" />
              </View>
              <Text style={styles.sectionTitle}>Emergency Helplines</Text>
            </View>
            <View style={styles.livePill}>
              <PulsingDot color="#EF4444" />
              <Text style={[styles.liveText, { color: "#EF4444" }]}>24/7</Text>
            </View>
          </View>
          <View style={styles.emergGrid}>
            {[
              { num: "100",  label: "Police",        icon: "shield",    color: "#1A237E", bg: "#E8EAFF" },
              { num: "108",  label: "Ambulance",      icon: "heart",     color: "#EF4444", bg: "#FEF2F2" },
              { num: "1090", label: "Women Safety",   icon: "woman",     color: "#EC4899", bg: "#FDF2F8" },
              { num: "101",  label: "Fire Brigade",   icon: "flame",     color: "#F59E0B", bg: "#FFFBEB" },
              { num: "1095", label: "Traffic Police", icon: "car",       color: "#06B6D4", bg: "#F0FDFF" },
              { num: "1098", label: "Child Helpline", icon: "happy",     color: "#00A651", bg: "#F0FFF4" },
            ].map(e => (
              <Pressable key={e.num}
                onPress={() => Linking.openURL(`tel:${e.num}`)}
                style={[styles.emergCard, { backgroundColor: e.bg, borderColor: e.color + "30" }]}>
                <View style={[styles.emergIconWrap, { backgroundColor: e.color + "18" }]}>
                  <Ionicons name={e.icon as any} size={16} color={e.color} />
                </View>
                <Text style={[styles.emergNum, { color: e.color }]}>{e.num}</Text>
                <Text style={styles.emergLabel}>{e.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* GOVERNMENT SCHEMES */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Ionicons name="document-text" size={16} color="#FF9933" />
              <Text style={styles.sectionTitle}>Uttarakhand Govt Schemes</Text>
            </View>
            <Pressable><Text style={styles.seeAll}>View All →</Text></Pressable>
          </View>
          {SCHEMES_DATA.map((s, idx) => (
            <Pressable key={s.key} onPress={() => setSelectedScheme(s)}
              style={[styles.schemeRow, { borderTopWidth: idx === 0 ? 0 : 1 }]}>
              <View style={[styles.schemeIcon, { backgroundColor: s.color + "15" }]}>
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.schemeTitle}>{s.title}</Text>
                <Text style={styles.schemeSub}>{s.sub}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[styles.schemeTag, { backgroundColor: s.color + "15" }]}>
                  <Text style={[styles.schemeTagText, { color: s.color }]}>{s.tag}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
              </View>
            </Pressable>
          ))}
        </View>

        {/* GOVERNMENT NOTICES */}
        {announcements.length > 0 && (
          <View style={[styles.sectionCard, { borderColor: "#FFD07733" }]}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleWrap}>
                <View style={styles.megaphoneIcon}>
                  <Ionicons name="megaphone" size={14} color="#FF9933" />
                </View>
                <Text style={styles.sectionTitle}>Government Notices</Text>
              </View>
            </View>
            <View style={styles.tricolorThin}>
              <View style={{ flex: 1, backgroundColor: "#FF9933" }} />
              <View style={{ flex: 1, backgroundColor: "#E5E7EB" }} />
              <View style={{ flex: 1, backgroundColor: "#138808" }} />
            </View>
            {announcements.slice(0, 3).map(ann => (
              <Pressable key={ann.id} onPress={() => setSelectedNotice(ann)} style={[styles.annRow, { borderRadius: 8 }]}>
                <View style={styles.annDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.annTitle} numberOfLines={1}>{ann.title}</Text>
                  <Text style={styles.annDept}>{ann.department}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {ann.priority === "urgent" && (
                    <View style={styles.urgentBadge}><Text style={styles.urgentText}>URGENT</Text></View>
                  )}
                  <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* CATEGORY BREAKDOWN */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Ionicons name="pie-chart" size={16} color="#3B82F6" />
              <Text style={styles.sectionTitle}>Issue Breakdown</Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/analytics")}>
              <Text style={styles.seeAll}>View Analytics →</Text>
            </Pressable>
          </View>
          {catBreakdown.map(cat => (
            <View key={cat.key} style={styles.catRow}>
              <View style={[styles.catIconWrap, { backgroundColor: cat.bg }]}>
                <Ionicons name={cat.icon} size={13} color={cat.color} />
              </View>
              <Text style={styles.catLabel}>{cat.label}</Text>
              <View style={{ flex: 1, height: 6, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden" }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: cat.color, width: `${cat.pct}%` }} />
              </View>
              <Text style={[styles.catPct, { color: cat.color }]}>{cat.pct}%</Text>
            </View>
          ))}
        </View>

        {/* RECENT REPORTS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Ionicons name="list" size={16} color="#00A651" />
              <Text style={styles.sectionTitle}>Recent Reports</Text>
            </View>
            <Pressable onPress={() => router.push("/(tabs)/complaints")}>
              <Text style={styles.seeAll}>See All →</Text>
            </Pressable>
          </View>
          {complaints.slice(0, 5).map(c => {
            const meta = CATEGORY_META[c.category] || CATEGORY_META.other;
            const statusMeta = STATUS_META[c.status] || STATUS_META.closed;
            return (
              <Pressable key={c.id} onPress={() => router.push("/(tabs)/complaints")} style={styles.complaintRow}>
                <View style={[styles.complaintIcon, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.complaintTopRow}>
                    <Text style={styles.complaintId}>{c.ticketId}</Text>
                    <View style={[styles.priorityPill, { backgroundColor: c.priority === "P1" ? "#FEF2F2" : c.priority === "P2" ? "#FFFBEB" : "#F0FFF4" }]}>
                      <Text style={[styles.priorityText, { color: c.priority === "P1" ? "#EF4444" : c.priority === "P2" ? "#F59E0B" : "#00A651" }]}>{c.priority}</Text>
                    </View>
                  </View>
                  <Text style={styles.complaintDesc} numberOfLines={1}>{c.description}</Text>
                  <View style={styles.complaintLocation}>
                    <Ionicons name="location-outline" size={10} color="#9CA3AF" />
                    <Text style={styles.complaintLocationText} numberOfLines={1}>{c.location}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
                  <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* WARD HEALTH */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleWrap}>
              <Ionicons name="map" size={16} color="#8B5CF6" />
              <Text style={styles.sectionTitle}>Ward Health Overview</Text>
            </View>
          </View>
          <View style={styles.wardGrid}>
            {wards.slice(0, 12).map(ward => {
              const c = ward.healthScore >= 70 ? "#00A651" : ward.healthScore >= 50 ? "#F59E0B" : "#EF4444";
              return (
                <Pressable key={ward.id} onPress={() => router.push("/(tabs)/analytics")} style={[styles.wardChip, { borderColor: c + "44", backgroundColor: c + "10" }]}>
                  <View style={[styles.wardDot, { backgroundColor: c }]} />
                  <Text style={[styles.wardName, { color: c }]} numberOfLines={1}>{ward.name.split(" ")[0]}</Text>
                  <Text style={styles.wardScore}>{ward.healthScore}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const ms = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  card: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: "90%", shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  handle: { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { padding: 20, flexDirection: "row", gap: 14, alignItems: "flex-start" },
  headerIcon: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  tagPill: { alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6 },
  tagText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  modalTitle: { color: "#111827", fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 24, marginBottom: 4 },
  modalTagline: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" },
  section: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  sectionIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { color: "#111827", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  bulletDot: { width: 7, height: 7, borderRadius: 3.5, marginTop: 6 },
  bulletText: { flex: 1, color: "#374151", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  howBox: { borderLeftWidth: 3, paddingLeft: 14, backgroundColor: "#F9FAFB", borderRadius: 4, padding: 12 },
  howText: { color: "#374151", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  contactRow: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingVertical: 12 },
  contactBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, borderWidth: 1 },
  contactBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  closeBtn: { marginHorizontal: 20, marginBottom: 28, marginTop: 4, backgroundColor: "#F3F4F6", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  closeBtnText: { color: "#6B7280", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

const nm = StyleSheet.create({
  urgentBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignSelf: "flex-start" },
  urgentText: { color: "#DC2626", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  body: { color: "#374151", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },

  header: { paddingHorizontal: 20, paddingBottom: 24, overflow: "hidden" },
  headerBgCircle1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.08)", top: -60, right: -40 },
  headerBgCircle2: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.06)", bottom: 0, left: 30 },
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  greeting: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontFamily: "Inter_400Regular" },
  userName: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", marginTop: 2 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  liveText: { color: "rgba(255,255,255,0.9)", fontSize: 11, fontFamily: "Inter_500Medium" },
  headerRight: { flexDirection: "row", gap: 8, alignItems: "center" },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.25)", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center" },
  avatarBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  adminBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)", alignItems: "center", justifyContent: "center" },
  tricolor: { height: 3, flexDirection: "row", borderRadius: 1.5, overflow: "hidden", marginBottom: 14 },
  healthCard: { backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  healthCardLeft: { flex: 1, gap: 6 },
  healthCardLabel: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  healthCardSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_400Regular" },
  healthScoreBubble: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 2 },
  healthScore: { fontSize: 26, fontFamily: "Inter_700Bold" },
  healthScoreOf: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: -2 },

  sosBanner: { marginHorizontal: 16, marginTop: 14, borderRadius: 14, overflow: "hidden" },
  sosBannerInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  sosIconWrap: { width: 34, height: 34, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  sosBannerTitle: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  sosBannerSub: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },

  kpiIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  activityCard: { backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#FFE0B2" },
  activityHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  activityTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  activityTitle: { color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold" },
  activitySeeAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  activitySeeAllText: { color: "#FF9933", fontSize: 12, fontFamily: "Inter_500Medium" },
  activityStats: { flexDirection: "row", gap: 8, marginBottom: 12 },
  activityStatItem: { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 5, borderWidth: 1 },
  activityStatNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  activityStatLabel: { color: "#9CA3AF", fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },
  motivRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFBEB", borderRadius: 12, padding: 12 },
  motivText: { flex: 1, color: "#92400E", fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 17 },

  quickNav: { paddingHorizontal: 16, marginTop: 14, marginBottom: 4 },
  sectionLabel: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1.5, marginBottom: 10 },
  quickGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  quickCard: { width: "22%", flexGrow: 1, borderRadius: 14, padding: 12, alignItems: "center", gap: 8, borderWidth: 1 },
  quickCardIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  quickCardLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", textAlign: "center" },

  aiBanner: { marginHorizontal: 16, marginTop: 14, borderRadius: 16, overflow: "hidden" },
  aiBannerGrad: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  aiBannerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  aiBannerIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  aiBannerTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  aiBannerSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  aiBannerStats: { alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10 },
  aiBannerStatNum: { color: "#fff", fontSize: 18, fontFamily: "Inter_700Bold" },
  aiBannerStatLabel: { color: "rgba(255,255,255,0.8)", fontSize: 9, fontFamily: "Inter_400Regular" },
  aiBannerArrow: { width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },

  aqiCard: { marginHorizontal: 16, marginTop: 14, marginBottom: 4, borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: "#FCA5A5" },
  aqiGrad: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  aqiLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  aqiIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  aqiTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  aqiLivePill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  aqiLiveText: { color: "#4ADE80", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  aqiSub: { color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  aqiAdvice: { color: "#FCA5A5", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 4 },
  aqiRight: { alignItems: "flex-end" },
  aqiNum: { color: "#fff", fontSize: 36, fontFamily: "Inter_700Bold", lineHeight: 38 },
  aqiCategory: { color: "#FCA5A5", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 4 },
  aqiBar: { width: 80, height: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" },
  aqiBarFill: { height: 4, backgroundColor: "#FCA5A5", borderRadius: 2 },
  aqiBreakdown: { flexDirection: "row", backgroundColor: "#FFF5F5", paddingVertical: 12, paddingHorizontal: 16 },
  aqiMetric: { flex: 1, alignItems: "center" },
  aqiMetricVal: { fontSize: 15, fontFamily: "Inter_700Bold" },
  aqiMetricLabel: { color: "#9CA3AF", fontSize: 9, fontFamily: "Inter_500Medium", marginTop: 2 },

  emergGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  emergCard: { width: "30%", borderRadius: 14, padding: 10, alignItems: "center", borderWidth: 1, gap: 4 },
  emergIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  emergNum: { fontSize: 18, fontFamily: "Inter_700Bold" },
  emergLabel: { color: "#6B7280", fontSize: 9, fontFamily: "Inter_500Medium", textAlign: "center" },

  schemeRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopColor: "#F3F4F6" },
  schemeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  schemeTitle: { color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  schemeSub: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  schemeTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  schemeTagText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  sectionCard: { marginHorizontal: 16, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#E5E7EB", marginTop: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  sectionTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sectionTitle: { color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold" },
  seeAll: { color: "#FF9933", fontSize: 12, fontFamily: "Inter_500Medium" },
  megaphoneIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#FFF8E7", alignItems: "center", justifyContent: "center" },
  tricolorThin: { height: 2, flexDirection: "row", borderRadius: 1, overflow: "hidden", marginBottom: 12 },
  annRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  annDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FF9933" },
  annTitle: { color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  annDept: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  urgentBadge: { backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  urgentText: { color: "#EF4444", fontSize: 9, fontFamily: "Inter_700Bold" },

  catRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderTopWidth: 1, borderTopColor: "#F9FAFB" },
  catIconWrap: { width: 28, height: 28, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  catLabel: { color: "#374151", fontSize: 12, fontFamily: "Inter_500Medium", width: 75 },
  catPct: { fontSize: 12, fontFamily: "Inter_700Bold", width: 36, textAlign: "right" },

  complaintRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#F9FAFB" },
  complaintIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  complaintTopRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  complaintId: { color: "#374151", fontSize: 12, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  priorityPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  priorityText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  complaintDesc: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" },
  complaintLocation: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  complaintLocationText: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },

  wardGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  wardChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  wardDot: { width: 7, height: 7, borderRadius: 3.5 },
  wardName: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  wardScore: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular" },

  newsRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  newsIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  newsTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  newsTagText: { fontSize: 8, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  newsTime: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_400Regular" },
  newsHeadline: { color: "#111827", fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 },
});
