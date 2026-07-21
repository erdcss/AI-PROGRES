import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ExternalLink } from "lucide-react";
import {
  CHANGE_STATUS_LABELS,
  CHANGE_TYPE_LABELS,
  changeStatusVariant,
  formatChangeDiff,
  formatChangeValue,
} from "./format-change-value";
import { TrackingProductImage } from "./TrackingProductImage";
import {
  isActionableTrackingChangeStatus,
  isDirectlyApplicableTrackingChange,
} from "@shared/tracking-change-policy";

export type TrackingChangeItem = {
  id: number;
  trackedProductId: number;
  trackedVariantId?: number | null;
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
  productImageUrl?: string | null;
  shopifyProductId?: string | null;
  trackingUid?: string | null;
  variantUid?: string | null;
  variantLabel?: string | null;
  variantSku?: string | null;
  shopifyVariantId?: string | null;
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
    isActionableTrackingChangeStatus(c.status) &&
    isDirectlyApplicableTrackingChange(c.changeType, c.fieldName, c.newValue);
  const needsReview = c.status === "manual_review" || c.status === "pending";

  return (
    <article
      className={`rounded-xl border bg-card/50 overflow-hidden transition-colors ${
        needsReview ? "border-amber-500/30" : "border-border/60"
      }`}
    >
      <div className="p-4 flex gap-4">
        <TrackingProductImage imageUrl={c.productImageUrl} title={c.productTitle} size="lg" />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <h3 className="font-medium leading-snug line-clamp-2 text-[15px]">
                {c.productTitle || `Ürün #${c.trackedProductId}`}
              </h3>
              <p className="text-sm text-foreground/85">{diff}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="font-normal text-xs">
                  {typeLabel}
                </Badge>
                <Badge variant={changeStatusVariant(c.status)} className="font-normal text-xs">
                  {CHANGE_STATUS_LABELS[c.status] || c.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0 lg:justify-end">
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
                  Shopify&apos;da düzelt
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
            <p className="text-sm text-amber-600 dark:text-amber-400 flex items-start gap-1.5 rounded-lg bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{c.reason}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground pt-0.5">
            {onMarkSeen && (
              <button
                type="button"
                className="hover:text-foreground transition-colors"
                disabled={busy}
                onClick={onMarkSeen}
              >
                Görüldü
              </button>
            )}
            {onIgnore && c.status !== "ignored" && (
              <button
                type="button"
                className="hover:text-foreground transition-colors"
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
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                Kaynak
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={() => setDetailsOpen((v) => !v)}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
              />
              Detay
            </button>
          </div>
        </div>
      </div>

      {detailsOpen && (
        <div className="px-4 pb-4 pt-0 ml-[6.5rem] space-y-2 text-xs text-muted-foreground border-t border-border/40 mx-4">
          <div className="grid sm:grid-cols-2 gap-2 rounded-lg bg-muted/30 p-3 mt-3">
            <div>
              <span className="font-medium text-foreground/70">Önceki: </span>
              {formatChangeValue(c.oldValue, c.changeType)}
            </div>
            <div>
              <span className="font-medium text-foreground/70">Sonraki: </span>
              {formatChangeValue(c.newValue, c.changeType)}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
            <span>#{c.id}</span>
            {c.trackingUid && <span>{c.trackingUid}</span>}
            {c.shopifyProductId && <span>Shopify {c.shopifyProductId}</span>}
            {c.confidence != null && <span>Güven %{c.confidence}</span>}
          </div>
        </div>
      )}
    </article>
  );
}
