import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Modal, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface RTIRequest {
  id: string; ticketId: string; subject: string; description: string;
  department: string; filedBy: string; filedByPhone: string; filedAt: string;
  status: "filed" | "acknowledged" | "processing" | "responded" | "closed";
  response?: string; respondedAt?: string; district: string; deadline: string;
}

const DEPARTMENTS = [
  "Public Works Department (PWD)",
  "Uttarakhand Jal Sansthan (UJN)",
  "Urban Local Body (ULB)",
  "Forest Department",
  "Uttarakhand Power Corporation Ltd (UPCL)",
  "Health & Family Welfare Department",
  "District Magistrate Office",
  "Revenue Department",
  "Education Department",
  "Transport Department",
  "Police Department",
  "Disaster Management Department",
];

const STATUS_META: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  filed:        { color: "#6B7280", bg: "#F9FAFB", icon: "document-text",    label: "Filed" },
  acknowledged: { color: "#3B82F6", bg: "#EFF6FF", icon: "eye",              label: "Acknowledged" },
  processing:   { color: "#F59E0B", bg: "#FFFBEB", icon: "time",             label: "Processing" },
  responded:    { color: "#00A651", bg: "#F0FFF4", icon: "checkmark-circle", label: "Responded" },
  closed:       { color: "#9CA3AF", bg: "#F3F4F6", icon: "close-circle",     label: "Closed" },
};

function makeApiCall(token: string | null) {
  return async function(path: string, method = "GET", body?: any) {
    const baseUrl = getApiUrl();
    const url = `${baseUrl}${path.startsWith("/") ? path.slice(1) : path}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Request failed");
    return res.json();
  };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) { const hours = Math.floor(diff / 3600000); return hours < 1 ? "Just now" : `${hours}h ago`; }
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function daysLeft(deadlineStr: string) {
  const diff = new Date(deadlineStr).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  return `${days} days left`;
}

export default function RTIScreen() {
  const insets = useSafeAreaInsets();
  const [rtis, setRtis] = useState<RTIRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedRTI, setSelectedRTI] = useState<RTIRequest | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [department, setDepartment] = useState("");
  const [showDeptPicker, setShowDeptPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("token").then(t => { setToken(t); });
  }, []);

  const loadRTIs = useCallback(async (tok: string | null) => {
    if (!tok) return;
    const api = makeApiCall(tok);
    setLoading(true);
    try {
      const data = await api("/api/rti");
      setRtis(data);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (token) loadRTIs(token);
  }, [token, loadRTIs]);

  const handleSubmit = useCallback(async () => {
    if (!subject.trim() || !description.trim() || !department) {
      Alert.alert("Required Fields", "Please fill subject, description and select department.");
      return;
    }
    if (!token) return;
    const api = makeApiCall(token);
    setSubmitting(true);
    try {
      const created = await api("/api/rti", "POST", { subject: subject.trim(), description: description.trim(), department });
      setRtis(prev => [created, ...prev]);
      setShowForm(false);
      setSubject(""); setDescription(""); setDepartment("");
      Alert.alert(
        "RTI Filed Successfully!",
        `Your RTI ticket is ${created.ticketId}.\n\nThe department has 30 days to respond as per Right to Information Act, 2005.`,
        [{ text: "OK" }]
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Could not file RTI");
    }
    finally { setSubmitting(false); }
  }, [subject, description, department, token]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={s.container}>
      {/* Header */}
      <LinearGradient colors={["#1E3A5F", "#0F5132", "#00A651"]} style={[s.header, { paddingTop: topPad + 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>RTI Portal</Text>
            <Text style={s.headerSub}>Right to Information Act, 2005</Text>
            <Text style={s.headerSub2}>Request information from govt. departments</Text>
          </View>
          <Pressable onPress={() => setShowGuide(true)} style={s.guideBtn}>
            <Ionicons name="information-circle" size={16} color="#fff" />
            <Text style={s.guideBtnText}>How it works</Text>
          </Pressable>
        </View>
        <View style={s.statsRow}>
          <View style={s.statChip}>
            <Text style={s.statVal}>{rtis.length}</Text>
            <Text style={s.statLabel}>Total RTIs</Text>
          </View>
          <View style={s.statChip}>
            <Text style={s.statVal}>{rtis.filter(r => r.status === "responded").length}</Text>
            <Text style={s.statLabel}>Responded</Text>
          </View>
          <View style={s.statChip}>
            <Text style={s.statVal}>{rtis.filter(r => r.status === "processing" || r.status === "acknowledged").length}</Text>
            <Text style={s.statLabel}>Pending</Text>
          </View>
        </View>
      </LinearGradient>

      {/* File RTI Button */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#F3F4F6" }}>
        <Pressable onPress={() => setShowForm(true)} style={s.fileBtn}>
          <LinearGradient colors={["#00A651", "#059669"]} style={s.fileBtnGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="document-text" size={18} color="#fff" />
            <Text style={s.fileBtnText}>File a New RTI Request</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </Pressable>
      </View>

      {/* RTI List */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: botPad + 100, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ padding: 40, alignItems: "center" }}>
            <ActivityIndicator color="#00A651" size="large" />
            <Text style={{ color: "#9CA3AF", marginTop: 12, fontSize: 13, fontFamily: "Inter_400Regular" }}>Loading RTIs...</Text>
          </View>
        ) : rtis.length === 0 ? (
          <View style={s.empty}>
            <Text style={{ fontSize: 48 }}>📜</Text>
            <Text style={s.emptyTitle}>No RTIs Filed Yet</Text>
            <Text style={s.emptySub}>Use the button above to file your first RTI request to any government department</Text>
          </View>
        ) : rtis.map(rti => {
          const meta = STATUS_META[rti.status] || STATUS_META.filed;
          const dl = daysLeft(rti.deadline);
          const isOverdue = dl === "Overdue";
          return (
            <Pressable key={rti.id} onPress={() => setSelectedRTI(rti)} style={s.card}>
              <View style={s.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.ticketId}>{rti.ticketId}</Text>
                  <Text style={s.rtiSubject}>{rti.subject}</Text>
                  <Text style={s.rtiDept}>{rti.department}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
                  <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                  <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
              <View style={s.cardMeta}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Ionicons name="calendar-outline" size={10} color="#9CA3AF" />
                  <Text style={s.metaText}>Filed {timeAgo(rti.filedAt)}</Text>
                </View>
                <View style={[{ flexDirection: "row", alignItems: "center", gap: 4 }, isOverdue && { backgroundColor: "#FEF2F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}>
                  <Ionicons name="time-outline" size={10} color={isOverdue ? "#EF4444" : "#9CA3AF"} />
                  <Text style={[s.metaText, isOverdue && { color: "#EF4444", fontFamily: "Inter_600SemiBold" }]}>{dl}</Text>
                </View>
                {rti.response && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FFF4", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Ionicons name="checkmark-circle" size={10} color="#00A651" />
                    <Text style={[s.metaText, { color: "#00A651" }]}>Response received</Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}

        {/* RTI Info Cards */}
        <View style={s.infoSection}>
          <Text style={s.infoSectionTitle}>Know Your RTI Rights</Text>
          {[
            { icon: "time", color: "#3B82F6", title: "30-Day Response Deadline", body: "Under Section 7 of RTI Act 2005, the Public Information Officer must provide information within 30 days of receipt of RTI application." },
            { icon: "cash", color: "#00A651", title: "₹10 Application Fee", body: "RTI applications attract a nominal fee of ₹10. BPL card holders are exempt from this fee. Fee can be paid via IPO, DD, or cash." },
            { icon: "shield-checkmark", color: "#F59E0B", title: "First Appeal", body: "If dissatisfied, you can file a First Appeal within 30 days to the First Appellate Authority of the same department." },
            { icon: "people", color: "#8B5CF6", title: "Central Information Commission", body: "For second appeal or complaint, approach the State Information Commission of Uttarakhand within 90 days of first appeal decision." },
          ].map(info => (
            <View key={info.title} style={s.infoCard}>
              <View style={[s.infoIcon, { backgroundColor: info.color + "15" }]}>
                <Ionicons name={info.icon as any} size={16} color={info.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.infoTitle}>{info.title}</Text>
                <Text style={s.infoBody}>{info.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* RTI Detail Modal */}
      <Modal visible={!!selectedRTI} transparent animationType="slide" onRequestClose={() => setSelectedRTI(null)}>
        <Pressable style={s.overlay} onPress={() => setSelectedRTI(null)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            {selectedRTI && (() => {
              const meta = STATUS_META[selectedRTI.status] || STATUS_META.filed;
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <LinearGradient colors={[meta.color + "22", meta.bg]} style={{ padding: 20 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#111827", fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 }}>{selectedRTI.ticketId}</Text>
                        <Text style={{ color: "#111827", fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4, lineHeight: 26 }}>{selectedRTI.subject}</Text>
                      </View>
                      <Pressable onPress={() => setSelectedRTI(null)} style={s.closeBtn}>
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </Pressable>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                      <View style={[s.statusBadge, { backgroundColor: "rgba(255,255,255,0.7)" }]}>
                        <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                        <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
                      </View>
                    </View>
                  </LinearGradient>
                  <View style={{ padding: 20, gap: 16 }}>
                    {[
                      { label: "Department", val: selectedRTI.department, icon: "business" },
                      { label: "Filed On", val: new Date(selectedRTI.filedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), icon: "calendar" },
                      { label: "Response Deadline", val: new Date(selectedRTI.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }), icon: "time" },
                      { label: "District", val: selectedRTI.district, icon: "location" },
                    ].map(row => (
                      <View key={row.label} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={row.icon as any} size={16} color="#6B7280" />
                        </View>
                        <View>
                          <Text style={{ color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_500Medium", textTransform: "uppercase" }}>{row.label}</Text>
                          <Text style={{ color: "#111827", fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{row.val}</Text>
                        </View>
                      </View>
                    ))}
                    <View style={{ backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14 }}>
                      <Text style={{ color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", marginBottom: 6 }}>Your RTI Request</Text>
                      <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 }}>{selectedRTI.description}</Text>
                    </View>
                    {selectedRTI.response ? (
                      <View style={{ backgroundColor: "#F0FFF4", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#A7F3D0" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <Ionicons name="checkmark-circle" size={16} color="#00A651" />
                          <Text style={{ color: "#00A651", fontSize: 12, fontFamily: "Inter_700Bold" }}>Official Response Received</Text>
                        </View>
                        <Text style={{ color: "#374151", fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 }}>{selectedRTI.response}</Text>
                        {selectedRTI.respondedAt && (
                          <Text style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8 }}>
                            Responded on {new Date(selectedRTI.respondedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FDE68A" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <Ionicons name="time" size={14} color="#F59E0B" />
                          <Text style={{ color: "#F59E0B", fontSize: 12, fontFamily: "Inter_700Bold" }}>Awaiting Response</Text>
                        </View>
                        <Text style={{ color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                          The department must respond within 30 days. Deadline: {new Date(selectedRTI.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </Text>
                      </View>
                    )}
                    <View style={{ height: 10 }} />
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </Pressable>
      </Modal>

      {/* File RTI Modal */}
      <Modal visible={showForm} transparent animationType="slide" onRequestClose={() => setShowForm(false)}>
        <View style={s.overlay}>
          <ScrollView>
            <View style={[s.sheet, { borderRadius: 24, marginTop: 60 }]}>
              <View style={s.sheetHandle} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 }}>
                <View>
                  <Text style={{ color: "#111827", fontSize: 20, fontFamily: "Inter_700Bold" }}>File RTI Request</Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>Right to Information Act, 2005</Text>
                </View>
                <Pressable onPress={() => setShowForm(false)} style={s.closeBtn}>
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </View>
              <View style={{ paddingHorizontal: 20 }}>
                <Text style={s.fieldLabel}>SUBJECT OF RTI *</Text>
                <TextInput
                  style={s.textInput}
                  placeholder="e.g. Status of road repair work on Rajpur Road"
                  placeholderTextColor="#9CA3AF"
                  value={subject}
                  onChangeText={setSubject}
                />
                <Text style={s.fieldLabel}>DEPARTMENT *</Text>
                <Pressable onPress={() => setShowDeptPicker(true)} style={[s.textInput, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
                  <Text style={[{ color: department ? "#111827" : "#9CA3AF", fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 }]}>
                    {department || "Select government department..."}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
                </Pressable>
                <Text style={s.fieldLabel}>INFORMATION REQUESTED *</Text>
                <TextInput
                  style={[s.textInput, { minHeight: 120, textAlignVertical: "top" }]}
                  placeholder={`Describe the specific information you are seeking. Be precise. Example:\n\n"I request certified copies of:\n1. Work order for road repair on Rajpur Road\n2. Amount sanctioned and contractor name\n3. Expected completion date"`}
                  placeholderTextColor="#9CA3AF"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={5}
                />
                <View style={{ backgroundColor: "#F0FFF4", borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: "row", gap: 8 }}>
                  <Ionicons name="information-circle" size={16} color="#00A651" style={{ marginTop: 1 }} />
                  <Text style={{ color: "#00A651", fontSize: 11, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 16 }}>
                    Under RTI Act 2005, the department must respond within 30 days. Your request will be automatically logged with a ticket ID.
                  </Text>
                </View>
                <Pressable onPress={handleSubmit} disabled={submitting} style={s.submitBtn}>
                  {submitting ? <ActivityIndicator color="#fff" /> : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Ionicons name="paper-plane" size={16} color="#fff" />
                      <Text style={s.submitBtnText}>File RTI Request</Text>
                    </View>
                  )}
                </Pressable>
                <View style={{ height: 20 }} />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Department Picker Modal */}
      <Modal visible={showDeptPicker} transparent animationType="slide" onRequestClose={() => setShowDeptPicker(false)}>
        <Pressable style={s.overlay} onPress={() => setShowDeptPicker(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={{ color: "#111827", fontSize: 16, fontFamily: "Inter_700Bold", paddingHorizontal: 20, marginBottom: 12 }}>Select Department</Text>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              {DEPARTMENTS.map(dept => (
                <Pressable key={dept} onPress={() => { setDepartment(dept); setShowDeptPicker(false); }}
                  style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F3F4F6" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#374151", fontSize: 14, fontFamily: department === dept ? "Inter_700Bold" : "Inter_400Regular" }}>{dept}</Text>
                  </View>
                  {department === dept && <Ionicons name="checkmark-circle" size={18} color="#00A651" />}
                </Pressable>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* How RTI Works Guide */}
      <Modal visible={showGuide} transparent animationType="slide" onRequestClose={() => setShowGuide(false)}>
        <Pressable style={s.overlay} onPress={() => setShowGuide(false)}>
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ padding: 20 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text style={{ color: "#111827", fontSize: 20, fontFamily: "Inter_700Bold" }}>How RTI Works</Text>
                  <Pressable onPress={() => setShowGuide(false)} style={s.closeBtn}>
                    <Ionicons name="close" size={18} color="#6B7280" />
                  </Pressable>
                </View>
                {[
                  { step: "1", title: "File Your Request", body: "Write your RTI application specifying the exact information you need from the government department. Be specific and factual.", color: "#3B82F6" },
                  { step: "2", title: "Acknowledgement", body: "The Public Information Officer (PIO) must acknowledge your application within 5 days. You receive a tracking number.", color: "#8B5CF6" },
                  { step: "3", title: "30-Day Deadline", body: "The PIO must provide the requested information within 30 days. For matters concerning life and liberty, it's 48 hours.", color: "#F59E0B" },
                  { step: "4", title: "First Appeal", body: "If information is denied or unsatisfactory, file a First Appeal within 30 days to the First Appellate Authority.", color: "#EF4444" },
                  { step: "5", title: "State Information Commission", body: "If First Appeal is rejected, approach the Uttarakhand State Information Commission within 90 days.", color: "#00A651" },
                ].map(step => (
                  <View key={step.step} style={{ flexDirection: "row", gap: 14, marginBottom: 20 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: step.color, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" }}>{step.step}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 4 }}>{step.title}</Text>
                      <Text style={{ color: "#6B7280", fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 }}>{step.body}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ backgroundColor: "#FFF8E7", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FDE68A" }}>
                  <Text style={{ color: "#B45309", fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 4 }}>Emergency Contact</Text>
                  <Text style={{ color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    Uttarakhand Chief Information Commission: 0135-2714000{"\n"}Central RTI Portal: rtionline.gov.in
                  </Text>
                </View>
                <View style={{ height: 20 }} />
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F8F9FA" },
  header: { paddingHorizontal: 20, paddingBottom: 20 },
  headerTitle: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  headerSub2: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 14 },
  guideBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  guideBtnText: { color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  statsRow: { flexDirection: "row", gap: 8 },
  statChip: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 10, alignItems: "center" },
  statVal: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  statLabel: { color: "rgba(255,255,255,0.75)", fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },

  fileBtn: { borderRadius: 14, overflow: "hidden" },
  fileBtnGrad: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16 },
  fileBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },

  card: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E5E7EB", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  ticketId: { color: "#9CA3AF", fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  rtiSubject: { color: "#111827", fontSize: 14, fontFamily: "Inter_700Bold", marginTop: 2, lineHeight: 20 },
  rtiDept: { color: "#6B7280", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  metaText: { color: "#9CA3AF", fontSize: 11, fontFamily: "Inter_400Regular" },

  infoSection: { backgroundColor: "#fff", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "#E5E7EB", gap: 16 },
  infoSectionTitle: { color: "#111827", fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 4 },
  infoCard: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  infoTitle: { color: "#111827", fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 4 },
  infoBody: { color: "#6B7280", fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },

  empty: { padding: 40, alignItems: "center", gap: 8 },
  emptyTitle: { color: "#374151", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", overflow: "hidden" },
  sheetHandle: { width: 40, height: 4, backgroundColor: "#E5E7EB", borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 12 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },

  fieldLabel: { color: "#6B7280", fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  textInput: { backgroundColor: "#F9FAFB", borderRadius: 12, padding: 14, color: "#111827", fontSize: 14, fontFamily: "Inter_400Regular", borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 4 },
  submitBtn: { backgroundColor: "#00A651", borderRadius: 14, padding: 18, alignItems: "center", marginTop: 8 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
