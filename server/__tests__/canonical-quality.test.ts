/**
 * Canonical quality, variant validation, image dedupe tests
 */
import assert from "node:assert/strict";
import { evaluateProductQuality } from "../services/quality-gate.service";
import { validateCanonicalVariants, detectSyntheticVariantMatrix } from "../services/canonical-variant-validator.service";
import { dedupeTrendyolImages } from "../trendyol-image-identity";
import { hashCanonicalProduct, hashShopifySnapshot } from "../services/shopify-dry-run.service";
import type { CanonicalProduct, CanonicalVariant } from "@shared/canonical-product";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}:`, (err as Error).message);
  }
}

function baseProduct(overrides: Partial<CanonicalProduct> = {}): CanonicalProduct {
  return {
    sourcePlatform: "trendyol",
    sourceUrl: "https://www.trendyol.com/test-p-1158681520",
    sourceProductId: "1158681520",
    title: "Erkek Minimal Palmiye Baskılı Tişört",
    brand: "Trend",
    category: null,
    description: null,
    currency: "TRY",
    sourcePrice: 249,
    sourceOriginalPrice: 249,
    originalPrice: 249,
    sellingPrice: 249,
    calculatedShopifyPrice: 273.9,
    images: ["https://cdn.dsmcdn.com/ty1660/prod/QC_PREP/20260620/16/57b095a9-5012-3b4b-afd0-4dc81f7b4f5c/1_org_zoom.jpg"],
    options: [],
    variants: [],
    features: [],
    tags: [],
    quality: null,
    diagnostics: { titleSource: "api", priceVerified: true },
    ...overrides,
  };
}

function variant(overrides: Partial<CanonicalVariant> = {}): CanonicalVariant {
  return {
    sourceVariantId: "v1",
    option1Name: "Renk",
    option1Value: "Bej",
    option2Name: "Beden",
    option2Value: "S",
    option3Name: null,
    option3Value: null,
    sku: "TY-1158681520-bej-s",
    price: 249,
    sourcePrice: 249,
    calculatedShopifyPrice: 273.9,
    available: true,
    stockQuantity: null,
    stockSource: "availability_only",
    stockConfidence: 55,
    stockQuantityVerified: false,
    imageUrl: null,
    evidence: {
      evidenceSource: "all_variants",
      availabilityVerified: true,
      synthetic: false,
    },
    ...overrides,
  };
}

console.log("\n=== Canonical Quality Tests ===\n");

test("A: url-slug title cannot be approved", () => {
  const q = evaluateProductQuality(
    baseProduct({ diagnostics: { titleSource: "url-slug" } }),
    "1158681520",
  );
  assert.notEqual(q.status, "approved");
  assert.ok(q.score <= 70);
  assert.equal(q.status, "manual_review");
});

test("B: synthetic stock quantity blocked", () => {
  const q = evaluateProductQuality(
    baseProduct({
      variants: [variant({ stockQuantity: 10, stockQuantityVerified: false })],
    }),
    "1158681520",
  );
  assert.equal(q.status, "blocked");
  assert.ok(q.blockers.includes("synthetic_stock_quantity"));
});

test("C: cartesian synthetic matrix detected", () => {
  const variants: CanonicalVariant[] = [];
  const colors = ["Bej", "Mavi", "Siyah"];
  const sizes = ["S", "M", "L", "XL", "2XL"];
  for (const c of colors) {
    for (const s of sizes) {
      variants.push(
        variant({
          option1Value: c,
          option2Value: s,
          sku: `TY-${c}-${s}`,
          stockQuantity: 10,
          stockQuantityVerified: false,
          evidence: { evidenceSource: "color_size_cross", synthetic: true },
        }),
      );
    }
  }
  assert.ok(detectSyntheticVariantMatrix(variants));
  const q = evaluateProductQuality(baseProduct({ variants }), "1158681520");
  assert.ok(q.status === "blocked" || q.status === "manual_review");
});

test("D: confirmed matrix passes validation", () => {
  const variants = ["S", "M", "L", "XL", "2XL"].map((size) =>
    variant({
      option2Value: size,
      sku: `TY-bej-${size}`,
      sourceVariantId: `TY-bej-${size}`,
    }),
  );
  const v = validateCanonicalVariants(variants);
  assert.equal(v.valid.length, 5);
  assert.equal(v.suspectedSyntheticMatrix, false);
});

test("E: Tek Renk + named colors conflict", () => {
  const variants = [
    variant({ option1Value: "Bej" }),
    variant({ option1Value: "Tek Renk", option2Value: "S", sku: "tek-s" }),
  ];
  const v = validateCanonicalVariants(variants);
  assert.ok(v.errors.includes("tek_renk_with_named_colors"));
});

test("F: image dedupe same UUID", () => {
  const urls = [
    "https://cdn.dsmcdn.com/ty1660/prod/QC_PREP/20260620/16/57b095a9-5012-3b4b-afd0-4dc81f7b4f5c/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/ty1909/prod/QC_PREP/20260620/16/57b095a9-5012-3b4b-afd0-4dc81f7b4f5c/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/mnresize/1200/1800/ty1660/prod/QC_PREP/20260620/16/57b095a9-5012-3b4b-afd0-4dc81f7b4f5c/1_org_zoom.jpg",
  ];
  const deduped = dedupeTrendyolImages(urls);
  assert.equal(deduped.length, 1);
});

test("G: dry-run hash separation", () => {
  const canonical = baseProduct();
  const ch = hashCanonicalProduct(canonical);
  const sh = hashShopifySnapshot(null);
  assert.notEqual(ch, sh);
  assert.equal(sh, null);
});

test("H: source price stays 249 with calculated 273.9", () => {
  const v = variant({ sourcePrice: 249, calculatedShopifyPrice: 273.9, price: 249 });
  assert.equal(v.sourcePrice, 249);
  assert.equal(v.calculatedShopifyPrice, 273.9);
});

test("I: unknown stock quantity null", () => {
  const v = variant({ available: true, stockQuantity: null, stockQuantityVerified: false });
  assert.equal(v.stockQuantity, null);
  assert.equal(v.stockSource, "availability_only");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
