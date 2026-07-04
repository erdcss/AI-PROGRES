import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import {
  CHANGE_STATUS_LABELS,
  CHANGE_TYPE_LABELS,
  changeStatusVariant,
  formatChangeDiff,
  formatChangeValue,
} from "./format-change-value";

export type TrackingChangeItem = {
  id: number;
  trackedProductId: number;
  changeType: string;
  fieldName?: string;
  oldValue: unknown;
  newValue: unknown;
  confidence?: string;
  status: string;
  reason?: string | null;
  createdAt: string;
  productTitle?: string | null;
  productUrl?: string | null;
  shopifyProductId?: string | null;
  trackingUid?: string | null;
};

type TrackingChangeCardProps = {
  change: TrackingChangeItem;
  busy?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onIgnore?: () => void;
  onMarkSeen?: () => void;
  onShopifySync?: () => void;
  onApply?: () => void;
  onRetry?: () => void;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TrackingChangeCard({
  change: c,
  busy,
  onApprove,
  onReject,
  onIgnore,
  onMarkSeen,
  onShopifySync,
  onApply,
  onRetry,
}: TrackingChangeCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const typeLabel = CHANGE_TYPE_LABELS[c.changeType] || c.changeType;
  const diff = formatChangeDiff(c.changeType, c.oldValue, c.newValue);
  const canAct = c.status === "pending" || c.status === "manual_review";
  const canShopify =
    c.status !== "applied" && c.status !== "ignored" && c.status !== "rejected";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="font-medium leading-snug line-clamp-2">
              {c.productTitle || `Ürün #${c.trackedProductId}`}
            </p>
            <p className="text-sm text-foreground/90">{diff}</p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <Badge variant="secondary" className="font-normal">
                {typeLabel}
              </Badge>
              <Badge variant={changeStatusVariant(c.status)} className="font-normal">
                {CHANGE_STATUS_LABELS[c.status] || c.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {canAct && onApprove && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onApprove}>
                Onayla
              </Button>
            )}
            {canAct && onReject && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
                Reddet
              </Button>
            )}
            {canShopify && onShopifySync && (
              <Button
                size="sm"
                disabled={busy || !c.trackingUid || !c.shopifyProductId}
                title={
                  !c.trackingUid
                    ? "Takip UID eksik"
                    : !c.shopifyProductId
                      ? "Shopify ürün ID yok"
                      : undefined
                }
                onClick={onShopifySync}
              >
                Shopify&apos;da güncelle
              </Button>
            )}
            {c.status === "approved" && onApply && (
              <Button size="sm" disabled={busy} onClick={onApply}>
                Uygula
              </Button>
            )}
            {c.status === "failed" && onRetry && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onRetry}>
                Tekrar dene
              </Button>
            )}
          </div>
        </div>

        {c.reason && (
          <p className="text-sm text-amber-600 dark:text-amber-500 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{c.reason}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {onMarkSeen && (
            <button
              type="button"
              className="hover:text-foreground underline-offset-2 hover:underline"
              disabled={busy}
              onClick={onMarkSeen}
            >
              Görüldü işaretle
            </button>
          )}
          {onIgnore && c.status !== "ignored" && (
            <button
              type="button"
              className="hover:text-foreground underline-offset-2 hover:underline"
              disabled={busy}
              onClick={onIgnore}
            >
              Yok say
            </button>
          )}
          {c.productUrl && (
            <a
              href={c.productUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              Trendyol
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            />
            Teknik detaylar
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2 text-xs text-muted-foreground">
            <div className="grid sm:grid-cols-2 gap-2 rounded-md bg-muted/40 p-3">
              <div>
                <span className="text-muted-foreground">Önceki: </span>
                {formatChangeValue(c.oldValue, c.changeType)}
              </div>
              <div>
                <span className="text-muted-foreground">Sonraki: </span>
                {formatChangeValue(c.newValue, c.changeType)}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
              <span>#{c.id}</span>
              {c.trackingUid && <span>{c.trackingUid}</span>}
              {c.shopifyProductId && <span>Shopify {c.shopifyProductId}</span>}
              {c.confidence != null && <span>Güven %{c.confidence}</span>}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
