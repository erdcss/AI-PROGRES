/**
 * Varyant akışı testleri
 * Çalıştır: npm run test:variant-flow
 */
import {
  buildCanonicalProductForShopify,
  isValidSizeLabel,
  validateCanonicalForShopifyUpload,
} from "../variant-shape-normalizer";
import { resolveTrendyolSourceIds } from "../shopify-source-key";

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

console.log("\n=== Variant Flow Tests ===\n");

// Test 2 — allVariants sadece S, DOM S/M/L/XL ise 4 beden
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl:
      "https://www.trendyol.com/lela/test-elbise-p-897305689",
    scrapeResult: {
      title: "Test Elbise",
      brand: "Lela",
      price: { original: 500 },
      variants: {
        allVariants: [{ color: "Tek Renk", size: "S", inStock: true }],
        sizes: ["S"],
      },
      domSizeButtons: ["S", "M", "L", "XL"],
      variantDiagnostics: { domSizeButtons: ["S", "M", "L", "XL"], rawDomSizeCount: 4 },
    },
  });
  const sizes = [...new Set(canonical?.variants.map((v) => v.size) ?? [])];
  assert(sizes.join(",") === "S,M,L,XL", "DOM merge: 4 beden çıkar");
  assert((canonical?.stockSummary.totalVariants ?? 0) === 4, "totalVariants=4");
}

// Test 3 — source id URL'den seçilmeli
{
  const ids = resolveTrendyolSourceIds(
    "https://www.trendyol.com/lela/test-p-897305689",
    "803373460",
  );
  assert(ids.selectedSourceProductId === "897305689", "selectedSourceProductId=897305689");
  assert(ids.sourceKey === "trendyol:897305689", "sourceKey=trendyol:897305689");
}

// Test 5 — renk bilgisi yok → Beden option
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-897305689",
    scrapeResult: {
      title: "Elbise",
      brand: "Lela",
      price: { original: 400 },
      variants: {
        colors: ["Renk bilgisi yok"],
        sizes: ["S", "M", "L", "XL"],
        stockMap: {
          "Tek Renk-S": true,
          "Tek Renk-M": true,
          "Tek Renk-L": true,
          "Tek Renk-XL": true,
        },
      },
    },
  });
  const first = canonical?.variants[0];
  assert(first?.option1Name === "Beden", "Option1 Name = Beden");
  assert(!first?.option2Name, "Option2 boş (tek renk)");
}

// Test 6 — mismatch varsa upload engellensin
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-897305689",
    scrapeResult: {
      title: "Elbise",
      brand: "Lela",
      price: { original: 400 },
      variants: { allVariants: [{ color: "Tek Renk", size: "S", inStock: true }] },
      variantDiagnostics: { rawDomSizeCount: 4 },
    },
  });
  const validation = validateCanonicalForShopifyUpload(canonical, {
    rawDomSizeCount: 4,
  });
  assert(validation.ok === false, "upload blocked on mismatch");
}

// Geçerli beden filtresi
{
  assert(isValidSizeLabel("S"), "S geçerli beden");
  assert(!isValidSizeLabel("Sepete Ekle"), "Sepete Ekle beden değil");
}

// Test — apparel one-size after full scrape → blocked
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/lela/midi-elbise-p-897305689",
    scrapeResult: {
      title: "Midi Elbise",
      brand: "Lela",
      price: { original: 400 },
      variants: { allVariants: [{ color: "Tek Renk", size: "S", inStock: true }] },
      fullVariantScrapeAttempted: true,
      variantDiagnostics: { fullVariantScrapeAttempted: true, rawDomSizeCount: 0 },
    },
  });
  assert(canonical?.manualReviewRequired === true, "apparel one-size manual review");
  assert(canonical?.shopifyUploadBlocked === true, "apparel one-size upload blocked");
}

// Test — mismatch validation message
{
  const canonicalOne = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-897305689",
    scrapeResult: {
      title: "Elbise",
      brand: "Lela",
      price: { original: 400 },
      variants: { allVariants: [{ color: "Tek Renk", size: "S", inStock: true }] },
      variantDiagnostics: { rawDomSizeCount: 4 },
    },
  });
  const validation = validateCanonicalForShopifyUpload(canonicalOne, { rawDomSizeCount: 4 });
  assert(validation.ok === false, "blocks when dom has more sizes than canonical");
  if (!validation.ok) {
    assert(/beden/i.test(validation.error), "mismatch error mentions beden");
  }
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
