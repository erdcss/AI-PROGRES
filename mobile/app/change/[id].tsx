import React, { useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Image, Alert, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import { fetchAllChanges, markChangeSeen, shopifySyncChange } from "../../src/api/tracking";
import {
  changeTypeLabel,
  formatChangeValue,
  formatRelativeTime,
  marketplaceLabel,
  priceDeltaDirection,
  isPriceChangeType,
} from "../../src/lib/format";
import { showShopifyFixButton } from "../../src/lib/shopify-fix";
import { ErrorState, MetaLine, SkeletonList } from "../../src/components/Ui";

export default function ChangeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const changeId = Number(id);
  const router = useRouter();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["changes-all"],
    queryFn: () => fetchAllChanges(),
  });

  const item = (list.data?.changes || []).find((c: { id: number }) => c.id === changeId);

  const mark = useMutation({
    mutationFn: () => markChangeSeen(changeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-badge"] });
      qc.invalidateQueries({ queryKey: ["changes-all"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const fix = useMutation({
    mutationFn: () => shopifySyncChange(changeId),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["changes-all"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert("Shopify", data.shopify?.message || "Shopify'da düzeltildi.");
    },
    onError: (err: Error) => {
      Alert.alert("Shopify", err.message || "Düzeltme başarısız");
    },
  });

  useEffect(() => {
    if (item && !item.seenAt) {
      mark.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (list.isLoading) {
    return (
      <View style={styles.root}>
        <SkeletonList rows={4} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.root}>
        <ErrorState
          message={`Değişiklik #${changeId} bulunamadı`}
          onRetry={() => list.refetch()}
        />
      </View>
    );
  }

  const dir = isPriceChangeType(item.changeType)
    ? priceDeltaDirection(item.oldValue, item.newValue)
    : null;
  const canFix = showShopifyFixButton(item);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {item.productImageUrl ? (
        <Image source={{ uri: item.productImageUrl }} style={styles.hero} />
      ) : null}
      <Text style={styles.type}>{changeTypeLabel(item.changeType)} değişti</Text>
      <Text style={styles.title}>
        {item.productTitle || `Ürün #${item.trackedProductId}`}
      </Text>
      <View style={styles.valuesRow}>
        <Text style={styles.values}>
          {formatChangeValue(item.oldValue)} → {formatChangeValue(item.newValue)}
        </Text>
        {dir === "down" ? (
          <Text style={{ color: colors.positive }}>↓</Text>
        ) : dir === "up" ? (
          <Text style={{ color: colors.negative }}>↑</Text>
        ) : null}
      </View>
      <Text style={styles.time}>{formatRelativeTime(item.createdAt)}</Text>

      {canFix ? (
        <TouchableOpacity
          style={styles.fixBtn}
          onPress={() => fix.mutate()}
          disabled={fix.isPending}
          activeOpacity={0.8}
        >
          <Text style={styles.fixBtnText}>
            {fix.isPending ? "Shopify düzeltiliyor…" : "Shopify'da düzelt"}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.panel}>
        <MetaLine label="Kaynak" value={marketplaceLabel(item.sourceSite)} />
        <MetaLine label="Durum" value={item.status || "—"} />
        <MetaLine label="Alan" value={item.fieldName || item.changeType} />
      </View>

      <Text
        style={styles.link}
        onPress={() => router.push(`/product/tracked-${item.trackedProductId}`)}
      >
        Ürün detayına git
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  content: { paddingBottom: 40 },
  hero: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  type: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  valuesRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  values: { color: colors.text, fontSize: 16, fontWeight: "600" },
  time: { color: colors.textMuted, marginTop: 8, fontSize: 12 },
  fixBtn: {
    marginTop: 18,
    backgroundColor: colors.text,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  fixBtnText: { color: colors.bg, fontSize: 15, fontWeight: "700" },
  panel: {
    marginTop: 18,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  link: {
    color: colors.textSecondary,
    marginTop: 20,
    textDecorationLine: "underline",
    fontSize: 13,
  },
});
