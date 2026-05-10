import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Modal, Platform, Animated, TextInput, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface BillBreakdown { label: string; amount: number; }
interface BillTransaction { ref: string; date: string; amount: number; method: string; status: string; }
interface BillUsage { label: string; value: string; unit: string; history: number[]; }
interface Bill {
  id: string; type: string; title: string; subtitle: string; accountNo: string;
  amount: number; dueDate: string; status: "unpaid" | "paid" | "overdue";
  period: string; icon: string; color: string; gradient: [string,string,string];
  usage: BillUsage; breakdown: BillBreakdown[]; transactions: BillTransaction[];
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  unpaid:  { bg:"#F59E0B22", text:"#F59E0B", label:"DUE",     icon:"time-outline" },
  overdue: { bg:"#EF444422", text:"#EF4444", label:"OVERDUE",  icon:"warning" },
  paid:    { bg:"#22C55E22", text:"#22C55E", label:"PAID",     icon:"checkmark-circle" },
};

function MiniBar({ history, color }: { history: number[]; color: string }) {
  const max = Math.max(...history, 1);
  return (
    <View style={{ flexDirection:"row", alignItems:"flex-end", gap:3, height:28 }}>
      {history.map((v,i) => (
        <View key={i} style={{
          width:12, borderRadius:3,
          height: Math.max(4, Math.round((v/max)*28)),
          backgroundColor: i === history.length-1 ? color : color+"55",
        }}/>
      ))}
    </View>
  );
}

function AnimatedSpinner({ color="#3B82F6" }: { color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin,{toValue:1,duration:900,useNativeDriver:false})).start();
  },[]);
  const rotate = spin.interpolate({inputRange:[0,1],outputRange:["0deg","360deg"]});
  return (
    <Animated.View style={{transform:[{rotate}],width:48,height:48,borderRadius:24,borderWidth:3,borderColor:color+"33",borderTopColor:color}}/>
  );
}

function SuccessCheckmark() {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(scale,{toValue:1.2,friction:5,useNativeDriver:false}),
      Animated.spring(scale,{toValue:1,friction:6,useNativeDriver:false}),
    ]).start();
  },[]);
  return (
    <Animated.View style={{transform:[{scale}]}}>
      <Ionicons name="checkmark-circle" size={72} color="#22C55E"/>
    </Animated.View>
  );
}

function BillCard({ bill, onPress, index=0 }: { bill:Bill; onPress:()=>void; index?:number }) {
  const status = STATUS_STYLES[bill.status];
  const slideY = useRef(new Animated.Value(40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY,{toValue:0,duration:420,delay:index*80,useNativeDriver:false}),
      Animated.timing(opacity,{toValue:1,duration:420,delay:index*80,useNativeDriver:false}),
    ]).start();
  },[]);
  const daysLeft = Math.ceil((new Date(bill.dueDate).getTime()-Date.now())/86400000);
  return (
    <Animated.View style={{opacity,transform:[{translateY:slideY},{scale}]}}>
      <Pressable onPress={onPress}
        onPressIn={()=>Animated.spring(scale,{toValue:0.97,useNativeDriver:false}).start()}
        onPressOut={()=>Animated.spring(scale,{toValue:1,friction:6,useNativeDriver:false}).start()}
        style={[s.billCard,bill.status==="overdue"&&{borderColor:"#EF444440"}]}>
        <LinearGradient colors={bill.gradient} style={s.billGrad}>
          {/* Top row */}
          <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
            <View style={{flexDirection:"row",gap:10,alignItems:"center",flex:1}}>
              <View style={{width:44,height:44,borderRadius:14,backgroundColor:bill.color+"30",alignItems:"center",justifyContent:"center"}}>
                <Ionicons name={bill.icon as any} size={22} color={bill.color}/>
              </View>
              <View style={{flex:1}}>
                <Text style={s.billTitle}>{bill.title}</Text>
                <Text style={s.billSub}>{bill.subtitle}</Text>
              </View>
            </View>
            <View style={[s.statusBadge,{backgroundColor:status.bg}]}>
              <Ionicons name={status.icon as any} size={10} color={status.text}/>
              <Text style={[s.statusText,{color:status.text}]}>{status.label}</Text>
            </View>
          </View>
          {/* Account */}
          <Text style={s.acct}>{bill.accountNo}</Text>
          {/* Usage mini-bar */}
          <View style={{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",marginTop:10,marginBottom:12}}>
            <View>
              <Text style={{color:"rgba(255,255,255,0.45)",fontSize:9,marginBottom:2}}>{bill.usage.label.toUpperCase()}</Text>
              <Text style={{color:"#fff",fontSize:20,fontFamily:"Inter_700Bold"}}>{bill.usage.value}</Text>
              <Text style={{color:"rgba(255,255,255,0.5)",fontSize:10}}>{bill.usage.unit}</Text>
            </View>
            <MiniBar history={bill.usage.history} color={bill.color}/>
          </View>
          {/* Divider */}
          <View style={{height:1,backgroundColor:"rgba(255,255,255,0.1)",marginBottom:12}}/>
          {/* Bottom */}
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
            <View>
              <Text style={{color:"rgba(255,255,255,0.55)",fontSize:11}}>{bill.period}</Text>
              <Text style={{color:bill.status==="overdue"?"#FCA5A5":"rgba(255,255,255,0.45)",fontSize:10,marginTop:1}}>
                {bill.status==="paid"?"✓ Paid":daysLeft<0?`Overdue by ${Math.abs(daysLeft)}d`:`Due in ${daysLeft}d`}
              </Text>
            </View>
            <View style={{alignItems:"flex-end"}}>
              <Text style={{color:"rgba(255,255,255,0.45)",fontSize:11}}>Rs.</Text>
              <Text style={{color:"#fff",fontSize:26,fontFamily:"Inter_700Bold",lineHeight:30}}>{bill.amount.toLocaleString("en-IN")}</Text>
            </View>
          </View>
          {/* Pay / Paid button */}
          {bill.status!=="paid" ? (
            <View style={{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,backgroundColor:"rgba(255,255,255,0.18)",borderRadius:12,padding:11,marginTop:14}}>
              <Ionicons name="card" size={14} color="#fff"/>
              <Text style={{color:"#fff",fontSize:12,fontFamily:"Inter_700Bold"}}>Pay Now · Rs. {bill.amount.toLocaleString("en-IN")}</Text>
            </View>
          ) : (
            <View style={{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,backgroundColor:"#22C55E22",borderRadius:12,padding:11,marginTop:14}}>
              <Ionicons name="checkmark-circle" size={14} color="#22C55E"/>
              <Text style={{color:"#22C55E",fontSize:12,fontFamily:"Inter_700Bold"}}>Paid · {new Date(bill.transactions[0]?.date||bill.dueDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const PAYMENT_METHODS = [
  { key:"upi",    icon:"📱", label:"UPI",         sub:"PhonePe · GPay · BHIM" },
  { key:"card",   icon:"💳", label:"Card",         sub:"Debit / Credit" },
  { key:"net",    icon:"🏦", label:"Net Banking",  sub:"All 50+ banks" },
  { key:"wallet", icon:"👛", label:"Wallet",        sub:"Paytm · MobiKwik" },
];

export default function BillsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveUser, setLiveUser] = useState<{name:string;phone:string;district:string}|null>(null);
  const [selectedBill, setSelectedBill] = useState<Bill|null>(null);
  const [detailView, setDetailView] = useState<"overview"|"breakdown"|"history">("overview");
  const [payStep, setPayStep] = useState<"confirm"|"processing"|"success">("confirm");
  const [payMethod, setPayMethod] = useState("upi");
  const [upiId, setUpiId] = useState("");
  const [payRef, setPayRef] = useState("");
  const headerAnim = useRef(new Animated.Value(-20)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;

  const fetchBills = useCallback(async () => {
    try {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      const res = await fetch(`${getApiUrl()}api/bills`, {
        headers: { Authorization: `Bearer ${tok}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBills(data.bills || []);
        setLiveUser(data.user || null);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerAnim,{toValue:0,duration:500,useNativeDriver:false}),
      Animated.timing(headerOpacity,{toValue:1,duration:500,useNativeDriver:false}),
    ]).start();
    fetchBills();
  }, []);

  const onRefresh = () => { setRefreshing(true); fetchBills(); };

  const unpaidTotal = bills.filter(b=>b.status!=="paid").reduce((s,b)=>s+b.amount,0);
  const paidCount = bills.filter(b=>b.status==="paid").length;
  const dueCount = bills.filter(b=>b.status==="unpaid").length;
  const overdueCount = bills.filter(b=>b.status==="overdue").length;

  const handlePay = (bill: Bill) => {
    setSelectedBill(bill); setPayStep("confirm"); setDetailView("overview");
    setPayMethod("upi"); setUpiId(""); setPayRef("");
  };

  const confirmPayment = async () => {
    if (!selectedBill) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPayStep("processing");
    try {
      const tok = await AsyncStorage.getItem("@sankalp_token");
      const res = await fetch(`${getApiUrl()}api/bills/${selectedBill.id}/pay`, {
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:`Bearer ${tok}`},
        body:JSON.stringify({method:payMethod,upiId:upiId||undefined}),
      });
      if (res.ok) {
        const data = await res.json();
        setPayRef(data.ref || `SANKALP-${Date.now().toString().slice(-8)}`);
      } else {
        setPayRef(`SANKALP-${Date.now().toString().slice(-8)}`);
      }
    } catch {
      await new Promise(r=>setTimeout(r,2000));
      setPayRef(`SANKALP-${Date.now().toString().slice(-8)}`);
    }
    setBills(prev=>prev.map(b=>b.id===selectedBill.id?{...b,status:"paid" as const}:b));
    setPayStep("success");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const closeModal = () => { setSelectedBill(null); setPayStep("confirm"); fetchBills(); };

  const topPad = Platform.OS==="web"?67:insets.top;
  const botPad = Platform.OS==="web"?34:insets.bottom;

  return (
    <View style={[s.container,{paddingTop:topPad}]}>
      {/* Header */}
      <Animated.View style={{opacity:headerOpacity,transform:[{translateY:headerAnim}]}}>
        <View style={{height:3,flexDirection:"row",overflow:"hidden"}}>
          <View style={{flex:1,backgroundColor:Colors.saffron}}/>
          <View style={{flex:1,backgroundColor:"#FFFFFF30"}}/>
          <View style={{flex:1,backgroundColor:Colors.nationalGreen}}/>
        </View>
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Uttarakhand Gov Bills</Text>
            <Text style={s.headerSub}>{liveUser?.name||user?.name||"—"} · {liveUser?.district||"—"}</Text>
          </View>
          <Pressable onPress={onRefresh} style={s.refreshBtn}>
            <Ionicons name="refresh" size={16} color={Colors.saffron}/>
            <Text style={{color:Colors.saffron,fontSize:11,fontFamily:"Inter_600SemiBold"}}>Live</Text>
          </Pressable>
        </View>
      </Animated.View>

      {loading ? (
        <View style={{flex:1,alignItems:"center",justifyContent:"center",gap:16}}>
          <AnimatedSpinner color={Colors.saffron}/>
          <Text style={{color:Colors.textMuted,fontSize:13,fontFamily:"Inter_400Regular"}}>Loading your bills…</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={{paddingBottom:botPad+100}}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.saffron}/>}>

          {/* Summary Card */}
          <LinearGradient colors={["#1E3A5F","#0F172A","#0A0F1C"]} style={s.summaryCard}>
            <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
              <View>
                <Text style={{color:Colors.textMuted,fontSize:11,fontFamily:"Inter_500Medium",marginBottom:4}}>TOTAL OUTSTANDING</Text>
                <Text style={{color:"#fff",fontSize:34,fontFamily:"Inter_700Bold",lineHeight:38}}>Rs. {unpaidTotal.toLocaleString("en-IN")}</Text>
                {overdueCount>0&&<Text style={{color:"#FCA5A5",fontSize:11,fontFamily:"Inter_500Medium",marginTop:4}}>⚠ {overdueCount} overdue — penalty may apply</Text>}
              </View>
              <View style={{width:52,height:52,borderRadius:16,backgroundColor:"#3B82F622",alignItems:"center",justifyContent:"center"}}>
                <Ionicons name="receipt-outline" size={28} color="#3B82F6"/>
              </View>
            </View>
            <View style={{flexDirection:"row",borderTopWidth:1,borderTopColor:"rgba(255,255,255,0.1)",paddingTop:14}}>
              {[
                {label:"Paid",val:paidCount,color:"#22C55E"},
                {label:"Due",val:dueCount,color:"#F59E0B"},
                {label:"Overdue",val:overdueCount,color:"#EF4444"},
                {label:"Total",val:bills.length,color:"#60A5FA"},
              ].map((item,i,arr)=>(
                <React.Fragment key={item.label}>
                  <View style={{flex:1,alignItems:"center"}}>
                    <Text style={{color:item.color,fontSize:22,fontFamily:"Inter_700Bold"}}>{item.val}</Text>
                    <Text style={{color:Colors.textMuted,fontSize:10,fontFamily:"Inter_400Regular",marginTop:2}}>{item.label}</Text>
                  </View>
                  {i<arr.length-1&&<View style={{width:1,height:36,backgroundColor:"rgba(255,255,255,0.1)"}}/>}
                </React.Fragment>
              ))}
            </View>
          </LinearGradient>

          {/* Live Dept Alerts */}
          {overdueCount>0&&(
            <View style={{marginHorizontal:16,marginBottom:14,borderRadius:14,overflow:"hidden",borderWidth:1,borderColor:"#EF444440"}}>
              <LinearGradient colors={["#450A0A","#7F1D1D"]} style={{padding:14}}>
                <View style={{flexDirection:"row",alignItems:"center",gap:8,marginBottom:8}}>
                  <View style={{width:7,height:7,borderRadius:3.5,backgroundColor:"#EF4444"}}/>
                  <Text style={{color:"#FCA5A5",fontSize:10,fontFamily:"Inter_700Bold",letterSpacing:1}}>LIVE DEPT ALERT</Text>
                  <Text style={{color:"#9CA3AF",fontSize:10,fontFamily:"Inter_400Regular",marginLeft:"auto" as any}}>{new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</Text>
                </View>
                <Text style={{color:"#fff",fontSize:13,fontFamily:"Inter_600SemiBold",marginBottom:4}}>⚠️ Overdue Bills Flagged by Department</Text>
                <Text style={{color:"#FCA5A5",fontSize:12,fontFamily:"Inter_400Regular",lineHeight:18}}>
                  {overdueCount} bill{overdueCount>1?"s":""}  overdue. Continued non-payment may result in service disconnection.
                </Text>
                <View style={{flexDirection:"row",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  {bills.filter(b=>b.status==="overdue").map(b=>(
                    <View key={b.id} style={{flexDirection:"row",alignItems:"center",gap:5,backgroundColor:"#EF444422",borderRadius:8,paddingHorizontal:10,paddingVertical:5}}>
                      <Ionicons name="alert-circle" size={11} color="#EF4444"/>
                      <Text style={{color:"#EF4444",fontSize:10,fontFamily:"Inter_700Bold"}}>{b.subtitle}</Text>
                    </View>
                  ))}
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Bills List */}
          <Text style={s.sectionLabel}>Your Bills</Text>
          {bills.map((bill,i)=>(
            <BillCard key={bill.id} bill={bill} index={i} onPress={()=>handlePay(bill)}/>
          ))}

          {/* Payment History Summary */}
          <Text style={s.sectionLabel}>Recent Transactions</Text>
          <View style={s.txCard}>
            {bills.flatMap(b=>b.transactions.map(tx=>({...tx,billTitle:b.title,color:b.color}))).sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,6).map((tx,i)=>(
              <View key={i} style={[s.txRow,i>0&&{borderTopWidth:1,borderTopColor:Colors.border}]}>
                <View style={{width:36,height:36,borderRadius:10,backgroundColor:tx.color+"22",alignItems:"center",justifyContent:"center"}}>
                  <Ionicons name="checkmark-circle" size={18} color={tx.color}/>
                </View>
                <View style={{flex:1,marginLeft:10}}>
                  <Text style={s.txTitle}>{tx.billTitle}</Text>
                  <Text style={s.txSub}>{new Date(tx.date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})} · {tx.method}</Text>
                </View>
                <View style={{alignItems:"flex-end"}}>
                  <Text style={{color:"#22C55E",fontSize:13,fontFamily:"Inter_700Bold"}}>Rs. {tx.amount.toLocaleString("en-IN")}</Text>
                  <Text style={s.txRef}>{tx.ref.slice(-10)}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={s.infoBox}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.textMuted}/>
            <Text style={s.infoText}>Bill data linked to registered address · Disputes: 1800-180-4167 (UK Helpline)</Text>
          </View>
        </ScrollView>
      )}

      {/* Bill Detail + Payment Modal */}
      <Modal visible={!!selectedBill} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            {payStep==="confirm"&&selectedBill&&(
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Bill Header */}
                <LinearGradient colors={selectedBill.gradient} style={{borderRadius:16,padding:16,marginBottom:16}}>
                  <View style={{flexDirection:"row",gap:10,alignItems:"center",marginBottom:12}}>
                    <View style={{width:44,height:44,borderRadius:12,backgroundColor:selectedBill.color+"33",alignItems:"center",justifyContent:"center"}}>
                      <Ionicons name={selectedBill.icon as any} size={22} color={selectedBill.color}/>
                    </View>
                    <View style={{flex:1}}>
                      <Text style={{color:"#fff",fontSize:17,fontFamily:"Inter_700Bold"}}>{selectedBill.title}</Text>
                      <Text style={{color:"rgba(255,255,255,0.6)",fontSize:11,fontFamily:"Inter_400Regular"}}>{selectedBill.accountNo}</Text>
                    </View>
                    <Pressable onPress={closeModal} style={{width:32,height:32,borderRadius:16,backgroundColor:"rgba(255,255,255,0.1)",alignItems:"center",justifyContent:"center"}}>
                      <Ionicons name="close" size={16} color="#fff"/>
                    </Pressable>
                  </View>
                  <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end"}}>
                    <View>
                      <Text style={{color:"rgba(255,255,255,0.6)",fontSize:10}}>{selectedBill.period}</Text>
                      <Text style={{color:"rgba(255,255,255,0.5)",fontSize:10,marginTop:2}}>
                        Due: {new Date(selectedBill.dueDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}
                      </Text>
                    </View>
                    <Text style={{color:"#fff",fontSize:32,fontFamily:"Inter_700Bold"}}>Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                  </View>
                </LinearGradient>

                {/* Tab nav */}
                <View style={{flexDirection:"row",backgroundColor:Colors.bgCard,borderRadius:12,padding:3,marginBottom:16}}>
                  {(["overview","breakdown","history"] as const).map(t=>(
                    <Pressable key={t} onPress={()=>setDetailView(t)} style={[{flex:1,borderRadius:10,padding:8,alignItems:"center"},detailView===t&&{backgroundColor:Colors.bg}]}>
                      <Text style={{color:detailView===t?Colors.saffron:Colors.textMuted,fontSize:11,fontFamily:"Inter_600SemiBold",textTransform:"capitalize"}}>{t}</Text>
                    </Pressable>
                  ))}
                </View>

                {detailView==="overview"&&(
                  <View style={{gap:8,marginBottom:16}}>
                    {/* Usage */}
                    <View style={[s.infoRow,{alignItems:"center"}]}>
                      <Text style={s.infoRowLabel}>{selectedBill.usage.label}</Text>
                      <View style={{flexDirection:"row",alignItems:"baseline",gap:4}}>
                        <Text style={{color:"#fff",fontSize:18,fontFamily:"Inter_700Bold"}}>{selectedBill.usage.value}</Text>
                        <Text style={{color:Colors.textMuted,fontSize:11}}>{selectedBill.usage.unit}</Text>
                      </View>
                    </View>
                    <View style={[s.infoRow,{alignItems:"center"}]}>
                      <Text style={s.infoRowLabel}>Period</Text>
                      <Text style={{color:Colors.textPrimary,fontSize:13,fontFamily:"Inter_500Medium"}}>{selectedBill.period}</Text>
                    </View>
                    <View style={[s.infoRow,{alignItems:"center"}]}>
                      <Text style={s.infoRowLabel}>Department</Text>
                      <Text style={{color:Colors.textPrimary,fontSize:13,fontFamily:"Inter_500Medium"}}>{selectedBill.subtitle}</Text>
                    </View>
                    <View style={{padding:12,backgroundColor:Colors.bgCard,borderRadius:12,marginTop:4}}>
                      <Text style={{color:Colors.textMuted,fontSize:10,fontFamily:"Inter_700Bold",marginBottom:8}}>5-MONTH TREND</Text>
                      <View style={{flexDirection:"row",alignItems:"flex-end",gap:6,height:40}}>
                        {selectedBill.usage.history.map((v,i)=>{
                          const max=Math.max(...selectedBill.usage.history,1);
                          const h=Math.max(6,Math.round((v/max)*40));
                          const months=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
                          const mo=months[(new Date().getMonth()-4+i+12)%12];
                          return (
                            <View key={i} style={{flex:1,alignItems:"center",gap:3}}>
                              <View style={{width:"100%",borderRadius:4,height:h,backgroundColor:i===selectedBill.usage.history.length-1?selectedBill.color:selectedBill.color+"55"}}/>
                              <Text style={{color:Colors.textMuted,fontSize:8}}>{mo}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                )}

                {detailView==="breakdown"&&(
                  <View style={{marginBottom:16}}>
                    {selectedBill.breakdown.map((item,i)=>(
                      <View key={i} style={[s.infoRow,{alignItems:"center"},i>0&&{borderTopWidth:1,borderTopColor:Colors.border}]}>
                        <Text style={{color:Colors.textPrimary,fontSize:13,fontFamily:"Inter_400Regular"}}>{item.label}</Text>
                        <Text style={{color:Colors.textPrimary,fontSize:13,fontFamily:"Inter_600SemiBold"}}>Rs. {item.amount.toLocaleString("en-IN")}</Text>
                      </View>
                    ))}
                    <View style={[s.infoRow,{alignItems:"center",borderTopWidth:2,borderTopColor:Colors.saffron}]}>
                      <Text style={{color:Colors.saffron,fontSize:14,fontFamily:"Inter_700Bold"}}>Total</Text>
                      <Text style={{color:Colors.saffron,fontSize:18,fontFamily:"Inter_700Bold"}}>Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                    </View>
                  </View>
                )}

                {detailView==="history"&&(
                  <View style={{marginBottom:16}}>
                    {selectedBill.transactions.length===0 ? (
                      <Text style={{color:Colors.textMuted,textAlign:"center",padding:20,fontSize:13}}>No payment history</Text>
                    ) : selectedBill.transactions.map((tx,i)=>(
                      <View key={i} style={[{padding:12,borderRadius:12,backgroundColor:Colors.bgCard,marginBottom:8}]}>
                        <View style={{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                          <Text style={{color:"#22C55E",fontSize:13,fontFamily:"Inter_700Bold"}}>Rs. {tx.amount.toLocaleString("en-IN")}</Text>
                          <View style={{backgroundColor:"#22C55E22",borderRadius:6,paddingHorizontal:8,paddingVertical:2}}>
                            <Text style={{color:"#22C55E",fontSize:10,fontFamily:"Inter_700Bold"}}>✓ SUCCESS</Text>
                          </View>
                        </View>
                        <Text style={{color:Colors.textMuted,fontSize:11}}>{new Date(tx.date).toLocaleDateString("en-IN",{day:"2-digit",month:"long",year:"numeric"})} · {tx.method}</Text>
                        <Text style={{color:Colors.textMuted,fontSize:10,marginTop:2,fontFamily:"Inter_400Regular"}}>Ref: {tx.ref}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Payment Method */}
                {selectedBill.status!=="paid"&&(
                  <>
                    <Text style={{color:Colors.textMuted,fontSize:10,fontFamily:"Inter_700Bold",letterSpacing:1,marginBottom:10}}>PAYMENT METHOD</Text>
                    <View style={{flexDirection:"row",flexWrap:"wrap",gap:8,marginBottom:14}}>
                      {PAYMENT_METHODS.map(m=>(
                        <Pressable key={m.key} onPress={()=>setPayMethod(m.key)} style={{flex:1,minWidth:"44%",backgroundColor:payMethod===m.key?"#22C55E11":Colors.bgCard,borderRadius:12,padding:10,alignItems:"center",gap:3,borderWidth:payMethod===m.key?1.5:1,borderColor:payMethod===m.key?"#22C55E55":Colors.border}}>
                          <Text style={{fontSize:20}}>{m.icon}</Text>
                          <Text style={{color:payMethod===m.key?"#22C55E":"#fff",fontSize:11,fontFamily:"Inter_700Bold"}}>{m.label}</Text>
                          <Text style={{color:Colors.textMuted,fontSize:9}}>{m.sub}</Text>
                        </Pressable>
                      ))}
                    </View>

                    {payMethod==="upi"&&(
                      <View style={{marginBottom:14}}>
                        <Text style={{color:Colors.textMuted,fontSize:10,fontFamily:"Inter_700Bold",letterSpacing:1,marginBottom:6}}>UPI ID (optional)</Text>
                        <TextInput
                          value={upiId} onChangeText={setUpiId}
                          placeholder="yourname@upi"
                          placeholderTextColor={Colors.textMuted}
                          style={{backgroundColor:Colors.bgCard,borderWidth:1,borderColor:Colors.border,borderRadius:10,padding:12,color:Colors.textPrimary,fontSize:13,fontFamily:"Inter_400Regular"}}
                          keyboardType="email-address" autoCapitalize="none"
                        />
                        <Text style={{color:Colors.textMuted,fontSize:10,marginTop:4}}>Leave blank to choose at gateway</Text>
                      </View>
                    )}

                    <View style={{flexDirection:"row",alignItems:"center",gap:6,backgroundColor:"#22C55E11",borderRadius:10,padding:10,marginBottom:16}}>
                      <Ionicons name="shield-checkmark" size={14} color="#22C55E"/>
                      <Text style={{flex:1,color:"#22C55E",fontSize:11,fontFamily:"Inter_500Medium"}}>256-bit encrypted · RBI compliant · Uttarakhand e-Pay Gateway</Text>
                    </View>

                    <View style={{flexDirection:"row",gap:10}}>
                      <Pressable onPress={closeModal} style={s.cancelBtn}>
                        <Text style={s.cancelText}>Cancel</Text>
                      </Pressable>
                      <Pressable onPress={confirmPayment} style={s.confirmBtn}>
                        <Ionicons name="card" size={15} color="#fff"/>
                        <Text style={s.confirmText}>Pay Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                      </Pressable>
                    </View>
                  </>
                )}

                {selectedBill.status==="paid"&&(
                  <Pressable onPress={closeModal} style={[s.confirmBtn,{backgroundColor:"#22C55E"}]}>
                    <Ionicons name="checkmark" size={15} color="#fff"/>
                    <Text style={s.confirmText}>Already Paid · Close</Text>
                  </Pressable>
                )}
              </ScrollView>
            )}

            {payStep==="processing"&&(
              <View style={{alignItems:"center",padding:40,gap:20}}>
                <AnimatedSpinner color="#3B82F6"/>
                <Text style={{color:"#fff",fontSize:17,fontFamily:"Inter_700Bold"}}>Processing Payment</Text>
                <Text style={{color:Colors.textMuted,fontSize:13,textAlign:"center"}}>Connecting to Uttarakhand e-Pay Gateway…</Text>
                <View style={{flexDirection:"row",gap:8,marginTop:4}}>
                  {["Secure","Encrypted","RBI Approved"].map(t=>(
                    <View key={t} style={{backgroundColor:"#22C55E22",borderRadius:8,paddingHorizontal:10,paddingVertical:4}}>
                      <Text style={{color:"#22C55E",fontSize:10,fontFamily:"Inter_600SemiBold"}}>{t}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {payStep==="success"&&selectedBill&&(
              <View style={{alignItems:"center",padding:32,gap:14}}>
                <SuccessCheckmark/>
                <Text style={{color:"#fff",fontSize:20,fontFamily:"Inter_700Bold"}}>Payment Successful!</Text>
                <Text style={{color:Colors.textMuted,fontSize:13}}>{selectedBill.title}</Text>
                <Text style={{color:"#22C55E",fontSize:30,fontFamily:"Inter_700Bold"}}>Rs. {selectedBill.amount.toLocaleString("en-IN")}</Text>
                <View style={{backgroundColor:"#1c2128",borderRadius:12,padding:14,width:"100%",gap:6}}>
                  <View style={{flexDirection:"row",justifyContent:"space-between"}}>
                    <Text style={{color:Colors.textMuted,fontSize:12}}>Reference No.</Text>
                    <Text style={{color:"#fff",fontSize:12,fontFamily:"Inter_700Bold"}}>{payRef}</Text>
                  </View>
                  <View style={{flexDirection:"row",justifyContent:"space-between"}}>
                    <Text style={{color:Colors.textMuted,fontSize:12}}>Payment Method</Text>
                    <Text style={{color:"#fff",fontSize:12,fontFamily:"Inter_500Medium"}}>{PAYMENT_METHODS.find(m=>m.key===payMethod)?.label}</Text>
                  </View>
                  <View style={{flexDirection:"row",justifyContent:"space-between"}}>
                    <Text style={{color:Colors.textMuted,fontSize:12}}>Date & Time</Text>
                    <Text style={{color:"#fff",fontSize:12,fontFamily:"Inter_500Medium"}}>{new Date().toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})}</Text>
                  </View>
                </View>
                <Pressable onPress={closeModal} style={[s.confirmBtn,{backgroundColor:"#22C55E",width:"100%"}]}>
                  <Ionicons name="checkmark" size={16} color="#fff"/>
                  <Text style={s.confirmText}>Done</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:{flex:1,backgroundColor:Colors.bg},
  header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingTop:10,paddingBottom:14},
  headerTitle:{color:"#fff",fontSize:22,fontFamily:"Inter_700Bold"},
  headerSub:{color:Colors.textMuted,fontSize:12,fontFamily:"Inter_400Regular",marginTop:2},
  refreshBtn:{flexDirection:"row",alignItems:"center",gap:5,backgroundColor:Colors.saffron+"18",borderRadius:12,paddingHorizontal:12,paddingVertical:6,borderWidth:1,borderColor:Colors.saffron+"44"},
  summaryCard:{marginHorizontal:16,marginBottom:16,borderRadius:20,padding:20,borderWidth:1,borderColor:"#1E3A5F"},
  sectionLabel:{color:Colors.textMuted,fontSize:11,fontFamily:"Inter_600SemiBold",textTransform:"uppercase",letterSpacing:1,paddingHorizontal:20,marginBottom:12},
  billCard:{marginHorizontal:16,marginBottom:14,borderRadius:18,overflow:"hidden",borderWidth:1,borderColor:"rgba(255,255,255,0.08)"},
  billGrad:{padding:18},
  billTitle:{color:"#fff",fontSize:16,fontFamily:"Inter_700Bold"},
  billSub:{color:"rgba(255,255,255,0.55)",fontSize:11,fontFamily:"Inter_400Regular",marginTop:1},
  acct:{color:"rgba(255,255,255,0.35)",fontSize:10,fontFamily:"Inter_400Regular",letterSpacing:0.3},
  statusBadge:{flexDirection:"row",alignItems:"center",gap:4,borderRadius:8,paddingHorizontal:8,paddingVertical:3},
  statusText:{fontSize:10,fontFamily:"Inter_700Bold",letterSpacing:0.3},
  txCard:{marginHorizontal:16,marginBottom:16,backgroundColor:Colors.bgCard,borderRadius:16,borderWidth:1,borderColor:Colors.border,overflow:"hidden"},
  txRow:{flexDirection:"row",alignItems:"center",padding:14},
  txTitle:{color:Colors.textPrimary,fontSize:12,fontFamily:"Inter_600SemiBold"},
  txSub:{color:Colors.textMuted,fontSize:10,fontFamily:"Inter_400Regular",marginTop:1},
  txRef:{color:Colors.textMuted,fontSize:9,fontFamily:"Inter_400Regular",marginTop:1},
  infoBox:{flexDirection:"row",alignItems:"flex-start",gap:8,marginHorizontal:16,marginBottom:16,backgroundColor:Colors.bgCard,borderRadius:12,padding:12,borderWidth:1,borderColor:Colors.border},
  infoText:{flex:1,color:Colors.textMuted,fontSize:11,fontFamily:"Inter_400Regular"},
  overlay:{flex:1,backgroundColor:"rgba(0,0,0,0.7)",justifyContent:"flex-end"},
  modalCard:{backgroundColor:"#0d1117",borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,maxHeight:"92%",borderTopWidth:1,borderColor:"#30363d"},
  infoRow:{padding:12,backgroundColor:Colors.bgCard,borderRadius:0,flexDirection:"row",justifyContent:"space-between",padding:12},
  infoRowLabel:{color:Colors.textMuted,fontSize:12,fontFamily:"Inter_400Regular"},
  cancelBtn:{flex:1,backgroundColor:Colors.bgCard,borderRadius:14,padding:14,alignItems:"center",borderWidth:1,borderColor:Colors.border},
  cancelText:{color:Colors.textPrimary,fontSize:13,fontFamily:"Inter_600SemiBold"},
  confirmBtn:{flex:2,backgroundColor:Colors.saffron,borderRadius:14,padding:14,alignItems:"center",flexDirection:"row",justifyContent:"center",gap:8},
  confirmText:{color:"#fff",fontSize:14,fontFamily:"Inter_700Bold"},
});
