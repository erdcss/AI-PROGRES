/** Shopify stok miktarı env yapılandırması */
export interface ShopifyInventoryConfig {
  defaultInStockQty: number;
  limitedStockQty: number;
  exportOutOfStockVariants: boolean;
  /** true ise stok bitince satışa devam (CONTINUE); varsayılan false → DENY */
  allowOverselling: boolean;
}

export function getShopifyInventoryConfig(): ShopifyInventoryConfig {
  const defaultInStockQty = parsePositiveInt(
    process.env.SHOPIFY_DEFAULT_IN_STOCK_QTY,
    10,
  );
  const limitedStockQty = parsePositiveInt(
    process.env.SHOPIFY_LIMITED_STOCK_QTY,
    3,
  );
  const raw = process.env.TRENDYOL_EXPORT_OUT_OF_STOCK_VARIANTS?.trim().toLowerCase();
  const exportOutOfStockVariants =
    raw === "true" || raw === "1" || raw === "yes";
  const oversellRaw = process.env.SHOPIFY_ALLOW_OVERSELLING?.trim().toLowerCase();
  const allowOverselling =
    oversellRaw === "true" || oversellRaw === "1" || oversellRaw === "yes";

  return { defaultInStockQty, limitedStockQty, exportOutOfStockVariants, allowOverselling };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
