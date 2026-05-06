import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, Platform, Alert, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

interface Bill {
  id: string;
  type: "mcd" | "djb" | "bses" | "property" | "vehicle";
  title: string;
  subtitle: string;
  accountNo: string;
  amount: number;
  dueDate: string;
  status: "unpaid" | "paid" | "overdue";
  period: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  gradient: [string, string, string];
}

const BILLS: Bill[] = [
  {
    id: "b1", type: "mcd", title: "ULB Property Tax", subtitle: "Urban Local Body, Dehradun",
    accountNo: "ULB-UK-07-2024-483920", amount: 4850, dueDate: "2026-03-31", status: "unpaid",
    period: "Annual 2024-25", icon: "business-outline", color: "#F59E0B",
    gradient: ["#78350F", "#92400E", "#B45309"],
  },
  {
    id: "b2", type: "djb", title: "UJN Water Bill", subtitle: "Uttarakhand Jal Nigam",
    accountNo: "UJN-2024-W-991234", amount: 1240, dueDate: "2026-03-20", status: "overdue",
    period: "Feb 2026", icon: "water-outline", color: "#3B82F6",
    gradient: ["#1E3A5F", "#1D4ED8", "#2563EB"],
  },
  {
    id: "b3", type: "bses", title: "UPCL Electricity", subtitle: "Uttarakhand Power Corp Ltd",
    accountNo: "UPCL-DDN-10287654", amount: 2180, dueDate: "2026-04-05", status: "unpaid",
    period: "Mar 2026", icon: "flash-outline", color: "#EF4444",
    gradient: ["#450A0A", "#7F1D1D", "#B91C1C"],
  },
  {
    id: "b4", type: "vehicle", title: "Vehicle Tax", subtitle: "Transport Dept. Uttarakhand",
    accountNo: "UK-07-AB-1234 · Maruti Swift", amount: 3500, dueDate: "2026-06-15", status: "unpaid",
    period: "Annual 2026-27", icon: "car-outline", color: "#22C55E",
    gradient: ["#052E16", "#14532D", "#166534"],
  },
  {
    id: "b5", type: "mcd", title: "ULB House Tax", subtitle: "Urban Local Body, Haldwani",
    accountNo: "ULB-HLD-23-7741820", amount: 1800, dueDate: "2025-12-31", status: "paid",
    period: "Annual 2023-24", icon: "home-outline", color: "#8B5CF6",
    gradient: ["#2E1065", "#4C1D95", "#6D28D9"],
  },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  unpaid: { bg: "#F59E0B22", text: "#F59E0B", label: "DUE" },
  overdue: { bg: "#EF444422", text: "#EF4444", label: "OVERDUE" },
  paid: { bg: "#22C55E22", text: "#22C55E", label: "PAID" },
};

function BillCard({ bill, onPay, index = 0 }: { bill: Bill; onPay: (bill: Bill) => void; index?: number }) {
  const status = STATUS_STYLES[bill.status];
  const isActionable = bill.status !== "paid";
  const slideY = useRef(new Animated.Value(50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 0, duration: 400, delay: index * 90, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 1, duration: 400, delay: index * 90, useNativeDriver: false }),
    ]).start();
  }, []);

  const onPressIn = () => Animated.spring(pressScale, { toValue: 0.97, useNativeDriver: false }).start();
  const onPressOut = () => Animated.spring(pressScale, { toValue: 1, friction: 6, useNativeDriver: false }).start();

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: slideY }, { scale: pressScale }] }}>
    <Pressable
      onPress={() => isActionable && onPay(bill)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={styles.billCard}
    >
      <LinearGradient colors={bill.gradient} style={styles.billCardGradient}>
        <View style={styles.billCardTop}>
          <View style={[styles.billIcon, { backgroundColor: bill.color + "33" }]}>
            <Ionicons name={bill.icon} size={22} color={bill.color} />
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>

        <Text style={styles.billTitle}>{bill.title}</Text>
        <Text style={styles.billSub}>{bill.subtitle}</Text>
        <Text style={styles.billAcct}>{bill.accountNo}</Text>

        <View style={styles.billDivider} />

        <View style={styles.billBottom}>
          <View>
            <Text style={styles.billPeriod}>{bill.period}</Text>
            <Text style={styles.billDue}>Due: {new Date(bill.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
          </View>
          <View style={styles.billAmountWrap}>
            <Text style={styles.billCurrency}>Rs.</Text>
            <Text style={styles.billAmount}>{bill.amount.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        {isActionable && (
          <View style={styles.payBtn}>
            <Ionicons name="card-outline" size={14} color="#fff" />
            <Text style={styles.payBtnText}>Pay Now</Text>
          </View>
        )}
        {!isActionable && (
          <View style={[styles.payBtn, { backgroundColor: "#22C55E33" }]}>
            <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
            <Text style={[styles.payBtnText, { color: "#22C55E" }]}>Paid</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
    </Animated.View>
  );
}

function AnimatedSpinner() {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, useNativeDriver: false })).start();
    Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 450, useNativeDriver: false }),
      Animated.timing(pulse, { toValue: 0.8, duration: 450, useNativeDriver: false }),
    ])).start();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }, { scale: pulse }], marginBottom: 20 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#3B82F622", alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#3B82F6", borderTopColor: "transparent" }} />
    </Animated.View>
  );
}

function SuccessCheckmark() {
  const scale = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.2, friction: 5, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: false }),
    ]).start();
    Animated.timing(ring, { toValue: 1, duration: 600, useNativeDriver: false }).start();
  }, []);
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.0] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] });
  return (
    <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
      <Animated.View style={{ position: "absolute", width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: "#22C55E", transform: [{ scale: ringScale }], opacity: ringOpacity }} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name="checkmark-circle" size={72} color="#22C55E" />
      </Animated.View>
    </View>
  );
}

export default function BillsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>(BILLS);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [payStep, setPayStep] = useState<"confirm" | "processing" | "success">("confirm");
  const headerSlide = useRef(new Animated.Value(-30)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerSlide, { toValue: 0, duration: 500, useNativeDriver: false }),
      Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]).start();
  }, []);

  const unpaidTotal = bills.filter(b => b.status !== "paid").reduce((s, b) => s + b.amount, 0);
  const overdueCount = bills.filter(b => b.status === "overdue").length;

  const handlePay = (bill: Bill) => {
    setSelectedBill(bill);
    setPayStep("confirm");
  };

  const confirmPayment = async () => {
    if (!selectedBill) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPayStep("processing");
    await new Promise(r => setTimeout(r, 2000));
    setBills(prev => prev.map(b => b.id === selectedBill.id ? { ...b, status: "paid" as const } : b));
    setPayStep("success");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const closeModal = () => {
    setSelectedBill(null);
    setPayStep("confirm");
  };

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}>
      {/* Header */}
      <Animated.View style={[styles.header, { opacity: headerOpacity, transform: [{ translateY: headerSlide }] }]}>
        <View style={{ flexDirection: "row", height: 3, marginBottom: 10, borderRadius: 2, overflow: "hidden" }}>
          <View style={{ flex: 1, backgroundColor: Colors.saffron }} />
          <View style={{ flex: 1, backgroundColor: "#FFFFFF30" }} />
          <View style={{ flex: 1, backgroundColor: Colors.nationalGreen }} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={styles.headerTitle}>Uttarakhand Gov Bills</Text>
            <Text style={styles.headerSub}>ULB · UJN · UPCL · उत्तराखंड परिवहन</Text>
          </View>
          <View style={styles.headerBadge}>
            <Ionicons name="shield-checkmark" size={16} color="#22C55E" />
            <Text style={styles.headerBadgeText}>Secured</Text>
          </View>
        </View>
      </Animated.View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 34 : insets.bottom + 90 }}>
        {/* Summary Card */}
        <LinearGradient colors={["#1E3A5F", "#0F172A", "#0A0F1C"]} style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <Text style={styles.summaryLabel}>Total Outstanding</Text>
              <Text style={styles.summaryAmount}>Rs. {unpaidTotal.toLocaleString("en-IN")}</Text>
              {overdueCount > 0 && (
                <Text style={styles.summaryOverdue}>{overdueCount} bill{overdueCount > 1 ? "s" : ""} overdue — interest may apply</Text>
              )}
            </View>
            <View style={styles.summaryIcon}>
              <Ionicons name="receipt-outline" size={30} color="#3B82F6" />
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryItemVal}>{bills.filter(b => b.status === "paid").length}</Text>
              <Text style={styles.summaryItemLabel}>Paid</Text>
            </View>
            <View style={[styles.summaryItemDivider]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryItemVal, { color: "#F59E0B" }]}>{bills.filter(b => b.status === "unpaid").length}</Text>
              <Text style={styles.summaryItemLabel}>Due</Text>
            </View>
            <View style={styles.summaryItemDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryItemVal, { color: "#EF4444" }]}>{overdueCount}</Text>
              <Text style={styles.summaryItemLabel}>Overdue</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Overdue Notice */}
        {overdueCount > 0 && (
          <View style={styles.overdueNotice}>
            <Ionicons name="warning" size={16} color="#EF4444" />
            <Text style={styles.overdueNoticeText}>Pay overdue bills to avoid penalty and service disconnection</Text>
          </View>
        )}

        {/* Bills List */}
        <Text style={styles.sectionLabel}>Your Bills</Text>
        {bills.map((bill, i) => (
          <BillCard key={bill.id} bill={bill} onPay={handlePay} index={i} />
        ))}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.infoText}>Bill data is linked to your registered address. For disputes, visit your nearest citizen service center or call 1800-180-4167 (UK Helpline).</Text>
        </View>
      </ScrollView>

      {/* Payment Modal */}
      <Modal visible={!!selectedBill} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {payStep === "confirm" && selectedBill && (
              <>
                <Text style={styles.modalTitle}>Confirm Payment</Text>
                <View style={styles.modalBillInfo}>
                  <Ionicons name={selectedBill.icon} size={24} color={selectedBill.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalBillTitle}>{selectedBill.title}</Text>
                    <Text style={styles.modalBillAcct}>{selectedBill.accountNo}</Text>
                  </View>
                </View>
                <View style={styles.modalAmountRow}>
                  <Text style={styles.modalAmountLabel}>Amount</Text>
                  <Text style={styles.modalAmountVal}>Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                </View>
                <View style={styles.modalAmountRow}>
                  <Text style={styles.modalAmountLabel}>Period</Text>
                  <Text style={styles.modalAmountSub}>{selectedBill.period}</Text>
                </View>
                <View style={styles.modalAmountRow}>
                  <Text style={styles.modalAmountLabel}>Due Date</Text>
                  <Text style={styles.modalAmountSub}>{new Date(selectedBill.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                </View>
                <Text style={{ color: Colors.textMuted, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1, marginTop: 14, marginBottom: 10 }}>CHOOSE PAYMENT METHOD</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                  {[
                    { icon: "📱", label: "UPI", sub: "PhonePe · GPay" },
                    { icon: "💳", label: "Card", sub: "Debit/Credit" },
                    { icon: "🏦", label: "Net Banking", sub: "All banks" },
                  ].map((m, i) => (
                    <Pressable key={m.label} style={{ flex: 1, backgroundColor: i === 0 ? "#22C55E22" : Colors.bgCard, borderRadius: 12, padding: 10, alignItems: "center", borderWidth: i === 0 ? 1.5 : 1, borderColor: i === 0 ? "#22C55E55" : Colors.border, gap: 3 }}>
                      <Text style={{ fontSize: 20 }}>{m.icon}</Text>
                      <Text style={{ color: i === 0 ? "#22C55E" : "#fff", fontSize: 11, fontFamily: "Inter_700Bold" }}>{m.label}</Text>
                      <Text style={{ color: Colors.textMuted, fontSize: 9, fontFamily: "Inter_400Regular" }}>{m.sub}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#22C55E11", borderRadius: 10, padding: 10, marginBottom: 16 }}>
                  <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
                  <Text style={{ flex: 1, color: "#22C55E", fontSize: 11, fontFamily: "Inter_500Medium" }}>256-bit encrypted · RBI compliant · Uttarakhand e-Pay Gateway</Text>
                </View>
                <View style={styles.modalBtns}>
                  <Pressable onPress={closeModal} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={confirmPayment} style={styles.confirmBtn}>
                    <Ionicons name="card" size={16} color="#fff" />
                    <Text style={styles.confirmText}>Pay Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {payStep === "processing" && (
              <View style={styles.processingView}>
                <AnimatedSpinner />
                <Text style={styles.processingTitle}>Processing Payment</Text>
                <Text style={styles.processingSub}>Connecting to Uttarakhand e-Pay Gateway...</Text>
              </View>
            )}

            {payStep === "success" && selectedBill && (
              <View style={styles.successView}>
                <SuccessCheckmark />
                <Text style={styles.successTitle}>Payment Successful</Text>
                <Text style={styles.successSub}>{selectedBill.title}</Text>
                <Text style={styles.successAmount}>Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                <Text style={styles.successRef}>Ref: SANKALP-{Date.now().toString().slice(-8)}</Text>
                <Pressable onPress={closeModal} style={styles.doneBtn}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  headerTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  headerSub: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#22C55E22", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#22C55E44" },
  headerBadgeText: { color: "#22C55E", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  summaryCard: { marginHorizontal: 16, marginBottom: 16, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: "#1E3A5F" },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  summaryLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  summaryAmount: { color: "#fff", fontSize: 32, fontFamily: "Inter_700Bold" },
  summaryOverdue: { color: "#EF4444", fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 4 },
  summaryIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: "#3B82F622", alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.1)", paddingTop: 14 },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryItemVal: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  summaryItemLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  summaryItemDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.1)" },
  overdueNotice: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 16, backgroundColor: "#EF444422", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#EF444444" },
  overdueNoticeText: { flex: 1, color: "#FCA5A5", fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 },
  billCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  billCardGradient: { padding: 18 },
  billCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  billIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  billTitle: { color: "#fff", fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 2 },
  billSub: { color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  billAcct: { color: "rgba(255,255,255,0.4)", fontSize: 10, fontFamily: "Inter_400Regular", letterSpacing: 0.3, marginBottom: 14 },
  billDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginBottom: 14 },
  billBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  billPeriod: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_500Medium" },
  billDue: { color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  billAmountWrap: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  billCurrency: { color: "rgba(255,255,255,0.6)", fontSize: 14, fontFamily: "Inter_500Medium" },
  billAmount: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold" },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 12 },
  payBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginHorizontal: 16, marginVertical: 8, padding: 14, backgroundColor: Colors.bgCard, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  infoText: { flex: 1, color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#111827", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, borderWidth: 1, borderColor: "#1F2937" },
  modalTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 18 },
  modalBillInfo: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18, backgroundColor: Colors.bgCard, borderRadius: 14, padding: 14 },
  modalBillTitle: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  modalBillAcct: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  modalAmountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalAmountLabel: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  modalAmountVal: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold" },
  modalAmountSub: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium" },
  payMethodRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 20 },
  payMethodText: { color: Colors.green, fontSize: 12, fontFamily: "Inter_500Medium" },
  modalBtns: { flexDirection: "row", gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
  cancelText: { color: Colors.textMuted, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  confirmBtn: { flex: 2, backgroundColor: "#22C55E", borderRadius: 14, padding: 16, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  confirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  processingView: { alignItems: "center", paddingVertical: 30 },
  processingSpinner: { marginBottom: 16 },
  processingTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 8 },
  processingSub: { color: Colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  successView: { alignItems: "center", paddingVertical: 20 },
  successIcon: { marginBottom: 16 },
  successTitle: { color: "#fff", fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  successSub: { color: Colors.textMuted, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 8 },
  successAmount: { color: Colors.green, fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  successRef: { color: Colors.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 24 },
  doneBtn: { backgroundColor: "#22C55E", borderRadius: 14, paddingHorizontal: 40, paddingVertical: 16 },
  doneBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
