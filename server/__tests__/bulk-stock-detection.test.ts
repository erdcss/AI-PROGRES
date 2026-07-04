import { summarizeStockFromVariants, resolveVariantAvailability } from "@shared/stock-status";
import { buildCanonicalProductForShopify } from "../variant-shape-normalizer";

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

console.log("\n=== Bulk Stock Detection Tests ===\n");

{
  const variants = [
    { color: "Gri", size: "S", inStock: true },
    { color: "Gri", size: "M", inStock: false },
    { color: "Gri", size: "L", inStock: true },
    { color: "Gri", size: "XL", inStock: false },
  ];
  const summary = summarizeStockFromVariants(
    variants.map((v) => ({
      inStock: v.inStock,
      stockStatus: v.inStock ? "in_stock" : "out_of_stock",
    })),
  );
  assert(summary.totalVariants === 4, "totalVariants = 4");
  assert(summary.inStockVariants === 2, "inStockVariants = 2");
  assert(summary.outOfStockVariants === 2, "outOfStockVariants = 2");
  assert(!variants.some((v) => v.inStock && v.size === "M"), "M stok dışı");
  assert(!variants.some((v) => v.inStock && v.size === "XL"), "XL stok dışı");
}

{
  const unknown = resolveVariantAvailability({});
  assert(unknown === null, "bilinmeyen stok true yapılmaz");
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-123",
    scrapeResult: {
      title: "Test",
      brand: "X",
      price: { original: 100 },
      variants: { sizes: ["S", "M"], colors: ["Gri"] },
    },
  });
  assert(
    (canonical?.stockSummary.totalVariants ?? 0) >= 2 ||
      canonical?.manualReviewRequired ||
      canonical?.shopifyUploadBlocked,
    "sentetik cross stok doğrulanmadan export edilmez veya review gerekir",
  );
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
