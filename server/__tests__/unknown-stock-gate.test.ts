import { validateBulkUploadItem } from "../bulk-upload-validator";
import { generateCanonicalShopifyCSV } from "../shopify-canonical-export";
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

console.log("\n=== Unknown Stock Gate Tests ===\n");

{
  const result = await validateBulkUploadItem({
    clientItemId: "u1",
    sourceUrl: "https://www.trendyol.com/x-p-999",
    productData: {
      title: "Test Ürün Adı Uzun",
      brand: "Marka",
      price: { original: 150, withProfit: 165 },
      images: ["https://cdn.dsmcdn.com/test.jpg"],
      variants: {
        items: [{ color: "Gri", size: "S" }],
      },
    },
  });
  assert(result.ok === false && result.errorCode === "unknown_stock", "unknown stock otomatik upload engeli");
}

{
  const result = await validateBulkUploadItem({
    clientItemId: "u2",
    sourceUrl: "https://www.trendyol.com/x-p-999",
    approvedForShopify: true,
    productData: {
      title: "Test Ürün Adı Uzun",
      brand: "Marka",
      price: { original: 150, withProfit: 165 },
      images: ["https://cdn.dsmcdn.com/test.jpg"],
      variants: {
        items: [{ color: "Gri", size: "S", inStock: true }],
      },
    },
    csvContent: "Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Google Shopping / Google Product Category,Google Shopping / Gender,Google Shopping / Age Group,Google Shopping / MPN,Google Shopping / Condition,Google Shopping / Custom Product,Variant Image,Variant Weight Unit,Variant Tax Code,Cost per item,Included / United States,Price / United States,Compare At Price / United States,Included / International,Price / International,Compare At Price / International,Status\nx,x,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,active",
  });
  assert(result.ok === true || result.errorCode !== "unknown_stock", "manuel onay ile unknown stock geçebilir veya csv eksikse başka hata");
}

// Current canonical contract keeps out-of-stock rows both in `variants` and in
// the `outOfStockVariants` convenience subset. The overlap must not be treated
// as a duplicate SKU during upload validation.
{
  const sourceUrl = "https://www.trendyol.com/test/urun-p-123456";
  const productData = {
    title: "Varyantlı Test Ürünü",
    brand: "Test Marka",
    price: { original: 100, withProfit: 110 },
    images: ["https://cdn.dsmcdn.com/test.jpg"],
    variants: {
      allVariants: [
        { color: "Siyah", size: "S", inStock: true, stockCount: 10 },
        { color: "Siyah", size: "M", inStock: false, stockCount: 0 },
      ],
    },
  };
  const canonical = buildCanonicalProductForShopify({ scrapeResult: productData, sourceUrl });
  const csvContent = canonical ? generateCanonicalShopifyCSV(canonical) : null;
  const result = await validateBulkUploadItem({
    clientItemId: "overlap-1",
    sourceUrl,
    productData,
    canonicalProduct: canonical ?? undefined,
    csvContent: csvContent ?? undefined,
    approvedForShopify: true,
  });
  assert(
    result.errorCode !== "duplicate_sku",
    "outOfStockVariants alt kümesi duplicate_sku hatası üretmez",
  );
  assert(result.ok === true, "stokta ve stoksuz varyantlı canonical ürün doğrulamadan geçer");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
if (failed > 0) process.exit(1);
