import React from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Text, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { colors } from "../../src/theme/colors";
import {
  fetchDashboard,
  fetchMobileScan,
  fetchShopifyConnection,
  fetchTrackingSettings,
  startMobileScan,
  updateTrackingSettings,
} from "../../src/api/tracking";
import { apiFetch, getApiBaseUrl } from "../../src/api/client";
import { formatDateTime } from "../../src/lib/format";
import { isMobileSupabaseConfigured } from "../../src/lib/supabase";
import {
  OfflineBanner,
  ScreenHeader,
  SectionLabel,
  SettingRow,
  SettingToggle,
  StatusBadge,
} from "../../src/components/Ui";
import { NotificationBell } from "../../src/components/NotificationDrawer";
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
  const qc = useQueryClient();
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });
  const trackingSettings = useQuery({
    queryKey: ["tracking-settings"],
    queryFn: fetchTrackingSettings,
  });
  const autoFix = useMutation({
    mutationFn: (enabled: boolean) =>
      updateTrackingSettings({ autoShopifySyncEnabled: enabled }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["tracking-settings"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert(
        "Otomatik Shopify",
        data.settings.autoShopifySyncEnabled
          ? "Açık — uygun fiyat/stok/renk/kaldırma değişiklikleri Shopify'a uygulanır."
          : "Kapalı — düzeltmeler yalnızca tek tuşla yapılır.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Ayar", err.message || "Kaydedilemedi");
    },
  });
  const health = useQuery({
    queryKey: ["mobile-health"],
    queryFn: fetchMobileHealth,
    retry: 0,
  });
  const shopify = useQuery({
    queryKey: ["shopify-connection"],
    queryFn: fetchShopifyConnection,
    retry: 0,
  });
  const scan = useQuery({
    queryKey: ["mobile-scan"],
    queryFn: fetchMobileScan,
    refetchInterval: (q) => (q.state.data?.scan?.running ? 1500 : false),
  });
  const scanMut = useMutation({
    mutationFn: startMobileScan,
    onSuccess: (data) => {
      qc.setQueryData(["mobile-scan"], data);
      void qc.invalidateQueries({ queryKey: ["mobile-scan"] });
      void qc.invalidateQueries({ queryKey: ["changes-all"] });
      void qc.invalidateQueries({ queryKey: ["scraped-products"] });
      void qc.invalidateQueries({ queryKey: ["tracked-products"] });
      void qc.invalidateQueries({ queryKey: ["memory-products"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert(
        "Tarama",
        data.scan.running
          ? "Hafıza ve takip ürünleri taranıyor. Değişiklikler bildirim olarak gelir."
          : data.scan.lastMessage,
      );
    },
    onError: (err: Error) => {
      Alert.alert("Tarama", err.message || "Başlatılamadı");
    },
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
              trackingSettings.refetch();
              shopify.refetch();
              scan.refetch();
            }}
            tintColor={colors.text}
          />
        }
      >
        <View style={styles.head}>
          <ScreenHeader title="Ayarlar" right={<NotificationBell />} />
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

        <SectionLabel>SHOPIFY</SectionLabel>
        <SettingRow
          label="Mağaza bağlantısı"
          value={
            shopify.data?.connected
              ? shopify.data.shopDomain || "Bağlı"
              : shopify.isLoading
                ? "Kontrol ediliyor"
                : shopify.isError
                  ? "Bağlantı yok"
                  : shopify.data?.error || "Bağlı değil"
          }
        />
        <SettingRow
          label="Shopify ürün sayısı"
          value={
            shopify.data?.productCount != null
              ? String(shopify.data.productCount)
              : dash.data?.cards?.shopifyMemoryTotal != null
                ? String(dash.data.cards.shopifyMemoryTotal)
                : "—"
          }
        />
        <SettingRow
          label="Taramayı başlat"
          value={
            scan.data?.scan.running
              ? `${scan.data.scan.checked}/${scan.data.scan.total}`
              : scanMut.isPending
                ? "Başlatılıyor"
                : "Hafızayı tara"
          }
          onPress={() => {
            if (scan.data?.scan.running || scanMut.isPending) return;
            scanMut.mutate();
          }}
        />
        {scan.data?.scan.lastMessage ? (
          <Text style={styles.scanNote}>{scan.data.scan.lastMessage}</Text>
        ) : null}

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
        <SettingToggle
          label="Otomatik Shopify düzeltmesi"
          hint="Fiyat, stok bitti, renk/varyant ve satıştan kalkma kayıtlarını onay beklemeden Shopify'a uygular."
          value={Boolean(
            trackingSettings.data?.settings.autoShopifySyncEnabled ??
              dash.data?.system?.autoShopifySyncEnabled,
          )}
          disabled={autoFix.isPending || trackingSettings.isLoading}
          onValueChange={(v) => autoFix.mutate(v)}
        />

        <SectionLabel>UYGULAMA</SectionLabel>
        <SettingRow label="Hakkında" value="ORVIAN · Ürün Veri Takip Paneli" />
        <SettingRow label="API" value={getApiBaseUrl() || "—"} />

        <Text style={styles.note}>
          Bu sürümde hesap girişi yoktur. Otomatik Shopify düzeltmesi kapalıyken değişiklikler tek tuşla uygulanır.
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
  scanNote: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginBottom: 8, lineHeight: 18 },
});
