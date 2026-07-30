/** Kaynak alış fiyatından Shopify kârlı satış fiyatı hesaplama */

export function resolveProfitMarginPercent(input: {
  profitMargin?: number | string | null;
  originalPrice?: number | string | null;
  shopifyPrice?: number | string | null;
  fallbackPercent?: number;
}): number | null {
  const direct = Number(input.profitMargin);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 200) return direct;

  const original = Number(input.originalPrice);
  const shopify = Number(input.shopifyPrice);
  if (Number.isFinite(original) && original > 0 && Number.isFinite(shopify) && shopify > 0) {
    const derived = ((shopify / original) - 1) * 100;
    if (derived >= 0 && derived <= 200) return Math.round(derived * 100) / 100;
  }

  const fallback = input.fallbackPercent;
  if (fallback != null && Number.isFinite(fallback) && fallback >= 0 && fallback <= 200) {
    return fallback;
  }
  return null;
}

/**
 * Transfer marjı ile canlı Shopify fiyatı çelişiyorsa canlıdan türetilen marjı kullan.
 * Örn. beklenen 818,13 ₺ ama Admin'de 822,05 ₺ → marj canlıya göre yeniden hesaplanır.
 */
export function resolveMarginPercentPreferringLive(input: {
  transferProfitMargin?: number | string | null;
  transferOriginalPrice?: number | string | null;
  transferShopifyPrice?: number | string | null;
  baselineCost?: number | null;
  liveSalePrice?: number | null;
  fallbackPercent?: number;
}): number | null {
  const fallback = input.fallbackPercent ?? 10;
  const transferMargin = resolveProfitMarginPercent({
    profitMargin: input.transferProfitMargin,
    originalPrice: input.transferOriginalPrice,
    shopifyPrice: input.transferShopifyPrice,
    fallbackPercent: fallback,
  });

  const baseline = Number(input.baselineCost);
  const live = Number(input.liveSalePrice);
  if (
    Number.isFinite(baseline) &&
    baseline > 0 &&
    Number.isFinite(live) &&
    live > 0 &&
    transferMargin != null
  ) {
    const expected = applyProfitMargin(baseline, transferMargin);
    if (expected != null && Math.abs(expected - live) > 1) {
      const liveMargin = resolveProfitMarginPercent({
        originalPrice: baseline,
        shopifyPrice: live,
        fallbackPercent: transferMargin,
      });
      if (liveMargin != null) return liveMargin;
    }
  }

  // Transfer kaydı yoksa / zayıfsa canlıdan türet
  if (Number.isFinite(baseline) && baseline > 0 && Number.isFinite(live) && live > 0) {
    const liveOnly = resolveProfitMarginPercent({
      originalPrice: baseline,
      shopifyPrice: live,
      fallbackPercent: transferMargin ?? fallback,
    });
    if (liveOnly != null) return liveOnly;
  }

  return transferMargin;
}

export function applyProfitMargin(
  sourcePrice: number,
  marginPercent: number | null | undefined,
): number | null {
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) return null;
  if (marginPercent == null || !Number.isFinite(marginPercent) || marginPercent < 0) return null;
  return Math.round(sourcePrice * (1 + marginPercent / 100) * 100) / 100;
}

/** Canlı Shopify varyant fiyatlarından temsilci satış fiyatı (medyan). */
export function pickRepresentativeShopifyPrice(prices: Array<number | null | undefined>): number | null {
  const valid = prices
    .map((p) => Number(p))
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0
    ? Math.round(((valid[mid - 1]! + valid[mid]!) / 2) * 100) / 100
    : valid[mid]!;
}

export function formatTryPrice(value: number): string {
  return `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ₺`;
}

export type PricePairDisplay = {
  costOld: number | null;
  costNew: number | null;
  saleOld: number | null;
  saleNew: number | null;
  marginPercent: number | null;
  /** saleOld canlı Shopify'dan alındıysa true */
  saleOldFromShopify?: boolean;
};

export function buildPricePairDisplay(
  oldCost: unknown,
  newCost: unknown,
  marginPercent: number | null | undefined,
  options?: { liveSalePrice?: number | null },
): PricePairDisplay {
  const costOld = Number(oldCost);
  const costNew = Number(newCost);
  const margin = marginPercent ?? null;
  const live = Number(options?.liveSalePrice);
  const hasLive = Number.isFinite(live) && live > 0;
  const derivedOld = Number.isFinite(costOld) ? applyProfitMargin(costOld, margin) : null;

  return {
    costOld: Number.isFinite(costOld) ? costOld : null,
    costNew: Number.isFinite(costNew) ? costNew : null,
    saleOld: hasLive ? live : derivedOld,
    saleNew: Number.isFinite(costNew) ? applyProfitMargin(costNew, margin) : null,
    marginPercent: margin,
    saleOldFromShopify: hasLive,
  };
}
