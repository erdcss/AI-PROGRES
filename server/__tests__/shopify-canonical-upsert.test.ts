/**
 * Canonical variant shape + Shopify upsert testleri
 * Çalıştır: npm run test:shopify-upsert
 */
import {
  normalizeSizeValue,
  normalizeColorValue,
  buildCanonicalProductForShopify,
  containsBannedHardcodedVariants,
} from "../variant-shape-normalizer";
import { parseLastFewStock, resolveInventoryQty } from "../shopify-inventory-qty";
import { generateCanonicalShopifyCSV } from "../shopify-canonical-export";
import { acquireUploadLock, releaseUploadLock } from "../shopify-upsert-service";

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

console.log("\n=== Shopify Canonical + Upsert Tests ===\n");

// 1. Obje array bedenleri
{
  const sizes = [{ name: "S" }, { name: "M" }, { name: "L" }, { name: "XL" }];
  const normalized = sizes.map(normalizeSizeValue).filter(Boolean);
  assert(normalized.join(",") === "S,M,L,XL", "obje array bedenler normalize edilir");
}

// 2. String array bedenler
{
  const sizes = ["S", "M", "L", "XL"];
  const normalized = sizes.map(normalizeSizeValue).filter(Boolean);
  assert(normalized.join(",") === "S,M,L,XL", "string array bedenler çalışır");
}

// 3. stockMap ile tüm stokta varyantlar
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-897305689",
    scrapeResult: {
      title: "Test Elbise",
      brand: "Lela",
      price: { original: 500 },
      variants: {
        stockMap: {
          "YAĞ YEŞİLİ-S": true,
          "YAĞ YEŞİLİ-M": true,
          "YAĞ YEŞİLİ-L": true,
          "YAĞ YEŞİLİ-XL": false,
        },
        colors: ["YAĞ YEŞİLİ"],
        sizes: ["S", "M", "L", "XL"],
      },
    },
  });
  assert(canonical !== null, "canonical ürün oluşur");
  assert(canonical!.sourceProductId === "897305689", "sourceProductId doğru");
  assert(canonical!.variants.length === 3, "stokta 3 varyant export edilir (OOS hariç)");
  assert(canonical!.outOfStockVariants.length === 1, "1 stoksuz varyant ayrı");
}

// 4. stockCount yok ama inStock — default 10 (env default)
{
  process.env.SHOPIFY_DEFAULT_IN_STOCK_QTY = "10";
  const qty = resolveInventoryQty({ inStock: true });
  assert(qty === 10, "inStock default qty 10 (1 değil)");
}

// 5. Son 3 Ürün
{
  const qty = parseLastFewStock("Son 3 Ürün");
  assert(qty === 3, "Son 3 Ürün → qty 3");
}

// 6. CSV her satırda Handle dolu
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/lela-elbise-p-897305689",
    scrapeResult: {
      title: "Lela Elbise",
      brand: "Lela",
      price: "500",
      variants: {
        items: [
          { color: "YAĞ YEŞİLİ", size: "S", inStock: true },
          { color: "YAĞ YEŞİLİ", size: "M", inStock: true },
        ],
      },
    },
  });
  const csv = generateCanonicalShopifyCSV(canonical!);
  const lines = csv.split("\n").filter((l) => l.trim());
  const handle = canonical!.handle;
  const dataLines = lines.slice(1);
  const allHaveHandle = dataLines.every((line) => line.includes(handle));
  assert(allHaveHandle, "CSV tüm satırlarda Handle dolu");
}

// 7. Hardcoded Gri/Turuncu yasak
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-123",
    scrapeResult: {
      title: "UA Tişört",
      brand: "UA",
      price: "100",
      variants: {
        items: [
          { color: "Gri", size: "S", inStock: true },
          { color: "Turuncu", size: "M", inStock: true },
        ],
      },
    },
  });
  assert(
    containsBannedHardcodedVariants(canonical!.variants),
    "Gri+Turuncu hardcoded imza yakalanır",
  );
}

// 8. Upload lock — ikinci istek engellenir
{
  const key = "trendyol:lock-test";
  const first = acquireUploadLock(key);
  const second = acquireUploadLock(key);
  assert(first.acquired === true, "ilk lock alınır");
  assert(second.acquired === false, "ikinci lock engellenir");
  releaseUploadLock(first.lockKey);
  const third = acquireUploadLock(key);
  assert(third.acquired === true, "lock release sonrası tekrar alınır");
  releaseUploadLock(third.lockKey);
}

// 9. Renk yoksa Tek Renk
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-999",
    scrapeResult: {
      title: "Tek Renk Ürün",
      brand: "Test",
      price: "50",
      variants: { sizes: ["S", "M"] },
    },
  });
  assert(canonical!.variants.some((v) => v.color === "Tek Renk"), "renk yoksa Tek Renk");
}

// 10. SKU standardı
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-897305689",
    scrapeResult: {
      title: "Test",
      brand: "Lela",
      price: "100",
      variants: { items: [{ color: "Kırmızı", size: "S", inStock: true }] },
    },
  });
  assert(
    canonical!.variants[0].sku.startsWith("TY-897305689-"),
    "SKU TY-{productId} prefix ile başlar",
  );
}

// 11. Tek renk çok beden — CSV throw etmemeli
{
  const canonical = {
    sourcePlatform: "trendyol" as const,
    sourceProductId: "897305689",
    sourceUrl: "https://www.trendyol.com/lela-elbise-p-897305689",
    sourceKey: "trendyol:897305689",
    handle: "lela-elbise-897305689",
    title: "Lela Elbise",
    brand: "Lela",
    price: "381.70",
    images: ["https://example.com/1.jpg"],
    variants: [
      { sourceProductId: "897305689", color: "Tek Renk", size: "S", option1Name: "Beden" as const, option1Value: "S", sku: "TY-897305689-tek-renk-s", inStock: true, inventoryQty: 10, stockConfidence: "high" as const, price: "381.70" },
      { sourceProductId: "897305689", color: "Tek Renk", size: "M", option1Name: "Beden" as const, option1Value: "M", sku: "TY-897305689-tek-renk-m", inStock: true, inventoryQty: 10, stockConfidence: "high" as const, price: "381.70" },
      { sourceProductId: "897305689", color: "Tek Renk", size: "L", option1Name: "Beden" as const, option1Value: "L", sku: "TY-897305689-tek-renk-l", inStock: true, inventoryQty: 10, stockConfidence: "high" as const, price: "381.70" },
      { sourceProductId: "897305689", color: "Tek Renk", size: "XL", option1Name: "Beden" as const, option1Value: "XL", sku: "TY-897305689-tek-renk-xl", inStock: false, inventoryQty: 0, stockConfidence: "high" as const, price: "381.70" },
    ],
    outOfStockVariants: [],
    stockSummary: { totalVariants: 4, inStockVariants: 3, outOfStockVariants: 1, defaultInventoryQty: 10 },
  };
  let threw = false;
  try {
    generateCanonicalShopifyCSV(canonical);
  } catch {
    threw = true;
  }
  assert(!threw, "tek renk çok beden CSV throw etmez (options2 TDZ yok)");
  const csv = generateCanonicalShopifyCSV(canonical);
  assert((csv.match(/Beden/g) || []).length >= 1, "Beden option CSV'de var");
  assert(csv.includes("897305689") || csv.includes("tek-renk-s"), "SKU/handle doğru");
}

// 12. URL product id öncelikli
{
  const { resolveTrendyolSourceIds } = await import("../shopify-source-key");
  const ids = resolveTrendyolSourceIds(
    "https://www.trendyol.com/lela-elbise-p-897305689",
    "803373460",
  );
  assert(ids.selectedSourceProductId === "897305689", "URL product id öncelikli");
  assert(ids.sourceKey === "trendyol:897305689", "sourceKey URL id ile sabit");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
