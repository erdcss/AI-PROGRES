import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw,
  Play,
  Pause,
  ExternalLink,
  AlertTriangle,
  Package,
  GitCompare,
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

const STATUS_LABELS: Record<string, string> = {
  pending: "Bekliyor",
  manual_review: "Manuel İnceleme",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  applied: "Uygulandı",
  ignored: "Yok Sayıldı",
};

const CHANGE_LABELS: Record<string, string> = {
  price: "Fiyat Değişimi",
  stock: "Stok Değişimi",
  variant_added: "Varyant Eklendi",
  variant_removed: "Varyant Kaldırıldı",
  variant_changed: "Varyant Değişti",
  title: "Başlık Değişimi",
  image: "Görsel Değişimi",
  error: "Hata",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("tr-TR");
}

export default function UrunTakipPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");

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
      if (data.success) {
        toast({
          title: "Kontrol tamamlandı",
          description:
            data.changesCreated > 0
              ? `${data.changesCreated} değişiklik tespit edildi (Shopify güncellemesi yapılmadı)`
              : "Değişiklik tespit edilmedi",
        });
      } else {
        toast({
          title: "Kaynak veri alınamadı",
          description: data.error || data.message || "Değişiklik oluşturulmadı",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Kontrol hatası",
        description: err.message.includes("Fiyat")
          ? "Fiyat doğrulanamadı"
          : err.message,
        variant: "destructive",
      });
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
    },
  });

  const moduleDisabled =
    productsQuery.error instanceof Error &&
    productsQuery.error.message.includes("TRACKING_ENABLED");

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Package className="w-8 h-8 text-blue-500" />
            Ürün Takip Sistemi
          </h1>
          <p className="text-muted-foreground mt-1">
            Kaynak site ile Shopify arasında değişiklik tespiti — otomatik Shopify güncelleme kapalı
          </p>
        </div>
        <Badge variant="outline" className="self-start">
          Manuel onay modu
        </Badge>
      </div>

      {moduleDisabled && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Takip modülü kapalı</p>
              <p className="text-sm text-muted-foreground">
                Cloud ortamında TRACKING_ENABLED=true yaparak etkinleştirin.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Takip Edilen Ürünler</TabsTrigger>
          <TabsTrigger value="changes">Değişiklikler</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => productsQuery.refetch()}
              disabled={productsQuery.isFetching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${productsQuery.isFetching ? "animate-spin" : ""}`} />
              Yenile
            </Button>
          </div>

          {productsQuery.isLoading && (
            <p className="text-muted-foreground text-center py-8">Yükleniyor...</p>
          )}

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
                    <Badge variant={p.currentStatus === "active" ? "default" : "secondary"}>
                      {p.currentStatus}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Son fiyat:</span>{" "}
                      {p.currentSourcePrice ? `${p.currentSourcePrice} TRY` : "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Son stok:</span>{" "}
                      {p.currentSourceStock ?? "—"}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Son kontrol:</span>{" "}
                      {formatDate(p.lastCheckedAt)}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Shopify ID:</span>{" "}
                      {p.shopifyProductId || "—"}
                    </div>
                  </div>

                  {p.lastErrorMessage && (
                    <p className="text-sm text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
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
                      >
                        <Pause className="w-4 h-4 mr-1" />
                        Devre Dışı
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: p.id, enable: true })}
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
              <option value="approved">Onaylandı</option>
              <option value="rejected">Reddedildi</option>
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
                    <span className="text-xs text-muted-foreground">
                      Güven: {c.confidence}%
                    </span>
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
                  <Button size="sm" variant="secondary" disabled title="Yakında">
                    Shopify&apos;a Otomatik Güncelle (yakında)
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
