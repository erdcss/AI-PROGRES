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
import { fetchDashboard, type ChangeRow } from "../../src/api/tracking";
import {
  ChangeRowItem,
  EmptyState,
  ErrorState,
  OfflineBanner,
  ScreenHeader,
  SkeletonList,
  StatCard,
  StatusBadge,
} from "../../src/components/Ui";
import { NotificationBell } from "../../src/components/NotificationDrawer";
import { useOnline } from "../../src/hooks/useOnline";

export default function HomeScreen() {
  const online = useOnline();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });

  const cards = q.data?.cards;
  const system = q.data?.system;
  const recent = useMemo((): ChangeRow[] => {
    return (q.data?.recentChanges || []).slice(0, 5);
  }, [q.data?.recentChanges]);
  const systemOk = Boolean(system?.healthOk || system?.trackingEnabled);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching && !q.isLoading}
            onRefresh={() => q.refetch()}
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
              <StatCard label="Toplam Ürün" value={cards?.scrapedTotal ?? 0} icon="▣" />
              <StatCard label="Aktif Takip" value={cards?.trackedActive ?? 0} icon="◎" />
              <StatCard label="Bekleyen Değişiklik" value={cards?.pendingChanges ?? 0} icon="…" />
              <StatCard label="Fiyat Değişiklikleri" value={cards?.priceChanges ?? 0} icon="⇄" />
              <StatCard label="Stok Değişiklikleri" value={cards?.stockChanges ?? 0} icon="▢" />
              <StatCard label="Varyant Değişiklikleri" value={cards?.variantChanges ?? 0} icon="▦" />
              <StatCard label="Kırmızı Etiket" value={cards?.watchRed ?? 0} icon="●" />
              <StatCard label="Yeşil Etiket" value={cards?.watchGreen ?? 0} icon="●" />
            </View>

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
