/**
 * Trendyol varyant stok normalizer testleri
 * Çalıştır: npx tsx server/__tests__/trendyol-variant-stock-normalizer.test.ts
 */
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  normalizeTrendyolVariantStock,
  isValidTrendyolSizeLabel,
  buildVariantStockKey,
} from "../trendyol-variant-stock-normalizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

function htmlFixture(body: string, stateJson?: object): string {
  const state = stateJson
    ? `<script>window.__PRODUCT_DETAIL_APP_INITIAL_STATE__=${JSON.stringify(stateJson)};</script>`
    : "";
  return `<!DOCTYPE html><html><head></head><body>${body}${state}</body></html>`;
}

console.log("\n=== Trendyol Variant Stock Normalizer Tests ===\n");

// 1. Renk yoksa Tek Renk
{
  const html = htmlFixture(`
    <div class="slicing-attribute-section-value">
      <button>S</button><button class="disabled">M</button><button>L</button><button>XL</button>
    </div>
  `);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  assert(result.colors.includes("Tek Renk"), "Renk yoksa Tek Renk kullanılır");
  assert(result.stockMap["Tek Renk-S"] === true, "Tek Renk-S stokta");
  assert(Object.keys(result.stockMap).length >= 4, "stockMap boş değil");
}

// 2. S/M/L/XL — 4 varyant
{
  const html = htmlFixture("", {
    product: {
      slicedAttributes: [
        {
          attributeName: "Renk",
          attributes: [{ attributeValue: "YAĞ YEŞİLİ", inStock: true }],
        },
        {
          attributeName: "Beden",
          attributes: [
            { attributeValue: "S", stockState: "InStock", inStock: true },
            { attributeValue: "M", stockState: "InStock", inStock: true },
            { attributeValue: "L", stockState: "InStock", inStock: true },
            { attributeValue: "XL", stockState: "OutOfStock", inStock: false },
          ],
        },
      ],
    },
  });
  const result = normalizeTrendyolVariantStock({ html });
  assert(result.sizes.length === 4, "4 beden bulunur");
  assert(result.variants.length === 4, "4 varyant oluşur");
  assert(result.stockMap["YAĞ YEŞİLİ-XL"] === false, "XL stokta değil");
  assert(result.outOfStockVariants.some((v) => v.size === "XL"), "XL outOfStockVariants içinde");
}

// 3. Disabled class
{
  const html = htmlFixture(`
    <button class="slicing-attributes disabled">M</button>
    <div class="slicing-attribute-section-value">
      <button>S</button>
      <button class="passive">M</button>
      <button>L</button>
    </div>
  `);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  const mVariant = result.variants.find((v) => v.size === "M");
  assert(mVariant?.inStock === false, "passive/disabled beden stokta değil");
}

// 4. aria-disabled
{
  const html = htmlFixture(`
    <div class="slicing-attribute-section-value">
      <button aria-disabled="true">XL</button>
      <button>S</button>
    </div>
  `);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  const xl = result.variants.find((v) => v.size === "XL");
  assert(xl?.inStock === false, 'aria-disabled="true" stokta değil');
}

// 5. Script JSON stock:0
{
  const html = htmlFixture("", {
    product: {
      allVariants: [
        {
          attributes: { RENK: "Kırmızı", BEDEN: "S" },
          stock: 5,
          inStock: true,
        },
        {
          attributes: { RENK: "Kırmızı", BEDEN: "M" },
          stock: 0,
          inStock: false,
        },
      ],
    },
  });
  const result = normalizeTrendyolVariantStock({ html });
  assert(result.stockMap["Kırmızı-M"] === false, "script stock:0 → stokta yok");
  assert(result.stockMap["Kırmızı-S"] === true, "script stock>0 → stokta");
}

// 6. Ürün stokta ama bir beden tükenmiş
{
  const html = htmlFixture("", {
    product: {
      slicedAttributes: [
        {
          attributeName: "Beden",
          attributes: [
            { attributeValue: "S", inStock: true },
            { attributeValue: "M", inStock: false },
          ],
        },
      ],
    },
  });
  const result = normalizeTrendyolVariantStock({ html });
  assert(result.productInStock === true, "Ürün genel olarak stokta");
  assert(result.availableVariants.length === 1, "Yalnızca 1 beden stokta");
  assert(result.outOfStockVariants.length === 1, "1 beden tükenmiş");
}

// 7. Düşük güven — otomatik stokta varsayımı yok
{
  const html = htmlFixture(`<p>Ürün açıklaması</p>`);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  assert(result.confidence === "low", "Stok bilgisi yoksa confidence low");
  assert(result.warnings.length > 0, "Uyarı üretilir");
}

// 8. Renk: metni
{
  const html = htmlFixture(`<p>Renk: YAĞ YEŞİLİ</p><div><button>S</button><button>L</button></div>`);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  assert(
    result.colors.some((c) => c.toUpperCase().includes("YAĞ YEŞİLİ")),
    "Renk: metninden renk çıkarılır",
  );
}

// 9. Valiberta fixture
{
  const fixturePath = path.join(__dirname, "../__fixtures__/valiberta-haki-shirt-api.json");
  const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const result = normalizeTrendyolVariantStock({ product: raw.result });
  assert(result.variants.length === 15, "Valiberta: 15 kombinasyon");
  assert(result.outOfStockVariants.length === 6, "Valiberta: 6 tükenmiş");
  assert(result.confidence !== "low", "Valiberta: confidence low değil");
}

// 10. isValidTrendyolSizeLabel rejects noise
assert(!isValidTrendyolSizeLabel("Sepete Ekle"), "Sepete Ekle beden değil");
assert(isValidTrendyolSizeLabel("XL"), "XL geçerli beden");
assert(buildVariantStockKey("Kırmızı", "S") === "Kırmızı-S", "stock key formatı");

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
process.exit(failed > 0 ? 1 : 0);
