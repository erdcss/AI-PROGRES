import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ExternalLink, Layers3, Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CHANGE_STATUS_LABELS,
  CHANGE_TYPE_LABELS,
  changeStatusVariant,
  formatChangeDiff,
} from "./format-change-value";
import { TrackingProductImage } from "./TrackingProductImage";
import type { TrackingChangeItem } from "./TrackingChangeCard";
import {
  buildTrackingVariantLabel,
  isPlaceholderColor,
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
  const [expanded, setExpanded] = useState(false);
  const sorted = [...changes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const product = sorted[0];
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

  const statusCounts = sorted.reduce<Record<string, number>>((counts, change) => {
    counts[change.status] = (counts[change.status] || 0) + 1;
    return counts;
  }, {});

  return (
    <article
      className={`rounded-xl border bg-card/50 overflow-hidden ${
        needsReview ? "border-amber-500/40" : "border-border/60"
      }`}
    >
      <div className="p-4 flex gap-4">
        <TrackingProductImage
          imageUrl={product.productImageUrl}
          title={product.productTitle}
          size="lg"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold leading-snug line-clamp-2 text-[15px]">
                {product.productTitle || `Ürün #${product.trackedProductId}`}
              </h3>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Layers3 className="w-3 h-3" />
                  {sorted.length} değişiklik
                </Badge>
                {Object.entries(statusCounts).map(([status, count]) => (
                  <Badge
                    key={status}
                    variant={changeStatusVariant(status)}
                    className="font-normal text-xs"
                  >
                    {CHANGE_STATUS_LABELS[status] || status}: {count}
                  </Badge>
                ))}
                <span className="text-xs text-muted-foreground">
                  Son değişiklik {formatDate(sorted[0].createdAt)}
                </span>
                {colorOptions.length > 0 && (
                  <Badge variant="outline" className="gap-1 font-normal text-[11px]">
                    <Palette className="w-3 h-3" />
                    {colorOptions.length} renk
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              {approvable.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onApproveMany(approvable.map((change) => change.id))}
                >
                  Tümünü onayla ({approvable.length})
                </Button>
              )}
              {syncable.length > 0 && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => onShopifySyncMany(syncable.map((change) => change.id))}
                >
                  Shopify&apos;da düzelt ({syncable.length})
                </Button>
              )}
            </div>
          </div>

          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-between border-border/50 bg-background/25 px-3 font-normal"
              >
                <span className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-muted-foreground" />
                  Varyant ve değişiklikleri {expanded ? "gizle" : "göster"}
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                    {sorted.length}
                  </Badge>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    expanded ? "rotate-180" : ""
                  }`}
                />
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-2 space-y-2">
              {variantsQuery.isLoading && (
                <p className="text-xs text-muted-foreground px-1">Varyantlar yükleniyor…</p>
              )}
              {trackedVariants.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-background/25 p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5" />
                    Takip edilen varyantlar ({trackedVariants.length})
                  </p>
                  {colorOptions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {colorOptions.map((color) => (
                        <Badge key={color} variant="outline" className="text-[11px] font-normal">
                          {color}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {trackedVariants.slice(0, 12).map((variant) => {
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
                    {trackedVariants.length > 12 && (
                      <span className="text-[11px] text-muted-foreground self-center">
                        +{trackedVariants.length - 12} daha
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="divide-y divide-border/50 rounded-lg border border-border/50 bg-background/25">
                {sorted.map((change) => {
                  const canAct = change.status === "pending" || change.status === "manual_review";
                  const canSync =
                    isActionableTrackingChangeStatus(change.status) &&
                    isDirectlyApplicableTrackingChange(
                      change.changeType,
                      change.fieldName,
                      change.newValue,
                    ) &&
                    Boolean(change.trackingUid && change.shopifyProductId);

                  return (
                    <div key={change.id} className="px-3 py-2.5">
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {change.variantLabel && (
                              <Badge variant="outline" className="font-medium text-[11px]">
                                {change.variantLabel}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="font-normal text-[11px]">
                              {CHANGE_TYPE_LABELS[change.changeType] || change.changeType}
                            </Badge>
                            <Badge
                              variant={changeStatusVariant(change.status)}
                              className="font-normal text-[11px]"
                            >
                              {CHANGE_STATUS_LABELS[change.status] || change.status}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatDate(change.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm mt-1 break-words">
                            {formatChangeDiff(change.changeType, change.oldValue, change.newValue)}
                          </p>
                          {!change.variantLabel && change.variantSku && (
                            <p className="text-[11px] text-muted-foreground mt-1">
                              SKU: {change.variantSku}
                            </p>
                          )}
                          {change.reason && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex gap-1">
                              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                              {change.reason}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {canAct && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={busy}
                              onClick={() => onApprove(change.id)}
                            >
                              Onayla
                            </Button>
                          )}
                          {canSync && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              disabled={busy}
                              onClick={() => onShopifySync(change.id)}
                            >
                              Shopify&apos;da düzelt
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            disabled={busy}
                            onClick={() => onMarkSeen(change.id)}
                          >
                            Görüldü
                          </Button>
                          {change.status !== "ignored" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-muted-foreground"
                              disabled={busy}
                              onClick={() => onIgnore(change.id)}
                            >
                              Yok say
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-3 text-muted-foreground">
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
      </div>
    </article>
  );
}
