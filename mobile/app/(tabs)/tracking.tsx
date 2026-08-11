import React, { useMemo, useState, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import { fetchAllChanges, shopifySyncChange, type ChangeRow } from "../../src/api/tracking";
import { showShopifyFixButton } from "../../src/lib/shopify-fix";
import {
  isPriceChangeType,
  isStockChangeType,
  isVariantChangeType,
} from "../../src/lib/format";
import {
  ChangeRowItem,
  EmptyState,
  ErrorState,
  FilterTabs,
  OfflineBanner,
  ScreenHeader,
  SkeletonList,
} from "../../src/components/Ui";
import { NotificationBell } from "../../src/components/NotificationDrawer";
import { useOnline } from "../../src/hooks/useOnline";

const FILTERS = ["Tümü", "Kırmızı", "Yeşil", "Fiyat", "Stok", "Varyant"];

const Row = memo(function Row({
  item,
  onPress,
  onShopifyFix,
  shopifyFixing,
}: {
  item: ChangeRow;
  onPress: (id: number) => void;
  onShopifyFix: (id: number) => void;
  shopifyFixing: boolean;
}) {
  return (
    <ChangeRowItem
      item={item}
      onPress={() => onPress(item.id)}
      onShopifyFix={showShopifyFixButton(item) ? () => onShopifyFix(item.id) : undefined}
      shopifyFixing={shopifyFixing}
    />
  );
});

export default function TrackingScreen() {
  const online = useOnline();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [fixingId, setFixingId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Tümü");

  const changes = useQuery({
    queryKey: ["changes-all"],
    queryFn: () => fetchAllChanges(),
    refetchInterval: 8_000,
  });

  const items = useMemo(() => {
    let list: ChangeRow[] = changes.data?.changes || [];
    if (filter === "Kırmızı") list = list.filter((c: ChangeRow) => c.watchTag === "red");
    if (filter === "Yeşil") list = list.filter((c: ChangeRow) => c.watchTag === "green");
    if (filter === "Fiyat") list = list.filter((c: ChangeRow) => isPriceChangeType(c.changeType));
    if (filter === "Stok") list = list.filter((c: ChangeRow) => isStockChangeType(c.changeType));
    if (filter === "Varyant") list = list.filter((c: ChangeRow) => isVariantChangeType(c.changeType));

    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((c: ChangeRow) =>
        String(c.productTitle || "")
          .toLowerCase()
          .includes(needle),
      );
    }
    return list;
  }, [changes.data, filter, q]);

  const onPress = useCallback(
    (id: number) => router.push(`/change/${id}`),
    [router],
  );

  const fixMut = useMutation({
    mutationFn: (id: number) => shopifySyncChange(id),
    onMutate: (id) => setFixingId(id),
    onSettled: () => setFixingId(null),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["changes-all"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert("Shopify", data.shopify?.message || "Shopify'da düzeltildi.");
    },
    onError: (err: Error) => {
      Alert.alert("Shopify", err.message || "Düzeltme başarısız");
    },
  });

  const onShopifyFix = useCallback(
    (id: number) => {
      Alert.alert("Shopify'da düzelt", "Bu değişiklik Shopify'a anında uygulanacak.", [
        { text: "Vazgeç", style: "cancel" },
        { text: "Düzelt", onPress: () => fixMut.mutate(id) },
      ]);
    },
    [fixMut],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <View style={styles.pad}>
        <ScreenHeader
          title="Takip"
          subtitle={changes.data?.changes ? `${changes.data.changes.length} değişiklik` : undefined}
          right={<NotificationBell />}
        />
        <TextInput
          placeholder="Ürün ara..."
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
        <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {changes.isLoading ? (
        <View style={styles.pad}>
          <SkeletonList rows={8} />
        </View>
      ) : changes.isError ? (
        <ErrorState
          message="Veriler alınamadı"
          onRetry={() => changes.refetch()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          initialNumToRender={16}
          windowSize={9}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={changes.isFetching && !changes.isLoading}
              onRefresh={() => changes.refetch()}
              tintColor={colors.text}
            />
          }
          renderItem={({ item }) => (
            <Row
              item={item}
              onPress={onPress}
              onShopifyFix={onShopifyFix}
              shopifyFixing={fixingId === item.id}
            />
          )}
          ListEmptyComponent={<EmptyState message="Henüz takip değişikliği yok." />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  search: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 10,
  },
});
