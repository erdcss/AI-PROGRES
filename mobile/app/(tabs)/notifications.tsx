import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import {
  fetchAllChanges,
  fetchNotificationSettings,
  fetchNotifications,
  sendMobileNotificationTest,
  toggleAllNotificationSettings,
  updateNotificationSetting,
  type ChangeRow,
} from "../../src/api/tracking";
import {
  changeTypeLabel,
  formatChangeValue,
  formatRelativeTime,
} from "../../src/lib/format";
import {
  EmptyState,
  ErrorState,
  OfflineBanner,
  SettingToggle,
  SkeletonList,
} from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";
import { useNotificationPermission } from "../../src/components/NotificationPermissionGate";

const LABELS: Record<string, { title: string; hint: string }> = {
  new_product: {
    title: "Yeni ürün",
    hint: "Hafızaya veya takip listesine ürün eklendiğinde",
  },
  variant_change: {
    title: "Varyant değişikliği",
    hint: "Renk, beden veya seçenek değiştiğinde",
  },
  variant_removed: {
    title: "Varyant kaldırıldı",
    hint: "Bir seçenek kaynaktan silindiğinde",
  },
  price_change: {
    title: "Fiyat değişikliği",
    hint: "Alış veya satış fiyatı değiştiğinde",
  },
  stock_update: {
    title: "Stok güncellemesi",
    hint: "Stok bitti, geldi veya adet değiştiğinde",
  },
  shopify_upload: {
    title: "Shopify yükleme",
    hint: "Ürün mağazaya aktarıldığında",
  },
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Gönderildi",
  failed: "Başarısız",
  blocked: "Kapalı",
  pending: "Bekliyor",
};

export default function NotificationsScreen() {
  const online = useOnline();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const permission = useNotificationPermission();
  const [filter, setFilter] = useState<"Tümü" | "Okunmamış">("Tümü");

  const settingsQ = useQuery({
    queryKey: ["notification-settings"],
    queryFn: fetchNotificationSettings,
  });
  const notif = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const changes = useQuery({
    queryKey: ["changes-all"],
    queryFn: () => fetchAllChanges(),
    refetchInterval: false,
  });

  const settings = (settingsQ.data?.settings || []).filter((s) => s.notificationType !== "test");
  const allOn = settings.length > 0 && settings.every((s) => s.enabled);

  const toggleOne = useMutation({
    mutationFn: ({ type, enabled }: { type: string; enabled: boolean }) =>
      updateNotificationSetting(type, enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-settings"] });
    },
    onError: (err: Error) => Alert.alert("Ayar", err.message),
  });

  const toggleAll = useMutation({
    mutationFn: (enabled: boolean) => toggleAllNotificationSettings(enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notification-settings"] });
    },
    onError: (err: Error) => Alert.alert("Ayar", err.message),
  });

  const testMut = useMutation({
    mutationFn: sendMobileNotificationTest,
    onSuccess: (data) => {
      Alert.alert("Mobil test", data.message || "Bildirim gönderildi");
    },
    onError: (err: Error) => Alert.alert("Test başarısız", err.message),
  });

  const items = useMemo(() => {
    let list: ChangeRow[] = changes.data?.changes?.length
      ? changes.data.changes
      : notif.data?.lastChanges || [];
    if (filter === "Okunmamış") list = list.filter((c) => !c.seenAt);
    return list.slice(0, 40);
  }, [changes.data, notif.data, filter]);

  const loading = changes.isLoading && notif.isLoading;
  const error = changes.isError && notif.isError;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={settingsQ.isFetching || changes.isFetching}
            onRefresh={() => {
              settingsQ.refetch();
              changes.refetch();
              notif.refetch();
              void permission.refresh();
            }}
            tintColor={colors.text}
          />
        }
      >
        <View style={styles.iconBox}>
          <Ionicons name="notifications-outline" size={20} color={colors.text} />
        </View>
        <Text style={styles.pageTitle}>BİLDİRİMLER</Text>
        <Text style={styles.pageCopy}>
          Hangi olaylarda bildirim gideceğini açıp kapatın. Test, kayıtlı ORVIAN cihazlarına mobil bildirim gönderir.
        </Text>

        {permission.status !== "granted" ? (
          <Pressable
            onPress={permission.show}
            style={({ pressed }) => [styles.card, styles.permCard, pressed && styles.pressed]}
          >
            <Text style={styles.cardKicker}>CİHAZ İZNİ</Text>
            <Text style={styles.permTitle}>Sistem bildirim izni gerekli</Text>
            <Text style={styles.hint}>
              Dokunun; izin Android sistem penceresinden verilir. Ardından Ayarlar’dan cihazı panele kaydedin.
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.ready}>Cihaz kaydı hazır</Text>
        )}

        <View style={styles.card}>
          <SettingToggle
            label="Tüm bildirimler"
            hint="Tek tuşla hepsini aç veya kapat"
            value={allOn}
            disabled={toggleAll.isPending || settingsQ.isLoading}
            onValueChange={(v) => toggleAll.mutate(v)}
          />
          {settings.map((row) => {
            const meta = LABELS[row.notificationType] || {
              title: row.notificationType,
              hint: row.description || "",
            };
            return (
              <SettingToggle
                key={row.notificationType}
                label={meta.title}
                hint={meta.hint}
                value={Boolean(row.enabled)}
                disabled={toggleOne.isPending}
                onValueChange={(v) =>
                  toggleOne.mutate({ type: row.notificationType, enabled: v })
                }
              />
            );
          })}
        </View>

        <Pressable
          onPress={() => testMut.mutate()}
          disabled={testMut.isPending || permission.status !== "granted"}
          style={({ pressed }) => [styles.testBtn, pressed && styles.pressed]}
        >
          <Ionicons name="send-outline" size={16} color={colors.text} />
          <Text style={styles.testText}>
            {testMut.isPending ? "GÖNDERİLİYOR…" : "TEST BİLDİRİMİ GÖNDER"}
          </Text>
        </Pressable>

        <View style={styles.card}>
          <View style={styles.historyHead}>
            <Ionicons name="time-outline" size={16} color="#A1A1AA" />
            <View>
              <Text style={styles.cardKicker}>BİLDİRİM GEÇMİŞİ</Text>
              <Text style={styles.hint}>Son gönderilen ve bekleyen kayıtlar</Text>
            </View>
          </View>
          <View style={styles.filterRow}>
            {(["Tümü", "Okunmamış"] as const).map((opt) => (
              <Pressable
                key={opt}
                onPress={() => setFilter(opt)}
                style={[styles.filterTab, filter === opt && styles.filterTabOn]}
              >
                <Text style={[styles.filterText, filter === opt && styles.filterTextOn]}>{opt}</Text>
              </Pressable>
            ))}
          </View>
          {loading ? (
            <SkeletonList rows={5} />
          ) : error ? (
            <ErrorState
              message="Geçmiş alınamadı"
              onRetry={() => {
                changes.refetch();
                notif.refetch();
              }}
            />
          ) : items.length === 0 ? (
            <EmptyState message="Henüz bildirim kaydı yok." />
          ) : (
            items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/change/${item.id}`)}
                style={styles.historyRow}
              >
                <View style={styles.historyTop}>
                  <Text style={styles.historyTitle} numberOfLines={1}>
                    {item.productTitle || `Takip #${item.trackedProductId}`}
                  </Text>
                  <Text style={styles.historyStatus}>
                    {STATUS_LABEL[item.status || "pending"] || item.status || "Bekliyor"}
                  </Text>
                </View>
                <Text style={styles.hint} numberOfLines={2}>
                  {changeTypeLabel(item.changeType)} · {formatChangeValue(item.oldValue)} →{" "}
                  {formatChangeValue(item.newValue)}
                </Text>
                <Text style={styles.historyTime}>{formatRelativeTime(item.createdAt)}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#27272A",
    backgroundColor: "#09090B",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  pageTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "600",
    letterSpacing: 3.2,
  },
  pageCopy: {
    color: "#8A8A8A",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  ready: {
    color: "#71717A",
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    marginBottom: 14,
  },
  card: {
    backgroundColor: "#070707",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#27272A",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 14,
  },
  permCard: { paddingVertical: 16 },
  cardKicker: {
    color: colors.text,
    fontSize: 11,
    letterSpacing: 2.4,
    fontWeight: "600",
  },
  permTitle: { color: colors.text, fontSize: 14, marginTop: 6 },
  hint: { color: "#71717A", fontSize: 12, lineHeight: 18, marginTop: 4 },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3F3F46",
    backgroundColor: "#09090B",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
  },
  testText: {
    color: colors.text,
    fontSize: 12,
    letterSpacing: 2.2,
    fontWeight: "600",
  },
  historyHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#18181B",
  },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 12, marginBottom: 4 },
  filterTab: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#27272A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterTabOn: { borderColor: "#A1A1AA" },
  filterText: { color: "#71717A", fontSize: 12 },
  filterTextOn: { color: colors.text, fontWeight: "600" },
  historyRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#18181B",
  },
  historyTop: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  historyTitle: { color: colors.text, fontSize: 13, flex: 1 },
  historyStatus: {
    color: "#71717A",
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  historyTime: { color: "#52525B", fontSize: 11, marginTop: 4 },
  pressed: { opacity: 0.7 },
});
