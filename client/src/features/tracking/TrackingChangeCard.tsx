import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ExternalLink, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CHANGE_STATUS_LABELS,
  changeStatusVariant,
  formatChangeValue,
  formatPricePairLines,
  getChangeDiffParts,
} from "./format-change-value";
import { TrackingProductImage } from "./TrackingProductImage";
import { isShopifySyncableTrackingChange } from "@shared/tracking-change-policy";
import { isPlaceholderColor, isPlaceholderSize } from "@shared/trendyol-variant-utils";
import { formatTryPrice } from "@shared/tracking-price-display";
import {
  buildProductTrackingTimeline,
  formatTrackingDateTime,
} from "./tracking-timeline";

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
  approvedAt?: string | null;
  appliedAt?: string | null;
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
  productCreatedAt?: string | null;
  productLastCheckedAt?: string | null;
  productLastSuccessAt?: string | null;
  productLastShopifySyncAt?: string | null;
  shopifyTransferredAt?: string | null;
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
  return formatTrackingDateTime(value);
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
  const price = c.priceDisplay ?? parts.priceDisplay;
  const priceLines = formatPricePairLines(price);
  const saleTarget = price?.saleNew != null ? formatTryPrice(price.saleNew) : null;
  const canAct = c.status === "pending" || c.status === "manual_review";
  const canShopify = isShopifySyncableTrackingChange(c);
  const needsReview = c.status === "manual_review" || c.status === "pending";
  const color =
    c.variantColor && !isPlaceholderColor(c.variantColor) ? c.variantColor : null;
  const size = c.variantSize && !isPlaceholderSize(c.variantSize) ? c.variantSize : null;
  const isPrice = c.changeType.includes("price");

  return (
    <article
      className={`rounded-2xl border bg-card/40 ${
        needsReview ? "border-amber-500/30" : "border-border/50"
      }`}
    >
      <div className="p-4 sm:p-5 flex gap-3 sm:gap-4">
        <TrackingProductImage imageUrl={c.productImageUrl} title={c.productTitle} size="md" />

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex gap-3 items-start justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold leading-snug line-clamp-2 text-[15px]">
                {c.productTitle || `Ürün #${c.trackedProductId}`}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                {(color || size) && (
                  <span className="text-foreground/85 font-medium">
                    {[color, size].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span className="text-foreground/85 font-medium">{parts.headline}</span>
                <Badge variant={changeStatusVariant(c.status)} className="font-normal text-[10px] h-5 px-1.5">
                  {CHANGE_STATUS_LABELS[c.status] || c.status}
                </Badge>
                <span>{formatDate(c.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {canShopify && onShopifySync && (
                <Button
                  size="sm"
                  disabled={busy || !c.trackingUid || !c.shopifyProductId}
                  title={
                    !c.shopifyProductId || !c.trackingUid
                      ? "Shopify ürün bağlantısı eksik"
                      : saleTarget
                        ? `Shopify satış: ${saleTarget}`
                        : "Shopify güncelle"
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
              {(canAct || onMarkSeen || onIgnore) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0 text-muted-foreground"
                      disabled={busy}
                      aria-label="Diğer işlemler"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canAct && onApprove && (
                      <DropdownMenuItem onClick={onApprove}>Onayla</DropdownMenuItem>
                    )}
                    {canAct && onReject && (
                      <DropdownMenuItem onClick={onReject}>Reddet</DropdownMenuItem>
                    )}
                    {onMarkSeen && (
                      <DropdownMenuItem onClick={onMarkSeen}>Görüldü</DropdownMenuItem>
                    )}
                    {onIgnore && c.status !== "ignored" && (
                      <DropdownMenuItem onClick={onIgnore}>Yok say</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {isPrice && (priceLines.costLine || saleTarget) ? (
            <div className="space-y-1">
              {priceLines.costLine && (
                <p className="text-sm text-muted-foreground">
                  Alış{" "}
                  <span className="text-foreground/80 tabular-nums">{priceLines.costLine}</span>
                </p>
              )}
              {saleTarget && (
                <p className="text-[15px]">
                  <span className="text-muted-foreground">Shopify satış </span>
                  <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {saleTarget}
                  </span>
                  {priceLines.marginLine && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      ({priceLines.marginLine})
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-foreground/85 leading-snug">{parts.diagnosis}</p>
          )}

          {(() => {
            const points = buildProductTrackingTimeline({
              productCreatedAt: c.productCreatedAt,
              shopifyTransferredAt: c.shopifyTransferredAt,
              changeDetectedAt: c.createdAt,
              changeAppliedAt: c.appliedAt,
              productLastCheckedAt: c.productLastCheckedAt,
              productLastSuccessAt: c.productLastSuccessAt,
              productLastShopifySyncAt: c.productLastShopifySyncAt,
            });
            if (points.length === 0) return null;
            return (
              <div className="rounded-xl border border-border/40 bg-background/25 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Zaman çizelgesi
                </p>
                <dl className="grid gap-1 sm:grid-cols-2">
                  {points.map((point) => (
                    <div
                      key={`${point.label}-${String(point.at)}`}
                      className="flex items-baseline gap-2 text-xs"
                    >
                      <dt className="text-muted-foreground shrink-0 min-w-[7.5rem]">
                        {point.label}
                      </dt>
                      <dd className="font-medium tabular-nums text-foreground/90">
                        {formatTrackingDateTime(point.at)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
              {detailsOpen ? "Gizle" : "Ham değerler"}
            </button>
          </div>
        </div>
      </div>

      {detailsOpen && (
        <div className="px-4 sm:px-5 pb-4 border-t border-border/40 pt-3 space-y-2 text-sm">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                {parts.oldLabel}
              </p>
              <p className="break-words text-muted-foreground">
                {formatChangeValue(c.oldValue, c.changeType)}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
                {parts.newLabel}
              </p>
              <p className="break-words font-medium">
                {formatChangeValue(c.newValue, c.changeType)}
              </p>
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            #{c.id}
            {c.shopifyProductId ? ` · Shopify ${c.shopifyProductId}` : ""}
          </p>
        </div>
      )}
    </article>
  );
}
