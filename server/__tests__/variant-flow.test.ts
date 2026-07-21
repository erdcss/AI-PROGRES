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
import {
  attachCsvToScrapeResult,
  normalizeScrapeProduct,
} from "../scrape-csv-builder";
import { parseCSVRow } from "../csv-paths";
import { analyzeShopifyCsvContent } from "../csv-paths";
import {
  evaluateVariantCollapse,
  runWithVariantTrace,
  traceVariants,
} from "../variant-trace";

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

function assertCsvProductRow(csvContent: string, expectedTitle: string) {
  const lines = csvContent.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  assert(lines.length >= 2, "CSV has header + data row");
  const headers = parseCSVRow(lines[0]);
  const row = parseCSVRow(lines[1]);
  const titleIdx = headers.findIndex((h) => h.toLowerCase() === "title");
  const handleIdx = headers.findIndex((h) => h.toLowerCase() === "url handle");
  const priceIdx = headers.findIndex((h) => h.toLowerCase() === "price");
  const title = titleIdx >= 0 ? row[titleIdx] : "";
  const handle = handleIdx >= 0 ? row[handleIdx] : "";
  const price = priceIdx >= 0 ? Number.parseFloat(row[priceIdx].replace(",", ".")) : 0;
  assert(title === expectedTitle, `CSV Title=${expectedTitle}`);
  assert(Boolean(handle), "CSV URL handle dolu");
  assert(Number.isFinite(price) && price > 0, "CSV Price pozitif");
  assert(!lines[1].startsWith(",") || Boolean(title), "CSV yalnızca görsel satırı değil");
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

// OOS bedenlerin CSV'den çıkarılması varyant çökmesi değildir
{
  const report = runWithVariantTrace(
    {
      requestId: "oos-collapse-regression",
      sourceUrl: "https://www.trendyol.com/bianco-lucci/elbise-p-712280973",
    },
    () => {
      const sourceVariants = {
        allVariants: [
          { color: "Tek Renk", size: "S", inStock: true },
          { color: "Tek Renk", size: "M", inStock: false },
          { color: "Tek Renk", size: "L", inStock: false },
        ],
      };
      traceVariants("resolver_input", sourceVariants, { source: "test" });
      const canonical = buildCanonicalProductForShopify({
        sourceUrl: "https://www.trendyol.com/bianco-lucci/elbise-p-712280973",
        scrapeResult: {
          title: "Bianco Lucci Elbise",
          brand: "Bianco Lucci",
          price: { original: 869 },
          variants: sourceVariants,
        },
      });
      return evaluateVariantCollapse([
        ...(canonical?.variants ?? []),
        ...(canonical?.outOfStockVariants ?? []),
      ]);
    },
  );
  assert(report.richestCount === 3, "collapse test source=3");
  assert(report.finalCount === 3, "collapse test canonical stocklu+OOS=3");
  assert(report.collapsed === false, "OOS filtresi collapse sayılmaz");
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
  assert(isValidSizeLabel("S/M"), "S/M combo geçerli beden");
  assert(isValidSizeLabel("L/XL"), "L/XL combo geçerli beden");
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
  assert(csv != null && csv.includes("Parazit Damla"), "CSV contains product title");
  assert(csv != null && (!csv.split("\n")[1]?.startsWith(",") || csv.includes("Default Title")), "CSV has variant row not image-only");
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
  assert(csv != null && !/trendyol/i.test(csv), "CSV Tags kolonunda trendyol yok");
  const sanitized = sanitizeShopifyTags(["indirim", "trendyol-import", "src:123"]);
  assert(sanitized.join(",") === "indirim,src:123", "sanitizeShopifyTags trendyol etiketlerini çıkarır");
}

// Shopify CSV fiyat politikası — withProfit satış, compare-at boş, DENY
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test/canli-p-123456789",
    scrapeResult: {
      title: "Canlı Test Ürün",
      brand: "Marka",
      price: { original: 492, withProfit: 541.2 },
      images: ["https://cdn.dsmcdn.com/a.jpg"],
      variants: { items: [{ color: "Siyah", size: "M", inStock: true }] },
    },
  });
  const csv = generateCanonicalShopifyCSV(canonical!);
  assert(csv != null, "CSV oluşur");
  const lines = csv!.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCSVRow(lines[0]);
  const row = parseCSVRow(lines[1]);
  const priceIdx = headers.findIndex((h) => h.toLowerCase() === "price");
  const compareIdx = headers.findIndex((h) => h.toLowerCase() === "compare-at price");
  const continueIdx = headers.findIndex((h) =>
    h.toLowerCase().includes("continue selling when out of stock"),
  );
  assert(row[priceIdx] === "541.20", "Price = withProfit (541.20)");
  assert(!row[compareIdx]?.trim(), "Compare-at price boş");
  assert(row[continueIdx] === "DENY", "Continue selling when out of stock = DENY");
}

// CSV satır istatistikleri — 49 varyant + görsel satırları
{
  const colors = ["Siyah", "Beyaz", "Mavi", "Kırmızı", "Gri", "Pembe", "Lacivert"];
  const sizes = ["34", "36", "38", "40", "42", "44", "XS"];
  const allVariants: Array<{ color: string; size: string; inStock: boolean }> = [];
  for (const color of colors) {
    for (const size of sizes) {
      allVariants.push({ color, size, inStock: true });
    }
  }
  const images = Array.from({ length: 33 }, (_, i) => `https://cdn.dsmcdn.com/extra-${i + 1}.jpg`);
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/test/stats-p-987654321",
    scrapeResult: {
      title: "Çok Varyantlı Ürün",
      brand: "Marka",
      price: { original: 492, withProfit: 541.2 },
      images,
      variants: { allVariants, sizes: allVariants.map((v) => v.size) },
    },
  });
  const csv = generateCanonicalShopifyCSV(canonical!);
  assert(csv != null, "Çok varyantlı CSV oluşur");
  const stats = analyzeShopifyCsvContent(csv!);
  assert(stats != null, "stats hesaplanır");
  assert(stats!.productCount === 1, "productCount = 1");
  assert(stats!.variantRowCount === 49, "variantRowCount = 49");
  assert(stats!.rowCount > 49, "rowCount > variantRowCount (görsel satırları dahil)");
  assert(stats!.rowCount === stats!.variantRowCount + stats!.imageRowCount, "rowCount = varyant + görsel");
}

async function runAttachCsvTests() {
  const baseUrl = "https://www.trendyol.com/test/urun-p-123456789";
  const images = Array.from({ length: 19 }, (_, i) => `https://cdn.dsmcdn.com/img-${i + 1}.jpg`);

  {
    const attached = await attachCsvToScrapeResult(
      {
        title: "Root Başlık",
        price: { original: 499.9 },
        images,
        productInfo: { title: "", price: 0 },
        product: { title: "", price: { original: 0 } },
      },
      baseUrl,
      "test-A",
    );
    const normalized = normalizeScrapeProduct(attached as Record<string, unknown>, baseUrl);
    assert(normalized?.title === "Root Başlık", "A: root title kullanılır");
    assert((normalized?.price.original ?? 0) > 0, "A: root price kullanılır");
    assert(Boolean(attached.csvContent && attached.csvContent.length > 50), "A: csvContent dolu");
    assert(attached.csvInfo?.ready === true, "A: csvInfo.ready=true");
    assert(attached.csvDiagnostics?.selectedTitleSource === "root", "A: selectedTitleSource=root");
    assert(attached.csvDiagnostics?.selectedPriceSource === "root", "A: selectedPriceSource=root");
    if (attached.csvContent) assertCsvProductRow(attached.csvContent, "Root Başlık");
  }

  {
    const attached = await attachCsvToScrapeResult(
      { title: "Fiyat B", price: { currentPrice: 499.9 }, images },
      baseUrl,
      "test-B",
    );
    assert(attached.csvInfo?.ready === true, "B: csvInfo.ready=true");
    if (attached.csvContent) assertCsvProductRow(attached.csvContent, "Fiyat B");
  }

  {
    const attached = await attachCsvToScrapeResult(
      { title: "Fiyat C", price: { originalPrice: 499.9 }, images },
      baseUrl,
      "test-C",
    );
    assert(attached.csvInfo?.ready === true, "C: csvInfo.ready=true");
    if (attached.csvContent) assertCsvProductRow(attached.csvContent, "Fiyat C");
  }

  {
    const attached = await attachCsvToScrapeResult(
      {
        title: "Fiyat D",
        price: { sellingPrice: { value: 49990 } },
        images,
      },
      baseUrl,
      "test-D",
    );
    assert(attached.csvInfo?.ready === true, "D: csvInfo.ready=true");
    if (attached.csvContent) assertCsvProductRow(attached.csvContent, "Fiyat D");
  }

  {
    const attached = await attachCsvToScrapeResult(
      {
        title: "Tek SKU Ürün",
        brand: "Marka",
        price: { original: 170 },
        images,
        variants: {
          colors: ["Tek Renk"],
          sizes: [],
          allVariants: [{ color: "Tek Renk", size: "", inStock: true }],
        },
      },
      baseUrl,
      "test-E",
    );
    assert(attached.csvInfo?.ready === true, "E: csvInfo.ready=true");
    assert(Boolean(attached.csvContent && attached.csvContent.length > 100), "E: csvContent dolu");
    if (attached.csvContent) assertCsvProductRow(attached.csvContent, "Tek SKU Ürün");
  }

  {
    const attached = await attachCsvToScrapeResult(
      {
        success: false,
        partialSuccess: true,
        previewOk: true,
        title: "Kısmi Ürün",
        price: { original: 299.9 },
        images: ["https://cdn.dsmcdn.com/a.jpg"],
        stageErrors: ["api-null-response"],
      },
      baseUrl,
      "test-partial-job",
    );
    assert(attached.csvInfo?.ready === true, "partialSuccess job: csvInfo.ready=true");
    assert(Boolean(attached.csvContent), "partialSuccess job: csvContent taşınıyor");
    assert(Boolean(attached.csvPreview?.rows?.length), "partialSuccess job: csvPreview taşınıyor");
  }

  console.log("\n  csvDiagnostics örnek:", JSON.stringify({
    selectedTitleSource: "root",
    selectedPriceSource: "root",
    rawPriceShape: "object{original}",
    canonicalCreated: true,
    normalizedCreated: true,
    csvLength: 842,
    csvReady: true,
  }));
}

await runAttachCsvTests();

// Renk adı + kendi görseli → CSV Variant Image
{
  const canonical = buildCanonicalProductForShopify({
    sourceUrl: "https://www.trendyol.com/lacase/ewo-bordo-p-975907095",
    scrapeResult: {
      title: "Ewo Kuyruklu Abiye",
      brand: "LACASE",
      price: { original: 1200 },
      images: [
        "https://cdn.dsmcdn.com/bordo1.jpg",
        "https://cdn.dsmcdn.com/siyah1.jpg",
      ],
      imagesByColor: {
        Bordo: ["https://cdn.dsmcdn.com/bordo1.jpg", "https://cdn.dsmcdn.com/bordo2.jpg"],
        Siyah: ["https://cdn.dsmcdn.com/siyah1.jpg"],
      },
      variants: {
        colors: ["Bordo", "Siyah"],
        sizes: ["M", "L"],
        allVariants: [
          {
            color: "Bordo",
            size: "M",
            inStock: true,
            image: "https://cdn.dsmcdn.com/bordo1.jpg",
          },
          {
            color: "Bordo",
            size: "L",
            inStock: true,
            image: "https://cdn.dsmcdn.com/bordo1.jpg",
          },
          {
            color: "Siyah",
            size: "M",
            inStock: true,
            image: "https://cdn.dsmcdn.com/siyah1.jpg",
          },
          {
            color: "Siyah",
            size: "L",
            inStock: true,
            image: "https://cdn.dsmcdn.com/siyah1.jpg",
          },
        ],
      },
    },
  });
  assert(canonical != null, "multi-color canonical");
  assert(canonical!.variants.some((v) => v.color === "Bordo" && v.image?.includes("bordo")), "Bordo image");
  assert(canonical!.variants.some((v) => v.color === "Siyah" && v.image?.includes("siyah")), "Siyah image");
  const csv = generateCanonicalShopifyCSV(canonical!);
  assert(csv != null && csv.includes("bordo1.jpg"), "CSV bordo image");
  assert(csv != null && csv.includes("siyah1.jpg"), "CSV siyah image");
  assert(csv != null && /Ewo Kuyruklu Abiye - Bordo/.test(csv), "CSV alt text Bordo");
  assert(csv != null && /Ewo Kuyruklu Abiye - Siyah/.test(csv), "CSV alt text Siyah");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
