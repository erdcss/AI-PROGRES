/** Shopify CSV'ye stokta olmayan varyantların dahil edilip edilmeyeceği */
export function shouldExportOutOfStockVariants(): boolean {
  const raw = process.env.TRENDYOL_EXPORT_OUT_OF_STOCK_VARIANTS?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}
