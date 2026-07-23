import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CHANGE_STATUS_LABELS,
  changeStatusVariant,
  formatPricePairLines,
  getChangeDiffParts,
} from "./format-change-value";
import { TrackingProductImage } from "./TrackingProductImage";
import type { TrackingChangeItem } from "./TrackingChangeCard";
import {
  buildTrackingVariantLabel,
  isPlaceholderColor,
  isPlaceholderSize,
} from "@shared/trendyol-variant-utils";
import {
  isActionableTrackingChangeStatus,
  isDirectlyApplicableTrackingChange,
} from "@shared/tracking-change-policy";

type TrackedVariantRow = {
  id: number;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sourceSku: string | null;
  sourceVariantTitle: string | null;
  currentAvailable: boolean | null;
  shopifyVariantId: string | null;
};

type Props = {
  changes: TrackingChangeItem[];
  busy?: boolean;
  onApprove: (id: number) => void;
  onIgnore: (id: number) => void;
  onMarkSeen: (id: number) => void;
  onShopifySync: (id: number) => void;
  onApproveMany: (ids: number[]) => void;
  onShopifySyncMany: (ids: number[]) => void;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function VariantOptionBadges({ change }: { change: TrackingChangeItem }) {
  const color =
    change.variantColor && !isPlaceholderColor(change.variantColor)
      ? change.variantColor
      : null;
  const size =
    change.variantSize && !isPlaceholderSize(change.variantSize) ? change.variantSize : null;
  if (!color && !size && !change.variantLabel) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {color && (
        <Badge variant="outline" className="font-medium text-[11px]">
          Renk: {color}
        </Badge>
      )}
      {size && (
        <Badge variant="outline" className="font-medium text-[11px]">
          Beden: {size}
        </Badge>
      )}
      {!color && !size && change.variantLabel && (
        <Badge variant="outline" className="font-medium text-[11px]">
          {change.variantLabel}
        </Badge>
      )}
    </div>
  );
}

function PriceChangeBlock({ change }: { change: TrackingChangeItem }) {
  const resolved =
    change.priceDisplay ??
    getChangeDiffParts(change.changeType, change.oldValue, change.newValue, {
      profitMarginPercent: change.profitMarginPercent ?? 10,
    }).priceDisplay;
  const lines = formatPricePairLines(resolved);
  if (!lines.costLine && !lines.saleLine) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-2 text-sm">
      {lines.costLine && (
        <div className="rounded-md bg-muted/40 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
            Alış fiyatı
          </p>
          <p className="font-medium">{lines.costLine}</p>
        </div>
      )}
      {lines.saleLine && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-0.5">
            Kârlı satış
            {lines.marginLine ? ` · ${lines.marginLine}` : ""}
          </p>
          <p className="font-medium">{lines.saleLine}</p>
        </div>
      )}
    </div>
  );
}

function ChangeValueBlock({ change }: { change: TrackingChangeItem }) {
  const parts = getChangeDiffParts(change.changeType, change.oldValue, change.newValue, {
    fieldName: change.fieldName,
    variantLabel: change.variantLabel,
    storedReason: change.reason,
    profitMarginPercent: change.profitMarginPercent,
    priceDisplay: change.priceDisplay,
  });
  const isTitle = change.changeType.includes("title");
  const isPrice = change.changeType.includes("price");

  if (isPrice && (change.priceDisplay || parts.priceDisplay)) {
    return <PriceChangeBlock change={change} />;
  }

  if (parts.oldText === "—" && parts.newText === "—") {
    return <p className="text-sm text-muted-foreground">Detay yok</p>;
  }

  if (isTitle || (parts.oldText.length > 40 && parts.newText.length > 40)) {
    return (
      <div className="space-y-2 text-sm">
        {parts.oldText !== "—" && (
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
              {parts.oldLabel}
            </p>
            <p className="text-muted-foreground line-through decoration-muted-foreground/50 break-words">
              {parts.oldText}
            </p>
          </div>
        )}
        {parts.newText !== "—" && (
          <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-0.5">
              {parts.newLabel}
            </p>
            <p className="font-medium text-foreground break-words">{parts.newText}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
      {parts.oldText !== "—" && (
        <span className="text-muted-foreground line-through">{parts.oldText}</span>
      )}
      {parts.oldText !== "—" && parts.newText !== "—" && (
        <span className="text-muted-foreground">→</span>
      )}
      {parts.newText !== "—" && (
        <span className="font-medium text-foreground">{parts.newText}</span>
      )}
    </div>
  );
}

export function TrackingChangeGroupCard({
  changes,
  busy,
  onApprove,
  onIgnore,
  onMarkSeen,
  onShopifySync,
  onApproveMany,
  onShopifySyncMany,
}: Props) {
  const sorted = [...changes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const [expanded, setExpanded] = useState(sorted.length <= 2);
  const product = sorted[0];
  const primary = sorted[0];
  const primaryDiff = getChangeDiffParts(
    primary.changeType,
    primary.oldValue,
    primary.newValue,
    {
      fieldName: primary.fieldName,
      variantLabel: primary.variantLabel,
      storedReason: primary.reason,
      profitMarginPercent: primary.profitMarginPercent,
      priceDisplay: primary.priceDisplay,
    },
  );

  const approvable = sorted.filter(
    (change) => change.status === "pending" || change.status === "manual_review",
  );
  const syncable = sorted.filter(
    (change) =>
      isActionableTrackingChangeStatus(change.status) &&
      isDirectlyApplicableTrackingChange(change.changeType, change.fieldName, change.newValue) &&
      change.trackingUid &&
      change.shopifyProductId,
  );
  const needsReview = approvable.length > 0;
  const reviewCount = sorted.filter((c) => c.status === "manual_review").length;

  const variantsQuery = useQuery({
    queryKey: ["tracking-product-variants", product.trackedProductId],
    queryFn: async () => {
      const res = await fetch(`/api/tracking/products/${product.trackedProductId}/variants`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Varyantlar alınamadı");
      return (data.variants || []) as TrackedVariantRow[];
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  const trackedVariants = variantsQuery.data ?? [];
  const colorOptions = [
    ...new Set(
      trackedVariants
        .map((variant) => variant.option1)
        .filter((value): value is string => Boolean(value) && !isPlaceholderColor(value)),
    ),
  ];
  const exhaustedSizes = trackedVariants.filter((v) => v.currentAvailable === false);

  return (
    <article
      className={`rounded-xl border bg-card/50 overflow-hidden ${
        needsReview ? "border-amber-500/35" : "border-border/60"
      }`}
    >
      <div className="p-4 flex gap-3 sm:gap-4">
        <TrackingProductImage
          imageUrl={product.productImageUrl}
          title={product.productTitle}
          size="lg"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h3 className="font-semibold leading-snug line-clamp-2 text-[15px]">
                {product.productTitle || `Ürün #${product.trackedProductId}`}
              </h3>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="font-normal text-xs">
                  {primaryDiff.headline}
                </Badge>
                {needsReview && (
                  <Badge variant="destructive" className="font-normal text-xs">
                    {reviewCount > 0
                      ? `${reviewCount} kontrol gerekli`
                      : `${approvable.length} bekliyor`}
                  </Badge>
                )}
                {sorted.length > 1 && (
                  <Badge variant="outline" className="font-normal text-xs">
                    {sorted.length} değişiklik
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDate(primary.createdAt)}
                </span>
              </div>

              <p className="text-sm text-foreground/90 leading-snug pt-0.5">
                {primaryDiff.diagnosis}
              </p>
              {!expanded && primary.changeType.includes("price") && (
                <PriceChangeBlock change={primary} />
              )}
              {!expanded && primaryDiff.advice && (
                <p className="text-xs text-muted-foreground">{primaryDiff.advice}</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {syncable.length > 0 && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onShopifySyncMany(syncable.map((change) => change.id))}
                >
                  Shopify&apos;da düzelt
                  {syncable.length > 1 ? ` (${syncable.length})` : ""}
                </Button>
              )}
              {approvable.length > 0 && syncable.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onApproveMany(approvable.map((change) => change.id))}
                >
                  Onayla
                  {approvable.length > 1 ? ` (${approvable.length})` : ""}
                </Button>
              )}
            </div>
          </div>

          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-background/30 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-background/50 transition-colors"
              >
                <span>
                  {expanded ? "Detayları gizle" : "Ne değiştiğini gör"}
                  {sorted.length > 1 ? ` · ${sorted.length} kayıt` : ""}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-3 space-y-3">
              <div className="space-y-2.5">
                {sorted.map((change) => {
                  const canAct =
                    change.status === "pending" || change.status === "manual_review";
                  const canSync =
                    isActionableTrackingChangeStatus(change.status) &&
                    isDirectlyApplicableTrackingChange(
                      change.changeType,
                      change.fieldName,
                      change.newValue,
                    ) &&
                    Boolean(change.trackingUid && change.shopifyProductId);
                  const diff = getChangeDiffParts(
                    change.changeType,
                    change.oldValue,
                    change.newValue,
                    {
                      fieldName: change.fieldName,
                      variantLabel: change.variantLabel,
                      storedReason: change.reason,
                      profitMarginPercent: change.profitMarginPercent,
                      priceDisplay: change.priceDisplay,
                    },
                  );

                  return (
                    <div
                      key={change.id}
                      className="rounded-lg border border-border/50 bg-background/30 p-3 space-y-3"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <VariantOptionBadges change={change} />
                        <Badge variant="secondary" className="font-normal text-[11px]">
                          {diff.headline}
                        </Badge>
                        <Badge
                          variant={changeStatusVariant(change.status)}
                          className="font-normal text-[11px]"
                        >
                          {CHANGE_STATUS_LABELS[change.status] || change.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          {formatDate(change.createdAt)}
                        </span>
                      </div>

                      <p className="text-sm text-foreground/90 leading-snug">{diff.diagnosis}</p>

                      <ChangeValueBlock change={change} />

                      {diff.advice && (
                        <p className="text-xs text-muted-foreground border-l-2 border-border/70 pl-2">
                          {diff.advice}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        {canSync && (
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={busy}
                            onClick={() => onShopifySync(change.id)}
                          >
                            Shopify&apos;da düzelt
                          </Button>
                        )}
                        {canAct && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={busy}
                            onClick={() => onApprove(change.id)}
                          >
                            Onayla
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-muted-foreground"
                          disabled={busy}
                          onClick={() => onMarkSeen(change.id)}
                        >
                          Görüldü
                        </Button>
                        {change.status !== "ignored" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-muted-foreground"
                            disabled={busy}
                            onClick={() => onIgnore(change.id)}
                          >
                            Yok say
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {exhaustedSizes.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 space-y-1.5">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    Tükenen seçenekler (ürün açık)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {exhaustedSizes.map((variant) => {
                      const label =
                        buildTrackingVariantLabel(
                          variant.option1,
                          variant.option2,
                          variant.sourceVariantTitle,
                        ) ||
                        variant.sourceSku ||
                        `#${variant.id}`;
                      return (
                        <Badge
                          key={variant.id}
                          variant="secondary"
                          className="text-[11px] font-normal"
                        >
                          {label} · Tükendi
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {trackedVariants.length > 0 && (
                <details className="rounded-lg border border-border/40 bg-background/20 px-3 py-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground list-none flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
                    <Palette className="w-3.5 h-3.5" />
                    Tüm varyantlar ({trackedVariants.length})
                    {colorOptions.length > 0 ? ` · ${colorOptions.length} renk` : ""}
                  </summary>
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {trackedVariants.slice(0, 24).map((variant) => {
                      const label =
                        buildTrackingVariantLabel(
                          variant.option1,
                          variant.option2,
                          variant.sourceVariantTitle,
                        ) ||
                        variant.sourceSku ||
                        `#${variant.id}`;
                      return (
                        <Badge
                          key={variant.id}
                          variant={variant.currentAvailable === false ? "secondary" : "outline"}
                          className="text-[11px] font-normal"
                        >
                          {label}
                          {variant.currentAvailable === false ? " · Tükendi" : ""}
                        </Badge>
                      );
                    })}
                    {trackedVariants.length > 24 && (
                      <span className="text-[11px] text-muted-foreground self-center">
                        +{trackedVariants.length - 24} daha
                      </span>
                    )}
                  </div>
                </details>
              )}
              {variantsQuery.isLoading && (
                <p className="text-xs text-muted-foreground">Varyantlar yükleniyor…</p>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {product.productUrl && (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                Kaynak <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {product.shopifyProductId && <span>Shopify #{product.shopifyProductId}</span>}
          </div>
        </div>
      </div>
    </article>
  );
}
