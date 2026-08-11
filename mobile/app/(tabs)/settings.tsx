import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Text,
  Alert,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
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
import { useNotificationPermission } from "../../src/components/NotificationPermissionGate";
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

type SettingsTab = "bildirimler" | "sistem" | "shopify" | "takip" | "uygulama";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "bildirimler", label: "Bildirimler" },
  { id: "sistem", label: "Sistem" },
  { id: "shopify", label: "Shopify" },
  { id: "takip", label: "Takip" },
  { id: "uygulama", label: "Uygulama" },
];

async function fetchMobileHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/mobile/health");
}

export default function SettingsScreen() {
  const online = useOnline();
  const permission = useNotificationPermission();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("bildirimler");
  const [registered, setRegistered] = useState(false);

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

  const registerMut = useMutation({
    mutationFn: () => permission.registerDevice(),
    onSuccess: (result) => {
      if (!result.ok) {
        Alert.alert("Cihaz kaydı", result.error || "Kayıt başarısız");
        return;
      }
      setRegistered(true);
      Alert.alert(
        "Cihaz kaydedildi",
        "Bu cihaz program panelindeki Kayıtlı cihazlar listesine eklendi. Test bildirimi artık bu telefona gidebilir.",
      );
    },
    onError: (err: Error) => {
      Alert.alert("Cihaz kaydı", err.message || "Kayıt başarısız");
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
      <View style={styles.headWrap}>
        <View style={styles.head}>
          <ScreenHeader title="Ayarlar" right={<NotificationBell />} />
          <StatusBadge ok={systemOk} />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {TABS.map((item) => {
            const on = item.id === tab;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                style={[styles.tab, on && styles.tabOn]}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

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
              void permission.refresh();
            }}
            tintColor={colors.text}
          />
        }
      >
        {tab === "bildirimler" ? (
          <>
            <SectionLabel>İZİN VE KAYIT</SectionLabel>
            <SettingRow
              label="Sistem izni"
              value={permission.status === "granted" ? "Verildi" : "Bekliyor"}
            />
            <Pressable
              onPress={() => void permission.requestSystemPermission()}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.text} />
              <Text style={styles.actionText}>SİSTEM BİLDİRİM İZNİNİ İSTE</Text>
            </Pressable>
            <Text style={styles.hint}>
              İzin Android sistem penceresinden verilir. Uygulama içi onay yeterli değildir.
            </Text>

            <Pressable
              onPress={() => registerMut.mutate()}
              disabled={registerMut.isPending}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
            >
              <Ionicons name="phone-portrait-outline" size={16} color="#000" />
              <Text style={styles.primaryText}>
                {registerMut.isPending
                  ? "KAYDEDİLİYOR…"
                  : registered
                    ? "CİHAZ KAYITLI — TEKRAR KAYDET"
                    : "CİHAZI PANELE KAYDET"}
              </Text>
            </Pressable>
            <Text style={styles.hint}>
              Kayıt sonrası cihaz programdaki Bildirimler → Kayıtlı cihazlar listesinde görünür ve test bildirimi bu telefona gider.
            </Text>
          </>
        ) : null}

        {tab === "sistem" ? (
          <>
            <SectionLabel>DURUM</SectionLabel>
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
          </>
        ) : null}

        {tab === "shopify" ? (
          <>
            <SectionLabel>MAĞAZA</SectionLabel>
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
          </>
        ) : null}

        {tab === "takip" ? (
          <>
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
          </>
        ) : null}

        {tab === "uygulama" ? (
          <>
            <SectionLabel>HAKKINDA</SectionLabel>
            <SettingRow label="Hakkında" value="ORVIAN · Ürün Veri Takip Paneli" />
            <SettingRow label="API" value={getApiBaseUrl() || "—"} />
            <Text style={styles.note}>
              Bu sürümde hesap girişi yoktur. Otomatik Shopify düzeltmesi kapalıyken değişiklikler tek tuşla uygulanır.
            </Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headWrap: { paddingHorizontal: 16, paddingTop: 8 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tabs: { gap: 8, paddingBottom: 8 },
  tab: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#27272A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#070707",
  },
  tabOn: { borderColor: "#E4E4E7" },
  tabText: { color: "#71717A", fontSize: 12, letterSpacing: 0.4 },
  tabTextOn: { color: colors.text, fontWeight: "600" },
  content: { padding: 16, paddingBottom: 40 },
  note: { color: colors.textMuted, fontSize: 12, marginTop: 20, lineHeight: 18 },
  scanNote: { color: colors.textMuted, fontSize: 12, marginTop: 6, marginBottom: 8, lineHeight: 18 },
  hint: { color: "#71717A", fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 16 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3F3F46",
    backgroundColor: "#09090B",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  actionText: {
    color: colors.text,
    fontSize: 12,
    letterSpacing: 1.6,
    fontWeight: "600",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E4E4E7",
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryText: {
    color: "#000",
    fontSize: 12,
    letterSpacing: 1.6,
    fontWeight: "700",
  },
  pressed: { opacity: 0.75 },
});
