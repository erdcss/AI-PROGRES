import React, { useMemo, useState, useCallback, memo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import {
  fetchScrapedProducts,
  fetchTrackedProducts,
  type ScrapedProduct,
  type TrackedProduct,
} from "../../src/api/tracking";
import {
  domainFromUrl,
  formatMoney,
  marketplaceLabel,
} from "../../src/lib/format";
import {
  EmptyState,
  ErrorState,
  FilterTabs,
  OfflineBanner,
  ProductRow,
  ScreenHeader,
  SkeletonList,
} from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";

type UnifiedProduct = {
  key: string;
  routeId: string;
  title: string;
  subtitle: string;
  price: string;
  imageUrl?: string | null;
  tracked: boolean;
};

const FILTERS = ["Tümü", "Takipte", "Takipte Değil"];

const Row = memo(function Row({
  item,
  onPress,
}: {
  item: UnifiedProduct;
  onPress: (id: string) => void;
}) {
  return (
    <ProductRow
      title={item.title}
      subtitle={item.subtitle}
      price={item.price}
      imageUrl={item.imageUrl}
      onPress={() => onPress(item.routeId)}
    />
  );
});

export default function ProductsScreen() {
  const online = useOnline();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Tümü");

  const scraped = useQuery({
    queryKey: ["scraped-products", "all"],
    queryFn: () => fetchScrapedProducts({ limit: 100, offset: 0 }),
  });
  const tracked = useQuery({
    queryKey: ["tracked-products"],
    queryFn: fetchTrackedProducts,
  });

  const items = useMemo(() => {
    const trackedList: TrackedProduct[] = tracked.data?.products || [];
    const scrapedList: ScrapedProduct[] = scraped.data?.products || [];
    const trackedByUrl = new Set(
      trackedList.map((t) => String(t.sourceUrl || "").toLowerCase()).filter(Boolean),
    );

    const unified: UnifiedProduct[] = [];

    for (const t of trackedList) {
      unified.push({
        key: `t-${t.id}`,
        routeId: `tracked-${t.id}`,
        title: t.sourceTitle,
        subtitle:
          domainFromUrl(t.sourceUrl) ||
          `${marketplaceLabel(t.sourceSite).toLowerCase()}.com`,
        price: formatMoney(t.currentSourcePrice),
        imageUrl: t.productImageUrl,
        tracked: true,
      });
    }

    for (const p of scrapedList) {
      const url = String(p.trendyolUrl || "").toLowerCase();
      const already =
        (url && trackedByUrl.has(url)) ||
        (p.shopifyProductId &&
          trackedList.some((t) => t.shopifyProductId === p.shopifyProductId));
      if (already) continue;
      unified.push({
        key: `s-${p.id}`,
        routeId: String(p.id),
        title: p.title,
        subtitle:
          domainFromUrl(p.trendyolUrl) ||
          marketplaceLabel(p.marketplace || p.sourcePlatform).toLowerCase(),
        price: formatMoney(p.currentPrice),
        imageUrl: p.image || (Array.isArray(p.images) ? p.images[0] : null),
        tracked: false,
      });
    }

    let filtered = unified;
    if (filter === "Takipte") filtered = unified.filter((u) => u.tracked);
    if (filter === "Takipte Değil") filtered = unified.filter((u) => !u.tracked);

    const needle = q.trim().toLowerCase();
    if (needle) {
      filtered = filtered.filter(
        (u) =>
          u.title.toLowerCase().includes(needle) ||
          u.subtitle.toLowerCase().includes(needle),
      );
    }
    return filtered;
  }, [scraped.data, tracked.data, filter, q]);

  const onPress = useCallback(
    (id: string) => router.push(`/product/${id}`),
    [router],
  );

  const loading = scraped.isLoading || tracked.isLoading;
  const error = scraped.isError && tracked.isError;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <View style={styles.pad}>
        <ScreenHeader title="Ürünler" />
        <TextInput
          placeholder="Ürün ara..."
          placeholderTextColor={colors.textMuted}
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
        <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {loading ? (
        <View style={styles.pad}>
          <SkeletonList rows={8} />
        </View>
      ) : error ? (
        <ErrorState
          message="Veriler alınamadı"
          onRetry={() => {
            scraped.refetch();
            tracked.refetch();
          }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.key}
          contentContainerStyle={styles.list}
          initialNumToRender={16}
          windowSize={9}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={(scraped.isFetching || tracked.isFetching) && !loading}
              onRefresh={() => {
                scraped.refetch();
                tracked.refetch();
              }}
              tintColor={colors.text}
            />
          }
          renderItem={({ item }) => <Row item={item} onPress={onPress} />}
          ListEmptyComponent={<EmptyState message="Henüz ürün bulunmuyor." />}
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
