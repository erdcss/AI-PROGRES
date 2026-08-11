import React from "react";
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
  clearPushInbox,
  fetchPushInboxRecent,
  type PushInboxItem,
} from "../../src/api/tracking";
import { formatRelativeTime } from "../../src/lib/format";
import { EmptyState, ErrorState, OfflineBanner, SkeletonList } from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";

function typeLabel(type?: string) {
  const t = String(type || "").toUpperCase();
  if (t === "TEST") return "Test";
  if (t.includes("TRANSFERRED")) return "Aktarım";
  if (t.includes("PRICE")) return "Fiyat";
  if (t.includes("STOCK")) return "Stok";
  if (t.includes("VARIANT")) return "Varyant";
  if (t.includes("PRODUCT")) return "Ürün";
  if (t.includes("SHOPIFY")) return "Shopify";
  return "Bildirim";
}

export default function NotificationsScreen() {
  const online = useOnline();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();

  const inbox = useQuery({
    queryKey: ["push-inbox-recent"],
    queryFn: () => fetchPushInboxRecent(40),
    refetchInterval: false,
  });

  const clearMut = useMutation({
    mutationFn: clearPushInbox,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["push-inbox-recent"] });
      void qc.invalidateQueries({ queryKey: ["notifications-badge"] });
    },
    onError: (err: Error) => Alert.alert("Temizle", err.message || "Silinemedi"),
  });

  const items: PushInboxItem[] = inbox.data?.items || [];

  const onClear = () => {
    if (!items.length || clearMut.isPending) return;
    Alert.alert("Bildirimleri temizle", "Tüm bildirimler listeden silinsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Temizle",
        style: "destructive",
        onPress: () => clearMut.mutate(),
      },
    ]);
  };

  const openItem = (item: PushInboxItem) => {
    const changeId = item.data?.changeId;
    const productId = String(item.data?.productId || "");
    if (changeId) {
      router.push(`/change/${changeId}`);
      return;
    }
    if (productId.startsWith("memory-") || productId.startsWith("tracked-") || productId.startsWith("scraped-")) {
      router.push(`/product/${productId}`);
      return;
    }
    if (productId) router.push(`/product/tracked-${productId}`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={inbox.isFetching}
            onRefresh={() => inbox.refetch()}
            tintColor={colors.text}
          />
        }
      >
        <View style={styles.head}>
          <View style={styles.iconBox}>
            <Ionicons name="notifications-outline" size={20} color={colors.text} />
          </View>
          <Pressable
            onPress={onClear}
            disabled={!items.length || clearMut.isPending}
            style={({ pressed }) => [
              styles.clearBtn,
              (!items.length || clearMut.isPending) && styles.clearBtnOff,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.clearText}>
              {clearMut.isPending ? "TEMİZLENİYOR…" : "BİLDİRİMLERİ TEMİZLE"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.pageTitle}>BİLDİRİMLER</Text>
        <Text style={styles.pageCopy}>
          Test ve programlı uyarılar. Uygulama açıkken kart olarak, kapalıyken sistem bildirimi olarak gelir.
        </Text>

        {inbox.isLoading ? (
          <SkeletonList rows={5} />
        ) : inbox.isError ? (
          <ErrorState
            message="Bildirimler alınamadı"
            onRetry={() => inbox.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState message="Henüz bildirim kaydı yok." />
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => openItem(item)}
              style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
            >
              <View style={styles.historyTop}>
                <Text style={styles.historyTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={styles.typeChip}>
                  <Text style={styles.typeChipText}>{typeLabel(item.data?.type)}</Text>
                </View>
              </View>
              {item.body ? (
                <Text style={styles.hint} numberOfLines={2}>
                  {item.body}
                </Text>
              ) : null}
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
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0B0B0B",
    alignItems: "center",
    justifyContent: "center",
  },
  clearBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0B0B0B",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  clearBtnOff: { opacity: 0.4 },
  clearText: {
    color: "#E4E4E7",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
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
  historyRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0B0B0B",
  },
  historyTop: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "center" },
  historyTitle: { color: colors.text, fontSize: 13, flex: 1, fontWeight: "600" },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#111111",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeChipText: {
    color: "#A1A1AA",
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  historyTime: { color: "#52525B", fontSize: 11, marginTop: 6 },
  pressed: { opacity: 0.75 },
});
