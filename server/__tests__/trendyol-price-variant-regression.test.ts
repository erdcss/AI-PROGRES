/**
 * Trendyol fiyat + beden regression testi
 *
 * Kapsam:
 *  - Tek fiyat sistemi: aktif selling/discounted → original/list fallback; Plus tuzağı reddedilir.
 *  - Beden çıkarımı: API 556 olsa bile embedded JSON (__PRODUCT_DETAIL_APP_INITIAL_STATE__),
 *    slicedAttributes, allVariants, merchantListing ve JSON-LD kaynakları birleştirilir.
 *  - Regresyon URL'si: framgan Y2k Beyaz Born to Reat Oversize T-Shirt (p-941825789)
 *
 * Çalıştır: npm run test:price-variant
 */
import * as cheerio from "cheerio";
import {
  extractOriginalTrendyolPriceFromProduct,
  resolveTrendyolActivePayablePrice,
} from "../trendyol-price-utils";
import { getTrendyolProductFromState } from "../trendyol-product-state";
import { resolveTrendyolVariants } from "../trendyol-variant-resolver";
import { normalizeTrendyolVariantStock } from "../trendyol-variant-stock-normalizer";
import { ultimatePriceExtract } from "../ultimate-price-extractor";

const REGRESSION_URL =
  "https://www.trendyol.com/framgan/y2k-beyaz-born-to-reat-baskili-oversize-t-shirt-p-941825789?boutiqueId=61&merchantId=1032714&sav=true";

// Beklenenler:
//   Aktif satış fiyatı: 279.92 TL  (sellingPrice = originalPrice)
//   Trendyol Plus / kampanya fiyatı: 151.28 TL  → üyelik tuzağı, seçilmemeli
//   Bedenler: S, M, L (tükendi), XL — API 556 olsa da embedded JSON'dan gelmeli
const EXPECTED_ORIGINAL = 279.92;
const PLUS_PRICE = 151.28;

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

/**
 * Framgan ürün sayfasının gerçekçi temsili:
 *  - Gövde bot koruması (556) ile gelmiş gibi minimal DOM: yalnızca 1 seçili beden butonu.
 *  - Ancak sayfa içi embedded state (__PRODUCT_DETAIL_APP_INITIAL_STATE__) tüm bedenleri,
 *    slicedAttributes + allVariants ile birlikte içeriyor.
 *  - price bloğu: originalPrice = sellingPrice = 27992 kuruş (279.92 TL),
 *    discountedPrice = 15128 kuruş (151.28 TL — Plus tuzağı).
 *  - JSON-LD offers.price = 151.28 (Plus fiyatı — tuzak).
 */
function buildFramganFixtureHtml(): string {
  const pad = "x".repeat(6000);
  const state = {
    product: {
      id: 941825789,
      name: "Y2k Beyaz Born to Reat Baskılı Oversize T-Shirt",
      brand: { name: "Framgan" },
      price: {
        originalPrice: { value: 27992 },
        sellingPrice: { value: 27992 },
        discountedPrice: { value: 15128 },
      },
      slicedAttributes: [
        {
          attributeName: "Beden",
          attributes: [
            { attributeValue: "S", inStock: true },
            { attributeValue: "M", inStock: true },
            { attributeValue: "L", inStock: false },
            { attributeValue: "XL", inStock: true },
          ],
        },
      ],
      allVariants: [
        { attributeName: "Beden", attributeValue: "S", inStock: true, stock: 5 },
        { attributeName: "Beden", attributeValue: "M", inStock: true, stock: 3 },
        { attributeName: "Beden", attributeValue: "L", inStock: false, stock: 0 },
        { attributeName: "Beden", attributeValue: "XL", inStock: true, stock: 2 },
      ],
    },
  };

  return `${pad}
<script type="application/ld+json">
{"@type":"Product","name":"Y2k Beyaz Born to Reat Baskılı Oversize T-Shirt","brand":{"name":"Framgan"},"offers":{"price":"151.28","priceCurrency":"TRY"}}
</script>
<script>window.__PRODUCT_DETAIL_APP_INITIAL_STATE__=${JSON.stringify(state)};</script>
<div class="product-price-container">
  <span class="prc-dsc">151,28 TL</span>
  <span class="prc-org">279,92 TL</span>
</div>
<div class="slicing-attribute-section-value"><button class="selected">M</button></div>`;
}

function fmt(n: number): string {
  return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

function printResultTable(rows: Array<{
  kaynak: string;
  fiyat: string;
  bedenler: string;
  stok: string;
  final: string;
}>) {
  const headers = {
    kaynak: "Kaynak",
    fiyat: "Bulunan fiyat",
    bedenler: "Bulunan bedenler",
    stok: "Stok durumu",
    final: "Final seçilen değer",
  };
  const all = [headers, ...rows];
  const widths = {
    kaynak: Math.max(...all.map((r) => r.kaynak.length)),
    fiyat: Math.max(...all.map((r) => r.fiyat.length)),
    bedenler: Math.max(...all.map((r) => r.bedenler.length)),
    stok: Math.max(...all.map((r) => r.stok.length)),
    final: Math.max(...all.map((r) => r.final.length)),
  };
  const line = (r: typeof headers) =>
    `| ${r.kaynak.padEnd(widths.kaynak)} | ${r.fiyat.padEnd(widths.fiyat)} | ${r.bedenler.padEnd(
      widths.bedenler,
    )} | ${r.stok.padEnd(widths.stok)} | ${r.final.padEnd(widths.final)} |`;
  const sep = `|-${"-".repeat(widths.kaynak)}-|-${"-".repeat(widths.fiyat)}-|-${"-".repeat(
    widths.bedenler,
  )}-|-${"-".repeat(widths.stok)}-|-${"-".repeat(widths.final)}-|`;

  console.log(line(headers));
  console.log(sep);
  for (const r of rows) console.log(line(r));
}

console.log("\n=== Trendyol Fiyat + Beden Regression (framgan p-941825789) ===\n");
console.log(`URL: ${REGRESSION_URL}\n`);

async function run() {
  const html = buildFramganFixtureHtml();
  const $ = cheerio.load(html);
  const product = getTrendyolProductFromState(html);

  assert(!!product, "embedded state (__PRODUCT_DETAIL_APP_INITIAL_STATE__) parse edildi");

  // --- FİYAT ---
  const fromProduct = extractOriginalTrendyolPriceFromProduct(product);
  const resolved = resolveTrendyolActivePayablePrice({
    html,
    product: product ?? undefined,
    jsonLdPrice: PLUS_PRICE,
  }).active;
  const upe = await ultimatePriceExtract($, html);

  assert(
    Math.abs(fromProduct - EXPECTED_ORIGINAL) < 0.01,
    `extractOriginalTrendyolPriceFromProduct → ${fmt(fromProduct)} (beklenen ${fmt(EXPECTED_ORIGINAL)})`,
  );
  assert(
    Math.abs(resolved - EXPECTED_ORIGINAL) < 0.01,
    `resolveTrendyolActivePayablePrice → ${fmt(resolved)} (Plus ${fmt(PLUS_PRICE)} DEĞİL)`,
  );
  assert(
    Math.abs(upe.original - EXPECTED_ORIGINAL) < 0.01,
    `ultimatePriceExtract → ${fmt(upe.original)} (merkezî resolver, Plus DEĞİL)`,
  );
  assert(
    Math.abs(upe.original - PLUS_PRICE) > 0.01,
    `Plus/kampanya fiyatı (${fmt(PLUS_PRICE)}) ASLA final fiyat değil`,
  );

  // --- BEDEN / VARYANT ---
  const variants = resolveTrendyolVariants({ html, url: REGRESSION_URL, productTitle: product?.name as string });
  const stockNorm = normalizeTrendyolVariantStock({ html, $, url: REGRESSION_URL });

  const variantSizes = [...variants.sizes].sort();
  const stockSizes = [...stockNorm.sizes].sort();
  const expectedSizes = ["L", "M", "S", "XL"];

  assert(
    variants.sizes.length >= 4,
    `resolveTrendyolVariants → ${variants.sizes.length} beden (beklenen ≥4): [${variantSizes.join(", ")}]`,
  );
  assert(
    expectedSizes.every((s) => variantSizes.includes(s)),
    `Tüm bedenler embedded JSON'dan çıkarıldı: [${expectedSizes.join(", ")}]`,
  );
  assert(
    stockNorm.sizes.length >= 4,
    `normalizeTrendyolVariantStock → ${stockNorm.sizes.length} beden: [${stockSizes.join(", ")}]`,
  );

  // Stok durumu: L tükendi, S/M/XL stokta
  const stockOf = (size: string) => {
    const item = stockNorm.variants.find((v) => v.size.toLowerCase() === size.toLowerCase());
    return item ? item.inStock : undefined;
  };
  assert(stockOf("L") === false, "Beden L → stokta değil (allVariants stock=0)");
  assert(stockOf("S") === true, "Beden S → stokta");
  assert(stockOf("XL") === true, "Beden XL → stokta");

  // --- TABLO ---
  const jsonLdPriceText = fmt(PLUS_PRICE);
  console.log("\nFiyat/Beden çözümleme tablosu:\n");
  printResultTable([
    {
      kaynak: "state.product.price.originalPrice",
      fiyat: fmt(fromProduct),
      bedenler: "-",
      stok: "-",
      final: fmt(resolved),
    },
    {
      kaynak: "state.product.price.discountedPrice (Plus)",
      fiyat: jsonLdPriceText,
      bedenler: "-",
      stok: "-",
      final: "REDDEDİLDİ",
    },
    {
      kaynak: "JSON-LD offers.price",
      fiyat: jsonLdPriceText,
      bedenler: "-",
      stok: "-",
      final: "yalnızca fallback",
    },
    {
      kaynak: "slicedAttributes + allVariants (Beden)",
      fiyat: "-",
      bedenler: variantSizes.join(", "),
      stok: `L tükendi; S/M/XL stokta`,
      final: variantSizes.join(", "),
    },
    {
      kaynak: "DOM (görünür seçili beden)",
      fiyat: "151,28 / 279,92 TL",
      bedenler: "M",
      stok: "1 beden",
      final: "kullanılmadı (embedded daha zengin)",
    },
    {
      kaynak: "ultimatePriceExtract (merkezî)",
      fiyat: fmt(upe.original),
      bedenler: `${stockNorm.sizes.length} beden`,
      stok: `${stockNorm.availableVariants.length}/${stockNorm.variants.length} stokta`,
      final: `${fmt(upe.original)} · [${stockSizes.join(", ")}]`,
    },
  ]);

  console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Test çalıştırma hatası:", err);
  process.exit(1);
});
