/**
 * Trendyol HTML'den beden/stok ve ürün özellikleri — Puppeteer gerektirmez.
 */
import type { CheerioAPI } from "cheerio";
import { extractTrendyolProductFeatures } from "./product-attributes";
import type { SanitizedVariants } from "@shared/trendyol-variant-utils";

export interface TrendyolStockAnalysis {
  totalVariants: number;
  inStockVariants: number;
  outOfStockVariants: number;
  availableSizes: string[];
  unavailableSizes: string[];
}

export function extractTrendyolEnrichmentFeatures(
  html: string,
  $: CheerioAPI,
): Array<{ key: string; value: string }> {
  return extractTrendyolProductFeatures(html, $);
}

export function buildStockAnalysisFromVariants(
  variants: SanitizedVariants,
): TrendyolStockAnalysis | null {
  const allVariants = variants.allVariants || [];
  if (allVariants.length === 0) return null;

  const inStock = allVariants.filter((v) => v.inStock !== false);
  const outOfStock = allVariants.filter((v) => v.inStock === false);

  const allSizes = [
    ...new Set(allVariants.map((v) => v.size).filter((s) => s && s.trim())),
  ];
  const availableSizes = [
    ...new Set(inStock.map((v) => v.size).filter((s) => s && s.trim())),
  ];
  const unavailableSizes = allSizes.filter((s) => !availableSizes.includes(s));

  return {
    totalVariants: allVariants.length,
    inStockVariants: inStock.length,
    outOfStockVariants: outOfStock.length,
    availableSizes,
    unavailableSizes,
  };
}
