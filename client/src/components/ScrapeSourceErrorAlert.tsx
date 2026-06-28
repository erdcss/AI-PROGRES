import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCw, Settings } from "lucide-react";

type Props = {
  message: string;
  details?: string;
  onRetry?: () => void;
};

export function ScrapeSourceErrorAlert({ message, details, onRetry }: Props) {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  const shortMessage =
    message.includes("Railway") || message.includes("engellen")
      ? "Railway sunucu IP'si Trendyol tarafından engellenmiş veya zaman aşımına düşmüş olabilir."
      : message.split("—")[0].trim();

  return (
    <Card className="border-red-500/40 bg-red-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 text-red-400">
          <AlertTriangle className="w-5 h-5" />
          Kaynak siteye erişilemedi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{shortMessage}</p>

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
            <li>Ürün HTML&apos;i alınamadı</li>
            <li>Görseller alınamadı</li>
            <li>Cloud&apos;da Puppeteer kapalı</li>
            <li>Proxy/kaynak erişim ayarı gerekebilir</li>
            {details && <li className="list-none pl-0 mt-2 font-mono">{details}</li>}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-1" />
              Tekrar Dene
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setLocation("/kaynak-erisim")}>
            <Settings className="w-4 h-4 mr-1" />
            Kaynak Erişim Ayarlarına Git
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
