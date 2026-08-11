import { useMemo } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Send, Smartphone, Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type NotificationSetting = {
  id: number;
  notificationType: string;
  enabled: boolean;
  description?: string | null;
};

type HistoryRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  type: string;
  at: string | null;
};

type DeviceRow = {
  id: number;
  deviceLabel: string;
  platform: string;
  enabled: boolean;
  appVersion?: string | null;
  lastSeenAt?: string | null;
};

const LABELS: Record<string, { title: string; hint: string }> = {
  new_product: {
    title: "Yeni ürün",
    hint: "Hafızaya veya takip listesine ürün eklendiğinde",
  },
  variant_change: {
    title: "Varyant değişikliği",
    hint: "Renk, beden veya seçenek değiştiğinde",
  },
  variant_removed: {
    title: "Varyant kaldırıldı",
    hint: "Bir seçenek kaynaktan silindiğinde",
  },
  price_change: {
    title: "Fiyat değişikliği",
    hint: "Alış veya satış fiyatı değiştiğinde",
  },
  stock_update: {
    title: "Stok güncellemesi",
    hint: "Stok bitti, geldi veya adet değiştiğinde",
  },
  shopify_upload: {
    title: "Shopify yükleme",
    hint: "Ürün mağazaya aktarıldığında",
  },
  test: { title: "Test", hint: "" },
};

const STATUS_LABEL: Record<string, string> = {
  sent: "Gönderildi",
  failed: "Başarısız",
  blocked: "Kapalı",
  pending: "Bekliyor",
};

function stripNotifyText(raw?: string | null) {
  return String(raw || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BildirimlerPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const settingsQ = useQuery({
    queryKey: ["/api/telegram/settings"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/settings");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Ayarlar alınamadı");
      return (data.settings || []) as NotificationSetting[];
    },
  });

  const statusQ = useQuery({
    queryKey: ["/api/telegram/status"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/status");
      return res.json();
    },
  });

  const settings = settingsQ.data || [];
  const allOn = settings.length > 0 && settings.every((s) => s.enabled);
  const connected = Boolean(statusQ.data?.status?.connected || statusQ.data?.status?.botConfigured);

  const toggleOne = useMutation({
    mutationFn: async ({ type, enabled }: { type: string; enabled: boolean }) => {
      await apiRequest("PUT", `/api/telegram/settings/${type}`, { enabled });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["/api/telegram/settings"] });
    },
    onError: (err: Error) => {
      toast({ title: "Ayar kaydedilemedi", description: err.message, variant: "destructive" });
    },
  });

  const toggleAll = useMutation({
    mutationFn: async (enabled: boolean) => {
      await apiRequest("POST", "/api/telegram/settings/toggle-all", { enabled });
    },
    onSuccess: (_d, enabled) => {
      void qc.invalidateQueries({ queryKey: ["/api/telegram/settings"] });
      toast({
        title: enabled ? "Bildirimler açıldı" : "Bildirimler kapatıldı",
        description: "Tüm bildirim türleri güncellendi",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Toplu ayar", description: err.message, variant: "destructive" });
    },
  });

  const historyQ = useQuery({
    queryKey: ["/api/telegram/history"],
    queryFn: async () => {
      const res = await fetch("/api/telegram/history?limit=40");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Geçmiş alınamadı");
      return (data.history || []) as Array<{
        id: number;
        notificationType: string;
        message: string;
        productTitle?: string | null;
        status: string;
        sentAt?: string | null;
        createdAt?: string | null;
        errorMessage?: string | null;
      }>;
    },
  });

  const trackingQ = useQuery({
    queryKey: ["/api/tracking/notifications"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/notifications");
      const data = await res.json();
      return (data.lastChanges || []) as Array<{
        id: number;
        changeType: string;
        productTitle?: string | null;
        createdAt?: string | null;
        status?: string | null;
      }>;
    },
  });

  const devicesQ = useQuery({
    queryKey: ["/api/notifications/devices"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/devices");
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Cihazlar alınamadı");
      }
      return (data.devices || []) as DeviceRow[];
    },
  });

  const testMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || "Test gönderilemedi");
      }
      return data;
    },
    onSuccess: (data: { message?: string; mobile?: { sent?: number } }) => {
      void qc.invalidateQueries({ queryKey: ["/api/telegram/history"] });
      void qc.invalidateQueries({ queryKey: ["/api/notifications/devices"] });
      toast({
        title: "Mobil test gönderildi",
        description: data.message || "ORVIAN uygulamasındaki bildirimi kontrol edin.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Test başarısız", description: err.message, variant: "destructive" });
    },
  });

  const rows = useMemo(
    () =>
      settings.filter((s) => s.notificationType !== "test"),
    [settings],
  );

  const history = useMemo((): HistoryRow[] => {
    const telegram: HistoryRow[] = (historyQ.data || []).map((h) => ({
      id: `tg-${h.id}`,
      title: h.productTitle || LABELS[h.notificationType]?.title || h.notificationType,
      detail: stripNotifyText(h.errorMessage || h.message),
      status: h.status,
      type: h.notificationType,
      at: h.sentAt || h.createdAt || null,
    }));
    const tracking: HistoryRow[] = (trackingQ.data || []).map((c) => ({
      id: `tr-${c.id}`,
      title: c.productTitle || `Takip #${c.id}`,
      detail: c.changeType,
      status: c.status || "pending",
      type: c.changeType,
      at: c.createdAt || null,
    }));
    return [...telegram, ...tracking]
      .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
      .slice(0, 40);
  }, [historyQ.data, trackingQ.data]);

  const devices = devicesQ.data || [];

  return (
    <div className="home-orvian relative min-h-screen overflow-x-hidden bg-black">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,255,255,0.03), transparent 55%), linear-gradient(180deg, #050505 0%, #000 40%, #000 100%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <button
          type="button"
          onClick={() => setLocation("/")}
          className="mb-6 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.25} />
          Ana sayfa
        </button>

        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8"
        >
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
            <Bell className="h-5 w-5 text-zinc-300" strokeWidth={1.25} />
          </div>
          <h1 className="home-title text-2xl tracking-[0.18em]">Bildirimler</h1>
          <p className="home-muted mt-2 text-[13px] leading-relaxed">
            Hangi olaylarda bildirim gideceğini açıp kapatın. Test, kayıtlı ORVIAN cihazlarına mobil bildirim gönderir.
          </p>
          <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
            {connected ? "Telegram yedek kanal hazır" : "Telegram yedek kanalı isteğe bağlı"}
          </p>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-zinc-800/80 bg-[#070707] p-4 sm:p-5"
        >
          <div className="flex items-center justify-between gap-4 border-b border-zinc-900 pb-4">
            <div>
              <div className="home-title text-[13px] uppercase tracking-[0.22em]">Tüm bildirimler</div>
              <p className="home-muted mt-1 text-[12px]">Tek tuşla hepsini aç veya kapat</p>
            </div>
            <Switch
              checked={allOn}
              disabled={toggleAll.isPending || settingsQ.isLoading}
              onCheckedChange={(v) => toggleAll.mutate(v)}
              className="data-[state=checked]:bg-zinc-200 data-[state=unchecked]:bg-zinc-800"
            />
          </div>

          <div className="divide-y divide-zinc-900">
            {settingsQ.isLoading ? (
              <p className="py-8 text-center text-sm text-zinc-500">Ayarlar yükleniyor…</p>
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">Bildirim ayarı bulunamadı.</p>
            ) : (
              rows.map((row) => {
                const meta = LABELS[row.notificationType] || {
                  title: row.notificationType,
                  hint: row.description || "",
                };
                return (
                  <div key={row.notificationType} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="text-[14px] text-zinc-100">{meta.title}</div>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{meta.hint}</p>
                    </div>
                    <Switch
                      checked={Boolean(row.enabled)}
                      disabled={toggleOne.isPending}
                      onCheckedChange={(v) =>
                        toggleOne.mutate({ type: row.notificationType, enabled: v })
                      }
                      className="data-[state=checked]:bg-zinc-200 data-[state=unchecked]:bg-zinc-800"
                    />
                  </div>
                );
              })
            )}
          </div>
        </motion.section>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4"
        >
          <button
            type="button"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3.5 text-[13px] uppercase tracking-[0.18em] text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-black disabled:opacity-50"
          >
            <Send className="h-4 w-4" strokeWidth={1.25} />
            {testMut.isPending ? "Gönderiliyor…" : "Test bildirimi gönder"}
          </button>
        </motion.div>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 rounded-2xl border border-zinc-800/80 bg-[#070707] p-4 sm:p-5"
        >
          <header className="mb-4 flex items-center gap-2 border-b border-zinc-900 pb-4">
            <Clock className="h-4 w-4 text-zinc-400" strokeWidth={1.25} />
            <div>
              <div className="home-title text-[13px] uppercase tracking-[0.22em]">Bildirim geçmişi</div>
              <p className="home-muted mt-1 text-[12px]">Son gönderilen ve bekleyen kayıtlar</p>
            </div>
          </header>
          {historyQ.isLoading ? (
            <p className="py-6 text-center text-sm text-zinc-500">Geçmiş yükleniyor…</p>
          ) : history.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Henüz bildirim kaydı yok.</p>
          ) : (
            <div className="max-h-[28rem] space-y-0 divide-y divide-zinc-900 overflow-y-auto">
              {history.map((item) => (
                <div key={item.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-zinc-100">{item.title}</div>
                      <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-500">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-600">{formatWhen(item.at)}</p>
                </div>
              ))}
            </div>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 rounded-2xl border border-zinc-800/80 bg-[#070707] p-4 sm:p-5"
        >
          <header className="mb-4 flex items-center gap-2 border-b border-zinc-900 pb-4">
            <Smartphone className="h-4 w-4 text-zinc-400" strokeWidth={1.25} />
            <div>
              <div className="home-title text-[13px] uppercase tracking-[0.22em]">Kayıtlı cihazlar</div>
              <p className="home-muted mt-1 text-[12px]">ORVIAN uygulamasından kayıtlı bildirim cihazları</p>
            </div>
          </header>
          {devicesQ.isLoading ? (
            <p className="py-6 text-center text-sm text-zinc-500">Cihazlar yükleniyor…</p>
          ) : devices.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Kayıtlı cihaz yok.</p>
          ) : (
            <div className="divide-y divide-zinc-900">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-zinc-100">
                      {d.platform || "android"} · {d.deviceLabel}
                    </div>
                    <p className="mt-0.5 text-[12px] text-zinc-500">
                      {d.appVersion ? `v${d.appVersion} · ` : ""}
                      son görülme {formatWhen(d.lastSeenAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    {d.enabled ? "Aktif" : "Kapalı"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.section>
      </div>
    </div>
  );
}
