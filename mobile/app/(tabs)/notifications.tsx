import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import {
  fetchAllChanges,
  fetchNotifications,
  type ChangeRow,
} from "../../src/api/tracking";
import {
  changeTypeLabel,
  formatChangeValue,
  formatRelativeTime,
} from "../../src/lib/format";
import { EmptyState, ErrorState, OfflineBanner, SkeletonList } from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";

const STATUS_LABEL: Record<string, string> = {
  sent: "Gönderildi",
  failed: "Başarısız",
  blocked: "Kapalı",
  pending: "Bekliyor",
};

export default function NotificationsScreen() {
  const online = useOnline();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<"Tümü" | "Okunmamış">("Tümü");

  const notif = useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
  const changes = useQuery({
    queryKey: ["changes-all"],
    queryFn: () => fetchAllChanges(),
    refetchInterval: false,
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
            refreshing={changes.isFetching || notif.isFetching}
            onRefresh={() => {
              changes.refetch();
              notif.refetch();
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
          Fiyat, stok ve varyant değişiklikleri. Bildirim türlerini web panelinden yönetin.
        </Text>

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
            message="Bildirimler alınamadı"
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
    marginBottom: 16,
  },
  hint: { color: "#71717A", fontSize: 12, lineHeight: 18, marginTop: 4 },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
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
});
