import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Play,
  Pause,
  ExternalLink,
  AlertTriangle,
  Package,
  GitCompare,
  Settings,
  Eye,
  EyeOff,
  Clock,
} from "lucide-react";

type TrackedProduct = {
  id: number;
  sourceUrl: string;
  sourceTitle: string;
  shopifyProductId: string | null;
  currentSourcePrice: string | null;
  currentSourceStock: number | null;
  currentStatus: string;
  trackingEnabled: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
};

type DetectedChange = {
  id: number;
  trackedProductId: number;
  changeType: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  confidence: string;
  status: string;
  reason: string | null;
  createdAt: string;
};

type SchedulerStatus = {
  trackingEnabled: boolean;
  schedulerEnabled: boolean;
  safeSchedulerRunning: boolean;
  pendingChangesCount: number;
  manualReviewCount: number;
  trackedProductsCount: number;
  activeTrackedProductsCount: number;
  errorProductsCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: string;
  intervalMinutes: number;
  batchSize: number;
  legacySystemsRemoved: boolean;
};

type TrackingSettings = {
  trackingEnabled: boolean;
  schedulerEnabled: boolean;
  autoShopifySyncEnabled: boolean;
  checkIntervalMinutes: number;
  batchSize: number;
  requestDelayMs: number;
  maxErrorsBeforePause: number;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  manual_review: "Manuel İnceleme",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  applied: "Uygulandı",
  ignored: "Yok Sayıldı",
};

const CHANGE_LABELS: Record<string, string> = {
  price_changed: "Fiyat Değişimi",
  stock_changed: "Stok Değişimi",
  variant_added: "Varyant Eklendi",
  variant_removed: "Varyant Kaldırıldı",
  variant_price_changed: "Varyant Fiyat",
  variant_stock_changed: "Varyant Stok",
  title_changed: "Başlık Değişimi",
  image_changed: "Görsel Değişimi",
  price: "Fiyat Değişimi",
  stock: "Stok Değişimi",
  title: "Başlık Değişimi",
  image: "Görsel Değişimi",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR");
}

export default function UrunTakipPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [settingsForm, setSettingsForm] = useState<Partial<TrackingSettings>>({});

  const statusQuery = useQuery({
    queryKey: ["tracking-scheduler-status"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/scheduler-status");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Durum alınamadı");
      return data as SchedulerStatus;
    },
    refetchInterval: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["tracking-settings"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ayarlar alınamadı");
      return data.settings as TrackingSettings;
    },
  });

  const productsQuery = useQuery({
    queryKey: ["tracking-products"],
    queryFn: async () => {
      const res = await fetch("/api/tracking/products");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Liste alınamadı");
      return (data.products || []) as TrackedProduct[];
    },
  });

  const changesQuery = useQuery({
    queryKey: ["tracking-changes", statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/tracking/changes${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Değişiklikler alınamadı");
      return (data.changes || []) as DetectedChange[];
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (patch: Partial<TrackingSettings>) => {
      const res = await fetch("/api/tracking/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kaydedilemedi");
      return data.settings;
    },
    onSuccess: () => {
      toast({ title: "Takip ayarları kaydedildi" });
      queryClient.invalidateQueries({ queryKey: ["tracking-settings"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const checkMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tracking/products/${id}/check`, { method: "POST" });
      const data = await res.json();
      if (!res.ok && !data.skipped) {
        throw new Error(data.error || data.message || "Kontrol başarısız");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
      if (data.success) {
        toast({
          title: "Kontrol tamamlandı",
          description:
            data.changesCreated > 0
              ? `${data.changesCreated} değişiklik tespit edildi`
              : "Değişiklik tespit edilmedi",
        });
      } else {
        toast({
          title: "Kaynak veri alınamadı",
          description: data.userMessage || data.error || data.message,
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Kontrol hatası", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enable }: { id: number; enable: boolean }) => {
      const path = enable ? "enable" : "disable";
      const res = await fetch(`/api/tracking/products/${id}/${path}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "İşlem başarısız");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tracking-products"] }),
  });

  const changeActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "mark-seen" | "ignore" }) => {
      const res = await fetch(`/api/tracking/changes/${id}/${action}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "İşlem başarısız");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-notifications"] });
    },
  });

  const st = statusQuery.data;
  const settings = { ...settingsQuery.data, ...settingsForm } as TrackingSettings | undefined;
  const trackingOff = settings && !settings.trackingEnabled;

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8 text-blue-500" />
            Ürün Takip Sistemi v2
          </h1>
          <p className="text-muted-foreground mt-1">
            Kaynak site değişiklik tespiti — Shopify otomatik güncelleme kapalı
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant={st?.safeSchedulerRunning ? "default" : "secondary"}>
            Scheduler: {st?.safeSchedulerRunning ? "çalışıyor" : "durdu"}
          </Badge>
          {st?.legacySystemsRemoved && (
            <Badge variant="outline" className="text-green-600 border-green-600/40">
              Legacy kaldırıldı
            </Badge>
          )}
        </div>
      </div>

      {trackingOff && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Takip sistemi kapalı</p>
              <p className="text-sm text-muted-foreground">
                Ayarlar sekmesinden &quot;Takip sistemi&quot;ni açabilirsiniz.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Takip edilen", value: st?.trackedProductsCount ?? "—" },
          { label: "Aktif", value: st?.activeTrackedProductsCount ?? "—" },
          { label: "Bekleyen", value: st?.pendingChangesCount ?? "—" },
          { label: "Manuel", value: st?.manualReviewCount ?? "—" },
          { label: "Hatalı", value: st?.errorProductsCount ?? "—" },
          { label: "Son kontrol", value: formatDate(st?.lastRunAt ?? null) },
          {
            label: "Aralık",
            value: st?.intervalMinutes ? `${st.intervalMinutes} dk` : "—",
          },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-lg font-semibold truncate">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Takip Edilen Ürünler</TabsTrigger>
          <TabsTrigger value="changes">
            Değişiklikler
            {(st?.pendingChangesCount ?? 0) > 0 && (
              <Badge className="ml-2 h-5 px-1.5" variant="destructive">
                {st?.pendingChangesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="w-4 h-4 mr-1" />
            Ayarlar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => productsQuery.refetch()} disabled={productsQuery.isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${productsQuery.isFetching ? "animate-spin" : ""}`} />
              Yenile
            </Button>
          </div>

          {productsQuery.isLoading && <p className="text-muted-foreground text-center py-8">Yükleniyor...</p>}

          {!productsQuery.isLoading && (productsQuery.data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Henüz takip edilen ürün yok. Shopify&apos;a başarılı aktarım sonrası otomatik eklenir.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4">
            {productsQuery.data?.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="text-lg">{p.sourceTitle}</CardTitle>
                    <Badge variant={p.currentStatus === "active" ? "default" : "secondary"}>{p.currentStatus}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Son fiyat:</span>{" "}
                      {p.currentSourcePrice ? `${p.currentSourcePrice} TRY` : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Son stok:</span> {p.currentSourceStock ?? "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Son kontrol:</span> {formatDate(p.lastCheckedAt)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Shopify ID:</span> {p.shopifyProductId || "—"}
                    </div>
                  </div>
                  {p.lastErrorMessage && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {p.lastErrorMessage}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => checkMutation.mutate(p.id)} disabled={checkMutation.isPending || !p.trackingEnabled}>
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Kontrol Et
                    </Button>
                    {p.trackingEnabled ? (
                      <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: p.id, enable: false })}>
                        <Pause className="w-4 h-4 mr-1" />
                        Devre Dışı
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: p.id, enable: true })}>
                        <Play className="w-4 h-4 mr-1" />
                        Etkinleştir
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" asChild>
                      <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        Kaynak
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <select
              className="border rounded-md px-3 py-2 text-sm bg-background"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tüm durumlar</option>
              <option value="pending">Bekliyor</option>
              <option value="manual_review">Manuel İnceleme</option>
              <option value="ignored">Yok Sayıldı</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => changesQuery.refetch()}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Yenile
            </Button>
          </div>

          {(changesQuery.data?.length ?? 0) === 0 && !changesQuery.isLoading && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                Henüz kayıtlı değişiklik yok
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            {changesQuery.data?.map((c) => (
              <Card key={c.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{CHANGE_LABELS[c.changeType] || c.changeType}</Badge>
                    <Badge variant="outline">{STATUS_LABELS[c.status] || c.status}</Badge>
                    <span className="text-xs text-muted-foreground">Güven: {c.confidence}%</span>
                  </div>
                  <div className="text-sm grid md:grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Eski:</span>{" "}
                      <code className="text-xs">{JSON.stringify(c.oldValue)}</code>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Yeni:</span>{" "}
                      <code className="text-xs">{JSON.stringify(c.newValue)}</code>
                    </div>
                  </div>
                  {c.reason && (
                    <p className="text-sm text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {c.reason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => changeActionMutation.mutate({ id: c.id, action: "mark-seen" })}>
                      <Eye className="w-4 h-4 mr-1" />
                      Görüldü
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => changeActionMutation.mutate({ id: c.id, action: "ignore" })}>
                      <EyeOff className="w-4 h-4 mr-1" />
                      Yok Say
                    </Button>
                    <Button size="sm" variant="secondary" disabled title="Yakında">
                      Shopify Güncelle (Yakında)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Takip Ayarları
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              {settingsQuery.isLoading ? (
                <p className="text-muted-foreground">Yükleniyor...</p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <Label>Takip sistemi açık</Label>
                    <Switch
                      checked={settings?.trackingEnabled ?? true}
                      onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, trackingEnabled: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>Otomatik kontrol (scheduler)</Label>
                    <Switch
                      checked={settings?.schedulerEnabled ?? true}
                      onCheckedChange={(v) => setSettingsForm((f) => ({ ...f, schedulerEnabled: v }))}
                    />
                  </div>
                  <div className="flex items-center justify-between opacity-60">
                    <div>
                      <Label>Otomatik Shopify güncelleme</Label>
                      <p className="text-xs text-muted-foreground">Bu özellik henüz kapalı</p>
                    </div>
                    <Switch checked={false} disabled />
                  </div>
                  <div>
                    <Label>Kontrol aralığı (dakika)</Label>
                    <Input
                      type="number"
                      value={settings?.checkIntervalMinutes ?? 60}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, checkIntervalMinutes: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Batch size</Label>
                    <Input
                      type="number"
                      value={settings?.batchSize ?? 5}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, batchSize: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>İstek bekleme (ms)</Label>
                    <Input
                      type="number"
                      value={settings?.requestDelayMs ?? 1500}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, requestDelayMs: Number(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label>Max hata sonrası duraklat</Label>
                    <Input
                      type="number"
                      value={settings?.maxErrorsBeforePause ?? 5}
                      onChange={(e) => setSettingsForm((f) => ({ ...f, maxErrorsBeforePause: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Sonraki scheduler: {formatDate(st?.nextRunAt ?? null)}
                  </div>
                  <Button
                    onClick={() => saveSettingsMutation.mutate(settingsForm)}
                    disabled={saveSettingsMutation.isPending || Object.keys(settingsForm).length === 0}
                  >
                    Kaydet
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
