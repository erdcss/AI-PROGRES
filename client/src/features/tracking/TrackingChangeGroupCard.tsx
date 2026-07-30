import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, History, MoreHorizontal, Palette, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { isShopifySyncableTrackingChange } from "@shared/tracking-change-policy";
import { formatTryPrice } from "@shared/tracking-price-display";
import {
  buildProductTrackingTimeline,
  formatTrackingDateTime,
} from "./tracking-timeline";

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
  rechecking?: boolean;
  onApprove: (id: number) => void;
  onIgnore: (id: number) => void;
  onMarkSeen: (id: number) => void;
  onShopifySync: (id: number) => void;
  onApproveMany: (ids: number[]) => void;
  onShopifySyncMany: (ids: number[]) => void;
  onRecheck: () => void;
};

function variantLabel(change: TrackingChangeItem): string | null {
  const color =
    change.variantColor && !isPlaceholderColor(change.variantColor)
      ? change.variantColor
      : null;
  const size =
    change.variantSize && !isPlaceholderSize(change.variantSize) ? change.variantSize : null;
  if (color && size) return `${color} · ${size}`;
  if (color) return color;
  if (size) return size;
  return change.variantLabel || null;
}

function canSyncChange(change: TrackingChangeItem): boolean {
  return isShopifySyncableTrackingChange(change);
}

/**
 * Anlık "Shopify'da düzelt": ürün fiyatı varsa yalnızca en yenisi +
 * gerçekten uygulanabilir yan kayıtlar (bağlı OOS / başlık).
 */
export function selectInstantShopifySyncIds(changes: TrackingChangeItem[]): number[] {
  const syncable = changes.filter(canSyncChange);
  const newestProductPrice = syncable
    .filter((c) => c.changeType === "price_changed")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  const ids: number[] = [];
  if (newestProductPrice) {
    ids.push(newestProductPrice.id);
    for (const change of syncable) {
      if (change.id === newestProductPrice.id) continue;
      if (
        change.changeType === "price_changed" ||
        change.changeType === "variant_price_changed"
      ) {
        continue;
      }
      ids.push(change.id);
    }
    return ids;
  }

  const seenVariantPrice = new Set<string>();
  const ordered = [...syncable].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const change of ordered) {
    if (change.changeType === "variant_price_changed") {
      const key = String(change.trackedVariantId ?? change.shopifyVariantId ?? change.id);
      if (seenVariantPrice.has(key)) continue;
      seenVariantPrice.add(key);
    }
    ids.push(change.id);
  }
  return ids;
}

function canActOnChange(change: TrackingChangeItem): boolean {
  return change.status === "pending" || change.status === "manual_review";
}

function ChangeRowActions({
  change,
  busy,
  onApprove,
  onIgnore,
  onMarkSeen,
  onShopifySync,
}: {
  change: TrackingChangeItem;
  busy?: boolean;
  onApprove: (id: number) => void;
  onIgnore: (id: number) => void;
  onMarkSeen: (id: number) => void;
  onShopifySync: (id: number) => void;
}) {
  const canAct = canActOnChange(change);
  const canSync = canSyncChange(change);

  return (
    <div className="flex items-center gap-1 shrink-0">
      {canSync && (
        <Button
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={busy}
          onClick={() => onShopifySync(change.id)}
        >
          {busy ? "…" : "Düzelt"}
        </Button>
      )}
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
          {canAct && (
            <DropdownMenuItem onClick={() => onApprove(change.id)}>Onayla</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => onMarkSeen(change.id)}>Görüldü</DropdownMenuItem>
          {change.status !== "ignored" && (
            <DropdownMenuItem onClick={() => onIgnore(change.id)}>Yok say</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProductMovementsDialog({
  open,
  onOpenChange,
  product,
  changes,
  busy,
  onApprove,
  onIgnore,
  onMarkSeen,
  onShopifySync,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: TrackingChangeItem;
  changes: TrackingChangeItem[];
  busy?: boolean;
  onApprove: (id: number) => void;
  onIgnore: (id: number) => void;
  onMarkSeen: (id: number) => void;
  onShopifySync: (id: number) => void;
}) {
  const sorted = [...changes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latestApplied =
    sorted
      .map((c) => c.appliedAt)
      .filter((at): at is string => Boolean(at))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ??
    product.productLastShopifySyncAt ??
    null;

  const timelinePoints = buildProductTrackingTimeline({
    productCreatedAt: product.productCreatedAt,
    shopifyTransferredAt: product.shopifyTransferredAt,
    changeDetectedAt: sorted[0]?.createdAt,
    changeAppliedAt: latestApplied,
    productLastCheckedAt: product.productLastCheckedAt,
    productLastSuccessAt: product.productLastSuccessAt,
    productLastShopifySyncAt: product.productLastShopifySyncAt,
  });

  const variantsQuery = useQuery({
    queryKey: ["tracking-product-variants", product.trackedProductId],
    queryFn: async () => {
      const res = await fetch(`/api/tracking/products/${product.trackedProductId}/variants`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Varyantlar alınamadı");
      return (data.variants || []) as TrackedVariantRow[];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const trackedVariants = variantsQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">Ürün hareketleri</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {product.productTitle || `Ürün #${product.trackedProductId}`}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Zaman çizelgesi
          </h4>
          {timelinePoints.length === 0 ? (
            <p className="text-sm text-muted-foreground">Kayıtlı zaman bilgisi yok.</p>
          ) : (
            <div className="rounded-lg border border-border/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Olay</th>
                    <th className="px-3 py-2 font-medium tabular-nums">Tarih / saat</th>
                  </tr>
                </thead>
                <tbody>
                  {timelinePoints.map((point) => (
                    <tr
                      key={`${point.label}-${String(point.at)}`}
                      className="border-t border-border/40"
                    >
                      <td className="px-3 py-2 text-foreground/90">{point.label}</td>
                      <td className="px-3 py-2 tabular-nums text-foreground/85">
                        {formatTrackingDateTime(point.at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Değişiklik kayıtları ({sorted.length})
          </h4>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Değişiklik</th>
                  <th className="px-3 py-2 font-medium">Detay</th>
                  <th className="px-3 py-2 font-medium">Durum</th>
                  <th className="px-3 py-2 font-medium tabular-nums">Tespit</th>
                  <th className="px-3 py-2 font-medium tabular-nums">Shopify</th>
                  <th className="px-3 py-2 font-medium w-[1%]" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((change) => {
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
                  const label = variantLabel(change);
                  const price =
                    change.priceDisplay ??
                    (change.changeType.includes("price") ? diff.priceDisplay : null);
                  const saleTarget =
                    price?.saleNew != null ? formatTryPrice(price.saleNew) : null;
                  const costPair = formatPricePairLines(price).costLine;
                  const detail =
                    change.changeType.includes("price") && (costPair || saleTarget)
                      ? [costPair && `Alış ${costPair}`, saleTarget && `Satış ${saleTarget}`]
                          .filter(Boolean)
                          .join(" · ")
                      : diff.diagnosis;

                  return (
                    <tr key={change.id} className="border-t border-border/40 align-top">
                      <td className="px-3 py-2.5">
                        <div className="space-y-0.5">
                          {label && (
                            <p className="text-xs font-medium text-foreground/90">{label}</p>
                          )}
                          <p className="text-foreground/85">{diff.headline}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground max-w-[14rem]">
                        <p className="leading-snug">{detail}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          variant={changeStatusVariant(change.status)}
                          className="font-normal text-[10px] h-5 px-1.5"
                        >
                          {CHANGE_STATUS_LABELS[change.status] || change.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-foreground/85">
                        {formatTrackingDateTime(change.createdAt)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap text-foreground/85">
                        {formatTrackingDateTime(change.appliedAt)}
                      </td>
                      <td className="px-3 py-2.5">
                        <ChangeRowActions
                          change={change}
                          busy={busy}
                          onApprove={onApprove}
                          onIgnore={onIgnore}
                          onMarkSeen={onMarkSeen}
                          onShopifySync={onShopifySync}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {trackedVariants.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              Varyantlar ({trackedVariants.length})
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {trackedVariants.map((variant) => {
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
            </div>
          </section>
        )}
        {variantsQuery.isLoading && (
          <p className="text-xs text-muted-foreground">Varyantlar yükleniyor…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function TrackingChangeGroupCard({
  changes,
  busy,
  rechecking,
  onApprove,
  onIgnore,
  onMarkSeen,
  onShopifySync,
  onApproveMany,
  onShopifySyncMany,
  onRecheck,
}: Props) {
  const sorted = [...changes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const [movementsOpen, setMovementsOpen] = useState(false);
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

  const approvable = sorted.filter(canActOnChange);
  const syncable = sorted.filter(canSyncChange);
  const instantSyncIds = selectInstantShopifySyncIds(sorted);
  const needsReview = approvable.length > 0;
  const reviewCount = sorted.filter((c) => c.status === "manual_review").length;
  const syncBusy = Boolean(busy);

  return (
    <article
      className={`rounded-2xl border bg-card/40 ${
        needsReview ? "border-amber-500/30" : "border-border/50"
      }`}
    >
      <div className="p-4 sm:p-5 flex gap-3 sm:gap-4">
        <TrackingProductImage
          imageUrl={product.productImageUrl}
          title={product.productTitle}
          size="md"
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex gap-3 items-start justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="font-semibold leading-snug line-clamp-2 text-[15px]">
                {product.productTitle || `Ürün #${product.trackedProductId}`}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="text-foreground/85 font-medium">{primaryDiff.headline}</span>
                {needsReview && (
                  <Badge variant="destructive" className="font-normal text-[10px] h-5 px-1.5">
                    {reviewCount > 0
                      ? `${reviewCount} kontrol`
                      : `${approvable.length} bekliyor`}
                  </Badge>
                )}
                {sorted.length > 1 && <span>{sorted.length} kayıt</span>}
              </div>
              <p className="text-sm text-foreground/80 leading-snug line-clamp-2">
                {primaryDiff.diagnosis}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 shrink-0 items-stretch sm:items-start">
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => setMovementsOpen(true)}
              >
                <History className="w-3.5 h-3.5 mr-1" />
                Ürün hareketleri
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={busy || rechecking}
                title="Kaynak URL'yi tekrar kontrol et"
                onClick={onRecheck}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${rechecking ? "animate-spin" : ""}`} />
                {rechecking ? "Kontrol ediliyor…" : "Tekrar kontrol et"}
              </Button>
              {instantSyncIds.length > 0 ? (
                <Button
                  size="sm"
                  className="shrink-0 min-w-[9.5rem]"
                  disabled={syncBusy || rechecking}
                  onClick={() => onShopifySyncMany(instantSyncIds)}
                >
                  {syncBusy
                    ? "Güncelleniyor…"
                    : instantSyncIds.length > 1
                      ? `Shopify'da düzelt (${instantSyncIds.length})`
                      : "Shopify'da düzelt"}
                </Button>
              ) : approvable.length > 0 ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={busy || rechecking}
                  onClick={() => onApproveMany(approvable.map((change) => change.id))}
                >
                  Onayla
                  {approvable.length > 1 ? ` (${approvable.length})` : ""}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-0.5">
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
            {approvable.length > 0 && syncable.length > 0 && (
              <button
                type="button"
                className="hover:text-foreground transition-colors disabled:opacity-50"
                disabled={busy}
                onClick={() => onApproveMany(approvable.map((c) => c.id))}
              >
                Toplu onayla
              </button>
            )}
            {sorted.some((c) => c.status !== "ignored") && (
              <button
                type="button"
                className="hover:text-foreground transition-colors disabled:opacity-50"
                disabled={busy}
                onClick={() => sorted.forEach((c) => onMarkSeen(c.id))}
              >
                Görüldü
              </button>
            )}
          </div>
        </div>
      </div>

      <ProductMovementsDialog
        open={movementsOpen}
        onOpenChange={setMovementsOpen}
        product={product}
        changes={sorted}
        busy={busy}
        onApprove={onApprove}
        onIgnore={onIgnore}
        onMarkSeen={onMarkSeen}
        onShopifySync={onShopifySync}
      />
    </article>
  );
}
