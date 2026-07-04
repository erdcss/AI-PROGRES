import {
  type CanonicalProduct,
  type CanonicalProductQuality,
  type QualityProvenance,
  PLACEHOLDER_TITLES,
  FAKE_DEFAULTS,
} from "@shared/canonical-product";
import { isValidTrendyolProductTitle } from "../trendyol-title-utils";
import { dedupeTrendyolImages } from "../trendyol-image-identity";
import { extractTrendyolProductId } from "../trendyol-title-utils";
import { detectSyntheticVariantMatrix } from "./canonical-variant-validator.service";

const BLOCKED_TITLE_PATTERNS = [/slicing attribute/i, /^ürün$/i, /^marka$/i];

const VERIFIED_TITLE_SOURCES = new Set([
  "api",
  "html-parser",
  "puppeteer-dom",
  "script-state",
  "direct-html",
  "scenario",
  "post-scenario-html",
]);

const RECOVERABLE_STAGE_ERRORS = new Set([
  "image-proxy-timeout",
  "image-proxy-error",
  "image-fallback-timeout",
  "image-fallback-error",
  "direct-html-timeout",
]);

function buildProvenance(product: CanonicalProduct): QualityProvenance {
  const titleSource = String(product.diagnostics?.titleSource || "unknown");
  const priceSource = String(product.diagnostics?.priceSource || "unknown");
  const imageSource = String(product.diagnostics?.imageSource || "scrape");
  const variantSource = String(product.diagnostics?.variantSource || "unknown");

  const deduped = dedupeTrendyolImages(product.images || []);
  const confirmedVariants = product.variants.filter(
    (v) => v.evidence?.synthetic !== true && v.evidence?.evidenceSource !== "color_size_cross",
  );
  const inferredVariants = product.variants.length - confirmedVariants.length;

  const exactStock = product.variants.filter((v) => v.stockSource === "exact").length;
  const availabilityOnly = product.variants.filter((v) => v.stockSource === "availability_only").length;

  return {
    title: {
      value: product.title,
      source: titleSource,
      confidence: VERIFIED_TITLE_SOURCES.has(titleSource) ? 90 : titleSource === "url-slug" ? 25 : 50,
      verified: VERIFIED_TITLE_SOURCES.has(titleSource),
    },
    price: {
      value: product.sourcePrice ?? product.originalPrice,
      source: priceSource,
      confidence: product.sourcePrice != null ? 85 : 40,
      verified: Boolean(product.diagnostics?.priceVerified),
    },
    images: {
      source: imageSource,
      confidence: deduped.length > 0 ? 80 : 0,
      verifiedCount: deduped.length,
      rawCount: product.images?.length ?? 0,
      uniqueCount: deduped.length,
    },
    variants: {
      source: variantSource,
      confidence: confirmedVariants.length > 0 ? 85 : 30,
      confirmedCount: confirmedVariants.length,
      inferredCount: inferredVariants,
    },
    stock: {
      source: exactStock > 0 ? "exact" : availabilityOnly > 0 ? "availability_only" : "unknown",
      confidence: exactStock > 0 ? 90 : availabilityOnly > 0 ? 60 : 20,
      quantityVerified: exactStock > 0,
      exactCount: exactStock,
      availabilityOnlyCount: availabilityOnly,
    },
  };
}

export function evaluateProductQuality(
  product: CanonicalProduct,
  expectedProductId?: string | null,
): CanonicalProductQuality {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  let score = 100;

  const provenance = buildProvenance(product);
  const title = (product.title || "").trim();
  const titleLower = title.toLowerCase();
  const titleSource = provenance.title.source;

  if (!product.sourceProductId) {
    blockers.push("source_product_id_missing");
    score -= 30;
  } else if (expectedProductId && product.sourceProductId !== expectedProductId) {
    blockers.push("source_product_id_mismatch");
    score -= 40;
  }

  if (!title || title.length < 5) {
    blockers.push("title_missing");
    score -= 25;
  } else if (
    PLACEHOLDER_TITLES.has(titleLower) ||
    BLOCKED_TITLE_PATTERNS.some((p) => p.test(title)) ||
    !isValidTrendyolProductTitle(title)
  ) {
    blockers.push("title_placeholder_or_invalid");
    score -= 30;
  }

  if (titleSource === "url-slug") {
    warnings.push("title_from_url_slug_only");
    score = Math.min(score, 70);
  } else if (!provenance.title.verified) {
    warnings.push("title_not_verified_by_source");
    score -= 15;
  }

  const sourcePrice = product.sourcePrice ?? product.originalPrice;
  if (!sourcePrice || sourcePrice <= 0) {
    blockers.push("price_missing");
    score -= 25;
  } else if (sourcePrice === 100) {
    warnings.push("suspicious_default_price_100");
    score -= 10;
  }

  const variantPrices = product.variants
    .map((v) => v.sourcePrice)
    .filter((p): p is number => p != null && p > 0);
  if (variantPrices.length > 0 && sourcePrice) {
    const mismatch = variantPrices.some((p) => Math.abs(p - sourcePrice) > 0.01 && p !== sourcePrice);
    if (mismatch) {
      warnings.push("variant_source_price_mismatch");
      score = Math.min(score, 75);
    }
  }

  const uniqueImages = provenance.images.uniqueCount;
  if (uniqueImages === 0) {
    blockers.push("no_verified_image");
    score -= 20;
  } else if (provenance.images.rawCount > uniqueImages * 2) {
    warnings.push("high_image_duplicate_ratio");
    score -= 10;
  }

  if (!product.variants || product.variants.length === 0) {
    warnings.push("no_variants");
    score -= 10;
  } else {
    for (const v of product.variants) {
      const size = (v.option2Value || v.option1Value || "").toLowerCase();
      if (size && FAKE_DEFAULTS.has(size)) {
        warnings.push(`fake_size_label:${size}`);
        score -= 5;
      }
      if (v.stockQuantity != null && !v.stockQuantityVerified) {
        blockers.push("synthetic_stock_quantity");
        score -= 25;
        break;
      }
    }

    if (detectSyntheticVariantMatrix(product.variants)) {
      blockers.push("suspected_synthetic_variant_matrix");
      score = Math.min(score, 65);
    }

    if (provenance.variants.inferredCount > 0) {
      warnings.push(`inferred_variants:${provenance.variants.inferredCount}`);
      score = Math.min(score, 65);
    }
  }

  const stageErrors = product.diagnostics?.stageErrors || [];
  const recoveredErrors = (product.diagnostics?.recoveredStageErrors || []) as string[];
  for (const code of stageErrors) {
    if (RECOVERABLE_STAGE_ERRORS.has(code) && recoveredErrors.includes(code)) continue;
    if (RECOVERABLE_STAGE_ERRORS.has(code)) {
      warnings.push(`stage_error:${code}`);
      score -= 3;
    } else if (code && code !== "scenario-error") {
      warnings.push(`stage_error:${code}`);
      score -= 8;
    }
  }

  if (product.diagnostics?.partialSuccess) {
    warnings.push("partial_scrape_success");
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  let status: CanonicalProductQuality["status"] = "blocked";

  if (blockers.length > 0) {
    status = "blocked";
  } else if (titleSource === "url-slug") {
    status = "manual_review";
    score = Math.min(score, 70);
  } else if (score >= 85 && warnings.length === 0) {
    status = "approved";
  } else if (score >= 60) {
    status = "manual_review";
  } else {
    status = "blocked";
  }

  if (titleSource === "url-slug" && status === "approved") {
    status = "manual_review";
  }

  return {
    score,
    status,
    reasons: [...new Set([...blockers, ...reasons])],
    warnings,
    blockers,
    provenance,
    titleSource,
    priceSource: provenance.price.source,
    imageSource: provenance.images.source,
    variantSource: provenance.variants.source,
  };
}

export function qualityAllowsShopifyUpload(quality: CanonicalProductQuality): boolean {
  return quality.status === "approved";
}

export function qualityBlocksShopifyUpload(quality: CanonicalProductQuality): boolean {
  return quality.status === "blocked";
}

export function qualityRequiresManualReview(quality: CanonicalProductQuality): boolean {
  return quality.status === "manual_review" || quality.status === "blocked";
}

export function extractExpectedProductId(url: string): string | null {
  return extractTrendyolProductId(url);
}
