import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const BROWSER_WORKER_MESSAGE =
  "Tarayıcı Worker bağlantısı kurulamadı. Ana ürün verisi diğer kaynaklardan alınabilir; yalnız bazı renk/beden ayrıntıları eksik kalabilir.";

const BROWSER_WORKER_BLOCKED_MESSAGE =
  "Tarayıcı Worker çalışıyor ancak Trendyol bu sunucu çıkışını 403 ile engelledi. Ürün başlık, fiyat ve görselleri hızlı kaynaklardan alındı; yalnız varyant ayrıntıları eksik olabilir.";

const LOCAL_AGENT_MESSAGE =
  "Local Agent bağlantısı kurulamadığı için Trendyol HTML verisi alınamadı. Renk/beden bilgisi eksik olabilir. Cloudflare Tunnel adresini yenileyip ürünü tekrar çekin.";

type Props = {
  warningCode?: string | null;
  detail?: string;
};

export function LocalAgentWarningAlert({ warningCode, detail }: Props) {
  const isBrowserWorkerBlocked = warningCode === "browser_worker_blocked";
  const isBrowserWorker = warningCode === "browser_worker_unreachable" || isBrowserWorkerBlocked;
  const title = isBrowserWorkerBlocked
    ? "Trendyol tarayıcı erişimini engelledi"
    : isBrowserWorker
      ? "Tarayıcı Worker ulaşılamıyor"
      : "Local Agent ulaşılamıyor";
  const message = isBrowserWorkerBlocked
    ? BROWSER_WORKER_BLOCKED_MESSAGE
    : isBrowserWorker
      ? BROWSER_WORKER_MESSAGE
      : LOCAL_AGENT_MESSAGE;

  return (
    <Card className="border-amber-500/40 bg-amber-950/20">
      <CardContent className="p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm text-amber-100 font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          {detail && (
            <p className="text-xs text-amber-200/70 font-mono break-all">{detail}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function resolveScrapeSourceWarning(warnings?: string[]): string | null {
  if (warnings?.includes("browser_worker_blocked")) return "browser_worker_blocked";
  if (warnings?.includes("browser_worker_unreachable")) return "browser_worker_unreachable";
  if (warnings?.includes("local_agent_unreachable")) return "local_agent_unreachable";
  return null;
}

/** @deprecated use resolveScrapeSourceWarning */
export function hasLocalAgentWarning(warnings?: string[]): boolean {
  return resolveScrapeSourceWarning(warnings) !== null;
}
