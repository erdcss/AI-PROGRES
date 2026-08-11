import React, { useMemo, useState, useCallback, memo, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import {
  fetchAllMemoryProducts,
  fetchAllScrapedProducts,
  fetchTrackedProducts,
  type MemoryProduct,
  type ProductVariantRow,
  type ScrapedProduct,
  type TrackedProduct,
} from "../../src/api/tracking";
import {
  domainFromUrl,
  formatMoney,
  marketplaceLabel,
  pickDisplayPrice,
  uniqueImageUrls,
  variantPrice,
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
import { NotificationBell } from "../../src/components/NotificationDrawer";
import { useOnline } from "../../src/hooks/useOnline";

type UnifiedProduct = {
  key: string;
  routeId: string;
  title: string;
  subtitle: string;
  price: string;
  imageUrl?: string | null;
  tracked: boolean;
  shopify: boolean;
  watchTag?: string | null;
};

const FILTERS = ["Tümü", "Kırmızı", "Yeşil", "Takipte", "Takipte Değil", "Shopify"];

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
      watchTag={item.watchTag}
      onPress={() => onPress(item.routeId)}
    />
  );
});

export default function ProductsScreen() {
  const online = useOnline();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Tümü");

  useEffect(() => {
    const next = String(params.filter || "").trim();
    if (next && FILTERS.includes(next)) setFilter(next);
  }, [params.filter]);

  const scraped = useQuery({
    queryKey: ["scraped-products", "all"],
    queryFn: fetchAllScrapedProducts,
    refetchInterval: false,
  });
  const tracked = useQuery({
    queryKey: ["tracked-products"],
    queryFn: () => fetchTrackedProducts({ includeUnlinked: true }),
    refetchInterval: false,
  });
  const memory = useQuery({
    queryKey: ["memory-products", "all"],
    queryFn: fetchAllMemoryProducts,
    refetchInterval: false,
  });

  const items = useMemo(() => {
    const trackedList: TrackedProduct[] = tracked.data?.products || [];
    const scrapedList: ScrapedProduct[] = scraped.data?.products || [];
    const memoryList: MemoryProduct[] = memory.data?.products || [];
    const scrapedTagByUrl = new Map(
      scrapedList
        .filter((p) => p.trendyolUrl)
        .map((p) => [String(p.trendyolUrl).toLowerCase(), p.watchTag || null] as const),
    );
    const scrapedByUrl = new Map(
      scrapedList
        .filter((p) => p.trendyolUrl)
        .map((p) => [String(p.trendyolUrl).toLowerCase(), p] as const),
    );

    const trackedByShopifyMap = new Map(
      trackedList
        .filter((t) => t.shopifyProductId)
        .map((t) => [String(t.shopifyProductId), t] as const),
    );
    const trackedByUrlMap = new Map(
      trackedList
        .filter((t) => t.sourceUrl)
        .map((t) => [String(t.sourceUrl).toLowerCase(), t] as const),
    );
    const scrapedByShopify = new Map(
      scrapedList
        .filter((p) => p.shopifyProductId)
        .map((p) => [String(p.shopifyProductId), p] as const),
    );

    const unified: UnifiedProduct[] = [];

    if (memoryList.length > 0) {
      for (const m of memoryList) {
        const url = String(m.sourceUrl || "").toLowerCase();
        const trackedMatch =
          (m.shopifyProductId && trackedByShopifyMap.get(String(m.shopifyProductId))) ||
          (url ? trackedByUrlMap.get(url) : undefined);
        const scrapedMatch =
          (m.shopifyProductId && scrapedByShopify.get(String(m.shopifyProductId))) ||
          (url ? scrapedByUrl.get(url) : undefined);
        const variantHint =
          typeof m.variantCount === "number" && m.variantCount > 0
            ? ` · ${m.variantCount} varyant`
            : scrapedMatch?.variantCount
              ? ` · ${scrapedMatch.variantCount} varyant`
              : "";
        unified.push({
          key: `m-${m.id}`,
          routeId: trackedMatch ? `tracked-${trackedMatch.id}` : `memory-${m.id}`,
          title: m.title || trackedMatch?.sourceTitle || scrapedMatch?.title || "Ürün",
          subtitle: `Shopify${variantHint}`,
          price: formatMoney(
            pickDisplayPrice(
              m.price,
              m.compareAtPrice,
              trackedMatch?.currentSourcePrice,
              scrapedMatch?.currentPrice,
              scrapedMatch?.originalPrice,
              ...((Array.isArray(m.variants) ? m.variants : []) as ProductVariantRow[]).map((v) =>
                variantPrice(v),
              ),
              ...(scrapedMatch?.variants || []).map((v) => variantPrice(v)),
            ),
          ),
          imageUrl:
            uniqueImageUrls(m.image, m.images)[0] ||
            trackedMatch?.productImageUrl ||
            uniqueImageUrls(scrapedMatch?.image, scrapedMatch?.images)[0],
          tracked: Boolean(trackedMatch || m.isTracking),
          shopify: true,
          watchTag:
            trackedMatch?.watchTag ||
            scrapedMatch?.watchTag ||
            (url ? scrapedTagByUrl.get(url) : null) ||
            null,
        });
      }
    }

    const seenRoute = new Set(unified.map((u) => u.routeId));
    const seenShopify = new Set(
      memoryList.map((m) => String(m.shopifyProductId || "")).filter(Boolean),
    );

    for (const t of trackedList) {
      const routeId = `tracked-${t.id}`;
      if (seenRoute.has(routeId)) continue;
      if (t.shopifyProductId && seenShopify.has(String(t.shopifyProductId))) continue;
      const scrapedMatch = scrapedByUrl.get(String(t.sourceUrl || "").toLowerCase());
      seenRoute.add(routeId);
      if (t.shopifyProductId) seenShopify.add(String(t.shopifyProductId));
      unified.push({
        key: `t-${t.id}`,
        routeId,
        title: t.sourceTitle,
        subtitle:
          domainFromUrl(t.sourceUrl) ||
          `${marketplaceLabel(t.sourceSite).toLowerCase()}.com`,
        price: formatMoney(
          pickDisplayPrice(
            t.currentSourcePrice,
            scrapedMatch?.currentPrice,
            scrapedMatch?.originalPrice,
            ...(scrapedMatch?.variants || []).map((v) => variantPrice(v)),
          ),
        ),
        imageUrl: t.productImageUrl || uniqueImageUrls(scrapedMatch?.image, scrapedMatch?.images)[0],
        tracked: true,
        shopify: Boolean(t.shopifyProductId),
        watchTag:
          t.watchTag ||
          scrapedTagByUrl.get(String(t.sourceUrl || "").toLowerCase()) ||
          null,
      });
    }

    for (const s of scrapedList) {
      const routeId = `scraped-${s.id}`;
      if (seenRoute.has(routeId)) continue;
      if (s.shopifyProductId && seenShopify.has(String(s.shopifyProductId))) continue;
      if (s.shopifyProductId && seenRoute.has(`tracked-${s.id}`)) continue;
      seenRoute.add(routeId);
      if (s.shopifyProductId) seenShopify.add(String(s.shopifyProductId));
      unified.push({
        key: `s-${s.id}`,
        routeId,
        title: s.title,
        subtitle: marketplaceLabel(s.marketplace || "trendyol"),
        price: formatMoney(
          pickDisplayPrice(s.currentPrice, s.originalPrice, ...(s.variants || []).map((v) => variantPrice(v))),
        ),
        imageUrl: uniqueImageUrls(s.image, s.images)[0],
        tracked: Boolean(s.tracking?.id),
        shopify: Boolean(s.shopifyProductId),
        watchTag: s.watchTag || null,
      });
    }

    let filtered = unified;
    if (filter === "Kırmızı") filtered = unified.filter((u) => u.watchTag === "red");
    if (filter === "Yeşil") filtered = unified.filter((u) => u.watchTag === "green");
    if (filter === "Takipte") filtered = unified.filter((u) => u.tracked);
    if (filter === "Takipte Değil") filtered = unified.filter((u) => !u.tracked);
    if (filter === "Shopify") filtered = unified.filter((u) => u.shopify);

    const needle = q.trim().toLowerCase();
    if (needle) {
      filtered = filtered.filter(
        (u) =>
          u.title.toLowerCase().includes(needle) ||
          u.subtitle.toLowerCase().includes(needle),
      );
    }
    return filtered;
  }, [scraped.data, tracked.data, memory.data, filter, q]);

  const onPress = useCallback(
    (id: string) => router.push(`/product/${id}`),
    [router],
  );

  const loading = memory.isLoading && tracked.isLoading && !memory.data && !tracked.data;
  const error = scraped.isError && tracked.isError && memory.isError;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <View style={styles.pad}>
        <ScreenHeader
          title="Ürünler"
          caption={`${items.length} ürün`}
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
            memory.refetch();
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
              refreshing={(scraped.isFetching || tracked.isFetching || memory.isFetching) && !loading}
              onRefresh={() => {
                scraped.refetch();
                tracked.refetch();
                memory.refetch();
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
