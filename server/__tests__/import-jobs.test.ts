/**
 * Import jobs + quality gate tests
 * Run: npm run test:import-jobs
 */
import { evaluateProductQuality } from "../services/quality-gate.service";
import { normalizeScrapeToCanonicalProduct } from "../services/canonical-product-normalizer.service";
import type { CanonicalProduct } from "@shared/canonical-product";
import { canTransitionJob, assertJobTransition } from "@shared/import-job-state-machine";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log("\n=== Import Jobs / Quality Gate Tests ===\n");

{
  const product: CanonicalProduct = {
    sourcePlatform: "trendyol",
    sourceUrl: "https://www.trendyol.com/test-p-1158681520",
    sourceProductId: "1158681520",
    title: "Erkek Minimal Palmiye Baskılı Tişört",
    brand: "Trend EmModa",
    category: null,
    description: null,
    currency: "TRY",
    originalPrice: 249,
    sellingPrice: 249,
    images: ["https://cdn.dsmcdn.com/ty123/prod/QC_test.jpg"],
    options: [{ name: "Beden", values: ["S", "M", "L"] }],
    variants: [
      {
        sourceVariantId: "TY-1158681520-S",
        option1Name: "Renk",
        option1Value: "Bej",
        option2Name: "Beden",
        option2Value: "S",
        option3Name: null,
        option3Value: null,
        sku: "TY-1158681520-S",
        price: 249,
        available: true,
        stockQuantity: null,
        imageUrl: null,
      },
    ],
    features: [],
    tags: [],
    quality: null,
    diagnostics: {},
  };
  const q = evaluateProductQuality(product, "1158681520");
  assert(q.status === "approved" || q.status === "manual_review", "valid product passes quality");
  assert(q.score >= 60, "quality score >= 60");
}

{
  const product: CanonicalProduct = {
    sourcePlatform: "trendyol",
    sourceUrl: "https://www.trendyol.com/test-p-999",
    sourceProductId: "999",
    title: "slicing attribute product",
    brand: null,
    category: null,
    description: null,
    currency: "TRY",
    originalPrice: 0,
    sellingPrice: null,
    images: [],
    options: [],
    variants: [],
    features: [],
    tags: [],
    quality: null,
    diagnostics: {},
  };
  const q = evaluateProductQuality(product, "1158681520");
  assert(q.status === "blocked", "placeholder title blocked");
  assert(q.reasons.includes("title_placeholder_or_invalid"), "title reason set");
}

{
  const normalized = normalizeScrapeToCanonicalProduct(
    {
      title: "Erkek Test Ürün",
      price: { original: 199 },
      images: ["https://cdn.dsmcdn.com/ty123/prod/QC_x.jpg"],
      sourceProductId: "1158681520",
      variants: {
        allVariants: [
          { color: "Bej", size: "M", inStock: true },
          { color: "Bej", size: "L", inStock: true },
        ],
      },
    },
    "https://www.trendyol.com/test-p-1158681520",
  );
  assert(normalized.sourceProductId === "1158681520", "source product id from scrape");
  assert((normalized.variants?.length ?? 0) >= 2, "variants normalized");
  assert(normalized.quality !== null, "quality attached after normalize");
}

{
  const pollDeadline = (globalMs: number) => Math.max(globalMs + 45_000, 240_000);
  assert(pollDeadline(180_000) >= 225_000, "poll deadline >= 225s for 180s global");
}

{
  assert(canTransitionJob("queued", "scraping"), "queued → scraping allowed");
  assert(!canTransitionJob("awaiting_approval", "completed"), "awaiting_approval → completed blocked");
  let threw = false;
  try {
    assertJobTransition("scraping", "completed");
  } catch {
    threw = true;
  }
  assert(threw, "invalid transition throws");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
