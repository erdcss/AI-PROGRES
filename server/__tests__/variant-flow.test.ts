/**
 * Varyant akışı testleri
 * Çalıştır: npm run test:variant-flow
 */
import {
  buildCanonicalProductForShopify,
  isValidSizeLabel,
  normalizeColorValue,
  validateCanonicalForShopifyUpload,
} from "../variant-shape-normalizer";
import { resolveTrendyolSourceIds } from "../shopify-source-key";
import {
  buildAutomaticProductTags,
  isBlockedShopifyTag,
  joinShopifyTags,
  sanitizeShopifyTags,
} from "@shared/shopify-tag-sanitizer";
import { generateCanonicalShopifyCSV } from "../shopify-canonical-export";

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
  const allSizes = [
    ...new Set(
      [...(canonical?.variants ?? []), ...(canonical?.outOfStockVariants ?? [])].map((v) => v.size),
    ),
  ];
  assert(allSizes.join(",") === "S,M,L,XL", "DOM merge: 4 beden çıkar");
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

// Test — tek SKU, bedensiz ürün (kozmetik / aksesuar)
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/muvicado/parazit-damla-p-948906937",
    scrapeResult: {
      title: "Parazit Damla",
      brand: "Muvicado",
      price: { original: 170 },
      variants: {
        colors: ["Tek Renk"],
        sizes: [],
        allVariants: [{ color: "Tek Renk", size: "", inStock: false }],
      },
    },
  });
  assert((canonical?.variants.length ?? 0) + (canonical?.outOfStockVariants.length ?? 0) >= 1, "single-SKU no-size yields 1 variant");
  const csv = generateCanonicalShopifyCSV(canonical!);
  assert(csv.includes("Parazit Damla"), "CSV contains product title");
  assert(!csv.split("\n")[1]?.startsWith(",") || csv.includes("Default Title"), "CSV has variant row not image-only");
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

// Renk normalizasyonu — DOM gürültüsünü filtreler
{
  assert(normalizeColorValue("Gri26") === "Gri", "Gri26 -> Gri");
  assert(normalizeColorValue("pembe") === "Pembe", "pembe -> Pembe");
  assert(normalizeColorValue("Slicing Attribute Product") === null, "UI gürültüsü reddedilir");
  assert(normalizeColorValue("KOLSUZBEYAZSİYAHVYAK5") === null, "slug renk reddedilir");
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/mercoledi/tisort-p-896261234",
    scrapeResult: {
      title: "mercoledi Kadın V Yaka Tişört",
      brand: "mercoledi",
      price: { original: 349 },
      variants: {
        colors: ["Gri26", "Beyaz20", "Siyah21", "pembe", "Slicing Attribute Product"],
        sizes: ["S", "M", "L", "XL"],
        allVariants: [],
      },
    },
  });
  const allRows = [...(canonical?.variants ?? []), ...(canonical?.outOfStockVariants ?? [])];
  const colors = [...new Set(allRows.map((v) => v.color))];
  assert(colors.includes("Gri") && colors.includes("Pembe"), "temiz renkler korunur");
  assert(!colors.some((c) => /slicing|kolsuz|26$/i.test(c)), "kirli renkler filtrelenir");
}

// Etiketlerde trendyol kelimesi engellenir
{
  assert(isBlockedShopifyTag("trendyol-import"), "trendyol-import engellenir");
  assert(isBlockedShopifyTag("source:trendyol"), "source:trendyol engellenir");
  assert(!isBlockedShopifyTag("import"), "import etiketi serbest");
  const auto = buildAutomaticProductTags("930888886");
  assert(!auto.some((t) => /trendyol/i.test(t)), "otomatik etiketler trendyol içermez");
  assert(auto.includes("src:930888886"), "src:{id} etiketi kullanılır");

  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test-p-930888886",
    scrapeResult: {
      title: "Test Ürün",
      brand: "Test",
      price: { original: 100 },
      variants: { items: [{ color: "Siyah", size: "M", inStock: true }] },
    },
  });
  const csv = generateCanonicalShopifyCSV(canonical!);
  assert(!/trendyol/i.test(csv), "CSV Tags kolonunda trendyol yok");
  const sanitized = sanitizeShopifyTags(["indirim", "trendyol-import", "src:123"]);
  assert(sanitized.join(",") === "indirim,src:123", "sanitizeShopifyTags trendyol etiketlerini çıkarır");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
