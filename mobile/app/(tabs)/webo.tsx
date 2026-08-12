import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { colors } from "../../src/theme/colors";
import {
  addWeboTags,
  fetchWeboProducts,
  fetchWeboSites,
  runWeboDiscoveryScan,
  type WeboProduct,
  type WeboSiteCatalog,
} from "../../src/api/webo";
import { EmptyState, ErrorState, OfflineBanner, ScreenHeader } from "../../src/components/Ui";
import {
  ShopifyTransferButton,
  ThemedConfirmModal,
} from "../../src/components/ShopifyTransfer";
import { useWeboShopifyTransfer } from "../../src/hooks/useWeboShopifyTransfer";
import { useOnline } from "../../src/hooks/useOnline";
import { formatMoney } from "../../src/lib/format";
import { useInAppBanner } from "../../src/components/InAppBanner";

function normalizeImageUri(url?: string | null, images?: string[]): string | undefined {
  const candidates = [url, ...(images || [])];
  for (const raw of candidates) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (s.startsWith("//")) return `https:${s}`;
    if (s.startsWith("http://")) return `https:${s.slice(7)}`;
    if (s.startsWith("https://")) return s;
  }
  return undefined;
}

function WeboThumb({ item }: { item: WeboProduct }) {
  const candidates = useMemo(() => {
    const list = [item.imageUrl, ...(item.images || [])];
    return list
      .map((u) => normalizeImageUri(u))
      .filter((u): u is string => Boolean(u));
  }, [item.imageUrl, item.images]);
  const [idx, setIdx] = useState(0);
  const uri = candidates[idx];

  if (!uri) {
    return <View style={[styles.thumb, styles.thumbEmpty]} />;
  }

  return (
    <Image
      source={{ uri }}
      style={styles.thumb}
      resizeMode="cover"
      onError={() => {
        if (idx < candidates.length - 1) setIdx(idx + 1);
      }}
    />
  );
}

function groupBySite(items: WeboProduct[]) {
  const map = new Map<string, WeboProduct[]>();
  for (const item of items) {
    const key = item.siteId || item.siteName || "Kaynak";
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, data]) => ({
    key,
    title: data[0]?.siteName || key,
    logoUrl: data[0]?.siteLogoUrl,
    data,
  }));
}

function WeboRow({
  item,
  selected,
  transferring,
  onOpen,
  onTransfer,
  onToggleSelect,
}: {
  item: WeboProduct;
  selected: boolean;
  transferring: boolean;
  onOpen: (id: number) => void;
  onTransfer: (id: number, title: string) => void;
  onToggleSelect: (id: number) => void;
}) {
  const price = item.salePrice ?? item.price;

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.checkWrap}
        onPress={() => onToggleSelect(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.cardMain}
        onPress={() => onOpen(item.id)}
        activeOpacity={0.85}
      >
        <WeboThumb item={item} />
        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.meta}>
            {item.siteLogoUrl ? (
              <Image
                source={{ uri: normalizeImageUri(item.siteLogoUrl) }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : null}
            <Text style={styles.site} numberOfLines={1}>
              {item.siteName || "Kaynak"}
            </Text>
          </View>
          {item.tags?.length ? (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 4).map((t) => (
                <Text key={t} style={styles.tagChip} numberOfLines={1}>
                  {t}
                </Text>
              ))}
            </View>
          ) : null}
          <Text style={styles.price}>
            {price && price > 0 ? formatMoney(price, item.currency) : "Fiyat bekleniyor"}
          </Text>
        </View>
      </TouchableOpacity>
      <ShopifyTransferButton
        compact
        boxed
        loading={transferring}
        onPress={() => onTransfer(item.id, item.title)}
      />
    </View>
  );
}

function SiteChip({
  site,
  active,
  onPress,
}: {
  site: WeboSiteCatalog | { id: string; name: string; logoUrl?: string; pendingCount?: number };
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {site.logoUrl ? (
        <Image source={{ uri: site.logoUrl }} style={styles.chipLogo} resizeMode="contain" />
      ) : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {site.name}
      </Text>
      {site.pendingCount != null && site.pendingCount > 0 ? (
        <Text style={styles.chipCount}>{site.pendingCount}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

export default function WeboScreen() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { showBanner } = useInAppBanner();
  const [siteFilter, setSiteFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [tagInput, setTagInput] = useState("");

  const {
    requestTransfer,
    cancelTransfer,
    confirmTransfer,
    confirmVisible,
    confirmTitle,
    busyId,
    transferring,
  } = useWeboShopifyTransfer();

  const sitesQ = useQuery({
    queryKey: ["webo-sites"],
    queryFn: fetchWeboSites,
  });

  const list = useQuery({
    queryKey: ["webo-products", siteFilter],
    queryFn: () => fetchWeboProducts(120, siteFilter),
  });

  const scan = useMutation({
    mutationFn: runWeboDiscoveryScan,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["webo-products"] });
      void qc.invalidateQueries({ queryKey: ["webo-sites"] });
      const s = data.summary;
      showBanner(
        "Tarama tamamlandı",
        s
          ? `${s.sitesScanned} site · ${s.ingested} yeni · ${s.skippedShopify} Shopify'da atlandı`
          : "Tarama bitti",
      );
    },
    onError: (err: Error) => {
      showBanner("Tarama hatası", err.message || "Tarama başarısız", "error");
    },
  });

  const tagMutation = useMutation({
    mutationFn: async ({ ids, tags }: { ids: number[]; tags: string[] }) =>
      addWeboTags(ids, tags),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["webo-products"] });
      setTagInput("");
      setSelectedIds(new Set());
      showBanner("Etiketler eklendi", `${data.updated} ürün güncellendi`);
    },
    onError: (err: Error) => {
      showBanner("Etiket hatası", err.message || "Etiket eklenemedi", "error");
    },
  });

  const onOpen = useCallback(
    (id: number) => router.push(`/webo/${id}`),
    [router],
  );

  const items = list.data?.products || [];
  const sections = useMemo(() => groupBySite(items), [items]);
  const sites = sitesQ.data?.sites || [];

  const visibleIds = items.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return new Set();
      return new Set(visibleIds);
    });
  }, [allVisibleSelected, visibleIds]);

  const applyTags = useCallback(
    (ids: number[]) => {
      const tags = tagInput
        .split(/[,;]+/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (!tags.length) {
        showBanner("Etiket gerekli", "En az bir etiket yazın", "error");
        return;
      }
      if (!ids.length) {
        showBanner("Ürün seçin", "Etiket için ürün seçin veya tümünü işaretleyin", "error");
        return;
      }
      tagMutation.mutate({ ids, tags });
    },
    [tagInput, tagMutation, showBanner],
  );

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
      <View style={styles.pad}>
        <ScreenHeader
          title="Webo"
          caption="Shopify’da olmayan yeni keşifler · sitelere göre düzenlenmiş"
        />
        <TouchableOpacity
          style={[styles.scanBtn, scan.isPending && styles.btnDisabled]}
          disabled={scan.isPending}
          onPress={() => scan.mutate()}
          activeOpacity={0.8}
        >
          {scan.isPending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.scanText}>Tüm siteleri tara</Text>
          )}
        </TouchableOpacity>

        <View style={styles.tagBar}>
          <Text style={styles.tagLabel}>Etiket ekle</Text>
          <TextInput
            style={styles.tagInput}
            placeholder="ör. yaz, sezon"
            placeholderTextColor={colors.textMuted}
            value={tagInput}
            onChangeText={setTagInput}
            autoCapitalize="none"
          />
          <View style={styles.tagActions}>
            <TouchableOpacity
              style={[styles.tagBtn, tagMutation.isPending && styles.btnDisabled]}
              disabled={tagMutation.isPending}
              onPress={() => applyTags([...selectedIds])}
            >
              <Text style={styles.tagBtnText}>Seçilenlere</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tagBtn, tagMutation.isPending && styles.btnDisabled]}
              disabled={tagMutation.isPending}
              onPress={() => applyTags(visibleIds)}
            >
              <Text style={styles.tagBtnText}>Görünenlere</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tagBtnGhost} onPress={toggleSelectAllVisible}>
              <Text style={styles.tagBtnGhostText}>
                {allVisibleSelected ? "Seçimi kaldır" : "Tümünü seç"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <SiteChip
            site={{ id: "all", name: "Tümü", pendingCount: sites.reduce((a, s) => a + s.pendingCount, 0) }}
            active={!siteFilter}
            onPress={() => setSiteFilter(null)}
          />
          {sites.map((site) => (
            <SiteChip
              key={site.id}
              site={site}
              active={siteFilter === site.id}
              onPress={() => setSiteFilter(site.id)}
            />
          ))}
        </ScrollView>
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
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={list.isFetching && !list.isLoading}
              onRefresh={() => {
                void list.refetch();
                void sitesQ.refetch();
              }}
              tintColor={colors.text}
            />
          }
          ListEmptyComponent={
            <EmptyState message="Henüz yeni keşif yok. Tüm siteleri tara ile keşif başlatın." />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              {section.logoUrl ? (
                <Image
                  source={{ uri: section.logoUrl }}
                  style={styles.sectionLogo}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>{section.data.length}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <WeboRow
              item={item}
              selected={selectedIds.has(item.id)}
              transferring={busyId === item.id}
              onOpen={onOpen}
              onTransfer={requestTransfer}
              onToggleSelect={toggleSelect}
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
  scanBtn: {
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  scanText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },
  tagBar: {
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    gap: 8,
  },
  tagLabel: { color: colors.text, fontSize: 13, fontWeight: "700" },
  tagInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    fontSize: 14,
  },
  tagActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tagBtnText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  tagBtnGhost: { paddingHorizontal: 6, paddingVertical: 8 },
  tagBtnGhostText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  chipRow: { gap: 8, paddingBottom: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 140,
  },
  chipActive: {
    borderColor: colors.text,
    backgroundColor: colors.surfaceElevated,
  },
  chipLogo: { width: 16, height: 16, borderRadius: 2, backgroundColor: "#fff" },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: "600", flexShrink: 1 },
  chipTextActive: { color: colors.text },
  chipCount: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 5,
    borderRadius: 8,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 6,
  },
  sectionLogo: { width: 18, height: 18, borderRadius: 2, backgroundColor: "#fff" },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  sectionCount: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingRight: 8,
    minHeight: 76,
  },
  checkWrap: { paddingLeft: 8 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceElevated,
  },
  checkOn: { borderColor: colors.text, backgroundColor: colors.text },
  checkMark: { color: colors.bg, fontSize: 12, fontWeight: "800" },
  cardMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
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
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  tagChip: {
    color: colors.textMuted,
    fontSize: 10,
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    maxWidth: 72,
  },
  price: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 2 },
});
