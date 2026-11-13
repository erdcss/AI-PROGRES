import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ExternalLink, FileText, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { TrackingPriceResearchReport } from "@shared/tracking-price-research";

type ReportResponse = { success: boolean; report: TrackingPriceResearchReport | null; error?: string };
type Props = { trackedProductId: number; productTitle: string };

const money = (amount: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

async function getJson(res: Response): Promise<ReportResponse> {
  const data = await res.json().catch(() => ({})) as ReportResponse;
  if (!res.ok || data.success === false)
    throw new Error(data.error || "Fiyat araştırması alınamadı");
  return data;
}

export function TrackingPriceResearchActions({ trackedProductId, productTitle }: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = ["tracking-price-research", trackedProductId];
  const endpoint = "/api/tracking/products/" + trackedProductId + "/price-research";

  const reportQuery = useQuery({
    queryKey,
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => getJson(await fetch(endpoint)),
  });

  const research = useMutation({
    mutationFn: async () => {
      const response = await fetch(endpoint, { method: "POST" });
      return getJson(response);
    },
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });

  const startResearch = () => {
    setOpen(true);
    if (!research.isPending) research.mutate();
  };
  const report = reportQuery.data?.report ?? null;
  const lowest = report?.summary.lowestPrice ?? null;

  return (
    <>
      <button
        type="button"
        onClick={startResearch}
        disabled={research.isPending}
        className="inline-flex min-h-8 items-center gap-1.5 font-medium text-foreground/85 hover:text-foreground disabled:opacity-50 transition-colors"
        aria-label={"Ürünü internette araştır: " + productTitle}
      >
        <Search className={"w-3.5 h-3.5 " + (research.isPending ? "animate-pulse" : "")} />
        {research.isPending ? "Araştırılıyor…" : "Ürünü araştır"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="h-3.5 w-3.5" />
        Raporu gör
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90dvh] overflow-y-auto px-4 sm:px-6">
          <DialogHeader>
            <DialogTitle className="pr-6 text-lg sm:text-xl">ÇIKAN SONUCU GÖR</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {productTitle} — internet genelinde ürün fiyat araştırması
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {report && (
                <>
                  <Badge variant="outline">{report.summary.verifiedCount} doğrulanan fiyat</Badge>
                  <Badge variant="secondary">{report.resultsFound} bağlantı</Badge>
                  <span className="self-center">
                    {new Date(report.searchedAt).toLocaleString("tr-TR")}
                  </span>
                </>
              )}
            </div>
            <Button size="sm" onClick={startResearch} disabled={research.isPending}>
              <RefreshCw className={"mr-2 h-3.5 w-3.5 " + (research.isPending ? "animate-spin" : "")} />
              {research.isPending ? "Web araştırılıyor…" : report ? "Yeniden araştır" : "Ürünü araştır"}
            </Button>
          </div>

          {research.isPending && (
            <div role="status" className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              Arama motorları ve mağaza sayfaları kontrol ediliyor. Doğrulanan fiyatlar araştırma bittiğinde görünecek.
              {report && <span className="block mt-1">Aşağıda önceki rapor gösteriliyor.</span>}
            </div>
          )}
          {research.isError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{research.error instanceof Error ? research.error.message : "Araştırma başarısız oldu."}</span>
            </div>
          )}
          {reportQuery.isLoading && !report && !research.isPending && (
            <p className="text-sm text-muted-foreground py-6 text-center">Kayıtlı fiyat raporu yükleniyor…</p>
          )}
          {reportQuery.isError && !report && !research.isPending && (
            <p role="alert" className="text-sm text-destructive">Rapor yüklenemedi. Tekrar deneyin.</p>
          )}
          {!report && !reportQuery.isLoading && !research.isPending && !reportQuery.isError && (
            <div className="py-10 text-center space-y-2">
              <FileText className="h-9 w-9 mx-auto text-muted-foreground" />
              <p className="font-medium">Bu ürün için kayıtlı araştırma raporu yok.</p>
              <p className="text-sm text-muted-foreground">Fiyatları ve kaynak URL'lerini görmek için Ürünü araştır'a basın.</p>
            </div>
          )}

          {report && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {([
                  ["Takip fiyatı", report.sourcePrice],
                  ["En düşük fiyat", lowest],
                  ["Ortalama fiyat", report.summary.averagePrice],
                  ["En yüksek fiyat", report.summary.highestPrice],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-border bg-muted/20 p-3 min-w-0">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-base sm:text-lg font-semibold tabular-nums break-words mt-1">
                      {value == null ? "—" : money(value)}
                    </p>
                  </div>
                ))}
              </div>

              {lowest != null && report.sourcePrice != null && (
                <p className="text-sm text-muted-foreground">
                  Takip fiyatına göre en düşük doğrulanan web fiyatı{" "}
                  <strong className="text-foreground">{money(Math.abs(report.sourcePrice - lowest))}</strong>{" "}
                  {report.sourcePrice >= lowest ? "daha ucuz." : "daha pahalı."}
                  {" "}Kargo ve kampanya koşulları dahil olmayabilir.
                </p>
              )}

              {report.warnings.map((warning, i) => (
                <div key={i} role="note" className="flex gap-2 items-start rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                  <span>{warning}</span>
                </div>
              ))}

              <section>
                <div className="flex flex-wrap gap-2 items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold">Bulunan satış bağlantıları ({report.offers.length})</h4>
                  <span className="text-xs text-muted-foreground">
                    {report.checkedCount} sayfa kontrol edildi · {report.provider}
                  </span>
                </div>

                {report.offers.length === 0 ? (
                  <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
                    Eşleşen ürün bağlantısı bulunamadı. Ürün adını veya modelini kontrol edin.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {report.offers.map((offer) => (
                      <div
                        key={offer.url}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between rounded-xl border border-border/70 p-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-xs font-semibold text-muted-foreground">{offer.site}</span>
                            {offer.isSource && <Badge variant="outline" className="text-[10px]">Takip edilen kaynak</Badge>}
                            {offer.verified ? (
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Fiyat sayfadan doğrulandı
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Fiyat doğrulanamadı</span>
                            )}
                          </div>
                          <p className="text-sm font-medium line-clamp-2 leading-snug">{offer.title}</p>
                          <p className="text-xs text-muted-foreground break-all line-clamp-1">{offer.url}</p>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0">
                          <span className="font-semibold text-base tabular-nums">
                            {offer.verified && offer.price != null ? money(offer.price) : "—"}
                          </span>
                          {safeHref(offer.url) && (
                            <a
                              href={safeHref(offer.url) ?? undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline whitespace-nowrap"
                            >
                              Ürüne git <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Fiyatlar yalnızca mağaza sayfasından TRY olarak okunabildiğinde doğrulanır; diğer
                sonuçlar yalnızca bağlantıdır. Liste tüm interneti eksiksiz kapsama garantisi vermez.
                Varyant, stok, kargo ve ödeme ekranındaki fiyatı satın almadan önce kontrol edin.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
