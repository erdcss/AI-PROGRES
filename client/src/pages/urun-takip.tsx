import { useMemo, useState } from "react";
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
  Clock,
} from "lucide-react";
import { TrackingChangeGroupCard } from "@/features/tracking/TrackingChangeGroupCard";
import { TrackingProductImage } from "@/features/tracking/TrackingProductImage";

type TrackedProduct = {
  id: number;
  sourceUrl: string;
  sourceTitle: string;
  shopifyProductId: string | null;
  trackingUid: string | null;
  currentSourcePrice: string | null;
  currentSourceStock: number | null;
  currentStatus: string;
  trackingEnabled: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  productImageUrl?: string | null;
};

type DetectedChange = {
  id: number;
  trackedProductId: number;
  trackedVariantId?: number | null;
  changeType: string;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  confidence: string;
  status: string;
  reason: string | null;
  createdAt: string;
  productTitle?: string | null;
  productUrl?: string | null;
  productImageUrl?: string | null;
  shopifyProductId?: string | null;
  trackingUid?: string | null;
  variantUid?: string | null;
  variantLabel?: string | null;
  variantSku?: string | null;
  shopifyVariantId?: string | null;
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
  shopifyReconcileRunning?: boolean;
  lastShopifyReconcile?: {
    status: string;
    message: string;
    meta?: {
      checked?: number;
      live?: number;
      archived?: number;
      restored?: number;
      superseded?: number;
    };
    created_at: string;
  } | null;
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

const CHANGE_FILTERS = [
  { value: "actionable", label: "Düzeltilecekler" },
  { value: "pending", label: "Bekleyen" },
  { value: "manual_review", label: "Manuel" },
  { value: "approved", label: "Onaylı" },
  { value: "failed", label: "Başarısız" },
  { value: "applied", label: "Uygulanmış" },
  { value: "", label: "Tüm geçmiş" },
] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR");
}

function getChangeProductKey(change: DetectedChange): string {
  return `tracked:${change.trackedProductId}`;
}

async function runBulkTrackingAction(
  action: "approve" | "shopify-sync",
  ids: number[],
): Promise<{ summary: { total: number; succeeded: number; failed: number } }> {
  const summary = { total: ids.length, succeeded: 0, failed: 0 };
  const chunkSize = 100;

  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const res = await fetch(`/api/tracking/bulk/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: chunk }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Toplu işlem başarısız");
    summary.succeeded += Number(data.summary?.succeeded || 0);
    summary.failed += Number(data.summary?.failed || 0);
  }

  return { summary };
}

export default function UrunTakipPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("actionable");
  const [settingsForm, setSettingsForm] = useState<Partial<TrackingSettings>>({});

  const refreshTrackingQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    queryClient.invalidateQueries({ queryKey: ["tracking-notifications"] });
  };

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
      const res = await fetch("/api/tracking/products", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Liste alınamadı");
      return (data.products || []) as TrackedProduct[];
    },
    refetchInterval: 15_000,
    retry: 2,
  });

  const changesQuery = useQuery({
    queryKey: ["tracking-changes", statusFilter],
    queryFn: async () => {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const res = await fetch(`/api/tracking/changes${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Değişiklikler alınamadı");
      return (data.changes || []) as DetectedChange[];
    },
    refetchInterval: 15_000,
    retry: 2,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Takip durumu değiştirilemedi", description: err.message, variant: "destructive" });
    },
  });

  const shopifyReconcileMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tracking/shopify-reconcile", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Shopify senkronu başarısız");
      return data as {
        checked: number;
        archived: number;
        restored: number;
      };
    },
    onSuccess: (data) => {
      refreshTrackingQueries();
      toast({
        title: "Shopify senkronu tamamlandı",
        description: `${data.checked} ürün kontrol edildi, ${data.archived} arşivlendi, ${data.restored} geri getirildi`,
      });
    },
    onError: (err: Error) => {
      refreshTrackingQueries();
      toast({ title: "Shopify senkron hatası", description: err.message, variant: "destructive" });
    },
  });

  const changeActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "mark-seen" | "ignore" | "approve" | "reject" }) => {
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

  const shopifySyncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tracking/changes/${id}/shopify-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || "Shopify güncellemesi başarısız");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Shopify güncellendi",
        description: data.shopify?.message || "Değişiklik uygulandı",
      });
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Shopify hatası", description: err.message, variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: number[]) => runBulkTrackingAction("approve", ids),
    onSuccess: (data) => {
      const s = data.summary;
      toast({
        title: "Toplu onay tamam",
        description: `${s.succeeded}/${s.total} değişiklik onaylandı`,
        variant: s.failed > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Toplu onay hatası", description: err.message, variant: "destructive" });
    },
  });

  const bulkShopifySyncMutation = useMutation({
    mutationFn: (ids: number[]) => runBulkTrackingAction("shopify-sync", ids),
    onSuccess: (data) => {
      const summary = data.summary;
      toast({
        title: "Shopify güncellemesi tamamlandı",
        description: `${summary.succeeded}/${summary.total} değişiklik uygulandı`,
        variant: summary.failed > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["tracking-changes"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-products"] });
      queryClient.invalidateQueries({ queryKey: ["tracking-scheduler-status"] });
    },
    onError: (err: Error) => {
      toast({ title: "Shopify güncelleme hatası", description: err.message, variant: "destructive" });
    },
  });

  const approvableIds =
    changesQuery.data?.filter((c) => c.status === "pending" || c.status === "manual_review").map((c) => c.id) ??
    [];
  const groupedChanges = useMemo(() => {
    const groups = new Map<string, DetectedChange[]>();
    for (const change of changesQuery.data ?? []) {
      const key = getChangeProductKey(change);
      const group = groups.get(key);
      if (group) group.push(change);
      else groups.set(key, [change]);
    }
    return [...groups.values()].sort((a, b) => {
      const latestA = Math.max(...a.map((change) => new Date(change.createdAt).getTime()));
      const latestB = Math.max(...b.map((change) => new Date(change.createdAt).getTime()));
      return latestB - latestA;
    });
  }, [changesQuery.data]);

  const st = statusQuery.data;
  const settings = { ...settingsQuery.data, ...settingsForm } as TrackingSettings | undefined;
  const trackingOff = settings && !settings.trackingEnabled;

  return (
    <div className={embedded ? "space-y-6" : "container mx-auto p-4 md:p-6 space-y-6 max-w-7xl"}>
      {!embedded && (
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8 text-blue-500" />
            Ürün Takip Sistemi v2
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Kaynak sitedeki fiyat ve stok değişikliklerini izler
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
      )}

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

      <Card className="border-border/60 bg-card/40">
        <CardContent className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">Shopify takip senkronu</p>
            <p className="text-xs text-muted-foreground truncate">
              {st?.shopifyReconcileRunning
                ? "Shopify ürünleri doğrulanıyor..."
                : st?.lastShopifyReconcile
                  ? `${st.lastShopifyReconcile.message} · ${formatDate(st.lastShopifyReconcile.created_at)}`
                  : "Henüz senkron çalışmadı"}
            </p>
          </div>
          <Badge
            variant={
              st?.shopifyReconcileRunning
                ? "secondary"
                : st?.lastShopifyReconcile?.status === "error"
                  ? "destructive"
                  : "outline"
            }
          >
            {st?.shopifyReconcileRunning
              ? "Çalışıyor"
              : st?.lastShopifyReconcile?.status === "success"
                ? "Senkron"
                : st?.lastShopifyReconcile?.status === "error"
                  ? "Hata"
                  : "Bekliyor"}
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Takip edilen",
            value: st?.trackedProductsCount ?? "—",
            hint: st?.activeTrackedProductsCount != null ? `${st.activeTrackedProductsCount} aktif` : undefined,
          },
          { label: "Bekleyen değişiklik", value: st?.pendingChangesCount ?? "—" },
          { label: "Manuel inceleme", value: st?.manualReviewCount ?? "—" },
          {
            label: "Son kontrol",
            value: st?.lastRunAt ? formatDate(st.lastRunAt).split(",")[0] : "—",
            hint: st?.intervalMinutes ? `Her ${st.intervalMinutes} dk` : undefined,
          },
        ].map((card) => (
          <Card key={card.label} className="border-border/60 bg-card/40">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{card.value}</p>
              {card.hint && <p className="text-[11px] text-muted-foreground mt-0.5">{card.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Takip Edilen Ürünler</TabsTrigger>
          <TabsTrigger value="changes">
            Değişiklikler
            {((st?.pendingChangesCount ?? 0) + (st?.manualReviewCount ?? 0)) > 0 && (
              <Badge className="ml-2 h-5 px-1.5" variant="destructive">
                {(st?.pendingChangesCount ?? 0) + (st?.manualReviewCount ?? 0)}
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => shopifyReconcileMutation.mutate()}
              disabled={
                productsQuery.isFetching ||
                shopifyReconcileMutation.isPending ||
                st?.shopifyReconcileRunning
              }
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${
                  productsQuery.isFetching ||
                  shopifyReconcileMutation.isPending ||
                  st?.shopifyReconcileRunning
                    ? "animate-spin"
                    : ""
                }`}
              />
              Shopify ile Yenile
            </Button>
          </div>

          {productsQuery.isLoading && <p className="text-muted-foreground text-center py-8">Yükleniyor...</p>}
          {productsQuery.error && (
            <Card className="border-destructive/50">
              <CardContent className="py-4 text-destructive text-sm text-center">
                {(productsQuery.error as Error).message}
              </CardContent>
            </Card>
          )}

          {!productsQuery.isLoading && !productsQuery.error && (productsQuery.data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Henüz takip edilen ürün yok. Shopify&apos;a başarılı aktarım sonrası otomatik eklenir.
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            {productsQuery.data?.map((p) => (
              <article
                key={p.id}
                className="rounded-xl border border-border/60 bg-card/50 p-4 flex gap-4"
              >
                <TrackingProductImage
                  imageUrl={p.productImageUrl}
                  title={p.sourceTitle}
                  size="lg"
                />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-medium leading-snug line-clamp-2 text-[15px] pr-2">
                      {p.sourceTitle}
                    </h3>
                    <Badge
                      variant={p.currentStatus === "active" ? "default" : "secondary"}
                      className="shrink-0 text-xs"
                    >
                      {p.currentStatus === "active" ? "Aktif" : p.currentStatus}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">Fiyat: </span>
                      {p.currentSourcePrice ? `${p.currentSourcePrice} ₺` : "—"}
                    </span>
                    <span>
                      <span className="text-muted-foreground">Stok: </span>
                      {p.currentSourceStock ?? "—"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Son kontrol: {formatDate(p.lastCheckedAt)}
                    </span>
                  </div>

                  {p.lastErrorMessage && (
                    <p className="text-sm text-destructive flex items-center gap-1.5 rounded-lg bg-destructive/5 px-3 py-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {p.lastErrorMessage}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => checkMutation.mutate(p.id)}
                      disabled={checkMutation.isPending || !p.trackingEnabled}
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Kontrol Et
                    </Button>
                    {p.trackingEnabled ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: p.id, enable: false })}
                        disabled={toggleMutation.isPending}
                      >
                        <Pause className="w-4 h-4 mr-1" />
                        Duraklat
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: p.id, enable: true })}
                        disabled={toggleMutation.isPending}
                      >
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
                </div>
              </article>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="changes" className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {CHANGE_FILTERS.map((f) => (
                <Button
                  key={f.value || "all"}
                  size="sm"
                  variant={statusFilter === f.value ? "default" : "outline"}
                  className="h-8"
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => changesQuery.refetch()}>
                <RefreshCw className={`w-4 h-4 mr-1 ${changesQuery.isFetching ? "animate-spin" : ""}`} />
                Yenile
              </Button>
              {approvableIds.length > 0 && (
                <Button
                  size="sm"
                  disabled={bulkApproveMutation.isPending}
                  onClick={() => bulkApproveMutation.mutate(approvableIds)}
                >
                  Toplu Onayla ({approvableIds.length})
                </Button>
              )}
            </div>
          </div>

          {changesQuery.isLoading && (
            <p className="text-muted-foreground text-sm">Değişiklikler yükleniyor…</p>
          )}
          {changesQuery.error && (
            <Card className="border-destructive/50">
              <CardContent className="py-4 text-destructive text-sm">
                {(changesQuery.error as Error).message}
                <Button variant="outline" size="sm" className="ml-3" onClick={() => changesQuery.refetch()}>
                  Tekrar dene
                </Button>
              </CardContent>
            </Card>
          )}

          {!changesQuery.isLoading && !changesQuery.error && (changesQuery.data?.length ?? 0) === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <GitCompare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                Henüz kayıtlı değişiklik yok
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            {groupedChanges.map((changes) => (
              <TrackingChangeGroupCard
                key={getChangeProductKey(changes[0])}
                changes={changes}
                busy={
                  changeActionMutation.isPending ||
                  shopifySyncMutation.isPending ||
                  bulkApproveMutation.isPending ||
                  bulkShopifySyncMutation.isPending
                }
                onMarkSeen={(id) => changeActionMutation.mutate({ id, action: "mark-seen" })}
                onIgnore={(id) => changeActionMutation.mutate({ id, action: "ignore" })}
                onApprove={(id) => changeActionMutation.mutate({ id, action: "approve" })}
                onShopifySync={(id) => shopifySyncMutation.mutate(id)}
                onApproveMany={(ids) => bulkApproveMutation.mutate(ids)}
                onShopifySyncMany={(ids) => bulkShopifySyncMutation.mutate(ids)}
              />
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
