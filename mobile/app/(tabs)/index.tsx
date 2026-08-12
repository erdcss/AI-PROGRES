import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import {
  fetchAllMemoryProducts,
  fetchAllScrapedProducts,
  fetchDashboard,
  fetchTrackedProducts,
  type ChangeRow,
  type MemoryProduct,
  type ProductVariantRow,
  type ScrapedProduct,
  type TrackedProduct,
} from "../../src/api/tracking";
import {
  ChangeRowItem,
  EmptyState,
  ErrorState,
  OfflineBanner,
  ProductRow,
  ScreenHeader,
  SkeletonList,
  StatCard,
  StatusBadge,
} from "../../src/components/Ui";
import { NotificationBell } from "../../src/components/NotificationDrawer";
import { useOnline } from "../../src/hooks/useOnline";
import {
  formatMoney,
  pickDisplayPrice,
  uniqueImageUrls,
  variantPrice,
} from "../../src/lib/format";

type DashProduct = {
  key: string;
  routeId: string;
  title: string;
  price: string;
  imageUrl?: string | null;
  tracked: boolean;
  shopify: boolean;
  watchTag: "red" | "green" | null;
};

/** Ürünler sekmesi ile aynı birleşik katalog — kutucuk sayıları buradan. */
function buildUnifiedProducts(
  memoryList: MemoryProduct[],
  trackedList: TrackedProduct[],
  scrapedList: ScrapedProduct[],
): DashProduct[] {
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

  const unified: DashProduct[] = [];

  if (memoryList.length > 0) {
    for (const m of memoryList) {
      const url = String(m.sourceUrl || "").toLowerCase();
      const trackedMatch =
        (m.shopifyProductId && trackedByShopifyMap.get(String(m.shopifyProductId))) ||
        (url ? trackedByUrlMap.get(url) : undefined);
      const scrapedMatch =
        (m.shopifyProductId && scrapedByShopify.get(String(m.shopifyProductId))) ||
        (url ? scrapedByUrl.get(url) : undefined);
      const tagRaw =
        trackedMatch?.watchTag ||
        scrapedMatch?.watchTag ||
        (url ? scrapedTagByUrl.get(url) : null) ||
        null;
      const watchTag = tagRaw === "red" || tagRaw === "green" ? tagRaw : null;
      unified.push({
        key: `m-${m.id}`,
        routeId: trackedMatch ? `tracked-${trackedMatch.id}` : `memory-${m.id}`,
        title: m.title || trackedMatch?.sourceTitle || scrapedMatch?.title || "Ürün",
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
        watchTag,
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
    const tagRaw = t.watchTag || scrapedTagByUrl.get(String(t.sourceUrl || "").toLowerCase()) || null;
    unified.push({
      key: `t-${t.id}`,
      routeId,
      title: t.sourceTitle,
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
      watchTag: tagRaw === "red" || tagRaw === "green" ? tagRaw : null,
    });
  }

  for (const s of scrapedList) {
    const routeId = `scraped-${s.id}`;
    if (seenRoute.has(routeId)) continue;
    if (s.shopifyProductId && seenShopify.has(String(s.shopifyProductId))) continue;
    seenRoute.add(routeId);
    if (s.shopifyProductId) seenShopify.add(String(s.shopifyProductId));
    const tagRaw = s.watchTag || null;
    unified.push({
      key: `s-${s.id}`,
      routeId,
      title: s.title,
      price: formatMoney(
        pickDisplayPrice(s.currentPrice, s.originalPrice, ...(s.variants || []).map((v) => variantPrice(v))),
      ),
      imageUrl: uniqueImageUrls(s.image, s.images)[0],
      tracked: Boolean(s.tracking?.id),
      shopify: Boolean(s.shopifyProductId),
      watchTag: tagRaw === "red" || tagRaw === "green" ? tagRaw : null,
    });
  }

  return unified;
}

export default function HomeScreen() {
  const online = useOnline();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: false,
  });
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

  const system = q.data?.system;
  const recent = useMemo((): ChangeRow[] => {
    return (q.data?.recentChanges || []).slice(0, 5);
  }, [q.data?.recentChanges]);
  const systemOk = Boolean(system?.healthOk || system?.trackingEnabled);

  const catalog = useMemo(
    () =>
      buildUnifiedProducts(
        memory.data?.products || [],
        tracked.data?.products || [],
        scraped.data?.products || [],
      ),
    [memory.data, tracked.data, scraped.data],
  );

  const redList = useMemo(() => catalog.filter((p) => p.watchTag === "red"), [catalog]);
  const greenList = useMemo(() => catalog.filter((p) => p.watchTag === "green"), [catalog]);
  const trackedCount = useMemo(() => catalog.filter((p) => p.tracked).length, [catalog]);
  const totalCount = catalog.length;

  const cards = q.data?.cards;
  const pendingChanges = cards?.pendingChanges ?? 0;
  const priceChanges = cards?.priceChanges ?? 0;
  const stockChanges = cards?.stockChanges ?? 0;
  const variantChanges = cards?.variantChanges ?? 0;

  const goProducts = useCallback(
    (filter?: string, count?: number) => {
      if (typeof count === "number" && count <= 0) return;
      if (filter) router.push({ pathname: "/(tabs)/products", params: { filter } });
      else router.push("/(tabs)/products");
    },
    [router],
  );

  const goTracking = useCallback(
    (params: { status?: string; kind?: string }, count: number) => {
      if (count <= 0) return;
      router.push({ pathname: "/(tabs)/tracking", params });
    },
    [router],
  );

  const refreshing =
    (q.isFetching && !q.isLoading) ||
    (tracked.isFetching && !tracked.isLoading) ||
    (scraped.isFetching && !scraped.isLoading) ||
    (memory.isFetching && !memory.isLoading);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void q.refetch();
              void tracked.refetch();
              void scraped.refetch();
              void memory.refetch();
            }}
            tintColor={colors.text}
          />
        }
      >
        <ScreenHeader
          title="ORVIAN"
          subtitle="Genel Bakış"
          caption="Sistem durumu ve özet bilgiler"
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <NotificationBell />
              <StatusBadge ok={systemOk} />
            </View>
          }
        />

        {q.isLoading && memory.isLoading && tracked.isLoading ? (
          <SkeletonList rows={4} />
        ) : q.isError && memory.isError && tracked.isError ? (
          <ErrorState
            message={(q.error as Error)?.message || "Veriler alınamadı"}
            onRetry={() => {
              void q.refetch();
              void memory.refetch();
              void tracked.refetch();
              void scraped.refetch();
            }}
          />
        ) : (
          <>
            <View style={styles.grid}>
              <StatCard
                label="Toplam Ürün"
                value={totalCount}
                icon="▣"
                onPress={() => goProducts(undefined, totalCount)}
              />
              <StatCard
                label="Aktif Takip"
                value={trackedCount}
                icon="◎"
                onPress={() => goProducts("Takipte", trackedCount)}
              />
              <StatCard
                label="Tespit Edilen Değişiklik"
                value={pendingChanges}
                icon="…"
                onPress={() => goTracking({ status: "Tümü" }, pendingChanges)}
              />
              <StatCard
                label="Fiyat Değişiklikleri"
                value={priceChanges}
                icon="⇄"
                onPress={() => goTracking({ kind: "Fiyat" }, priceChanges)}
              />
              <StatCard
                label="Stok Değişiklikleri"
                value={stockChanges}
                icon="▢"
                onPress={() => goTracking({ kind: "Stok" }, stockChanges)}
              />
              <StatCard
                label="Varyant Değişiklikleri"
                value={variantChanges}
                icon="▦"
                onPress={() => goTracking({ kind: "Varyant" }, variantChanges)}
              />
              <StatCard
                label="Kırmızı Etiket"
                value={redList.length}
                icon="●"
                onPress={() => goProducts("Kırmızı", redList.length)}
              />
              <StatCard
                label="Yeşil Etiket"
                value={greenList.length}
                icon="●"
                onPress={() => goProducts("Yeşil", greenList.length)}
              />
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Kırmızı etiket</Text>
              {redList.length > 0 ? (
                <TouchableOpacity onPress={() => goProducts("Kırmızı", redList.length)} activeOpacity={0.7}>
                  <Text style={styles.sectionLink}>Tümü</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {redList.length === 0 ? (
              <EmptyState message="Kırmızı etiketli ürün yok." />
            ) : (
              redList.slice(0, 6).map((p) => (
                <ProductRow
                  key={p.key}
                  title={p.title}
                  subtitle="Kırmızı"
                  price={p.price}
                  imageUrl={p.imageUrl}
                  watchTag="red"
                  onPress={() => router.push(`/product/${p.routeId}`)}
                />
              ))
            )}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Yeşil etiket</Text>
              {greenList.length > 0 ? (
                <TouchableOpacity onPress={() => goProducts("Yeşil", greenList.length)} activeOpacity={0.7}>
                  <Text style={styles.sectionLink}>Tümü</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {greenList.length === 0 ? (
              <EmptyState message="Yeşil etiketli ürün yok." />
            ) : (
              greenList.slice(0, 6).map((p) => (
                <ProductRow
                  key={p.key}
                  title={p.title}
                  subtitle="Yeşil"
                  price={p.price}
                  imageUrl={p.imageUrl}
                  watchTag="green"
                  onPress={() => router.push(`/product/${p.routeId}`)}
                />
              ))
            )}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Son Değişiklikler</Text>
              <TouchableOpacity onPress={() => router.push("/(tabs)/tracking")} activeOpacity={0.7}>
                <Text style={styles.sectionLink}>Tümü</Text>
              </TouchableOpacity>
            </View>

            {recent.length === 0 ? (
              <EmptyState message="Henüz takip değişikliği yok." />
            ) : (
              recent.map((c) => (
                <ChangeRowItem
                  key={c.id}
                  item={c}
                  compact
                  onPress={() => router.push(`/change/${c.id}`)}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sectionHead: {
    marginTop: 14,
    marginBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  sectionLink: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
});
