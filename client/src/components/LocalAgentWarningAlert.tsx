import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const DEFAULT_MESSAGE =
  "Local Agent bağlantısı kurulamadığı için Trendyol HTML verisi alınamadı. Renk/beden bilgisi eksik olabilir. Cloudflare Tunnel adresini yenileyip ürünü tekrar çekin.";

type Props = {
  detail?: string;
};

export function LocalAgentWarningAlert({ detail }: Props) {
  return (
    <Card className="border-amber-500/40 bg-amber-950/20">
      <CardContent className="p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm text-amber-100 font-medium">Local Agent ulaşılamıyor</p>
          <p className="text-sm text-muted-foreground">{DEFAULT_MESSAGE}</p>
          {detail && (
            <p className="text-xs text-amber-200/70 font-mono break-all">{detail}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function hasLocalAgentWarning(warnings?: string[]): boolean {
  return warnings?.includes("local_agent_unreachable") === true;
}
