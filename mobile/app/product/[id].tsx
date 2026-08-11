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
  fetchMemoryProduct,
  fetchScrapedProduct,
  fetchTrackedProducts,
  fetchTrackedSnapshots,
  fetchTrackedVariants,
  setWatchTag,
  type ProductVariantRow,
} from "../../src/api/tracking";
import {
  domainFromUrl,
  formatDateTime,
  formatMoney,
  marketplaceLabel,
  uniqueImageUrls,
  variantPrice,
  variantStock,
  variantTitle,
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
  const isMemory = raw.startsWith("memory-");
  const numericId = Number(raw.replace("tracked-", "").replace("memory-", ""));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const qc = useQueryClient();

  const scraped = useQuery({
    queryKey: ["scraped-product", numericId],
    queryFn: () => fetchScrapedProduct(numericId),
    enabled: !isTracked && !isMemory && Number.isFinite(numericId),
  });

  const memory = useQuery({
    queryKey: ["memory-product", numericId],
    queryFn: () => fetchMemoryProduct(numericId),
    enabled: isMemory && Number.isFinite(numericId),
  });

  const trackedList = useQuery({
    queryKey: ["tracked-products"],
    queryFn: () => fetchTrackedProducts({ includeUnlinked: true }),
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
  const memoryProduct = memory.data?.product;
  const linkedTrackedId = isTracked
    ? numericId
    : isMemory
      ? memoryProduct?.tracking?.id
      : scrapedProduct?.tracking?.id;

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
        scrapedProductId: !isTracked && !isMemory ? numericId : undefined,
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
    } else if (isMemory) {
      memory.refetch();
      variants.refetch();
      snapshots.refetch();
      history.refetch();
    } else {
      scraped.refetch();
      snapshots.refetch();
      history.refetch();
    }
  };

  const joinList = (v?: unknown) =>
    Array.isArray(v) ? v.filter(Boolean).map(String).join(", ") : "";

  const featureLines = (features?: Record<string, unknown> | null) => {
    if (!features || typeof features !== "object") return [];
    return Object.entries(features)
      .filter(([, val]) => val != null && String(val).trim() !== "")
      .slice(0, 40)
      .map(([label, val]) => ({
        label,
        value: Array.isArray(val) ? val.map(String).join(", ") : String(val),
      }));
  };

  const renderVariantList = (list: ProductVariantRow[] | undefined) => {
    const rows = list || [];
    return (
      <>
        <Text style={styles.section}>Varyantlar ({rows.length})</Text>
        {rows.length === 0 ? (
          <EmptyState message="Varyant kaydı yok." />
        ) : (
          rows.map((v, idx) => (
            <View key={String(v.id ?? idx)} style={styles.variant}>
              <Text style={styles.variantTitle}>{variantTitle(v)}</Text>
              <Text style={styles.variantMeta}>
                Alış {formatMoney(v.trendyolPrice ?? variantPrice(v))}
                {" · "}
                Satış {formatMoney(v.shopifyPrice ?? v.price)}
                {" · "}
                stok {variantStock(v) ?? "—"}
                {v.inStock === false ? " · tükendi" : ""}
              </Text>
              {v.sku || v.sourceSku || v.barcode ? (
                <Text style={styles.variantMeta}>
                  SKU {v.sku || v.sourceSku || "—"}
                  {v.barcode ? ` · barkod ${v.barcode}` : ""}
                </Text>
              ) : null}
              {v.shopifyVariantId ? (
                <Text style={styles.variantMeta}>Shopify {v.shopifyVariantId}</Text>
              ) : null}
            </View>
          ))
        )}
      </>
    );
  };

  const renderDescription = (text?: string | null) => {
    if (!text?.trim()) return null;
    return (
      <>
        <Text style={styles.section}>Açıklama</Text>
        <Text style={styles.description}>{text.trim()}</Text>
      </>
    );
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
          <MetaLine label="Durum" value={tracked.currentStatus || "—"} />
          <MetaLine label="Shopify ID" value={tracked.shopifyProductId || "—"} />
          <MetaLine label="Shopify senkron" value={tracked.shopifySyncStatus || "—"} />
          <MetaLine
            label="Kontrol aralığı"
            value={
              tracked.checkIntervalMinutes != null
                ? `${tracked.checkIntervalMinutes} dk`
                : "—"
            }
          />
          <MetaLine
            label="Son kontrol"
            value={formatDateTime(tracked.lastCheckedAt || tracked.lastSuccessAt)}
          />
          {matchedScraped?.brand ? <MetaLine label="Marka" value={matchedScraped.brand} /> : null}
          {matchedScraped?.category ? (
            <MetaLine label="Kategori" value={matchedScraped.category} />
          ) : null}
          {matchedScraped?.trendyolProductId ? (
            <MetaLine label="Kaynak ürün ID" value={matchedScraped.trendyolProductId} />
          ) : null}
        </View>
        {renderDescription(matchedScraped?.description)}

        {tracked.sourceUrl ? (
          <Text
            style={styles.link}
            onPress={() => Linking.openURL(tracked.sourceUrl)}
          >
            Kaynak bağlantısını aç
          </Text>
        ) : null}

        {renderVariantList(variants.data?.variants)}

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

  if (isMemory) {
    if (memory.isLoading) {
      return (
        <View style={styles.root}>
          <SkeletonList rows={5} />
        </View>
      );
    }
    if (memory.isError || !memoryProduct) {
      return (
        <View style={styles.root}>
          <ErrorState
            message={
              memory.isError ? (memory.error as Error).message : "Ürün bulunamadı"
            }
            onRetry={() => memory.refetch()}
          />
        </View>
      );
    }
    const memoryVariants = Array.isArray(memoryProduct.variants)
      ? (memoryProduct.variants as ProductVariantRow[])
      : [];
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={memory.isFetching}
            onRefresh={refetchAll}
            tintColor={colors.text}
          />
        }
      >
        <ImageGallery urls={uniqueImageUrls(memoryProduct.images, memoryProduct.image)} />
        <Text style={styles.title}>{memoryProduct.title}</Text>
        <Text style={styles.source}>Shopify hafıza</Text>
        <TouchableOpacity
          style={styles.priceBtn}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.75}
        >
          <View>
            <Text style={styles.priceBtnLabel}>Güncel fiyat</Text>
            <Text style={styles.priceBtnValue}>{formatMoney(memoryProduct.price)}</Text>
          </View>
          <Text style={styles.priceBtnHint}>Hareketler</Text>
        </TouchableOpacity>
        <View style={styles.panel}>
          <MetaLine label="Kaynak" value="Shopify" />
          <MetaLine label="Handle" value={memoryProduct.handle || "—"} />
          <MetaLine label="Satıcı" value={memoryProduct.vendor || "—"} />
          <MetaLine label="Ürün tipi" value={memoryProduct.productType || "—"} />
          <MetaLine label="SKU" value={memoryProduct.sku || "—"} />
          <MetaLine label="Barkod" value={memoryProduct.barcode || "—"} />
          <MetaLine
            label="Stok"
            value={
              memoryProduct.inventoryQuantity != null
                ? String(memoryProduct.inventoryQuantity)
                : "—"
            }
          />
          <MetaLine label="Stok politikası" value={memoryProduct.inventoryPolicy || "—"} />
          <MetaLine
            label="Karşılaştırma fiyatı"
            value={formatMoney(memoryProduct.compareAtPrice)}
          />
          <MetaLine
            label="Ağırlık"
            value={
              memoryProduct.weight != null
                ? `${memoryProduct.weight} ${memoryProduct.weightUnit || "kg"}`
                : "—"
            }
          />
          <MetaLine label="Durum" value={memoryProduct.status || "—"} />
          <MetaLine label="Etiketler" value={joinList(memoryProduct.tags) || "—"} />
          <MetaLine label="Shopify ID" value={memoryProduct.shopifyProductId || "—"} />
          <MetaLine label="Shopify varyant" value={memoryProduct.shopifyVariantId || "—"} />
          <MetaLine label="Takip ID" value={memoryProduct.uniqueTrackingId || "—"} />
          <MetaLine
            label="Takip"
            value={
              memoryProduct.tracking
                ? memoryProduct.tracking.trackingEnabled
                  ? "Aktif"
                  : "Pasif"
                : memoryProduct.isTracking
                  ? "Hafızada takip"
                  : "Takipte değil"
            }
          />
          <MetaLine label="Son senkron" value={formatDateTime(memoryProduct.lastSyncAt)} />
          <MetaLine label="Shopify oluşturulma" value={formatDateTime(memoryProduct.shopifyCreatedAt)} />
        </View>
        {memoryProduct.sourceUrl ? (
          <Text
            style={styles.link}
            onPress={() => Linking.openURL(memoryProduct.sourceUrl!)}
          >
            Kaynak bağlantısını aç
          </Text>
        ) : null}
        {renderVariantList(memoryVariants)}
        <PriceMovementDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          price={memoryProduct.price}
          stock={memoryProduct.inventoryQuantity}
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
        <MetaLine label="Marka" value={scrapedProduct.brand || "—"} />
        <MetaLine label="Kategori" value={scrapedProduct.category || "—"} />
        <MetaLine label="Liste fiyatı" value={formatMoney(scrapedProduct.originalPrice)} />
        <MetaLine label="Güncel fiyat" value={formatMoney(scrapedProduct.currentPrice)} />
        <MetaLine label="Stok" value={scrapedProduct.stockStatus || "—"} />
        <MetaLine label="Renkler" value={joinList(scrapedProduct.colorOptions) || "—"} />
        <MetaLine label="Bedenler" value={joinList(scrapedProduct.sizeOptions) || "—"} />
        <MetaLine
          label="Varyant"
          value={String(scrapedProduct.variantCount ?? scrapedProduct.variants?.length ?? "—")}
        />
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
        <MetaLine label="Aktif" value={scrapedProduct.isActive === false ? "Hayır" : "Evet"} />
        <MetaLine label="Kaynak ürün ID" value={scrapedProduct.trendyolProductId || "—"} />
        <MetaLine label="Takip ID" value={scrapedProduct.uniqueTrackingId || "—"} />
        <MetaLine label="Shopify ID" value={scrapedProduct.shopifyProductId || "—"} />
        <MetaLine label="Shopify URL" value={scrapedProduct.shopifyUrl || "—"} />
        <MetaLine label="Mağaza URL" value={scrapedProduct.shopifyStoreUrl || "—"} />
        <MetaLine label="Kaynak URL" value={scrapedProduct.sourceUrl || scrapedProduct.trendyolUrl || "—"} />
        <MetaLine
          label="Kâr marjı"
          value={scrapedProduct.profitMargin != null ? `%${scrapedProduct.profitMargin}` : "—"}
        />
        <MetaLine label="Senkron" value={scrapedProduct.syncStatus || "—"} />
        <MetaLine
          label="Son çekim"
          value={formatDateTime(scrapedProduct.scrapedAt || scrapedProduct.createdAt)}
        />
        <MetaLine label="Son kontrol" value={formatDateTime(scrapedProduct.lastChecked)} />
        {featureLines(scrapedProduct.features).map((row) => (
          <MetaLine key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
      {renderDescription(scrapedProduct.description)}
      {scrapedProduct.trendyolUrl ? (
        <Text
          style={styles.link}
          onPress={() => Linking.openURL(scrapedProduct.trendyolUrl!)}
        >
          Kaynak bağlantısını aç
        </Text>
      ) : null}
      {scrapedProduct.shopifyUrl || scrapedProduct.shopifyStoreUrl ? (
        <Text
          style={styles.link}
          onPress={() =>
            Linking.openURL(scrapedProduct.shopifyStoreUrl || scrapedProduct.shopifyUrl!)
          }
        >
          Shopify bağlantısını aç
        </Text>
      ) : null}
      {renderVariantList(scrapedProduct.variants)}
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
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
});
