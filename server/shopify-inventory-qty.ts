import { getShopifyInventoryConfig } from "@shared/shopify-inventory-config";

export interface InventoryQtyVariantInput {
  inStock?: boolean;
  sourceStockQty?: number | null;
  stockCount?: number | null;
}

/** Trendyol stok metninden son adet sayısını çıkarır */
export function parseLastFewStock(productStockText?: string | null): number | null {
  if (!productStockText || typeof productStockText !== "string") return null;
  const text = productStockText.trim();

  const sonMatch = text.match(/son\s*(\d+)\s*ürün/i);
  if (sonMatch) {
    const n = Number.parseInt(sonMatch[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  if (/5\s*adetten\s*az/i.test(text) || /az\s*stok/i.test(text)) {
    return getShopifyInventoryConfig().limitedStockQty;
  }

  const adetMatch = text.match(/(\d+)\s*adet/i);
  if (adetMatch) {
    const n = Number.parseInt(adetMatch[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return null;
}

/** Merkezi stok miktarı çözümleyici — Shopify export için */
export function resolveInventoryQty(
  variant: InventoryQtyVariantInput,
  productStockText?: string | null,
  config = getShopifyInventoryConfig(),
): number {
  if (typeof variant.sourceStockQty === "number" && variant.sourceStockQty > 0) {
    return variant.sourceStockQty;
  }

  if (typeof variant.stockCount === "number" && variant.stockCount > 0) {
    return variant.stockCount;
  }

  const lastQty = parseLastFewStock(productStockText);
  if (lastQty && lastQty > 0) {
    return lastQty;
  }

  if (variant.inStock) {
    return config.defaultInStockQty;
  }

  return 0;
}

/** Canonical model — gerçek miktar yalnız doğrulanmışsa sayı döner */
export function resolveCanonicalStock(variant: InventoryQtyVariantInput): {
  stockQuantity: number | null;
  available: boolean | null;
  stockSource: "exact" | "availability_only" | "unknown";
  stockConfidence: number;
  stockQuantityVerified: boolean;
} {
  if (typeof variant.sourceStockQty === "number" && variant.sourceStockQty > 0) {
    return {
      stockQuantity: variant.sourceStockQty,
      available: true,
      stockSource: "exact",
      stockConfidence: 95,
      stockQuantityVerified: true,
    };
  }

  if (typeof variant.stockCount === "number" && variant.stockCount > 0) {
    return {
      stockQuantity: variant.stockCount,
      available: true,
      stockSource: "exact",
      stockConfidence: 90,
      stockQuantityVerified: true,
    };
  }

  if (variant.inStock === true) {
    return {
      stockQuantity: null,
      available: true,
      stockSource: "availability_only",
      stockConfidence: 55,
      stockQuantityVerified: false,
    };
  }

  if (variant.inStock === false) {
    return {
      stockQuantity: 0,
      available: false,
      stockSource: "availability_only",
      stockConfidence: 80,
      stockQuantityVerified: false,
    };
  }

  return {
    stockQuantity: null,
    available: null,
    stockSource: "unknown",
    stockConfidence: 0,
    stockQuantityVerified: false,
  };
}
