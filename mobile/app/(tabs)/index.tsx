import React, { useMemo } from "react";
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
  fetchAllScrapedProducts,
  fetchDashboard,
  fetchTrackedProducts,
  type ChangeRow,
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
import { formatMoney, pickDisplayPrice, uniqueImageUrls } from "../../src/lib/format";

type TaggedRow = {
  key: string;
  routeId: string;
  title: string;
  price: string;
  imageUrl?: string | null;
  watchTag: "red" | "green";
};

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

  const cards = q.data?.cards;
  const system = q.data?.system;
  const recent = useMemo((): ChangeRow[] => {
    return (q.data?.recentChanges || []).slice(0, 5);
  }, [q.data?.recentChanges]);
  const systemOk = Boolean(system?.healthOk || system?.trackingEnabled);

  const tagged = useMemo(() => {
    const trackedList: TrackedProduct[] = tracked.data?.products || [];
    const scrapedList: ScrapedProduct[] = scraped.data?.products || [];
    const rows: TaggedRow[] = [];
    const seen = new Set<string>();

    for (const t of trackedList) {
      const tag = t.watchTag === "red" || t.watchTag === "green" ? t.watchTag : null;
      if (!tag) continue;
      const key = `tracked-${t.id}`;
      seen.add(key);
      rows.push({
        key,
        routeId: key,
        title: t.sourceTitle,
        price: formatMoney(pickDisplayPrice(t.currentSourcePrice)),
        imageUrl: t.productImageUrl,
        watchTag: tag,
      });
    }
    for (const s of scrapedList) {
      const tag = s.watchTag === "red" || s.watchTag === "green" ? s.watchTag : null;
      if (!tag) continue;
      const key = `scraped-${s.id}`;
      if (seen.has(key)) continue;
      rows.push({
        key,
        routeId: key,
        title: s.title,
        price: formatMoney(pickDisplayPrice(s.currentPrice, s.originalPrice)),
        imageUrl: uniqueImageUrls(s.image, s.images)[0],
        watchTag: tag,
      });
    }
    return rows;
  }, [tracked.data, scraped.data]);

  const redList = tagged.filter((p) => p.watchTag === "red");
  const greenList = tagged.filter((p) => p.watchTag === "green");
  const refreshing =
    (q.isFetching && !q.isLoading) ||
    (tracked.isFetching && !tracked.isLoading) ||
    (scraped.isFetching && !scraped.isLoading);

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

        {q.isLoading ? (
          <SkeletonList rows={4} />
        ) : q.isError ? (
          <ErrorState
            message={(q.error as Error)?.message || "Veriler alınamadı"}
            onRetry={() => q.refetch()}
          />
        ) : (
          <>
            <View style={styles.grid}>
              <StatCard
                label="Toplam Ürün"
                value={cards?.catalogTotal ?? cards?.shopifyMemoryTotal ?? cards?.scrapedTotal ?? 0}
                icon="▣"
                onPress={() => router.push("/(tabs)/products")}
              />
              <StatCard
                label="Aktif Takip"
                value={cards?.trackedActive ?? cards?.trackedTotal ?? 0}
                icon="◎"
                onPress={() => router.push({ pathname: "/(tabs)/products", params: { filter: "Takipte" } })}
              />
              <StatCard
                label="Tespit Edilen Değişiklik"
                value={cards?.pendingChanges ?? 0}
                icon="…"
                onPress={() => router.push({ pathname: "/(tabs)/tracking", params: { status: "Tümü" } })}
              />
              <StatCard
                label="Fiyat Değişiklikleri"
                value={cards?.priceChanges ?? 0}
                icon="⇄"
                onPress={() => router.push({ pathname: "/(tabs)/tracking", params: { kind: "Fiyat" } })}
              />
              <StatCard
                label="Stok Değişiklikleri"
                value={cards?.stockChanges ?? 0}
                icon="▢"
                onPress={() => router.push({ pathname: "/(tabs)/tracking", params: { kind: "Stok" } })}
              />
              <StatCard
                label="Varyant Değişiklikleri"
                value={cards?.variantChanges ?? 0}
                icon="▦"
                onPress={() => router.push({ pathname: "/(tabs)/tracking", params: { kind: "Varyant" } })}
              />
              <StatCard
                label="Kırmızı Etiket"
                value={cards?.watchRed ?? redList.length}
                icon="●"
                onPress={() => router.push({ pathname: "/(tabs)/products", params: { filter: "Kırmızı" } })}
              />
              <StatCard
                label="Yeşil Etiket"
                value={cards?.watchGreen ?? greenList.length}
                icon="●"
                onPress={() => router.push({ pathname: "/(tabs)/products", params: { filter: "Yeşil" } })}
              />
            </View>

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Kırmızı etiket</Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/(tabs)/products", params: { filter: "Kırmızı" } })}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionLink}>Tümü</Text>
              </TouchableOpacity>
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
              <TouchableOpacity
                onPress={() => router.push({ pathname: "/(tabs)/products", params: { filter: "Yeşil" } })}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionLink}>Tümü</Text>
              </TouchableOpacity>
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
  content: { padding: 16, paddingBottom: 40 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sectionLink: { color: colors.textSecondary, fontSize: 13 },
});
