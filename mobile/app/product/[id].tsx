import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Linking,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import {
  fetchAllChanges,
  fetchAllScrapedProducts,
  fetchScrapedProduct,
  fetchTrackedProducts,
  fetchTrackedSnapshots,
  fetchTrackedVariants,
  setWatchTag,
} from "../../src/api/tracking";
import {
  domainFromUrl,
  formatDateTime,
  formatMoney,
  marketplaceLabel,
  uniqueImageUrls,
} from "../../src/lib/format";
import {
  EmptyState,
  ErrorState,
  MetaLine,
  SkeletonList,
} from "../../src/components/Ui";
import { ImageGallery } from "../../src/components/ImageGallery";
import { PriceMovementDrawer } from "../../src/components/PriceMovementDrawer";
import { WatchTagPicker } from "../../src/components/WatchTag";
import { parseWatchTag, type WatchTag } from "../../src/lib/watch-tag";

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const raw = String(id || "");
  const isTracked = raw.startsWith("tracked-");
  const numericId = Number(raw.replace("tracked-", ""));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const qc = useQueryClient();

  const scraped = useQuery({
    queryKey: ["scraped-product", numericId],
    queryFn: () => fetchScrapedProduct(numericId),
    enabled: !isTracked && Number.isFinite(numericId),
  });

  const trackedList = useQuery({
    queryKey: ["tracked-products"],
    queryFn: () => fetchTrackedProducts(),
    enabled: isTracked,
  });

  const allScraped = useQuery({
    queryKey: ["scraped-products", "all"],
    queryFn: fetchAllScrapedProducts,
    enabled: isTracked,
  });

  const tracked = (trackedList.data?.products || []).find(
    (p: { id: number }) => p.id === numericId,
  );
  const scrapedProduct = scraped.data?.product;
  const linkedTrackedId = isTracked ? numericId : scrapedProduct?.tracking?.id;

  const variants = useQuery({
    queryKey: ["tracked-variants", linkedTrackedId],
    queryFn: () => fetchTrackedVariants(linkedTrackedId!),
    enabled: typeof linkedTrackedId === "number" && linkedTrackedId > 0,
  });
  const snapshots = useQuery({
    queryKey: ["tracked-snapshots", linkedTrackedId],
    queryFn: () => fetchTrackedSnapshots(linkedTrackedId!),
    enabled: typeof linkedTrackedId === "number" && linkedTrackedId > 0,
  });
  const history = useQuery({
    queryKey: ["tracked-changes-all", linkedTrackedId],
    queryFn: () => fetchAllChanges({ productId: linkedTrackedId! }),
    enabled: typeof linkedTrackedId === "number" && linkedTrackedId > 0,
  });

  const tagMut = useMutation({
    mutationFn: (next: WatchTag | null) =>
      setWatchTag({
        tag: next,
        trackedProductId: isTracked ? numericId : scrapedProduct?.tracking?.id,
        scrapedProductId: !isTracked ? numericId : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tracked-products"] });
      void qc.invalidateQueries({ queryKey: ["scraped-products"] });
      void qc.invalidateQueries({ queryKey: ["scraped-product"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["changes-all"] });
    },
  });

  const matchedScraped = useMemo(() => {
    if (!tracked) return null;
    const url = String(tracked.sourceUrl || "").toLowerCase();
    const list = allScraped.data?.products || [];
    return (
      list.find((p) => String(p.trendyolUrl || "").toLowerCase() === url) ||
      list.find(
        (p) =>
          p.shopifyProductId &&
          tracked.shopifyProductId &&
          p.shopifyProductId === tracked.shopifyProductId,
      ) ||
      null
    );
  }, [tracked, allScraped.data]);

  const currentTag =
    parseWatchTag(tracked?.watchTag) ||
    parseWatchTag(scrapedProduct?.watchTag) ||
    parseWatchTag(matchedScraped?.watchTag);

  const trackedImages = useMemo(() => {
    const snapImgs = (snapshots.data?.snapshots || []).flatMap((s) => s.images || []);
    return uniqueImageUrls(
      snapImgs,
      tracked?.productImageUrl,
      matchedScraped?.image,
      matchedScraped?.images,
    );
  }, [snapshots.data, tracked, matchedScraped]);

  const scrapedImages = useMemo(
    () => uniqueImageUrls(scrapedProduct?.images, scrapedProduct?.image),
    [scrapedProduct],
  );

  const refetchAll = () => {
    if (isTracked) {
      trackedList.refetch();
      variants.refetch();
      snapshots.refetch();
      history.refetch();
      allScraped.refetch();
    } else {
      scraped.refetch();
      snapshots.refetch();
      history.refetch();
    }
  };

  if (isTracked) {
    if (trackedList.isLoading) {
      return (
        <View style={styles.root}>
          <SkeletonList rows={5} />
        </View>
      );
    }
    if (!tracked) {
      return (
        <View style={styles.root}>
          <ErrorState
            message={
              trackedList.isError
                ? (trackedList.error as Error).message
                : "Ürün bulunamadı"
            }
            onRetry={() => trackedList.refetch()}
          />
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={trackedList.isFetching}
            onRefresh={refetchAll}
            tintColor={colors.text}
          />
        }
      >
        <ImageGallery urls={trackedImages} />
        <Text style={styles.title}>{tracked.sourceTitle}</Text>
        <Text style={styles.source}>
          {domainFromUrl(tracked.sourceUrl) || marketplaceLabel(tracked.sourceSite)}
        </Text>

        <TouchableOpacity
          style={styles.priceBtn}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.75}
        >
          <View>
            <Text style={styles.priceBtnLabel}>Güncel fiyat</Text>
            <Text style={styles.priceBtnValue}>{formatMoney(tracked.currentSourcePrice)}</Text>
          </View>
          <Text style={styles.priceBtnHint}>Hareketler</Text>
        </TouchableOpacity>

        <WatchTagPicker
          value={currentTag}
          disabled={tagMut.isPending}
          onChange={(next) => tagMut.mutate(next)}
        />

        <View style={styles.panel}>
          <MetaLine label="Kaynak" value={marketplaceLabel(tracked.sourceSite)} />
          <MetaLine label="Kaynak URL" value={tracked.sourceUrl || "—"} />
          <MetaLine
            label="Stok"
            value={
              tracked.currentSourceStock != null
                ? String(tracked.currentSourceStock)
                : "—"
            }
          />
          <MetaLine
            label="Varyant"
            value={String(variants.data?.variants?.length ?? "—")}
          />
          <MetaLine
            label="Takip"
            value={tracked.trackingEnabled ? "Aktif" : "Pasif"}
          />
          <MetaLine
            label="Son kontrol"
            value={formatDateTime(tracked.lastCheckedAt || tracked.lastSuccessAt)}
          />
        </View>

        {tracked.sourceUrl ? (
          <Text
            style={styles.link}
            onPress={() => Linking.openURL(tracked.sourceUrl)}
          >
            Kaynak bağlantısını aç
          </Text>
        ) : null}

        <Text style={styles.section}>
          Varyantlar ({variants.data?.variants?.length || 0})
        </Text>
        {(variants.data?.variants || []).length === 0 ? (
          <EmptyState message="Varyant kaydı yok." />
        ) : (
          (variants.data?.variants || []).map((v: any) => (
            <View key={v.id} style={styles.variant}>
              <Text style={styles.variantTitle}>
                {v.sourceVariantTitle || v.option1 || v.sourceSku || `#${v.id}`}
              </Text>
              <Text style={styles.variantMeta}>
                {formatMoney(v.currentSourcePrice)} · stok {v.currentSourceStock ?? "—"}
              </Text>
            </View>
          ))
        )}

        <PriceMovementDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          price={tracked.currentSourcePrice}
          stock={tracked.currentSourceStock}
          snapshots={snapshots.data?.snapshots || []}
          changes={history.data?.changes || []}
        />
      </ScrollView>
    );
  }

  if (scraped.isLoading) {
    return (
      <View style={styles.root}>
        <SkeletonList rows={5} />
      </View>
    );
  }
  if (scraped.isError || !scrapedProduct) {
    return (
      <View style={styles.root}>
        <ErrorState
          message={
            scraped.isError
              ? (scraped.error as Error).message
              : "Ürün bulunamadı"
          }
          onRetry={() => scraped.refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={scraped.isFetching}
          onRefresh={refetchAll}
          tintColor={colors.text}
        />
      }
    >
      <ImageGallery urls={scrapedImages} />
      <Text style={styles.title}>{scrapedProduct.title}</Text>
      <Text style={styles.source}>
        {domainFromUrl(scrapedProduct.trendyolUrl) ||
          marketplaceLabel(scrapedProduct.marketplace || scrapedProduct.sourcePlatform)}
      </Text>
      <TouchableOpacity
        style={styles.priceBtn}
        onPress={() => setDrawerOpen(true)}
        activeOpacity={0.75}
      >
        <View>
          <Text style={styles.priceBtnLabel}>Güncel fiyat</Text>
          <Text style={styles.priceBtnValue}>{formatMoney(scrapedProduct.currentPrice)}</Text>
        </View>
        <Text style={styles.priceBtnHint}>Hareketler</Text>
      </TouchableOpacity>
      <WatchTagPicker
        value={currentTag}
        disabled={tagMut.isPending}
        onChange={(next) => tagMut.mutate(next)}
      />
      <View style={styles.panel}>
        <MetaLine
          label="Kaynak"
          value={marketplaceLabel(scrapedProduct.marketplace || scrapedProduct.sourcePlatform)}
        />
        <MetaLine label="Stok" value={scrapedProduct.stockStatus || "—"} />
        <MetaLine
          label="Takip"
          value={
            scrapedProduct.tracking
              ? scrapedProduct.tracking.trackingEnabled
                ? "Aktif"
                : "Pasif"
              : "Takipte değil"
          }
        />
        <MetaLine
          label="Son çekim"
          value={formatDateTime(scrapedProduct.scrapedAt || scrapedProduct.createdAt)}
        />
      </View>
      {scrapedProduct.trendyolUrl ? (
        <Text
          style={styles.link}
          onPress={() => Linking.openURL(scrapedProduct.trendyolUrl!)}
        >
          Kaynak bağlantısını aç
        </Text>
      ) : null}
      <PriceMovementDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        price={scrapedProduct.currentPrice}
        stock={scrapedProduct.stockStatus}
        snapshots={snapshots.data?.snapshots || []}
        changes={history.data?.changes || []}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  content: { paddingBottom: 40 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  source: { color: colors.textSecondary, marginTop: 6, fontSize: 13 },
  priceBtn: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceBtnLabel: { color: colors.textSecondary, fontSize: 12 },
  priceBtnValue: { color: colors.text, fontSize: 24, fontWeight: "700", marginTop: 2 },
  priceBtnHint: { color: colors.textSecondary, fontSize: 13 },
  panel: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  link: {
    color: colors.textSecondary,
    marginTop: 14,
    fontSize: 13,
    textDecorationLine: "underline",
  },
  section: {
    color: colors.text,
    fontWeight: "700",
    fontSize: 15,
    marginTop: 22,
    marginBottom: 10,
  },
  variant: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  variantTitle: { color: colors.text, fontWeight: "600", fontSize: 13 },
  variantMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
