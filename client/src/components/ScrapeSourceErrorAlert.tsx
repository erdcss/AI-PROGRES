import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

export type ScrapeErrorMeta = {
  reason?: string;
  userMessage?: string;
  stageErrors?: string[];
  stageErrorsHuman?: string;
  finalSuccessReason?: string;
};

type Props = {
  message: string;
  details?: string;
  meta?: ScrapeErrorMeta;
  onRetry?: () => void;
};

const DEFAULT_TITLE = "Ürün verisi alınamadı";
const DEFAULT_MESSAGE =
  "Kaynak siteye erişim sağlanamadı veya ürün verisi doğrulanamadı. Program alternatif erişim yollarını denedi ancak geçerli fiyat, görsel veya başlık bulunamadı.";

import { formatStageErrorsForUser } from "@shared/scrape-runtime";

const STAGE_ERROR_LABELS: Record<string, string> = {
  "local-agent-failed": "Yerel agent erişilemedi (DNS veya tunnel süresi dolmuş olabilir)",
  "browser-worker-unhealthy": "Tarayıcı Worker sağlıksız veya yapılandırılmamış",
  "browser-worker-not-configured": "Tarayıcı Worker yapılandırılmamış",
  "api-null-response": "Trendyol API boş yanıt döndü",
  "image-proxy-timeout": "Görsel proxy zaman aşımı (ürün verisi etkilenmeyebilir)",
  "image-fallback-timeout": "Görsel yedek indirme zaman aşımı",
  "puppeteer-disabled-in-cloud": "Cloud ortamında Puppeteer kapalı — Browser Worker gerekli",
  "pipeline-global-timeout": "Toplam çekim süresi aşıldı",
};

function buildDetailLines(meta?: ScrapeErrorMeta) {
  const stages = meta?.stageErrors ?? [];
  const lines: string[] = stages.map((e) => STAGE_ERROR_LABELS[e] || e);

  if (lines.length === 0) {
    if (stages.some((e) => e.includes("api"))) lines.push("Trendyol API başarısız");
    if (stages.some((e) => e.includes("direct-html") || e.includes("html-parse"))) {
      lines.push("Sayfa HTML alınamadı");
    }
    if (stages.some((e) => e.includes("image"))) lines.push("Görseller indirilemedi");
    if (stages.some((e) => e.includes("local-agent") || e.includes("browser-worker"))) {
      lines.push("Tarayıcı tabanlı erişim başarısız");
    }
  }

  if (meta?.stageErrorsHuman) {
    lines.push(meta.stageErrorsHuman);
  } else if (stages.length > 0) {
    lines.push(formatStageErrorsForUser(stages as any));
  }

  return lines.length > 0 ? [...new Set(lines)] : ["Kaynak veri doğrulanamadı"];
}

export function ScrapeSourceErrorAlert({ message, details, meta, onRetry }: Props) {
  const [open, setOpen] = useState(false);
  const displayMessage = message?.trim() || DEFAULT_MESSAGE;
  const detailLines = buildDetailLines(meta);

  return (
    <Card className="border-red-500/40 bg-red-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          {DEFAULT_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{displayMessage || DEFAULT_MESSAGE}</p>

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
            {detailLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {details && <li className="list-none pl-0 mt-2 font-mono break-all">{details}</li>}
          </ul>
        )}

        {onRetry && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Tekrar Dene
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
