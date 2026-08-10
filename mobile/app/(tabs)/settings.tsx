import React from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import { fetchDashboard } from "../../src/api/tracking";
import { apiFetch, getApiBaseUrl } from "../../src/api/client";
import { formatDateTime } from "../../src/lib/format";
import { isMobileSupabaseConfigured } from "../../src/lib/supabase";
import {
  OfflineBanner,
  ScreenHeader,
  SectionLabel,
  SettingRow,
  StatusBadge,
} from "../../src/components/Ui";
import { useOnline } from "../../src/hooks/useOnline";

type HealthResponse = {
  success?: boolean;
  backend?: string;
  database?: string;
  supabase?: string;
  realtimeConfig?: string;
  push?: string;
  lastMobileSync?: string | null;
  lastDashboardSync?: string | null;
};

async function fetchMobileHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/mobile/health");
}

export default function SettingsScreen() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const health = useQuery({
    queryKey: ["mobile-health"],
    queryFn: fetchMobileHealth,
    retry: 0,
  });

  const systemOk = Boolean(
    health.data?.backend === "ok" ||
      dash.data?.system?.healthOk ||
      dash.data?.system?.trackingEnabled,
  );

  const syncLabel = health.data?.lastMobileSync
    ? formatDateTime(health.data.lastMobileSync)
    : formatDateTime(dash.data?.updatedAt);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <OfflineBanner online={online} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={health.isFetching || dash.isFetching}
            onRefresh={() => {
              health.refetch();
              dash.refetch();
            }}
            tintColor={colors.text}
          />
        }
      >
        <View style={styles.head}>
          <ScreenHeader title="Ayarlar" />
          <StatusBadge ok={systemOk} />
        </View>

        <SectionLabel>SİSTEM</SectionLabel>
        <SettingRow
          label="Sistem Durumu"
          value={
            health.data?.backend === "ok"
              ? "Aktif"
              : health.isError
                ? "Bağlantı yok"
                : dash.data?.system?.trackingEnabled
                  ? "Takip açık"
                  : "—"
          }
        />
        <SettingRow label="Veri Senkronizasyonu" value={syncLabel} />
        <SettingRow
          label="Supabase"
          value={
            health.data?.supabase ||
            (isMobileSupabaseConfigured() ? "yapılandırıldı" : "yapılandırılmamış")
          }
        />

        <SectionLabel>BİLDİRİMLER</SectionLabel>
        <SettingRow label="Bildirim Ayarları" value="Cihaz kayıtlı / FCM" />

        <SectionLabel>TAKİP</SectionLabel>
        <SettingRow
          label="Takip Ayarları"
          value={
            dash.data?.system?.schedulerEnabled
              ? "Scheduler açık"
              : dash.data?.system?.trackingEnabled
                ? "Takip açık"
                : "Pasif"
          }
        />

        <SectionLabel>UYGULAMA</SectionLabel>
        <SettingRow label="Hakkında" value="ORVIAN · Ürün Veri Takip Paneli" />
        <SettingRow label="API" value={getApiBaseUrl() || "—"} />

        <Text style={styles.note}>
          Bu sürümde hesap girişi yoktur. Ayarlar yalnızca sistem durumunu gösterir.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 20, lineHeight: 18 },
});
