import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Linking,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import {
  fetchScrapedProduct,
  fetchTrackedProducts,
  fetchTrackedVariants,
  fetchChanges,
} from "../../src/api/tracking";
import {
  domainFromUrl,
  formatDateTime,
  formatMoney,
  marketplaceLabel,
} from "../../src/lib/format";
import {
  ChangeRowItem,
  EmptyState,
  ErrorState,
  MetaLine,
  SkeletonList,
} from "../../src/components/Ui";

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const raw = String(id || "");
  const isTracked = raw.startsWith("tracked-");
  const numericId = Number(raw.replace("tracked-", ""));

  const scraped = useQuery({
    queryKey: ["scraped-product", numericId],
    queryFn: () => fetchScrapedProduct(numericId),
    enabled: !isTracked && Number.isFinite(numericId),
  });

  const trackedList = useQuery({
    queryKey: ["tracked-products"],
    queryFn: fetchTrackedProducts,
    enabled: isTracked,
  });

  const tracked = (trackedList.data?.products || []).find(
    (p: { id: number }) => p.id === numericId,
  );

  const variants = useQuery({
    queryKey: ["tracked-variants", numericId],
    queryFn: () => fetchTrackedVariants(numericId),
    enabled: isTracked && Number.isFinite(numericId),
  });
  const pending = useQuery({
    queryKey: ["tracked-changes-pending", numericId],
    queryFn: () => fetchChanges({ productId: numericId }),
    enabled: isTracked && Number.isFinite(numericId),
  });
  const seen = useQuery({
    queryKey: ["tracked-changes", numericId],
    queryFn: () => fetchChanges({ productId: numericId, status: "seen" }),
    enabled: isTracked && Number.isFinite(numericId),
  });

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

    const changeList = [
      ...(pending.data?.changes || []),
      ...(seen.data?.changes || []),
    ].slice(0, 30);

    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={trackedList.isFetching}
            onRefresh={() => {
              trackedList.refetch();
              variants.refetch();
              pending.refetch();
              seen.refetch();
            }}
            tintColor={colors.text}
          />
        }
      >
        {tracked.productImageUrl ? (
          <Image source={{ uri: tracked.productImageUrl }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroEmpty]} />
        )}
        <Text style={styles.title}>{tracked.sourceTitle}</Text>
        <Text style={styles.source}>
          {domainFromUrl(tracked.sourceUrl) || marketplaceLabel(tracked.sourceSite)}
        </Text>

        <View style={styles.panel}>
          <MetaLine label="Kaynak" value={marketplaceLabel(tracked.sourceSite)} />
          <MetaLine
            label="Kaynak URL"
            value={tracked.sourceUrl || "—"}
          />
          <MetaLine label="Fiyat" value={formatMoney(tracked.currentSourcePrice)} />
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

        <Text style={styles.section}>Son Değişiklikler</Text>
        {changeList.length === 0 ? (
          <EmptyState message="Henüz takip değişikliği yok." />
        ) : (
          changeList.map((c) => <ChangeRowItem key={c.id} item={c} compact />)
        )}

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
      </ScrollView>
    );
  }

  const p = scraped.data?.product;
  if (scraped.isLoading) {
    return (
      <View style={styles.root}>
        <SkeletonList rows={5} />
      </View>
    );
  }
  if (scraped.isError || !p) {
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
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {p.image ? (
        <Image source={{ uri: p.image }} style={styles.hero} />
      ) : (
        <View style={[styles.hero, styles.heroEmpty]} />
      )}
      <Text style={styles.title}>{p.title}</Text>
      <Text style={styles.source}>
        {domainFromUrl(p.trendyolUrl) ||
          marketplaceLabel(p.marketplace || p.sourcePlatform)}
      </Text>
      <View style={styles.panel}>
        <MetaLine
          label="Kaynak"
          value={marketplaceLabel(p.marketplace || p.sourcePlatform)}
        />
        <MetaLine label="Fiyat" value={formatMoney(p.currentPrice)} />
        <MetaLine label="Stok" value={p.stockStatus || "—"} />
        <MetaLine
          label="Takip"
          value={
            p.tracking
              ? p.tracking.trackingEnabled
                ? "Aktif"
                : "Pasif"
              : "Takipte değil"
          }
        />
        <MetaLine
          label="Son çekim"
          value={formatDateTime(p.scrapedAt || p.createdAt)}
        />
      </View>
      {p.trendyolUrl ? (
        <Text style={styles.link} onPress={() => Linking.openURL(p.trendyolUrl!)}>
          Kaynak bağlantısını aç
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  content: { paddingBottom: 40 },
  hero: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  heroEmpty: { backgroundColor: colors.skeletonHighlight },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  source: { color: colors.textSecondary, marginTop: 6, fontSize: 13 },
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
