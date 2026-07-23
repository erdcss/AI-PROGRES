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

export function applyProfitMargin(
  sourcePrice: number,
  marginPercent: number | null | undefined,
): number | null {
  if (!Number.isFinite(sourcePrice) || sourcePrice <= 0) return null;
  if (marginPercent == null || !Number.isFinite(marginPercent) || marginPercent < 0) return null;
  return Math.round(sourcePrice * (1 + marginPercent / 100) * 100) / 100;
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
};

export function buildPricePairDisplay(
  oldCost: unknown,
  newCost: unknown,
  marginPercent: number | null | undefined,
): PricePairDisplay {
  const costOld = Number(oldCost);
  const costNew = Number(newCost);
  const margin = marginPercent ?? null;
  return {
    costOld: Number.isFinite(costOld) ? costOld : null,
    costNew: Number.isFinite(costNew) ? costNew : null,
    saleOld: Number.isFinite(costOld) ? applyProfitMargin(costOld, margin) : null,
    saleNew: Number.isFinite(costNew) ? applyProfitMargin(costNew, margin) : null,
    marginPercent: margin,
  };
}
