import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useControlCenterHealth } from "../hooks";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge variant={ok ? "default" : "destructive"}>{ok ? "Sağlıklı" : "Sorunlu"}</Badge>
  );
}

export function SystemHealthTab({ active }: { active: boolean }) {
  const { data, isLoading, error, refetch, isFetching } = useControlCenterHealth(active);

  if (!active) return null;
  if (isLoading) return <p className="text-muted-foreground">Sağlık durumu yükleniyor...</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  if (!data) return null;

  const db = (data.database ?? {}) as Record<string, unknown>;
  const trendyol = (data.trendyol ?? {}) as Record<string, unknown>;
  const puppeteer = (trendyol.puppeteer ?? {}) as Record<string, unknown>;
  const shopify = (data.shopify ?? {}) as Record<string, unknown>;
  const tracking = (data.tracking ?? {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
        Yenile
      </Button>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Veritabanı
              <StatusBadge ok={db.status === "healthy"} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Durum: {String(db.status ?? "—")}</div>
            <div>Import jobs tablosu: {db.importJobsTable ? "hazır" : "eksik"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Trendyol / Scrape
              <StatusBadge ok={puppeteer.status === "healthy" || trendyol.api === "local"} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Ortam: {String(trendyol.api ?? "—")}</div>
            <div>Direct HTML: {String(trendyol.directHtml ?? "—")}</div>
            <div>
              Puppeteer: {String(puppeteer.status ?? "—")}
              {puppeteer.source ? ` (${String(puppeteer.source)})` : ""}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Shopify
              <StatusBadge ok={Boolean(shopify.ok)} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Domain: {String(shopify.shopDomain ?? "—")}</div>
            <div>Token: {shopify.hasAccessToken ? "var" : "yok"}</div>
            <div>Scope: {shopify.scopesOk ? "tamam" : "eksik"}</div>
            {shopify.lastErrorMessage ? (
              <div className="text-destructive">Son hata: {String(shopify.lastErrorMessage)}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-base">
              Ürün Takibi
              <StatusBadge ok={Boolean(tracking.schedulerRunning) || tracking.status === "local"} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>Ortam: {String(tracking.status ?? "—")}</div>
            <div>Scheduler: {tracking.schedulerRunning ? "çalışıyor" : "durdu"}</div>
            <div>Bekleyen değişiklik: {String(tracking.pendingChanges ?? 0)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
