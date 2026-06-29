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

function buildDetailLines(meta?: ScrapeErrorMeta) {
  const stages = meta?.stageErrors ?? [];
  const lines: string[] = [];

  if (stages.some((e) => e.includes("api"))) {
    lines.push("API başarısız");
  }
  if (
    stages.some(
      (e) =>
        e.includes("direct-html") ||
        e.includes("source-access-direct") ||
        e.includes("html-parse"),
    )
  ) {
    lines.push("HTML alınamadı");
  }
  if (stages.some((e) => e.includes("image"))) {
    lines.push("Görseller alınamadı");
  }
  if (
    stages.some(
      (e) =>
        e.startsWith("source-access-") ||
        e.includes("gateway-provider") ||
        e.includes("gateway-not") ||
        e.includes("local-agent"),
    )
  ) {
    lines.push("Alternatif erişim denendi (başarısız)");
  }

  if (meta?.stageErrorsHuman) {
    lines.push(meta.stageErrorsHuman);
  }

  return lines.length > 0 ? lines : ["Kaynak veri doğrulanamadı"];
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
