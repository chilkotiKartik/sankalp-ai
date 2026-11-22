import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Outbox from "@/lib/offline-queue";
import { getApiUrl } from "@/lib/query-client";
import { useI18n } from "@/lib/i18n";

/** m14 / P5.1: shows reports saved on the phone that are waiting for a connection, with a manual retry. */
export function OfflineBanner({ token, userId, refresh: refreshToken, onSent }: { token: string | null; userId: string | null; refresh: () => Promise<string | null>; onSent?: () => void }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<Outbox.OutboxItem[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) { setPending(0); setFailed([]); return; }
    setPending((await Outbox.pending(userId)).length);
    setFailed(await Outbox.failed(userId));
  }, [userId]);
  useEffect(() => { void refresh(); const i = setInterval(refresh, 10_000); return () => clearInterval(i); }, [refresh]);

  const retry = async () => {
    setBusy(true);
    if (!userId) { setBusy(false); return; }
    const r = await Outbox.flush(userId, Outbox.makeSender(getApiUrl(), () => token, refreshToken), undefined, true);
    setBusy(false);
    await refresh();
    if (r.sent) onSent?.();
  };

  if (!pending && !failed.length) return null;
  return (
    <View style={s.wrap} accessibilityRole="alert">
      {pending > 0 && (
        <View style={s.row}>
          <Ionicons name="cloud-offline-outline" size={18} color="#92400E" />
          <Text style={s.txt}>{t("common.offline")} · {pending} {pending === 1 ? "report" : "reports"} waiting to send</Text>
          <Pressable onPress={retry} disabled={busy} accessibilityRole="button" accessibilityLabel={t("common.retry")} style={s.btn}>
            <Text style={s.btnTxt}>{busy ? "…" : t("common.retry")}</Text>
          </Pressable>
        </View>
      )}
      {failed.map(f => (
        <View key={f.id} style={s.row}>
          <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" />
          <Text style={[s.txt, { color: "#B91C1C" }]} numberOfLines={2}>“{f.label}” was not accepted: {f.error}</Text>
          <Pressable onPress={async () => { await Outbox.retryFailed(userId!, f.id); await retry(); }} accessibilityRole="button" accessibilityLabel={t("common.retry")} style={s.btn}>
            <Ionicons name="refresh" size={16} color="#374151" />
          </Pressable>
          <Pressable onPress={async () => { await Outbox.dismissFailed(userId!, f.id); await refresh(); }} accessibilityRole="button" accessibilityLabel="Dismiss" style={s.btn}>
            <Ionicons name="close" size={16} color="#374151" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: "#FFFBEB", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 10, padding: 8, marginHorizontal: 16, marginBottom: 8, gap: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  txt: { flex: 1, color: "#92400E", fontSize: 13 },
  btn: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderRadius: 8, backgroundColor: "#FDE68A" },
  btnTxt: { color: "#78350F", fontWeight: "700" },
});
