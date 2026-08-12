import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import {
  fetchWeboProducts,
  transferWeboProductToShopify,
  type WeboProduct,
} from "../../src/api/webo";
import { EmptyState, ErrorState, OfflineBanner, ScreenHeader } from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";
import { formatMoney } from "../../src/lib/format";

function WeboRow({
  item,
  transferring,
  onTransfer,
}: {
  item: WeboProduct;
  transferring: boolean;
  onTransfer: (id: number) => void;
}) {
  const price = item.salePrice ?? item.price;
  return (
    <View style={styles.card}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          {item.siteLogoUrl ? (
            <Image source={{ uri: item.siteLogoUrl }} style={styles.logo} resizeMode="contain" />
          ) : null}
          <Text style={styles.site} numberOfLines={1}>
            {item.siteName || "Kaynak"}
          </Text>
        </View>
        <Text style={styles.price}>{formatMoney(price, item.currency)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.btn, transferring && styles.btnDisabled]}
        disabled={transferring}
        onPress={() => onTransfer(item.id)}
        activeOpacity={0.75}
      >
        {transferring ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <Text style={styles.btnText}>Shopify'a{`\n`}aktar</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function WeboScreen() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);

  const list = useQuery({
    queryKey: ["webo-products"],
    queryFn: () => fetchWeboProducts(80),
    refetchInterval: false,
  });

  const transfer = useMutation({
    mutationFn: transferWeboProductToShopify,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["webo-products"] });
      void qc.invalidateQueries({ queryKey: ["memory-products"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const onTransfer = useCallback(
    (id: number) => {
      Alert.alert("Shopify'a aktar", "Bu ürün mağazaya yüklensin mi?", [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Aktar",
          onPress: async () => {
            setBusyId(id);
            try {
              await transfer.mutateAsync(id);
              Alert.alert("Tamam", "Ürün Shopify'a aktarıldı");
            } catch (err) {
              Alert.alert("Hata", err instanceof Error ? err.message : "Aktarım başarısız");
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [transfer],
  );

  const items = list.data?.products || [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <View style={styles.pad}>
        <ScreenHeader
          title="Webo"
          caption={`${items.length} bekleyen ürün · Shopify’a aktarılmamış`}
        />
      </View>

      {list.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : list.isError ? (
        <View style={styles.pad}>
          <ErrorState
            message={(list.error as Error)?.message || "Liste alınamadı"}
            onRetry={() => list.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={list.isFetching && !list.isLoading}
              onRefresh={() => list.refetch()}
              tintColor={colors.text}
            />
          }
          ListEmptyComponent={<EmptyState message="Henüz bekleyen Webo ürünü yok." />}
          renderItem={({ item }) => (
            <WeboRow
              item={item}
              transferring={busyId === item.id}
              onTransfer={onTransfer}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 28, gap: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 76,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
  },
  thumbEmpty: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  mid: { flex: 1, minWidth: 0, gap: 2 },
  title: { color: colors.text, fontSize: 13, fontWeight: "600", lineHeight: 17 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  logo: { width: 14, height: 14, borderRadius: 2, backgroundColor: "#fff" },
  site: { color: colors.textMuted, fontSize: 11, flexShrink: 1 },
  price: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 },
  btn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
  },
});
