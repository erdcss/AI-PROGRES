import type { CanonicalVariant } from "@shared/canonical-product";

const TEK_RENK = /tek\s*renk/i;
const NAMED_COLOR_SKIP = new Set(["tek renk", "standart", "varsayılan", "default"]);

export type VariantValidationResult = {
  valid: CanonicalVariant[];
  blocked: CanonicalVariant[];
  errors: string[];
  warnings: string[];
  suspectedSyntheticMatrix: boolean;
};

function isTekRenk(value: string | null | undefined): boolean {
  return Boolean(value && TEK_RENK.test(value.trim()));
}

function isNamedColor(value: string | null | undefined): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return !NAMED_COLOR_SKIP.has(lower) && !TEK_RENK.test(lower);
}

/** Cartesian / uydurma varyant matrisi tespiti */
export function detectSyntheticVariantMatrix(variants: CanonicalVariant[]): boolean {
  if (variants.length < 6) return false;

  const colors = new Set(
    variants.map((v) => v.option1Value || v.option2Value).filter(isNamedColor),
  );
  const sizes = new Set(
    variants.map((v) => v.option2Value || v.option1Value).filter((s) => s && !isNamedColor(s)),
  );

  const hasTekRenk = variants.some(
    (v) => isTekRenk(v.option1Value) || isTekRenk(v.option2Value),
  );
  const hasNamedColors = variants.some(
    (v) => isNamedColor(v.option1Value) || isNamedColor(v.option2Value),
  );
  if (hasTekRenk && hasNamedColors) return true;

  const stockQtys = variants.map((v) => v.stockQuantity).filter((q) => q != null);
  const allSameStock =
    stockQtys.length === variants.length &&
    stockQtys.length > 0 &&
    new Set(stockQtys).size === 1;

  const prices = variants.map((v) => v.sourcePrice ?? v.price).filter((p) => p != null);
  const allSamePrice = prices.length > 0 && new Set(prices).size === 1;

  const allImagesNull = variants.every((v) => !v.imageUrl);
  const allAvailable = variants.every((v) => v.available === true);

  const noListingEvidence = variants.every(
    (v) => !v.evidence?.sourceListingId && v.evidence?.evidenceSource !== "api_listing",
  );

  const expectedCartesian = colors.size * sizes.size;
  const looksCartesian =
    colors.size >= 2 &&
    sizes.size >= 2 &&
    variants.length >= expectedCartesian * 0.8 &&
    variants.length <= expectedCartesian * 1.2;

  return (
    (looksCartesian && allSameStock && allSamePrice && allImagesNull && noListingEvidence) ||
    (allSameStock && allSamePrice && allAvailable && allImagesNull && variants.length >= 10 && noListingEvidence)
  );
}

export function validateCanonicalVariants(variants: CanonicalVariant[]): VariantValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: CanonicalVariant[] = [];
  const blocked: CanonicalVariant[] = [];

  const skuSet = new Set<string>();
  const comboSet = new Set<string>();
  const variantIdSet = new Set<string>();

  const hasNamedColors = variants.some(
    (v) => isNamedColor(v.option1Value) || isNamedColor(v.option2Value),
  );
  const hasTekRenk = variants.some(
    (v) => isTekRenk(v.option1Value) || isTekRenk(v.option2Value),
  );

  if (hasNamedColors && hasTekRenk) {
    errors.push("tek_renk_with_named_colors");
  }

  for (const v of variants) {
    const color = v.option1Value || v.option2Value;
    const size = v.option2Name === "Beden" ? v.option2Value : v.option1Name === "Beden" ? v.option1Value : v.option2Value;

    if (hasNamedColors && (isTekRenk(v.option1Value) || isTekRenk(v.option2Value))) {
      blocked.push(v);
      continue;
    }

    if (v.synthetic === true || v.evidence?.synthetic === true) {
      blocked.push(v);
      continue;
    }

    if (v.evidence?.evidenceSource === "inferred_matrix" || v.evidence?.evidenceSource === "color_size_cross") {
      blocked.push(v);
      continue;
    }

    const combo = `${v.option1Value || ""}|${v.option2Value || ""}|${v.option3Value || ""}`;
    if (comboSet.has(combo)) {
      errors.push("duplicate_option_combination");
      blocked.push(v);
      continue;
    }
    comboSet.add(combo);

    if (v.sku) {
      if (skuSet.has(v.sku)) {
        errors.push("duplicate_sku");
        blocked.push(v);
        continue;
      }
      skuSet.add(v.sku);
    }

    if (v.sourceVariantId) {
      if (variantIdSet.has(v.sourceVariantId)) {
        errors.push("duplicate_source_variant_id");
        blocked.push(v);
        continue;
      }
      variantIdSet.add(v.sourceVariantId);
    }

    if (v.available === true && !v.evidence?.availabilityVerified && v.evidence?.evidenceSource !== "api_listing") {
      warnings.push("availability_not_verified");
    }

    if (v.stockQuantity != null && !v.stockQuantityVerified) {
      errors.push("unverified_stock_quantity");
      blocked.push(v);
      continue;
    }

    valid.push(v);
  }

  const suspectedSyntheticMatrix = detectSyntheticVariantMatrix(variants);

  return { valid, blocked, errors, warnings, suspectedSyntheticMatrix };
}
