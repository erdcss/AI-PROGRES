import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, ShieldAlert } from "lucide-react";

export type ScrapeErrorMeta = {
  reason?: string;
  userMessage?: string;
  stageErrors?: string[];
  stageErrorsHuman?: string;
  finalSuccessReason?: string;
  blockCooldownMs?: number;
  blockKind?: string;
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
  "browser-worker-blocked": "Tarayıcı Worker engellendi (WAF/IP)",
  "api-null-response": "Trendyol API boş yanıt döndü",
  "image-proxy-timeout": "Görsel proxy zaman aşımı (ürün verisi etkilenmeyebilir)",
  "image-fallback-timeout": "Görsel yedek indirme zaman aşımı",
  "puppeteer-disabled-in-cloud": "Cloud ortamında Puppeteer kapalı — Browser Worker gerekli",
  "unknown-scenario-error": "Bilinmeyen senaryo hatası",
  "chromium-not-found": "Chromium bulunamadı",
  "chromium-launch-failed": "Chromium başlatılamadı",
  "navigation-timeout": "Sayfa yükleme zaman aşımı",
  "trendyol-blocked": "Trendyol erişimi engellendi",
  "trendyol-circuit-open": "Trendyol ban koruması aktif — bekleyin",
  "upstream-556": "Trendyol upstream 556 engeli",
  "page-empty": "Sayfa boş veya veri yok",
};

function isBanMeta(meta?: ScrapeErrorMeta): boolean {
  const stages = meta?.stageErrors ?? [];
  const reason = meta?.reason || "";
  return (
    stages.some((e) =>
      ["trendyol-blocked", "trendyol-circuit-open", "upstream-556", "browser-worker-blocked"].includes(
        e,
      ),
    ) ||
    reason.includes("trendyol-circuit") ||
    reason.includes("trendyol-blocked") ||
    reason.includes("upstream-556")
  );
}

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
  const displayMessage = message?.trim() || meta?.userMessage?.trim() || DEFAULT_MESSAGE;
  const detailLines = buildDetailLines(meta);
  const ban = isBanMeta(meta);
  const cooldownMin =
    typeof meta?.blockCooldownMs === "number" && meta.blockCooldownMs > 0
      ? Math.max(1, Math.ceil(meta.blockCooldownMs / 60_000))
      : null;

  return (
    <Card
      className={
        ban
          ? "border-amber-500/50 bg-amber-950/25"
          : "border-red-500/40 bg-red-950/20"
      }
    >
      <CardHeader className="pb-2">
        <CardTitle
          className={`text-lg flex items-center gap-2 ${ban ? "text-amber-300" : "text-red-400"}`}
        >
          {ban ? <ShieldAlert className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          {ban ? "Trendyol erişimi engellendi" : DEFAULT_TITLE}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-200">{displayMessage}</p>
        {ban && (
          <p className="text-xs text-amber-200/90">
            {cooldownMin
              ? `Ban koruması aktif — yaklaşık ${cooldownMin} dk bekleyin. Hemen tekrar denemek engeli uzatabilir.`
              : "Kısa süre bekleyip tekrar deneyin. Hemen denemek engeli uzatabilir."}
            {meta?.blockKind ? ` Sebep: ${meta.blockKind}.` : ""}
          </p>
        )}
        {details && details !== displayMessage && (
          <p className="text-xs text-zinc-500 break-all">{details}</p>
        )}
        <div className="flex flex-wrap gap-2">
          {!ban && onRetry && (
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Tekrar dene
            </Button>
          )}
          {ban && (
            <Button type="button" size="sm" variant="outline" className="border-amber-700 text-amber-200" disabled>
              Bekle
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
            Detay
          </Button>
        </div>
        {open && (
          <ul className="text-xs text-zinc-400 list-disc pl-4 space-y-1">
            {detailLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
