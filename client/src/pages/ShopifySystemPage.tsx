import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, RefreshCw, CheckCircle, XCircle, Clock, Shield,
  ShoppingCart, Key, AlertTriangle, Zap, Database, Cpu, HardDrive,
  Bot, Activity, RotateCcw, ExternalLink, Server, Loader2, Eye,
  TrendingUp, Package, Lock, Unlock, Timer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// ─── Tipler ─────────────────────────────────────────────────────────────────
interface TokenStatusData {
  status: {
    lastRefreshTime: number;
    nextRefreshTime: number;
    isRefreshing: boolean;
    msUntilRefresh: number;
  };
  hasActiveToken: boolean;
  shopDomain: string | null;
  envVarsConfigured: {
    SHOPIFY_API_KEY: boolean;
    SHOPIFY_APP_SHARED_SECRET: boolean;
    SHOPIFY_ACCESS_TOKEN: boolean;
    SHOPIFY_ADMIN_ACCESS_TOKEN: boolean;
  };
}

interface LiveConnectionData {
  success: boolean;
  message: string;
  store?: string;
}

interface CredentialsData {
  connected: boolean;
  shopDomain?: string;
  apiKey?: string;
  hasToken?: boolean;
  tokenInvalid?: boolean;
  updatedAt?: string;
  source?: string;
}

interface SystemStatusData {
  uptime?: number;
  memory?: { heapUsed: number; heapTotal: number; rss: number };
  services?: { shopify: boolean; telegram: boolean };
}

interface AIStatusData {
  openai?: { active: boolean; model: string };
  gemini?: { active: boolean; model: string };
  anthropic?: { active: boolean; model: string };
  dualValidation?: boolean;
}

// ─── Yardımcı fonksiyonlar ───────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms <= 0) return "Şimdi";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}s ${m}dk`;
  if (m > 0) return `${m}dk ${s}sn`;
  return `${s}sn`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}s ${m}dk`;
}

function formatTimestamp(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("tr-TR");
}

// ─── Kart bileşeni ───────────────────────────────────────────────────────────
function Card({ title, icon, children, accent = "blue", badge }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  accent?: "blue" | "green" | "red" | "orange" | "purple" | "gray";
  badge?: React.ReactNode;
}) {
  const borders = {
    blue: "border-blue-500/30",
    green: "border-green-500/30",
    red: "border-red-500/30",
    orange: "border-orange-500/30",
    purple: "border-purple-500/30",
    gray: "border-gray-500/30",
  };
  const headers = {
    blue: "from-blue-900/50 to-blue-800/20",
    green: "from-green-900/50 to-green-800/20",
    red: "from-red-900/50 to-red-800/20",
    orange: "from-orange-900/50 to-orange-800/20",
    purple: "from-purple-900/50 to-purple-800/20",
    gray: "from-gray-900/50 to-gray-800/20",
  };
  return (
    <div className={`rounded-xl border ${borders[accent]} bg-gray-900/60 overflow-hidden`}>
      <div className={`flex items-center justify-between px-4 py-3 bg-gradient-to-r ${headers[accent]}`}>
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          {icon}
          {title}
        </div>
        {badge}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Durum satırı ────────────────────────────────────────────────────────────
function StatusRow({ label, value, ok, mono = false }: {
  label: string; value: string; ok?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-xs font-semibold ${mono ? "font-mono" : ""} ${
        ok === true ? "text-green-400" : ok === false ? "text-red-400" : "text-white"
      }`}>
        {value}
      </span>
    </div>
  );
}

// ─── Geri sayım hook'u ───────────────────────────────────────────────────────
function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(Math.max(0, targetMs - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, targetMs - Date.now())), 1000);
    return () => clearInterval(id);
  }, [targetMs]);
  return remaining;
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
export default function ShopifySystemPage() {
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: tokenStatus, isLoading: tokenLoading } = useQuery<TokenStatusData>({
    queryKey: ["/api/shopify/token-status", refreshKey],
    refetchInterval: 15000,
  });

  const { data: credentials } = useQuery<CredentialsData>({
    queryKey: ["/api/shopify/credentials", refreshKey],
    refetchInterval: 20000,
  });

  const { data: liveConn, isLoading: liveLoading, refetch: refetchLive } = useQuery<LiveConnectionData>({
    queryKey: ["/api/shopify/status", refreshKey],
    refetchInterval: 30000,
  });

  const { data: systemStatus } = useQuery<SystemStatusData>({
    queryKey: ["/api/system/enhanced-status", refreshKey],
    refetchInterval: 5000,
  });

  const { data: aiStatus } = useQuery<AIStatusData>({
    queryKey: ["/api/ai-status"],
    refetchInterval: 60000,
  });

  const nextRefreshMs = tokenStatus?.status?.nextRefreshTime || 0;
  const countdownMs = useCountdown(nextRefreshMs);
  const lastRefreshMs = tokenStatus?.status?.lastRefreshTime || 0;

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/shopify/rotate-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Yenileme başarısız");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "✅ Token Yenilendi", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/token-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/status"] });
      setRefreshKey(k => k + 1);
    },
    onError: (err: Error) => {
      toast({ title: "❌ Yenileme Başarısız", description: err.message, variant: "destructive" });
    },
  });

  const handleRefreshAll = () => setRefreshKey(k => k + 1);

  const isConnected = liveConn?.success === true;
  const env = tokenStatus?.envVarsConfigured;
  const isRefreshing = tokenStatus?.status?.isRefreshing || rotateMutation.isPending;

  // Yüzde hesapla (12 saatlik döngü = 43200000 ms)
  const CYCLE_MS = 12 * 60 * 60 * 1000;
  const elapsed = lastRefreshMs > 0 ? Date.now() - lastRefreshMs : 0;
  const pct = lastRefreshMs > 0 ? Math.min(100, (elapsed / CYCLE_MS) * 100) : 0;

  const mem = (systemStatus as any)?.memory;
  const heapPct = mem ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0;

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black text-white ${
      isMobile ? "p-4" : "p-6"
    }`}>
      <div className={`mx-auto ${isMobile ? "max-w-full" : "max-w-5xl"}`}>

        {/* ── Başlık ── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center justify-between mb-6 ${isMobile ? "flex-col gap-3" : ""}`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/marketplace")}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className={`font-black text-white ${isMobile ? "text-xl" : "text-3xl"}`}>
                Shopify Sistem Analizi
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                Token yenileme, bağlantı ve kaynak izleme
              </p>
            </div>
          </div>
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Yenile
          </button>
        </motion.div>

        {/* ── Özet Durum Şeridi ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`grid gap-3 mb-6 ${isMobile ? "grid-cols-2" : "grid-cols-4"}`}
        >
          {[
            {
              label: "Shopify Bağlantı",
              value: liveLoading ? "Test ediliyor..." : isConnected ? "Bağlı" : "Bağlı Değil",
              icon: <ShoppingCart className="w-5 h-5" />,
              color: isConnected ? "text-green-400" : "text-red-400",
              bg: isConnected ? "from-green-900/40 to-green-800/20 border-green-500/30" : "from-red-900/40 to-red-800/20 border-red-500/30",
            },
            {
              label: "Token Durumu",
              value: tokenStatus?.hasActiveToken ? "Aktif" : "Yok",
              icon: <Key className="w-5 h-5" />,
              color: tokenStatus?.hasActiveToken ? "text-green-400" : "text-red-400",
              bg: tokenStatus?.hasActiveToken ? "from-green-900/40 to-green-800/20 border-green-500/30" : "from-red-900/40 to-red-800/20 border-red-500/30",
            },
            {
              label: "Sonraki Yenileme",
              value: lastRefreshMs > 0 ? formatDuration(countdownMs) : "—",
              icon: <Timer className="w-5 h-5" />,
              color: "text-blue-400",
              bg: "from-blue-900/40 to-blue-800/20 border-blue-500/30",
            },
            {
              label: "API Key",
              value: env?.SHOPIFY_API_KEY ? "Tanımlı" : "Eksik",
              icon: <Shield className="w-5 h-5" />,
              color: env?.SHOPIFY_API_KEY ? "text-green-400" : "text-red-400",
              bg: env?.SHOPIFY_API_KEY ? "from-green-900/40 to-green-800/20 border-green-500/30" : "from-red-900/40 to-red-800/20 border-red-500/30",
            },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl border bg-gradient-to-br ${item.bg} p-3`}>
              <div className={`${item.color} mb-1`}>{item.icon}</div>
              <div className={`font-bold text-sm ${item.color}`}>{item.value}</div>
              <div className="text-gray-400 text-xs">{item.label}</div>
            </div>
          ))}
        </motion.div>

        <div className={`grid gap-4 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>

          {/* ── Token Otomatik Yenileme ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card
              title="Otomatik Token Yenileme"
              icon={<RotateCcw className="w-4 h-4 text-blue-400" />}
              accent="blue"
              badge={
                <Badge className={`text-xs px-2 ${
                  env?.SHOPIFY_API_KEY && env?.SHOPIFY_APP_SHARED_SECRET
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                }`}>
                  {env?.SHOPIFY_API_KEY && env?.SHOPIFY_APP_SHARED_SECRET ? "Aktif" : "Yapılandırılmamış"}
                </Badge>
              }
            >
              {/* Döngü ilerleme çubuğu */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>12 saatlik döngü</span>
                  <span>{pct.toFixed(0)}% tamamlandı</span>
                </div>
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <StatusRow
                label="Son yenileme"
                value={lastRefreshMs > 0 ? formatTimestamp(lastRefreshMs) : "Henüz yenilenmedi"}
              />
              <StatusRow
                label="Sonraki yenileme"
                value={lastRefreshMs > 0 ? formatDuration(countdownMs) + " sonra" : "—"}
              />
              <StatusRow
                label="API Key"
                value={env?.SHOPIFY_API_KEY ? "✅ Tanımlı" : "❌ Eksik"}
                ok={env?.SHOPIFY_API_KEY}
              />
              <StatusRow
                label="Gizli Anahtar"
                value={env?.SHOPIFY_APP_SHARED_SECRET ? "✅ Tanımlı" : "❌ Eksik"}
                ok={env?.SHOPIFY_APP_SHARED_SECRET}
              />

              <div className="mt-4 space-y-2">
                <Button
                  className="w-full h-9 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => rotateMutation.mutate()}
                  disabled={isRefreshing}
                >
                  {isRefreshing
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <RefreshCw className="w-4 h-4" />}
                  {isRefreshing ? "Yenileniyor..." : "Şimdi Yenile"}
                </Button>
                {!tokenStatus?.hasActiveToken && (
                  <Button
                    variant="outline"
                    className="w-full h-9 gap-2 border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                    onClick={() => setLocation("/marketplace")}
                  >
                    <ExternalLink className="w-4 h-4" />
                    OAuth ile Bağlan
                  </Button>
                )}
              </div>
            </Card>
          </motion.div>

          {/* ── Shopify Bağlantısı ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            <Card
              title="Shopify Bağlantısı"
              icon={<ShoppingCart className="w-4 h-4 text-green-400" />}
              accent={isConnected ? "green" : "red"}
              badge={
                liveLoading
                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  : isConnected
                  ? <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">Bağlı</Badge>
                  : <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Hata</Badge>
              }
            >
              {/* Büyük durum göstergesi */}
              <div className={`flex items-center gap-3 p-3 rounded-lg mb-4 ${
                isConnected
                  ? "bg-green-900/30 border border-green-500/20"
                  : "bg-red-900/30 border border-red-500/20"
              }`}>
                {isConnected
                  ? <CheckCircle className="w-8 h-8 text-green-400 shrink-0" />
                  : <XCircle className="w-8 h-8 text-red-400 shrink-0" />}
                <div>
                  <p className={`font-bold text-sm ${isConnected ? "text-green-400" : "text-red-400"}`}>
                    {liveConn?.store || credentials?.shopDomain || "—"}
                  </p>
                  <p className="text-xs text-gray-400 line-clamp-2">
                    {liveConn?.message || "Bağlantı testi bekleniyor..."}
                  </p>
                </div>
              </div>

              <StatusRow
                label="Mağaza"
                value={credentials?.shopDomain || "—"}
              />
              <StatusRow
                label="Token kaynağı"
                value={credentials?.source === "db" ? "Veritabanı" : credentials?.source === "env" ? "ENV" : "—"}
              />
              <StatusRow
                label="Token geçerliliği"
                value={credentials?.tokenInvalid ? "❌ Geçersiz" : credentials?.hasToken ? "✅ Geçerli" : "—"}
                ok={credentials?.hasToken && !credentials?.tokenInvalid}
              />
              <StatusRow
                label="Son güncelleme"
                value={credentials?.updatedAt ? new Date(credentials.updatedAt).toLocaleString("tr-TR") : "—"}
              />

              <Button
                variant="outline"
                className="w-full mt-4 h-9 gap-2 border-white/20 text-white hover:bg-white/10"
                onClick={() => { refetchLive(); setRefreshKey(k => k + 1); }}
                disabled={liveLoading}
              >
                {liveLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Activity className="w-4 h-4" />}
                Bağlantıyı Test Et
              </Button>
            </Card>
          </motion.div>

          {/* ── Sistem Kaynakları ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card
              title="Sistem Kaynakları"
              icon={<Cpu className="w-4 h-4 text-purple-400" />}
              accent="purple"
            >
              {mem && (
                <>
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Heap Bellek</span>
                      <span>{heapPct}% ({formatBytes(mem.heapUsed)} / {formatBytes(mem.heapTotal)})</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          heapPct > 80 ? "bg-red-500" : heapPct > 60 ? "bg-orange-500" : "bg-purple-500"
                        }`}
                        style={{ width: `${heapPct}%` }}
                      />
                    </div>
                  </div>
                  <StatusRow label="RSS Bellek" value={formatBytes(mem.rss)} />
                  <StatusRow label="Heap Kullanılan" value={formatBytes(mem.heapUsed)} />
                  <StatusRow label="Heap Toplam" value={formatBytes(mem.heapTotal)} />
                </>
              )}
              {(systemStatus as any)?.uptime && (
                <StatusRow
                  label="Çalışma süresi"
                  value={formatUptime((systemStatus as any).uptime)}
                />
              )}
              {(systemStatus as any)?.database && (
                <>
                  <StatusRow
                    label="Veritabanı"
                    value={(systemStatus as any).database.connected ? "✅ Bağlı" : "❌ Hata"}
                    ok={(systemStatus as any).database.connected}
                  />
                  <StatusRow
                    label="Ürün sayısı"
                    value={String((systemStatus as any).database.products || "—")}
                  />
                </>
              )}
              {!mem && !systemStatus && (
                <div className="text-center text-gray-500 text-sm py-4">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Yükleniyor...
                </div>
              )}
            </Card>
          </motion.div>

          {/* ── AI Servisleri ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card
              title="AI Servisleri"
              icon={<Bot className="w-4 h-4 text-orange-400" />}
              accent="orange"
              badge={
                aiStatus?.dualValidation
                  ? <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">Çift Doğrulama</Badge>
                  : undefined
              }
            >
              {[
                {
                  name: "OpenAI GPT-4o",
                  active: aiStatus?.openai?.active,
                  model: aiStatus?.openai?.model,
                },
                {
                  name: "Google Gemini",
                  active: aiStatus?.gemini?.active,
                  model: aiStatus?.gemini?.model,
                },
                {
                  name: "Anthropic Claude",
                  active: aiStatus?.anthropic?.active,
                  model: aiStatus?.anthropic?.model,
                },
              ].map((ai) => (
                <div key={ai.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      ai.active ? "bg-green-400 shadow-[0_0_6px] shadow-green-400" : "bg-red-400"
                    }`} />
                    <span className="text-xs text-gray-300">{ai.name}</span>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-semibold ${ai.active ? "text-green-400" : "text-red-400"}`}>
                      {ai.active === undefined ? "—" : ai.active ? "Aktif" : "Pasif"}
                    </span>
                    {ai.model && (
                      <span className="block text-xs text-gray-500 font-mono">{ai.model}</span>
                    )}
                  </div>
                </div>
              ))}

              {aiStatus?.dualValidation && (
                <div className="mt-3 p-2 rounded-lg bg-orange-900/20 border border-orange-500/20 text-xs text-orange-300 text-center">
                  🔄 Çift AI doğrulaması aktif — OpenAI + Gemini paralel çalışıyor
                </div>
              )}

              {!aiStatus && (
                <div className="text-center text-gray-500 text-sm py-4">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Yükleniyor...
                </div>
              )}
            </Card>
          </motion.div>

          {/* ── ENV Değişken Durumu ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={isMobile ? "" : "col-span-2"}
          >
            <Card
              title="Shopify Kimlik Bilgileri"
              icon={<Lock className="w-4 h-4 text-gray-400" />}
              accent="gray"
            >
              <div className={`grid gap-3 ${isMobile ? "grid-cols-1" : "grid-cols-2"}`}>
                {[
                  {
                    key: "SHOPIFY_API_KEY",
                    label: "API Anahtarı (Client ID)",
                    present: env?.SHOPIFY_API_KEY,
                    note: "OAuth akışı ve tokenRotate için gerekli",
                  },
                  {
                    key: "SHOPIFY_APP_SHARED_SECRET",
                    label: "Gizli Anahtar (Client Secret)",
                    present: env?.SHOPIFY_APP_SHARED_SECRET,
                    note: "OAuth callback doğrulaması için gerekli",
                  },
                  {
                    key: "SHOPIFY_ACCESS_TOKEN",
                    label: "Erişim Token'ı",
                    present: env?.SHOPIFY_ACCESS_TOKEN,
                    note: "ENV'de kayıtlı yedek token",
                  },
                  {
                    key: "SHOPIFY_ADMIN_ACCESS_TOKEN",
                    label: "Admin Token (yedek)",
                    present: env?.SHOPIFY_ADMIN_ACCESS_TOKEN,
                    note: "İkincil yedek token",
                  },
                ].map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      item.present
                        ? "bg-green-900/20 border-green-500/20"
                        : "bg-gray-800/40 border-gray-700/30"
                    }`}
                  >
                    {item.present
                      ? <Unlock className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                      : <Lock className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />}
                    <div>
                      <p className="text-xs font-bold font-mono text-gray-200">{item.key}</p>
                      <p className="text-xs text-gray-400">{item.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.note}</p>
                      <span className={`text-xs font-semibold ${item.present ? "text-green-400" : "text-gray-500"}`}>
                        {item.present ? "✅ Tanımlı" : "⚪ Tanımsız"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* OAuth Yetkilendirme Yönlendirmesi */}
              {!credentials?.hasToken && (
                <div className="mt-4 p-3 rounded-lg bg-blue-900/20 border border-blue-500/20">
                  <p className="text-sm font-bold text-blue-300 mb-1">🔑 İlk Bağlantı Adımları</p>
                  <ol className="text-xs text-blue-300/80 space-y-1 list-decimal list-inside">
                    <li>Ana sayfada "Shopify Bağlantısı" butonuna tıklayın</li>
                    <li>OAuth sekmesini açın (alan adı ve API Key otomatik dolu gelir)</li>
                    <li>"Shopify'da Yetkilendir" butonuna basın</li>
                    <li>Shopify sayfasında onaylayın → Token otomatik kaydedilir</li>
                    <li>Bundan sonra her 12 saatte bir otomatik yenilenir</li>
                  </ol>
                </div>
              )}
            </Card>
          </motion.div>

        </div>

        {/* ── Alt Bilgi ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-4 text-center text-gray-600 text-xs"
        >
          Sayfa her 15 saniyede bir otomatik güncellenir · Token yenileme döngüsü: 12 saat
        </motion.div>
      </div>
    </div>
  );
}
