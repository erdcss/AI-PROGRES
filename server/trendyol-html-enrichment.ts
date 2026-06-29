/**
 * Trendyol HTML'den beden/stok ve ürün özellikleri — Puppeteer gerektirmez.
 */
import type { CheerioAPI } from "cheerio";
import { getTrendyolProductFromState } from "./trendyol-product-state";
import { extractTrendyolFeatures } from "./trendyol-features-extractor";
import type { SanitizedVariants } from "@shared/trendyol-variant-utils";

export interface TrendyolStockAnalysis {
  totalVariants: number;
  inStockVariants: number;
  outOfStockVariants: number;
  availableSizes: string[];
  unavailableSizes: string[];
}

function pushFeature(
  features: Array<{ key: string; value: string }>,
  seen: Set<string>,
  key: string,
  value: unknown,
): void {
  const k = String(key || "").trim();
  const v = String(value ?? "").trim();
  if (!k || !v || k.length > 80 || v.length > 300) return;
  const kl = k.toLowerCase();
  if (seen.has(kl) || kl.includes("fiyat") || kl.includes("price")) return;
  seen.add(kl);
  features.push({ key: k, value: v });
}

function extractFeaturesFromProductState(
  product: Record<string, unknown>,
): Array<{ key: string; value: string }> {
  const features: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();

  const arraySources = [
    product.attributes,
    product.productAttributes,
    product.specifications,
    product.specs,
    product.contentDescriptions,
    product.productFeatures,
  ];

  for (const source of arraySources) {
    if (!Array.isArray(source)) continue;
    for (const attr of source) {
      if (!attr || typeof attr !== "object") continue;
      const a = attr as Record<string, unknown>;
      const key = String(
        a.key ?? a.attributeKey ?? a.name ?? a.label ?? a.title ?? "",
      ).trim();
      const value = String(
        a.value ?? a.attributeValue ?? a.text ?? a.description ?? "",
      ).trim();
      pushFeature(features, seen, key, value);
    }
  }

  const colorAttr = Array.isArray(product.attributes)
    ? (product.attributes as Array<Record<string, unknown>>).find((a) => {
        const k = String(a.key ?? a.attributeKey ?? a.name ?? "").toLowerCase();
        return k === "renk" || k === "color";
      })
    : null;
  if (colorAttr) {
    pushFeature(
      features,
      seen,
      "Renk",
      colorAttr.value ?? colorAttr.attributeValue,
    );
  }

  return features;
}

export function extractTrendyolEnrichmentFeatures(
  html: string,
  $: CheerioAPI,
): Array<{ key: string; value: string }> {
  const features: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();

  const product = getTrendyolProductFromState(html);
  if (product) {
    for (const f of extractFeaturesFromProductState(product)) {
      pushFeature(features, seen, f.key, f.value);
    }
  }

  for (const f of extractTrendyolFeatures(html)) {
    pushFeature(features, seen, f.key, f.value);
  }

  $(
    ".product-detail-attributes .detail-attr-item, .detail-attr-item, .product-feature-list li",
  ).each((_, el) => {
    const keyEl = $(el).find(".detail-attr-item-key, .attr-name").first();
    const valueEl = $(el).find(".detail-attr-item-value, .attr-value").first();
    if (keyEl.length && valueEl.length) {
      pushFeature(features, seen, keyEl.text(), valueEl.text());
      return;
    }
    const text = $(el).text().trim();
    const colon = text.indexOf(":");
    if (colon > 0 && colon < text.length - 1) {
      pushFeature(features, seen, text.slice(0, colon), text.slice(colon + 1));
    }
  });

  return features;
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
