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
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("Tümü");

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
    const trackedByUrl = new Set(
      trackedList.map((t) => String(t.sourceUrl || "").toLowerCase()).filter(Boolean),
    );
    const trackedByShopify = new Set(
      trackedList.map((t) => String(t.shopifyProductId || "")).filter(Boolean),
    );
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

    const unified: UnifiedProduct[] = [];

    for (const t of trackedList) {
      const scrapedMatch = scrapedByUrl.get(String(t.sourceUrl || "").toLowerCase());
      const variantPrices = (scrapedMatch?.variants || []).map((v) => variantPrice(v));
      unified.push({
        key: `t-${t.id}`,
        routeId: `tracked-${t.id}`,
        title: t.sourceTitle,
        subtitle:
          domainFromUrl(t.sourceUrl) ||
          `${marketplaceLabel(t.sourceSite).toLowerCase()}.com`,
        price: formatMoney(
          pickDisplayPrice(t.currentSourcePrice, scrapedMatch?.currentPrice, scrapedMatch?.originalPrice, ...variantPrices),
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

    for (const p of scrapedList) {
      const url = String(p.trendyolUrl || "").toLowerCase();
      const already =
        (url && trackedByUrl.has(url)) ||
        (p.shopifyProductId && trackedByShopify.has(String(p.shopifyProductId)));
      if (already) continue;
      const variantHint =
        typeof p.variantCount === "number" && p.variantCount > 0
          ? ` · ${p.variantCount} varyant`
          : "";
      unified.push({
        key: `s-${p.id}`,
        routeId: String(p.id),
        title: p.title,
        subtitle:
          (domainFromUrl(p.trendyolUrl) ||
            marketplaceLabel(p.marketplace || p.sourcePlatform).toLowerCase()) +
          variantHint,
        price: formatMoney(
          pickDisplayPrice(
            p.currentPrice,
            p.originalPrice,
            ...(p.variants || []).map((v) => variantPrice(v)),
          ),
        ),
        imageUrl: uniqueImageUrls(p.image, p.images)[0],
        tracked: false,
        shopify: Boolean(p.shopifyProductId),
        watchTag: p.watchTag || null,
      });
    }

    for (const m of memoryList) {
      const url = String(m.sourceUrl || "").toLowerCase();
      const already =
        (m.shopifyProductId && trackedByShopify.has(String(m.shopifyProductId))) ||
        (url && trackedByUrl.has(url)) ||
        (m.shopifyProductId &&
          scrapedList.some((p) => p.shopifyProductId === m.shopifyProductId));
      if (already) continue;
      const variantHint =
        typeof m.variantCount === "number" && m.variantCount > 0
          ? ` · ${m.variantCount} varyant`
          : "";
      unified.push({
        key: `m-${m.id}`,
        routeId: `memory-${m.id}`,
        title: m.title,
        subtitle: `Shopify${variantHint}`,
        price: formatMoney(
          pickDisplayPrice(
            m.price,
            m.compareAtPrice,
            ...((Array.isArray(m.variants) ? m.variants : []) as ProductVariantRow[]).map((v) =>
              variantPrice(v),
            ),
          ),
        ),
        imageUrl: uniqueImageUrls(m.image, m.images)[0],
        tracked: Boolean(m.isTracking),
        shopify: true,
        watchTag: null,
      });
    }

    let filtered = unified.filter((u) => u.price !== "—" || u.subtitle.includes("varyant"));
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

  const loading = (scraped.isLoading || tracked.isLoading) && !scraped.data && !tracked.data;
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
