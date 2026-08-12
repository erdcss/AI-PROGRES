import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../src/theme/colors";
import { fetchWeboProduct } from "../../src/api/webo";
import { ErrorState, OfflineBanner } from "../../src/components/Ui";
import {
  ShopifyTransferButton,
  ThemedConfirmModal,
} from "../../src/components/ShopifyTransfer";
import { useWeboShopifyTransfer } from "../../src/hooks/useWeboShopifyTransfer";
import { useOnline } from "../../src/hooks/useOnline";
import { formatMoney } from "../../src/lib/format";

function normalizeImageUri(url?: string | null): string | undefined {
  const s = String(url || "").trim();
  if (!s) return undefined;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("http")) return s;
  return undefined;
}

export default function WeboDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Number(id);
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const {
    requestTransfer,
    cancelTransfer,
    confirmTransfer,
    confirmVisible,
    confirmTitle,
    transferring,
  } = useWeboShopifyTransfer();

  const detail = useQuery({
    queryKey: ["webo-product", productId],
    queryFn: () => fetchWeboProduct(productId),
    enabled: Number.isFinite(productId) && productId > 0,
  });

  const onTransfer = useCallback(() => {
    const title = detail.data?.product?.title;
    if (title) requestTransfer(productId, title);
  }, [detail.data?.product?.title, productId, requestTransfer]);

  const product = detail.data?.product;
  const images = (product?.images || [])
    .map((u) => normalizeImageUri(u))
    .filter(Boolean) as string[];
  const hero = normalizeImageUri(product?.imageUrl) || images[0] || undefined;
  const gallery = hero ? [hero, ...images.filter((u) => u !== hero)] : images;
  const price = product?.salePrice ?? product?.price;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <ThemedConfirmModal
        visible={confirmVisible}
        title="Shopify'a aktar"
        message={`${confirmTitle} mağazaya yüklensin mi? Aktarılan ürün Webo'dan kaldırılır ve Ürünler listesine gider.`}
        loading={transferring}
        onConfirm={() => void confirmTransfer()}
        onCancel={cancelTransfer}
      />
      {detail.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : detail.isError || !product ? (
        <View style={styles.pad}>
          <ErrorState
            message={(detail.error as Error)?.message || "Ürün bulunamadı"}
            onRetry={() => detail.refetch()}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {gallery.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
              {gallery.map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.hero} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.hero, styles.heroEmpty]} />
          )}

          <Text style={styles.title}>{product.title}</Text>

          <View style={styles.metaRow}>
            {product.siteLogoUrl ? (
              <Image
                source={{ uri: normalizeImageUri(product.siteLogoUrl) }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.site}>{product.siteName || "Kaynak"}</Text>
          </View>

          <Text style={styles.price}>{formatMoney(price, product.currency)}</Text>

          {product.brand ? <Text style={styles.line}>Marka: {product.brand}</Text> : null}
          {product.sku ? <Text style={styles.line}>SKU: {product.sku}</Text> : null}

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={() => Linking.openURL(product.sourceUrl)}
            activeOpacity={0.75}
          >
            <Text style={styles.linkText}>Kaynak sayfayı aç</Text>
          </TouchableOpacity>

          <ShopifyTransferButton loading={transferring} onPress={onTransfer} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  gallery: { marginBottom: 4 },
  hero: {
    width: 280,
    height: 280,
    borderRadius: 12,
    marginRight: 10,
    backgroundColor: colors.surfaceElevated,
  },
  heroEmpty: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "700", lineHeight: 24 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 20, height: 20, borderRadius: 3, backgroundColor: "#fff" },
  site: { color: colors.textMuted, fontSize: 13 },
  price: { color: colors.text, fontSize: 22, fontWeight: "800" },
  line: { color: colors.textMuted, fontSize: 13 },
  linkBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  linkText: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
