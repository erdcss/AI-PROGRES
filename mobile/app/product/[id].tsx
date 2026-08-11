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
  pickDisplayPrice,
  uniqueImageUrls,
  variantPrice,
  variantStock,
  variantTitle,
} from "../../src/lib/format";
import { EmptyState, ErrorState, MetaLine, SkeletonList } from "../../src/components/Ui";
import { ImageGallery } from "../../src/components/ImageGallery";
import { PriceMovementDrawer } from "../../src/components/PriceMovementDrawer";
import { WatchTagPicker } from "../../src/components/WatchTag";
import { parseWatchTag, type WatchTag } from "../../src/lib/watch-tag";

function Chip({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  if (!label.trim() || label === "—") return null;
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={styles.chipPress}>
        <Text style={styles.chipText} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionKicker}>{title}</Text>
      {children}
    </View>
  );
}

function ChipRow({ items }: { items: Array<{ label: string; onPress?: () => void }> }) {
  const visible = items.filter((i) => i.label && i.label !== "—");
  if (!visible.length) return null;
  return (
    <View style={styles.chipRow}>
      {visible.map((item) => (
        <Chip key={item.label} label={item.label} onPress={item.onPress} />
      ))}
    </View>
  );
}

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

  const variantsQ = useQuery({
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
      variantsQ.refetch();
      snapshots.refetch();
      history.refetch();
      allScraped.refetch();
    } else if (isMemory) {
      memory.refetch();
      variantsQ.refetch();
      snapshots.refetch();
      history.refetch();
    } else {
      scraped.refetch();
      snapshots.refetch();
      history.refetch();
    }
  };

  const asTags = (v?: unknown) =>
    Array.isArray(v) ? v.filter(Boolean).map(String) : [];

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

  const openUrl = (url?: string | null) => {
    if (!url) return;
    void Linking.openURL(url);
  };

  const renderVariantList = (list: ProductVariantRow[] | undefined) => {
    const rows = list || [];
    return (
      <Section title={`Varyantlar · ${rows.length}`}>
        {rows.length === 0 ? (
          <EmptyState message="Varyant kaydı yok." />
        ) : (
          rows.map((v, idx) => (
            <View key={String(v.id ?? idx)} style={styles.variant}>
              <Text style={styles.variantTitle}>{variantTitle(v)}</Text>
              <View style={styles.chipRow}>
                {v.color ? <Chip label={String(v.color)} /> : null}
                {v.size ? <Chip label={String(v.size)} /> : null}
                {v.option1 ? <Chip label={String(v.option1)} /> : null}
                {v.option2 ? <Chip label={String(v.option2)} /> : null}
                {v.inStock === false ? <Chip label="Tükendi" /> : null}
              </View>
              <Text style={styles.variantMeta}>
                Alış {formatMoney(v.trendyolPrice ?? variantPrice(v))}
                {" · "}
                Satış {formatMoney(v.shopifyPrice ?? v.price)}
                {" · "}
                stok {variantStock(v) ?? "—"}
              </Text>
              {v.sku || v.sourceSku || v.barcode ? (
                <Text style={styles.variantMeta}>
                  SKU {v.sku || v.sourceSku || "—"}
                  {v.barcode ? ` · barkod ${v.barcode}` : ""}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </Section>
    );
  };

  const loading =
    (isTracked && trackedList.isLoading) ||
    (isMemory && memory.isLoading) ||
    (!isTracked && !isMemory && scraped.isLoading);
  const missing =
    (isTracked && !tracked) ||
    (isMemory && !memoryProduct) ||
    (!isTracked && !isMemory && !scrapedProduct);
  const errorMsg = isTracked
    ? trackedList.isError
      ? (trackedList.error as Error).message
      : "Ürün bulunamadı"
    : isMemory
      ? memory.isError
        ? (memory.error as Error).message
        : "Ürün bulunamadı"
      : scraped.isError
        ? (scraped.error as Error).message
        : "Ürün bulunamadı";

  if (loading) {
    return (
      <View style={styles.root}>
        <SkeletonList rows={5} />
      </View>
    );
  }
  if (missing) {
    return (
      <View style={styles.root}>
        <ErrorState
          message={errorMsg}
          onRetry={() => {
            if (isTracked) trackedList.refetch();
            else if (isMemory) memory.refetch();
            else scraped.refetch();
          }}
        />
      </View>
    );
  }

  const title = isTracked
    ? tracked!.sourceTitle
    : isMemory
      ? memoryProduct!.title
      : scrapedProduct!.title;
  const images = isTracked
    ? trackedImages
    : isMemory
      ? uniqueImageUrls(memoryProduct!.images, memoryProduct!.image)
      : scrapedImages;
  const sourceLabel = isTracked
    ? domainFromUrl(tracked!.sourceUrl) || marketplaceLabel(tracked!.sourceSite)
    : isMemory
      ? "Shopify hafıza"
      : domainFromUrl(scrapedProduct!.trendyolUrl) ||
        marketplaceLabel(scrapedProduct!.marketplace || scrapedProduct!.sourcePlatform);
  const priceValue = isTracked
    ? pickDisplayPrice(
        tracked!.currentSourcePrice,
        matchedScraped?.currentPrice,
        matchedScraped?.originalPrice,
        ...(variantsQ.data?.variants || []).map((v) => variantPrice(v)),
        ...(matchedScraped?.variants || []).map((v) => variantPrice(v)),
      )
    : isMemory
      ? pickDisplayPrice(
          memoryProduct!.price,
          memoryProduct!.compareAtPrice,
          ...((Array.isArray(memoryProduct!.variants) ? memoryProduct!.variants : []) as ProductVariantRow[]).map(
            (v) => variantPrice(v),
          ),
        )
      : pickDisplayPrice(
          scrapedProduct!.currentPrice,
          scrapedProduct!.originalPrice,
          ...(scrapedProduct!.variants || []).map((v) => variantPrice(v)),
        );
  const sourceUrl = isTracked
    ? tracked!.sourceUrl
    : isMemory
      ? memoryProduct!.sourceUrl
      : scrapedProduct!.trendyolUrl || scrapedProduct!.sourceUrl;
  const shopifyUrl = isTracked
    ? null
    : isMemory
      ? null
      : scrapedProduct!.shopifyStoreUrl || scrapedProduct!.shopifyUrl;
  const variantRows: ProductVariantRow[] = isTracked
    ? variantsQ.data?.variants || []
    : isMemory
      ? ((Array.isArray(memoryProduct!.variants) ? memoryProduct!.variants : []) as ProductVariantRow[])
      : scrapedProduct!.variants || [];
  const colorTags = isTracked
    ? asTags(matchedScraped?.colorOptions)
    : isMemory
      ? []
      : asTags(scrapedProduct!.colorOptions);
  const sizeTags = isTracked
    ? asTags(matchedScraped?.sizeOptions)
    : isMemory
      ? []
      : asTags(scrapedProduct!.sizeOptions);
  const memoryTags = isMemory ? asTags(memoryProduct!.tags) : [];
  const description = isTracked
    ? matchedScraped?.description
    : isMemory
      ? null
      : scrapedProduct!.description;
  const features = isTracked
    ? featureLines(matchedScraped?.features)
    : isMemory
      ? []
      : featureLines(scrapedProduct!.features);
  const showWatch = !isMemory;
  const refreshing = isTracked
    ? trackedList.isFetching
    : isMemory
      ? memory.isFetching
      : scraped.isFetching;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={colors.text} />
      }
    >
      <ImageGallery urls={images} />
      <Text style={styles.title}>{title}</Text>
      <ChipRow
        items={[
          { label: sourceLabel },
          ...(isTracked
            ? [
                { label: marketplaceLabel(tracked!.sourceSite) },
                ...(matchedScraped?.brand ? [{ label: matchedScraped.brand }] : []),
                ...(matchedScraped?.category ? [{ label: matchedScraped.category }] : []),
              ]
            : isMemory
              ? [
                  ...(memoryProduct!.vendor ? [{ label: memoryProduct!.vendor }] : []),
                  ...(memoryProduct!.productType ? [{ label: memoryProduct!.productType }] : []),
                  ...(memoryProduct!.status ? [{ label: memoryProduct!.status }] : []),
                ]
              : [
                  ...(scrapedProduct!.brand ? [{ label: scrapedProduct!.brand }] : []),
                  ...(scrapedProduct!.category ? [{ label: scrapedProduct!.category }] : []),
                ]),
        ]}
      />

      <TouchableOpacity style={styles.priceBtn} onPress={() => setDrawerOpen(true)} activeOpacity={0.75}>
        <View>
          <Text style={styles.priceBtnLabel}>Güncel fiyat</Text>
          <Text style={styles.priceBtnValue}>{formatMoney(priceValue)}</Text>
        </View>
        <View style={styles.linkChip}>
          <Text style={styles.linkChipText}>Hareketler</Text>
        </View>
      </TouchableOpacity>

      {showWatch ? (
        <Section title="Takip">
          <WatchTagPicker
            value={currentTag}
            disabled={tagMut.isPending}
            onChange={(next) => tagMut.mutate(next)}
          />
        </Section>
      ) : null}

      <Section title="Ürün bilgisi">
        {isTracked ? (
          <>
            <MetaLine
              label="Stok"
              value={tracked!.currentSourceStock != null ? String(tracked!.currentSourceStock) : "—"}
            />
            <MetaLine label="Varyant" value={String(variantsQ.data?.variants?.length ?? "—")} />
            <MetaLine label="Takip" value={tracked!.trackingEnabled ? "Aktif" : "Pasif"} />
            <MetaLine label="Durum" value={tracked!.currentStatus || "—"} />
            <MetaLine
              label="Kontrol aralığı"
              value={
                tracked!.checkIntervalMinutes != null ? `${tracked!.checkIntervalMinutes} dk` : "—"
              }
            />
            <MetaLine
              label="Son kontrol"
              value={formatDateTime(tracked!.lastCheckedAt || tracked!.lastSuccessAt)}
            />
          </>
        ) : isMemory ? (
          <>
            <MetaLine label="Handle" value={memoryProduct!.handle || "—"} />
            <MetaLine label="SKU" value={memoryProduct!.sku || "—"} />
            <MetaLine label="Barkod" value={memoryProduct!.barcode || "—"} />
            <MetaLine
              label="Stok"
              value={
                memoryProduct!.inventoryQuantity != null
                  ? String(memoryProduct!.inventoryQuantity)
                  : "—"
              }
            />
            <MetaLine label="Stok politikası" value={memoryProduct!.inventoryPolicy || "—"} />
            <MetaLine label="Karşılaştırma fiyatı" value={formatMoney(memoryProduct!.compareAtPrice)} />
            <MetaLine
              label="Ağırlık"
              value={
                memoryProduct!.weight != null
                  ? `${memoryProduct!.weight} ${memoryProduct!.weightUnit || "kg"}`
                  : "—"
              }
            />
            <MetaLine
              label="Takip"
              value={
                memoryProduct!.tracking
                  ? memoryProduct!.tracking.trackingEnabled
                    ? "Aktif"
                    : "Pasif"
                  : memoryProduct!.isTracking
                    ? "Hafızada takip"
                    : "Takipte değil"
              }
            />
            <MetaLine label="Son senkron" value={formatDateTime(memoryProduct!.lastSyncAt)} />
          </>
        ) : (
          <>
            <MetaLine label="Liste fiyatı" value={formatMoney(scrapedProduct!.originalPrice)} />
            <MetaLine label="Stok" value={scrapedProduct!.stockStatus || "—"} />
            <MetaLine
              label="Varyant"
              value={String(scrapedProduct!.variantCount ?? scrapedProduct!.variants?.length ?? "—")}
            />
            <MetaLine
              label="Takip"
              value={
                scrapedProduct!.tracking
                  ? scrapedProduct!.tracking.trackingEnabled
                    ? "Aktif"
                    : "Pasif"
                  : "Takipte değil"
              }
            />
            <MetaLine
              label="Kâr marjı"
              value={
                scrapedProduct!.profitMargin != null ? `%${scrapedProduct!.profitMargin}` : "—"
              }
            />
            <MetaLine
              label="Son çekim"
              value={formatDateTime(scrapedProduct!.scrapedAt || scrapedProduct!.createdAt)}
            />
            <MetaLine label="Son kontrol" value={formatDateTime(scrapedProduct!.lastChecked)} />
          </>
        )}
      </Section>

      {(colorTags.length > 0 || sizeTags.length > 0 || memoryTags.length > 0) && (
        <Section title="Etiketler">
          {colorTags.length > 0 ? (
            <>
              <Text style={styles.subLabel}>Renkler</Text>
              <ChipRow items={colorTags.map((label) => ({ label }))} />
            </>
          ) : null}
          {sizeTags.length > 0 ? (
            <>
              <Text style={styles.subLabel}>Bedenler</Text>
              <ChipRow items={sizeTags.map((label) => ({ label }))} />
            </>
          ) : null}
          {memoryTags.length > 0 ? (
            <>
              <Text style={styles.subLabel}>Shopify etiketleri</Text>
              <ChipRow items={memoryTags.map((label) => ({ label }))} />
            </>
          ) : null}
        </Section>
      )}

      <Section title="Kaynak ve bağlantılar">
        {isTracked ? (
          <>
            <MetaLine label="Kaynak ürün ID" value={matchedScraped?.trendyolProductId || "—"} />
            <MetaLine label="Kaynak URL" value={tracked!.sourceUrl || "—"} />
          </>
        ) : isMemory ? (
          <>
            <MetaLine label="Takip ID" value={memoryProduct!.uniqueTrackingId || "—"} />
            <MetaLine label="Shopify oluşturulma" value={formatDateTime(memoryProduct!.shopifyCreatedAt)} />
          </>
        ) : (
          <>
            <MetaLine label="Kaynak ürün ID" value={scrapedProduct!.trendyolProductId || "—"} />
            <MetaLine label="Takip ID" value={scrapedProduct!.uniqueTrackingId || "—"} />
            <MetaLine
              label="Kaynak URL"
              value={scrapedProduct!.sourceUrl || scrapedProduct!.trendyolUrl || "—"}
            />
          </>
        )}
        <View style={styles.chipRow}>
          {sourceUrl ? <Chip label="Kaynak bağlantısını aç" onPress={() => openUrl(sourceUrl)} /> : null}
          {shopifyUrl ? <Chip label="Shopify bağlantısını aç" onPress={() => openUrl(shopifyUrl)} /> : null}
        </View>
      </Section>

      <Section title="Shopify">
        {isTracked ? (
          <>
            <MetaLine label="Shopify ID" value={tracked!.shopifyProductId || "—"} />
            <MetaLine label="Shopify senkron" value={tracked!.shopifySyncStatus || "—"} />
          </>
        ) : isMemory ? (
          <>
            <MetaLine label="Shopify ID" value={memoryProduct!.shopifyProductId || "—"} />
            <MetaLine label="Shopify varyant" value={memoryProduct!.shopifyVariantId || "—"} />
          </>
        ) : (
          <>
            <MetaLine label="Shopify ID" value={scrapedProduct!.shopifyProductId || "—"} />
            <MetaLine label="Shopify URL" value={scrapedProduct!.shopifyUrl || "—"} />
            <MetaLine label="Mağaza URL" value={scrapedProduct!.shopifyStoreUrl || "—"} />
            <MetaLine label="Senkron" value={scrapedProduct!.syncStatus || "—"} />
          </>
        )}
      </Section>

      {features.length > 0 ? (
        <Section title="Özellikler">
          {features.map((row) => (
            <MetaLine key={row.label} label={row.label} value={row.value} />
          ))}
        </Section>
      ) : null}

      {description?.trim() ? (
        <Section title="Açıklama">
          <Text style={styles.description}>{description.trim()}</Text>
        </Section>
      ) : null}

      {renderVariantList(variantRows)}

      <PriceMovementDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        price={
          isTracked
            ? tracked!.currentSourcePrice
            : isMemory
              ? memoryProduct!.price
              : scrapedProduct!.currentPrice
        }
        stock={
          isTracked
            ? tracked!.currentSourceStock
            : isMemory
              ? memoryProduct!.inventoryQuantity
              : scrapedProduct!.stockStatus
        }
        snapshots={snapshots.data?.snapshots || []}
        changes={history.data?.changes || []}
      />
    </ScrollView>
  );
}

const CHIP_BORDER = "#2A2A2A";
const CHIP_BG = "#0B0B0B";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 20, fontWeight: "700", marginTop: 14, letterSpacing: 0.2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: CHIP_BG,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  chipPress: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    backgroundColor: "#111111",
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  chipText: { color: "#D4D4D8", fontSize: 12, fontWeight: "600" },
  priceBtn: {
    marginTop: 16,
    backgroundColor: "#090909",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceBtnLabel: { color: colors.textSecondary, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase" },
  priceBtnValue: { color: colors.text, fontSize: 26, fontWeight: "700", marginTop: 4 },
  linkChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: CHIP_BG,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkChipText: { color: "#E4E4E7", fontSize: 12, fontWeight: "600" },
  sectionCard: {
    marginTop: 14,
    backgroundColor: "#080808",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F1F1F",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionKicker: {
    color: "#A1A1AA",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  subLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginTop: 6,
  },
  variant: {
    backgroundColor: CHIP_BG,
    borderColor: CHIP_BORDER,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  variantTitle: { color: colors.text, fontWeight: "600", fontSize: 13 },
  variantMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  description: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, paddingBottom: 6 },
});
