import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Settings, Play } from "lucide-react";

export type ScrapeErrorMeta = {
  reason?: string;
  userMessage?: string;
  stageErrors?: string[];
  stageErrorsHuman?: string;
  finalSuccessReason?: string;
  gatewayConfigured?: boolean;
  gatewayTestSuccess?: boolean;
  isReadyForCloudScrape?: boolean;
};

type Props = {
  message: string;
  details?: string;
  meta?: ScrapeErrorMeta;
  testUrl?: string;
  onRetry?: () => void;
};

function resolveErrorCopy(meta?: ScrapeErrorMeta, message?: string) {
  const reason = meta?.reason || meta?.finalSuccessReason || "";
  const stages = meta?.stageErrors ?? [];

  if (
    reason === "gateway-not-configured" ||
    stages.includes("gateway-not-configured") ||
    meta?.isReadyForCloudScrape === false
  ) {
    return {
      title: "Kaynak siteye erişilemedi",
      subtitle: "Proxy/Scraping API ayarı yapılmamış",
      hint: "Railway IP Trendyol tarafından engelleniyor. /kaynak-erisim sayfasından generic_proxy, scraping_api veya yerel köprü ayarlayın.",
    };
  }

  if (
    reason === "gateway-provider-failed" ||
    stages.includes("gateway-provider-failed")
  ) {
    return {
      title: "Kaynak siteye erişilemedi",
      subtitle: "Kaynak erişim sağlayıcısı başarısız",
      hint: "Proxy veya API ayarlarınız hatalı veya süresi dolmuş olabilir. Gateway Test ile doğrulayın.",
    };
  }

  if (reason === "no-usable-data" || reason === "gateway-data-invalid") {
    return {
      title: "Kaynak siteye erişilemedi",
      subtitle: "Kaynak veri doğrulanamadı",
      hint: "HTML alınsa bile geçerli fiyat, başlık veya görsel bulunamadı.",
    };
  }

  return {
    title: "Kaynak siteye erişilemedi",
    subtitle:
      message?.includes("Railway") || message?.includes("engellen")
        ? "Railway sunucu IP'si Trendyol tarafından engellenmiş veya zaman aşımına düşmüş olabilir."
        : message?.split("—")[0].trim() || "Trendyol'dan ürün verisi alınamadı.",
    hint: "Direct HTML ve görsel çekimi başarısız olmuş olabilir.",
  };
}

export function ScrapeSourceErrorAlert({ message, details, meta, testUrl, onRetry }: Props) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: gatewayStatus } = useQuery({
    queryKey: ["/api/scrape-gateway/settings"],
    queryFn: async () => {
      const r = await fetch("/api/scrape-gateway/settings", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 30_000,
  });

  const enrichedMeta: ScrapeErrorMeta = {
    ...meta,
    isReadyForCloudScrape: gatewayStatus?.isReadyForCloudScrape ?? meta?.isReadyForCloudScrape,
    gatewayConfigured: gatewayStatus?.providerConfigured ?? meta?.gatewayConfigured,
    gatewayTestSuccess: gatewayStatus?.lastTestStatus === "success",
  };

  const copy = resolveErrorCopy(enrichedMeta, message);

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!testUrl) throw new Error("Test URL yok");
      const r = await fetch("/api/scrape-gateway/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url: testUrl }),
      });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/scrape-gateway/settings"] }),
  });

  return (
    <Card className="border-red-500/40 bg-red-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          {copy.title}
        </CardTitle>
        <p className="text-sm font-medium text-amber-300/90">{copy.subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{copy.hint}</p>

        {gatewayStatus && (
          <div className="text-xs rounded-md bg-slate-900/60 p-2 space-y-1">
            <p>
              Gateway: {gatewayStatus.gatewayEnabled ? "açık" : "kapalı"} · Proxy fallback:{" "}
              {gatewayStatus.proxyFallbackEnabled ? "açık" : "kapalı"}
            </p>
            <p>
              Sağlayıcı: {gatewayStatus.providerType} · Yapılandırma:{" "}
              {gatewayStatus.providerConfigured ? "tamam" : "eksik"}
              {gatewayStatus.isReadyForCloudScrape ? " · Cloud hazır" : " · Cloud için ayar gerekli"}
            </p>
            {gatewayStatus.lastTestAt && (
              <p>
                Son test: {new Date(gatewayStatus.lastTestAt).toLocaleString("tr-TR")} —{" "}
                {gatewayStatus.lastTestStatus}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          className="text-xs text-blue-400 flex items-center gap-1"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Detayları {open ? "gizle" : "göster"}
        </button>

        {open && (
          <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
            <li>Ürün HTML&apos;i alınamadı (direct-html-timeout)</li>
            <li>Görseller alınamadı (image-proxy-timeout)</li>
            <li>Cloud&apos;da Puppeteer kapalı</li>
            {meta?.stageErrorsHuman && <li>{meta.stageErrorsHuman}</li>}
            {details && <li className="list-none pl-0 mt-2 font-mono break-all">{details}</li>}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Tekrar Dene
            </Button>
          )}
          {testUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              <Play className="w-4 h-4 mr-1" />
              Gateway Test Et
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setLocation("/kaynak-erisim")}>
            <Settings className="w-4 h-4 mr-1" />
            Kaynak Erişim Ayarlarına Git
          </Button>
        </div>

        {testMutation.data && (
          <p className={`text-xs ${testMutation.data.success ? "text-green-400" : "text-red-400"}`}>
            Test: {testMutation.data.userMessage || testMutation.data.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
