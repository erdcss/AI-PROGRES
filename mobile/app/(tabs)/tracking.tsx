import React, { useMemo, useState, useCallback, memo, useEffect } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import {
  fetchAllChanges,
  fetchAllMemoryProducts,
  fetchAllScrapedProducts,
  fetchChangeCounts,
  fetchChanges,
  fetchTrackedProducts,
  shopifySyncChange,
  type ChangeRow,
} from "../../src/api/tracking";
import { showShopifyFixButton } from "../../src/lib/shopify-fix";
import {
  isPriceChangeType,
  isStockChangeType,
  isVariantChangeType,
} from "../../src/lib/format";
import { buildUnifiedProducts } from "../../src/lib/unified-catalog";
import {
  ChangeRowItem,
  EmptyState,
  ErrorState,
  FilterTabs,
  OfflineBanner,
  ProductRow,
  ScreenHeader,
  SkeletonList,
} from "../../src/components/Ui";
import { NotificationBell } from "../../src/components/NotificationDrawer";
import { useOnline } from "../../src/hooks/useOnline";

const STATUS_FILTERS = ["Düzeltilecekler", "Uygulanan", "Tümü"] as const;
const KIND_FILTERS = ["Hepsi", "Kırmızı", "Yeşil", "Fiyat", "Stok", "Varyant"] as const;
const VIEW_MODES = ["Takip edilen", "Değişiklikler"] as const;

function statusToApi(label: string): string {
  if (label === "Düzeltilecekler") return "actionable";
  if (label === "Uygulanan") return "applied";
  return "history";
}

const ChangeRowMemo = memo(function ChangeRowMemo({
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

const TrackedRow = memo(function TrackedRow({
  item,
  onPress,
}: {
  item: ReturnType<typeof buildUnifiedProducts>[number];
  onPress: (routeId: string) => void;
}) {
  return (
    <ProductRow
      title={item.title}
      subtitle={item.subtitle}
      price={item.price}
      imageUrl={item.imageUrl}
      watchTag={item.watchTag}
      onPress={() => onPress(item.routeId)}
    />
  );
});

export default function TrackingScreen() {
  const online = useOnline();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [fixingId, setFixingId] = useState<number | null>(null);
  const params = useLocalSearchParams<{ status?: string; kind?: string; view?: string }>();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("Tümü");
  const [filter, setFilter] = useState("Hepsi");
  const [viewMode, setViewMode] = useState<string>("Takip edilen");

  useEffect(() => {
    const nextStatus = String(params.status || "").trim();
    if (nextStatus && (STATUS_FILTERS as readonly string[]).includes(nextStatus)) {
      setStatus(nextStatus);
      setViewMode("Değişiklikler");
    }
    const nextKind = String(params.kind || "").trim();
    if (nextKind && (KIND_FILTERS as readonly string[]).includes(nextKind)) {
      setFilter(nextKind);
      setViewMode("Değişiklikler");
    }
    if (String(params.view || "").trim() === "tracked") {
      setViewMode("Takip edilen");
    }
  }, [params.status, params.kind, params.view]);

  const tracked = useQuery({
    queryKey: ["tracked-products"],
    queryFn: () => fetchTrackedProducts({ includeUnlinked: true }),
    refetchInterval: false,
  });
  const scraped = useQuery({
    queryKey: ["scraped-products", "all"],
    queryFn: fetchAllScrapedProducts,
    refetchInterval: false,
  });
  const memory = useQuery({
    queryKey: ["memory-products", "all"],
    queryFn: fetchAllMemoryProducts,
    refetchInterval: false,
  });

  const counts = useQuery({
    queryKey: ["tracking-change-counts"],
    queryFn: fetchChangeCounts,
    refetchInterval: false,
    enabled: viewMode === "Değişiklikler",
  });

  const changes = useQuery({
    queryKey: ["tracking-changes", status],
    queryFn: async () => {
      if (status === "Tümü") return fetchAllChanges();
      return fetchChanges({ status: statusToApi(status) });
    },
    refetchInterval: false,
    enabled: viewMode === "Değişiklikler",
  });

  const trackedItems = useMemo(() => {
    const unified = buildUnifiedProducts(
      memory.data?.products || [],
      tracked.data?.products || [],
      scraped.data?.products || [],
    );
    let list = unified.filter((u) => u.tracked);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (u) =>
          u.title.toLowerCase().includes(needle) ||
          u.subtitle.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [memory.data, tracked.data, scraped.data, q]);

  const changeItems = useMemo(() => {
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

  const onPressChange = useCallback(
    (id: number) => router.push(`/change/${id}`),
    [router],
  );

  const onPressProduct = useCallback(
    (routeId: string) => router.push(`/product/${routeId}`),
    [router],
  );

  const fixMut = useMutation({
    mutationFn: (id: number) => shopifySyncChange(id),
    onMutate: (id) => setFixingId(id),
    onSettled: () => setFixingId(null),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["tracking-changes"] });
      void qc.invalidateQueries({ queryKey: ["changes-all"] });
      void qc.invalidateQueries({ queryKey: ["tracking-change-counts"] });
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

  const loadingTracked =
    viewMode === "Takip edilen" &&
    memory.isLoading &&
    tracked.isLoading &&
    !memory.data &&
    !tracked.data;
  const loadingChanges = viewMode === "Değişiklikler" && changes.isLoading;
  const errorTracked =
    viewMode === "Takip edilen" && tracked.isError && memory.isError && scraped.isError;
  const errorChanges = viewMode === "Değişiklikler" && changes.isError;

  const subtitle =
    viewMode === "Takip edilen"
      ? `${trackedItems.length} takip edilen ürün`
      : `${counts.data?.counts?.all ?? changes.data?.changes?.length ?? 0} değişiklik`;

  const refreshing =
    viewMode === "Takip edilen"
      ? (tracked.isFetching && !tracked.isLoading) ||
        (memory.isFetching && !memory.isLoading) ||
        (scraped.isFetching && !scraped.isLoading)
      : changes.isFetching && !changes.isLoading;

  const onRefresh = () => {
    if (viewMode === "Takip edilen") {
      void tracked.refetch();
      void memory.refetch();
      void scraped.refetch();
    } else {
      void changes.refetch();
      void counts.refetch();
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <View style={styles.pad}>
        <ScreenHeader
          title="Takip"
          subtitle={subtitle}
          right={<NotificationBell />}
        />
        <FilterTabs options={[...VIEW_MODES]} value={viewMode} onChange={setViewMode} />
        <TextInput
          placeholder="Ürün ara..."
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
        {viewMode === "Değişiklikler" ? (
          <>
            <FilterTabs options={[...STATUS_FILTERS]} value={status} onChange={setStatus} />
            <FilterTabs options={[...KIND_FILTERS]} value={filter} onChange={setFilter} />
          </>
        ) : null}
      </View>

      {loadingTracked || loadingChanges ? (
        <View style={styles.pad}>
          <SkeletonList rows={8} />
        </View>
      ) : errorTracked || errorChanges ? (
        <ErrorState message="Veriler alınamadı" onRetry={onRefresh} />
      ) : viewMode === "Takip edilen" ? (
        <FlatList
          data={trackedItems}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          initialNumToRender={16}
          windowSize={9}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
          }
          renderItem={({ item }) => <TrackedRow item={item} onPress={onPressProduct} />}
          ListEmptyComponent={<EmptyState message="Takip edilen ürün yok." />}
        />
      ) : (
        <FlatList
          data={changeItems}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          initialNumToRender={16}
          windowSize={9}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
          }
          renderItem={({ item }) => (
            <ChangeRowMemo
              item={item}
              onPress={onPressChange}
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
