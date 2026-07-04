import type {
  CanonicalProduct,
  CanonicalVariant,
  CanonicalImage,
  VariantEvidence,
} from "@shared/canonical-product";
import { filterValidProductImages } from "../trendyol-image-utils";
import { dedupeTrendyolImages } from "../trendyol-image-identity";
import { extractTrendyolProductId, isValidTrendyolProductTitle } from "../trendyol-title-utils";
import { resolveCanonicalStock } from "../shopify-inventory-qty";
import { calculatePriceWithRules } from "./price-rule-engine.service";
import { evaluateProductQuality } from "./quality-gate.service";
import {
  validateCanonicalVariants,
} from "./canonical-variant-validator.service";

const DEFAULT_COLOR_LABEL = "Tek Renk";

function normalizeSourcePrice(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 0) return raw;
  if (raw && typeof raw === "object") {
    const p = raw as Record<string, unknown>;
    for (const key of ["original", "sale", "value"]) {
      const v = p[key];
      if (typeof v === "number" && v > 0) return v;
    }
    if (typeof p.withProfit === "number" && p.withProfit > 0) {
      const original = (p as { original?: number }).original;
      if (typeof original === "number" && original > 0) return original;
    }
  }
  return null;
}

function mapEvidenceFromRow(
  row: Record<string, unknown>,
  sourceUrl: string,
): VariantEvidence {
  const evidenceSource = String(row.evidenceSource || "unknown") as VariantEvidence["evidenceSource"];
  return {
    sourceVariantId: typeof row.sourceVariantId === "string" ? row.sourceVariantId : null,
    sourceProductId: typeof row.sourceProductId === "string" ? row.sourceProductId : null,
    sourceListingId: typeof row.listingId === "string" ? row.listingId : null,
    evidenceSource,
    evidenceUrl: sourceUrl,
    availabilityVerified: evidenceSource === "all_variants" || evidenceSource === "stock_map" || evidenceSource === "api_listing",
    stockQuantityVerified: typeof row.stockCount === "number" && row.stockCount > 0,
    priceVerified: false,
    synthetic: evidenceSource === "color_size_cross" || evidenceSource === "inferred_matrix",
  };
}

function detectPrimaryColor(title: string | null, sourceUrl: string): string | null {
  const blob = `${title || ""} ${sourceUrl}`.toLowerCase();
  const colorMap: Array<[RegExp, string]> = [
    [/bej/i, "Bej"],
    [/lacivert/i, "Lacivert"],
    [/siyah/i, "Siyah"],
    [/beyaz/i, "Beyaz"],
    [/mavi/i, "Mavi"],
    [/kirmizi|kırmızı/i, "Kırmızı"],
    [/yesil|yeşil/i, "Yeşil"],
    [/gri/i, "Gri"],
    [/turuncu/i, "Turuncu"],
  ];
  for (const [re, label] of colorMap) {
    if (re.test(blob)) return label;
  }
  return null;
}

function mapVariantsFromScrape(
  scrapeResult: Record<string, unknown>,
  sourceUrl: string,
  sourceProductId: string | null,
  sourcePrice: number | null,
): CanonicalVariant[] {
  const variants = scrapeResult.variants as Record<string, unknown> | undefined;
  const allVariants = (variants?.allVariants || variants?.items || []) as Array<Record<string, unknown>>;

  if (!allVariants.length) return [];

  const titleForColor = String(scrapeResult.title || "");
  const primaryColor = detectPrimaryColor(titleForColor, sourceUrl);

  let filtered = allVariants;
  if (primaryColor) {
    const colorVariants = allVariants.filter((v) => {
      const c = String(v.color ?? v.colorName ?? "").trim();
      return c && c.toLowerCase() === primaryColor.toLowerCase();
    });
    if (colorVariants.length >= 1) {
      filtered = colorVariants;
    } else {
      const sizeOnly = allVariants.filter((v) => !v.color && !v.colorName);
      if (sizeOnly.length) filtered = sizeOnly;
    }
  } else if (allVariants.length > 12) {
    const colors = new Set(
      allVariants.map((v) => String(v.color ?? v.colorName ?? "").trim()).filter(Boolean),
    );
    if (colors.size > 3) {
      filtered = allVariants.filter((v) => !v.color && !v.colorName);
    }
  }

  const rows: CanonicalVariant[] = [];
  for (const v of filtered) {
    const color = String(v.color ?? v.colorName ?? "").trim();
    const size = String(v.size ?? v.sizeName ?? "").trim();
    if (!size) continue;

    const stock = resolveCanonicalStock({
      inStock: v.inStock !== false,
      stockCount: typeof v.stockCount === "number" ? v.stockCount : null,
      sourceStockQty: typeof v.sourceStockQty === "number" ? v.sourceStockQty : null,
    });

    const variantSourcePrice =
      typeof v.price === "number" && v.price > 0 ? v.price : sourcePrice;

    const colorProductId =
      typeof v.colorProductId === "string"
        ? v.colorProductId
        : typeof v.productId === "string"
          ? v.productId
          : sourceProductId;

    const sku =
      typeof v.sku === "string"
        ? v.sku
        : color && color !== DEFAULT_COLOR_LABEL
          ? `TY-${colorProductId}-${color.toLowerCase()}-${size.toLowerCase()}`
          : `TY-${colorProductId}-${size.toLowerCase()}`;

    rows.push({
      sourceVariantId: typeof v.variantId === "string" ? v.variantId : sku,
      option1Name: color ? "Renk" : "Beden",
      option1Value: color || size,
      option2Name: color ? "Beden" : null,
      option2Value: color ? size : null,
      option3Name: null,
      option3Value: null,
      sku,
      price: variantSourcePrice,
      sourcePrice: variantSourcePrice,
      calculatedShopifyPrice: null,
      sourcePriceVerified: variantSourcePrice === sourcePrice,
      available: stock.available,
      stockQuantity: stock.stockQuantity,
      stockSource: stock.stockSource,
      stockConfidence: stock.stockConfidence,
      stockQuantityVerified: stock.stockQuantityVerified,
      imageUrl: typeof v.image === "string" ? v.image : null,
      evidence: {
        ...mapEvidenceFromRow(v, sourceUrl),
        sourceProductId: colorProductId,
        colorProductId,
      },
    });
  }

  const hasNamedColors = rows.some(
    (r) => r.option1Value && r.option1Value !== DEFAULT_COLOR_LABEL,
  );
  if (hasNamedColors) {
    return rows.filter(
      (r) => r.option1Value !== DEFAULT_COLOR_LABEL && r.option2Value !== DEFAULT_COLOR_LABEL,
    );
  }

  return rows;
}

export function normalizeScrapeToCanonicalProduct(
  scrapeResult: Record<string, unknown>,
  sourceUrl: string,
  sourcePlatform = "trendyol",
): CanonicalProduct {
  const url = String(scrapeResult.sourceUrl || scrapeResult.originalUrl || sourceUrl);
  const sourceProductId =
    String(scrapeResult.sourceProductId || scrapeResult.urlProductId || "") ||
    extractTrendyolProductId(url) ||
    null;

  const titleRaw = String(scrapeResult.title || "").trim();
  const title =
    titleRaw && isValidTrendyolProductTitle(titleRaw) ? titleRaw : null;

  const sourcePrice = normalizeSourcePrice(scrapeResult.price);
  const rawImages = filterValidProductImages(scrapeResult.images);
  const deduped = dedupeTrendyolImages(rawImages, String(scrapeResult.imageSource || "scrape"));
  const imageDetails: CanonicalImage[] = deduped.map((img) => ({
    url: img.url,
    identity: img.identity,
    source: img.source,
    productId: sourceProductId,
    verified: img.verified,
  }));

  let variants = mapVariantsFromScrape(scrapeResult, url, sourceProductId, sourcePrice);
  const validation = validateCanonicalVariants(variants);
  variants = validation.valid;

  const priceRule = sourcePrice
    ? calculatePriceWithRules({ sourcePrice, rules: [] })
  : null;

  const calculatedShopifyPrice = priceRule?.calculatedPrice ?? null;

  variants = variants.map((v) => ({
    ...v,
    calculatedShopifyPrice:
      calculatedShopifyPrice && v.sourcePrice === sourcePrice
        ? calculatedShopifyPrice
        : v.sourcePrice,
  }));

  const colors = [...new Set(variants.map((v) => v.option1Value).filter(Boolean))] as string[];
  const sizes = [...new Set(variants.map((v) => v.option2Value).filter(Boolean))] as string[];

  const options: CanonicalProduct["options"] = [];
  if (colors.length > 0) options.push({ name: "Renk", values: colors });
  if (sizes.length > 0) options.push({ name: "Beden", values: sizes });

  const stageErrors = Array.isArray(scrapeResult.stageErrors)
    ? (scrapeResult.stageErrors as string[])
    : undefined;
  const recoveredStageErrors = Array.isArray(scrapeResult.recoveredStageErrors)
    ? (scrapeResult.recoveredStageErrors as string[])
    : undefined;

  const product: CanonicalProduct = {
    sourcePlatform,
    sourceUrl: url,
    sourceProductId,
    title,
    brand: scrapeResult.brand ? String(scrapeResult.brand) : null,
    category: scrapeResult.category ? String(scrapeResult.category) : null,
    description: scrapeResult.description ? String(scrapeResult.description) : null,
    currency: "TRY",
    sourcePrice,
    sourceOriginalPrice: sourcePrice,
    originalPrice: sourcePrice,
    sellingPrice: sourcePrice,
    calculatedShopifyPrice,
    priceRuleResult: priceRule?.calculatedPrice
      ? {
          sourcePrice: sourcePrice!,
          calculatedPrice: priceRule.calculatedPrice,
        }
      : null,
    images: deduped.map((i) => i.url),
    imageDetails,
    options,
    variants,
    blockedVariants: validation.blocked,
    features: Array.isArray(scrapeResult.features)
      ? (scrapeResult.features as Array<{ key: string; value: string }>)
      : [],
    tags: Array.isArray(scrapeResult.tags) ? (scrapeResult.tags as string[]) : [],
    quality: null,
    diagnostics: {
      extractionMethod: scrapeResult.extractionMethod
        ? String(scrapeResult.extractionMethod)
        : undefined,
      stageErrors,
      recoveredStageErrors,
      pipelineDurationMs:
        typeof scrapeResult.pipelineDurationMs === "number"
          ? scrapeResult.pipelineDurationMs
          : undefined,
      partialSuccess: scrapeResult.partialSuccess === true,
      titleSource: scrapeResult.titleSource ? String(scrapeResult.titleSource) : undefined,
      priceSource: scrapeResult.priceSource ? String(scrapeResult.priceSource) : "scrape",
      imageSource: scrapeResult.imageSource ? String(scrapeResult.imageSource) : "scrape",
      variantSource: variants.length ? "all_variants" : "unknown",
      priceVerified: sourcePrice != null,
      uniqueImageCount: deduped.length,
      rawImageCount: rawImages.length,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
      suspectedSyntheticMatrix: validation.suspectedSyntheticMatrix,
      scrapeRunId: scrapeResult.scrapeRunId ? String(scrapeResult.scrapeRunId) : undefined,
    },
  };

  product.quality = evaluateProductQuality(product, extractTrendyolProductId(url));

  return product;
}

function extractTrendyolProductId(url: string): string | null {
  const m = url.match(/p-(\d+)/);
  return m?.[1] ?? null;
}

