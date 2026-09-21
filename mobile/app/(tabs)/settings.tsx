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
  fetchTrackingSettings,
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
import { useInAppBanner } from "../../src/components/InAppBanner";
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

type SettingsTab = "sistem" | "takip" | "uygulama";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "sistem", label: "Sistem" },
  { id: "takip", label: "Takip" },
  { id: "uygulama", label: "Uygulama" },
];

async function fetchMobileHealth(): Promise<HealthResponse> {
  return apiFetch<HealthResponse>("/api/mobile/health");
}

export default function SettingsScreen() {
  const online = useOnline();
  const permission = useNotificationPermission();
  const { showBanner } = useInAppBanner();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>("sistem");
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
        "Otomatik MARKT-GO",
        data.settings.autoShopifySyncEnabled
          ? "Açık — uygun fiyat/stok/renk/kaldırma değişiklikleri MARKT-GO'ya uygulanır."
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

  const registerMut = useMutation({
    mutationFn: () => permission.registerDevice(),
    onSuccess: (result) => {
      if (!result.ok) {
        showBanner("Cihaz kaydı başarısız", result.error || "Kayıt başarısız");
        return;
      }
      setRegistered(true);
      showBanner(
        "Cihaz kaydedildi",
        "Program panelindeki Kayıtlı cihazlar listesine eklendi.",
      );
    },
    onError: (err: Error) => {
      showBanner("Cihaz kaydı", err.message || "Kayıt başarısız");
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

            <SectionLabel>CİHAZ</SectionLabel>
            <SettingRow
              label="Sistem izni"
              value={permission.status === "granted" ? "Verildi" : "Bekliyor"}
            />
            <Pressable
              onPress={() => {
                void (async () => {
                  const ok = await permission.requestSystemPermission();
                  showBanner(
                    ok ? "Sistem izni verildi" : "Sistem izni alınamadı",
                    ok
                      ? "Bildirim izni Android tarafından açık."
                      : "Açılan sistem penceresinden izni onaylayın.",
                  );
                })();
              }}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.text} />
              <Text style={styles.actionText}>SİSTEM BİLDİRİM İZNİNİ İSTE</Text>
            </Pressable>
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
              Bildirim türleri yalnızca web panelinden yönetilir. Cihaz kaydı test ve programlı bildirimler için gereklidir.
            </Text>
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
              label="Otomatik MARKT-GO düzeltmesi"
              hint="Fiyat, stok bitti, renk/varyant ve satıştan kalkma kayıtlarını onay beklemeden MARKT-GO'ya uygular."
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
              Bu sürümde hesap girişi yoktur. Otomatik MARKT-GO düzeltmesi kapalıyken değişiklikler tek tuşla uygulanır.
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
