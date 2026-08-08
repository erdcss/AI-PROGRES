/**
 * Trendyol varyant ↔ medya grubu testleri
 * Çalıştır: npx tsx server/__tests__/trendyol-variant-media.test.ts
 */
import {
  applyTrendyolVariantMediaToScrapeResult,
  resolveTrendyolVariantMedia,
} from "../trendyol-variant-media-resolver";
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

const TURUNCU_1 = "https://cdn.dsmcdn.com/mnresize/1200/1800/turuncu-1.jpg";
const TURUNCU_2 = "https://cdn.dsmcdn.com/mnresize/1200/1800/turuncu-2.jpg";
const SIYAH_1 = "https://cdn.dsmcdn.com/mnresize/1200/1800/siyah-1.jpg";
const SIYAH_2 = "https://cdn.dsmcdn.com/mnresize/800/1200/siyah-1.jpg?org=siyah"; // same asset, different resize/query

function baseScrape(overrides: Record<string, unknown> = {}) {
  return {
    title: "Test Bluz",
    images: [TURUNCU_1, TURUNCU_2, SIYAH_1],
    imagesByColor: {
      Turuncu: [TURUNCU_1, TURUNCU_2],
      Siyah: [SIYAH_1],
    },
    productContentId: 1134593582,
    variants: {
      allVariants: [
        {
          id: "t-sm",
          color: "Turuncu",
          size: "S-M",
          inStock: true,
          stockCount: 2,
        },
        {
          id: "t-lxl",
          color: "Turuncu",
          size: "L-XL",
          inStock: true,
          stockCount: 1,
        },
        {
          id: "s-sm",
          color: "Siyah",
          size: "S-M",
          inStock: true,
          stockCount: 3,
        },
        {
          id: "s-lxl",
          color: "Siyah",
          size: "L-XL",
          inStock: false,
          stockCount: 0,
        },
      ],
    },
    ...overrides,
  };
}

console.log("\n=== Trendyol Variant Media ===\n");

// TEST 1: Aynı renk + farklı beden => aynı mediaGroupKey
{
  const result = baseScrape();
  applyTrendyolVariantMediaToScrapeResult(result);
  const all = result.variants.allVariants as Array<Record<string, unknown>>;
  const turuncu = all.filter((v) => v.color === "Turuncu");
  assert(turuncu.length === 2, "TEST1: iki Turuncu beden var");
  assert(
    turuncu[0].mediaGroupKey === turuncu[1].mediaGroupKey &&
      turuncu[0].mediaGroupKey === "color:turuncu",
    "TEST1: aynı renk → aynı mediaGroupKey",
  );
  assert(
    turuncu[0].featuredImage === turuncu[1].featuredImage &&
      String(turuncu[0].featuredImage).includes("turuncu-1"),
    "TEST1: aynı renk → aynı featuredImage (grup ana görseli)",
  );
}

// TEST 2: Farklı renk => farklı mediaGroupKey
{
  const result = baseScrape();
  applyTrendyolVariantMediaToScrapeResult(result);
  const all = result.variants.allVariants as Array<Record<string, unknown>>;
  const t = all.find((v) => v.color === "Turuncu")!;
  const s = all.find((v) => v.color === "Siyah")!;
  assert(
    t.mediaGroupKey !== s.mediaGroupKey &&
      t.mediaGroupKey === "color:turuncu" &&
      s.mediaGroupKey === "color:siyah",
    "TEST2: farklı renk → farklı mediaGroupKey",
  );
  assert(
    t.featuredImage !== s.featuredImage,
    "TEST2: farklı renk → farklı featuredImage",
  );
}

// TEST 3: Varyant sırası değişse bile featuredImage değişmemeli
{
  const a = baseScrape();
  const b = baseScrape({
    variants: {
      allVariants: [
        {
          id: "t-lxl",
          color: "Turuncu",
          size: "L-XL",
          inStock: true,
          stockCount: 1,
        },
        {
          id: "t-sm",
          color: "Turuncu",
          size: "S-M",
          inStock: true,
          stockCount: 2,
        },
        {
          id: "s-lxl",
          color: "Siyah",
          size: "L-XL",
          inStock: false,
          stockCount: 0,
        },
        {
          id: "s-sm",
          color: "Siyah",
          size: "S-M",
          inStock: true,
          stockCount: 3,
        },
      ],
    },
  });
  applyTrendyolVariantMediaToScrapeResult(a);
  applyTrendyolVariantMediaToScrapeResult(b);
  const aT = (a.variants.allVariants as Array<Record<string, unknown>>).find(
    (v) => v.size === "S-M" && v.color === "Turuncu",
  )!;
  const bT = (b.variants.allVariants as Array<Record<string, unknown>>).find(
    (v) => v.size === "S-M" && v.color === "Turuncu",
  )!;
  assert(
    aT.featuredImage === bT.featuredImage &&
      aT.mediaGroupKey === bT.mediaGroupKey,
    "TEST3: sıra değişince featuredImage/mediaGroupKey aynı kalır",
  );
  // Index mapping olsaydı 2. sıradaki Turuncu farklı görsele bağlanırdı
  const aAll = a.variants.allVariants as Array<Record<string, unknown>>;
  assert(
    aAll.every(
      (v) =>
        v.color !== "Turuncu" ||
        String(v.featuredImage).includes("turuncu-1"),
    ),
    "TEST3: Turuncu bedenler images[i] değil grup ana görseli alır",
  );
}

// TEST 4: Kaynakta olmayan beden/renk otomatik oluşturulmamalı
{
  const html = `
    <script>
    window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ = {
      "product": {
        "id": 999,
        "images": ["https://cdn.dsmcdn.com/x.jpg"],
        "allVariants": [
          {"id": 1, "color": "Turuncu", "size": "S/M", "inStock": true, "quantity": 2, "images": ["https://cdn.dsmcdn.com/t1.jpg"]},
          {"id": 2, "color": "Turuncu", "size": "L/XL", "inStock": true, "quantity": 1, "images": ["https://cdn.dsmcdn.com/t1.jpg"]}
        ]
      }
    };
    </script>
  `;
  const resolved = resolveTrendyolVariantMedia(html);
  const colors = new Set(resolved.variants.allVariants.map((v) => v.color));
  const sizes = new Set(resolved.variants.allVariants.map((v) => v.size));
  assert(!colors.has("Gri"), "TEST4: sahte Gri üretilmez");
  assert(!sizes.has("XS") && !sizes.has("XXL") && !sizes.has("3XL"), "TEST4: sahte beden üretilmez");
  assert(colors.size === 1 && colors.has("Turuncu"), "TEST4: yalnızca kaynak renk");
  assert(
    resolved.variants.allVariants.length === 2,
    "TEST4: yalnızca kaynak varyant sayısı",
  );
}

// TEST 5: variantMediaGroups yoksa eski ürünlerde güvenli fallback
{
  const legacy = {
    title: "Eski Ürün",
    images: [TURUNCU_1, TURUNCU_2],
    variants: {
      allVariants: [
        { id: "1", color: "Turuncu", size: "S", inStock: true },
        { id: "2", color: "Turuncu", size: "M", inStock: true },
      ],
    },
  };
  const resolution = applyTrendyolVariantMediaToScrapeResult(legacy);
  assert(
    Array.isArray(resolution.variantMediaGroups) &&
      resolution.variantMediaGroups.length >= 1,
    "TEST5: groups yokken resolver grup üretir",
  );
  const all = legacy.variants.allVariants as Array<Record<string, unknown>>;
  assert(
    all.every((v) => v.featuredImage === TURUNCU_1 || v.featuredImage === TURUNCU_2),
    "TEST5: featuredImage ürün görsellerinden fallback",
  );
  assert(
    all[0].mediaGroupKey === all[1].mediaGroupKey,
    "TEST5: aynı renk fallback'te de aynı grup",
  );

  // CSV: media groups olmadan da Variant Image boş kalmamalı
  const product = {
    sourcePlatform: "trendyol" as const,
    sourceProductId: "1",
    sourceUrl: "https://example.com",
    sourceKey: "trendyol:1",
    handle: "eski-urun",
    title: "Eski Ürün",
    brand: "Test",
    price: "100",
    images: [TURUNCU_1],
    variants: [
      {
        sourceProductId: "1",
        color: "Turuncu",
        size: "S",
        option1Name: "Renk" as const,
        option1Value: "Turuncu",
        option2Name: "Beden" as const,
        option2Value: "S",
        sku: "1-turuncu-s",
        inStock: true,
        inventoryQty: 1,
        sourceStockQty: 1,
        stockConfidence: "high" as const,
        price: "100",
        image: TURUNCU_1,
      },
    ],
    outOfStockVariants: [] as [],
    stockSummary: {
      inStockCount: 1,
      outOfStockCount: 0,
      totalVariants: 1,
      unknownStockCount: 0,
    },
  };
  const csv = generateCanonicalShopifyCSV(product as any);
  assert(
    csv.includes(TURUNCU_1),
    "TEST5: CSV Variant Image / Image Src fallback çalışır",
  );
}

// TEST 6: Aynı görsel URL'si (resize/query) duplicate olmamalı
{
  const result = baseScrape({
    imagesByColor: {
      Siyah: [SIYAH_1, SIYAH_2, SIYAH_1],
      Turuncu: [TURUNCU_1, TURUNCU_1 + "?w=100", TURUNCU_2],
    },
  });
  applyTrendyolVariantMediaToScrapeResult(result);
  const groups = (result as any).variantMediaGroups as Array<{
    optionValue: string;
    images: string[];
  }>;
  const siyah = groups.find((g) => g.optionValue === "Siyah")!;
  const turuncu = groups.find((g) => g.optionValue === "Turuncu")!;
  assert(siyah.images.length === 1, "TEST6: Siyah duplicate resize/query birleşir");
  assert(turuncu.images.length === 2, "TEST6: Turuncu gerçek 2 görsel korunur");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} kaldı ===\n`);
process.exit(failed > 0 ? 1 : 0);
