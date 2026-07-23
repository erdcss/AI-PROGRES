import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ExternalLink } from "lucide-react";
import {
  CHANGE_STATUS_LABELS,
  changeStatusVariant,
  formatChangeValue,
  formatPricePairLines,
  getChangeDiffParts,
} from "./format-change-value";
import { TrackingProductImage } from "./TrackingProductImage";
import {
  isActionableTrackingChangeStatus,
  isDirectlyApplicableTrackingChange,
} from "@shared/tracking-change-policy";
import { isPlaceholderColor, isPlaceholderSize } from "@shared/trendyol-variant-utils";

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
  variantColor?: string | null;
  variantSize?: string | null;
  variantAvailable?: boolean | null;
  profitMarginPercent?: number | null;
  priceDisplay?: {
    costOld: number | null;
    costNew: number | null;
    saleOld: number | null;
    saleNew: number | null;
    marginPercent: number | null;
  } | null;
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
  const parts = getChangeDiffParts(c.changeType, c.oldValue, c.newValue, {
    fieldName: c.fieldName,
    variantLabel: c.variantLabel,
    storedReason: c.reason,
    profitMarginPercent: c.profitMarginPercent,
    priceDisplay: c.priceDisplay,
  });
  const priceLines = formatPricePairLines(c.priceDisplay ?? parts.priceDisplay);
  const canAct = c.status === "pending" || c.status === "manual_review";
  const canShopify =
    isActionableTrackingChangeStatus(c.status) &&
    isDirectlyApplicableTrackingChange(c.changeType, c.fieldName, c.newValue);
  const needsReview = c.status === "manual_review" || c.status === "pending";
  const color =
    c.variantColor && !isPlaceholderColor(c.variantColor) ? c.variantColor : null;
  const size = c.variantSize && !isPlaceholderSize(c.variantSize) ? c.variantSize : null;

  return (
    <article
      className={`rounded-xl border bg-card/50 overflow-hidden transition-colors ${
        needsReview ? "border-amber-500/30" : "border-border/60"
      }`}
    >
      <div className="p-4 flex gap-3 sm:gap-4">
        <TrackingProductImage imageUrl={c.productImageUrl} title={c.productTitle} size="lg" />

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h3 className="font-medium leading-snug line-clamp-2 text-[15px]">
                {c.productTitle || `Ürün #${c.trackedProductId}`}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {color && (
                  <Badge variant="outline" className="font-normal text-xs">
                    Renk: {color}
                  </Badge>
                )}
                {size && (
                  <Badge variant="outline" className="font-normal text-xs">
                    Beden: {size}
                  </Badge>
                )}
                <Badge variant="secondary" className="font-normal text-xs">
                  {parts.headline}
                </Badge>
                <Badge variant={changeStatusVariant(c.status)} className="font-normal text-xs">
                  {CHANGE_STATUS_LABELS[c.status] || c.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-sm text-foreground/90 leading-snug">{parts.diagnosis}</p>
              {priceLines.costLine && (
                <div className="grid sm:grid-cols-2 gap-2 text-sm pt-0.5">
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                      Alış fiyatı
                    </p>
                    <p className="font-medium">{priceLines.costLine}</p>
                  </div>
                  {priceLines.saleLine && (
                    <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-0.5">
                        Kârlı satış
                        {priceLines.marginLine ? ` · ${priceLines.marginLine}` : ""}
                      </p>
                      <p className="font-medium">{priceLines.saleLine}</p>
                    </div>
                  )}
                </div>
              )}
              {parts.advice && (
                <p className="text-xs text-muted-foreground">{parts.advice}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {canShopify && onShopifySync && (
                <Button
                  size="sm"
                  disabled={busy || !c.trackingUid || !c.shopifyProductId}
                  onClick={onShopifySync}
                >
                  Shopify&apos;da düzelt
                </Button>
              )}
              {canAct && onApprove && (
                <Button size="sm" variant="outline" disabled={busy} onClick={onApprove}>
                  Onayla
                </Button>
              )}
              {canAct && onReject && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
                  Reddet
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

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
        <div className="px-4 pb-4 border-t border-border/40 mx-4 pt-3 space-y-2 text-sm">
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                {parts.oldLabel}
              </p>
              <p className="break-words">{formatChangeValue(c.oldValue, c.changeType)}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-1">
                {parts.newLabel}
              </p>
              <p className="break-words font-medium">
                {formatChangeValue(c.newValue, c.changeType)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>#{c.id}</span>
            {c.shopifyProductId && <span>Shopify {c.shopifyProductId}</span>}
          </div>
        </div>
      )}
    </article>
  );
}
