import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../src/theme/colors";
import {
  fetchMarktGoHealth,
  fetchTrendyolScrapeJob,
  normalizeScrapeProduct,
  resolveJobId,
  resolveJobProgress,
  resolveJobResult,
  sendProductToMarktGo,
  startTrendyolScrape,
} from "../../src/api/trendyol";
import { useInAppBanner } from "../../src/components/InAppBanner";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type LiveLine = { id: string; label: string; detail?: string; ok?: boolean };

export default function TrendyolMobileScreen() {
  const insets = useSafeAreaInsets();
  const { showBanner } = useInAppBanner();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Hazır");
  const [product, setProduct] = useState<Record<string, any> | null>(null);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const cancelled = useRef(false);

  const addLine = (label: string, detail?: string, ok?: boolean) => {
    setLines((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, label, detail, ok },
    ].slice(-18));
  };

  const canStart = useMemo(
    () => /trendyol\.com/i.test(url) && !busy && !sending,
    [url, busy, sending],
  );

  const runScrape = async () => {
    if (!canStart) {
      Alert.alert("Trendyol URL gerekli", "Geçerli bir Trendyol ürün bağlantısı yapıştır.");
      return;
    }
    cancelled.current = false;
    setBusy(true);
    setProduct(null);
    setLines([]);
    setProgress(5);
    setStatus("Çekim başlatılıyor");
    addLine("İstek gönderildi", "Canlı sunucuya bağlanılıyor");
    showBanner("Trendyol çekimi başladı", "Ürün verileri canlı olarak izleniyor");

    try {
      const start = await startTrendyolScrape(url, false);
      const jobId = resolveJobId(start);
      if (!jobId) {
        const immediate = start?.result ?? start;
        const normalized = normalizeScrapeProduct(immediate, url.trim());
        setProduct(normalized);
        setProgress(100);
        setStatus("Ürün hazır");
        addLine("Ürün çekildi", normalized.title, true);
        showBanner("Ürün hazır", normalized.title);
        return;
      }

      addLine("İş kuyruğa alındı", `Job: ${jobId}`);
      const deadline = Date.now() + 240_000;
      let lastSignature = "";
      while (!cancelled.current && Date.now() < deadline) {
        const job = await fetchTrendyolScrapeJob(jobId);
        const jobStatus = String(job?.status || "processing");
        const jobProgress = resolveJobProgress(job);
        const detail = String(job?.message || job?.stage || job?.detail || "").trim();
        setProgress(jobProgress);
        setStatus(detail || jobStatus);
        const signature = `${jobStatus}|${detail}|${jobProgress}`;
        if (signature !== lastSignature) {
          addLine(jobStatus, detail || `%${jobProgress}`);
          lastSignature = signature;
        }

        if (jobStatus === "success" || jobStatus === "partial_success") {
          const result = resolveJobResult(job);
          if (!result) throw new Error("Ürün sonucu alınamadı");
          const normalized = normalizeScrapeProduct(result, url.trim());
          setProduct(normalized);
          setProgress(100);
          setStatus("Ürün hazır");
          addLine("Ürün çekildi", normalized.title, true);
          showBanner("Trendyol ürünü çekildi", normalized.title);
          return;
        }
        if (["error", "failed", "cancelled"].includes(jobStatus)) {
          throw new Error(String(job?.error || job?.message || "Ürün çekilemedi"));
        }
        await sleep(900);
      }
      if (!cancelled.current) throw new Error("Çekim zaman aşımına uğradı");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(message);
      addLine("Çekim başarısız", message, false);
      showBanner("Trendyol çekimi başarısız", message, "error");
    } finally {
      setBusy(false);
    }
  };

  const sendMarktGo = async () => {
    if (!product || sending) return;
    setSending(true);
    addLine("MARKT-GO kontrolü", "Bağlantı doğrulanıyor");
    try {
      await fetchMarktGoHealth();
      addLine("MARKT-GO bağlantısı hazır", undefined, true);
      const result = await sendProductToMarktGo(product);
      addLine("MARKT-GO aktarımı tamamlandı", String(result?.externalProductId || ""), true);
      showBanner("MARKT-GO'ya gönderildi", product.title);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addLine("MARKT-GO aktarımı başarısız", message, false);
      showBanner("MARKT-GO gönderimi başarısız", message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>ÜRÜN ÇIKARMA</Text>
            <Text style={styles.title}>Trendyol</Text>
            <Text style={styles.caption}>Canlı çekim · anlık durum · MARKT-GO aktarımı</Text>
          </View>
          <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>CANLI</Text></View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Ürün bağlantısı</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://www.trendyol.com/...-p-123456"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={styles.input}
          />
          <TouchableOpacity style={[styles.primary, !canStart && styles.disabled]} disabled={!canStart} onPress={runScrape}>
            {busy ? <ActivityIndicator color="#000" /> : <Ionicons name="download-outline" size={18} color="#000" />}
            <Text style={styles.primaryText}>{busy ? "Çekiliyor..." : "Ürünü Çek"}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Canlı işlem</Text>
            <Text style={styles.percent}>%{progress}</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, progress)}%` }]} /></View>
          <Text style={styles.status}>{status}</Text>
          <View style={styles.timeline}>
            {lines.length === 0 ? <Text style={styles.empty}>İşlem başladığında tüm adımlar burada canlı görünecek.</Text> : lines.map((line) => (
              <View key={line.id} style={styles.timelineRow}>
                <View style={[styles.timelineDot, line.ok === true && styles.dotOk, line.ok === false && styles.dotBad]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.timelineTitle}>{line.label}</Text>
                  {line.detail ? <Text style={styles.timelineDetail} numberOfLines={2}>{line.detail}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>

        {product ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Hazır ürün</Text>
            <View style={styles.productRow}>
              {product.images?.[0] ? <Image source={{ uri: product.images[0] }} style={styles.image} /> : <View style={styles.image} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.productTitle} numberOfLines={3}>{product.title}</Text>
                <Text style={styles.meta}>{product.brand || "Trendyol"}</Text>
                <Text style={styles.price}>{Number(product.salePrice || 0).toLocaleString("tr-TR")} ₺</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.mini}><Text style={styles.miniValue}>{product.images?.length || 0}</Text><Text style={styles.miniLabel}>Görsel</Text></View>
              <View style={styles.mini}><Text style={styles.miniValue}>{product.variants?.length || 0}</Text><Text style={styles.miniLabel}>Varyant</Text></View>
              <View style={styles.mini}><Text style={styles.miniValue}>{product.features?.length || 0}</Text><Text style={styles.miniLabel}>Özellik</Text></View>
            </View>
            <TouchableOpacity style={styles.secondary} disabled={sending} onPress={sendMarktGo}>
              {sending ? <ActivityIndicator color={colors.text} /> : <Ionicons name="cloud-upload-outline" size={18} color={colors.text} />}
              <Text style={styles.secondaryText}>{sending ? "MARKT-GO'ya gönderiliyor..." : "MARKT-GO'ya Gönder"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 },
  kicker: { color: colors.textMuted, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  title: { color: colors.text, fontSize: 28, fontWeight: "800", marginTop: 4 },
  caption: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.positive },
  liveText: { color: colors.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 14, padding: 14 },
  label: { color: colors.textSecondary, fontSize: 11, marginBottom: 8 },
  input: { minHeight: 74, color: colors.text, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 13, textAlignVertical: "top" },
  primary: { marginTop: 10, height: 48, borderRadius: 10, backgroundColor: colors.text, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryText: { color: "#000", fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.35 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  percent: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  track: { height: 4, backgroundColor: colors.surfaceElevated, borderRadius: 4, overflow: "hidden", marginTop: 12 },
  fill: { height: 4, backgroundColor: colors.text, borderRadius: 4 },
  status: { color: colors.textSecondary, fontSize: 12, marginTop: 9 },
  timeline: { marginTop: 12, gap: 10 },
  timelineRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  timelineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textMuted, marginTop: 5 },
  dotOk: { backgroundColor: colors.positive },
  dotBad: { backgroundColor: colors.negative },
  timelineTitle: { color: colors.text, fontSize: 12, fontWeight: "600" },
  timelineDetail: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  empty: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  productRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  image: { width: 82, height: 82, borderRadius: 10, backgroundColor: colors.surfaceElevated },
  productTitle: { color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  meta: { color: colors.textSecondary, fontSize: 11, marginTop: 5 },
  price: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 5 },
  statsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  mini: { flex: 1, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: 10, padding: 10 },
  miniValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
  miniLabel: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
  secondary: { marginTop: 12, height: 48, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surfaceElevated, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryText: { color: colors.text, fontSize: 13, fontWeight: "700" },
});
