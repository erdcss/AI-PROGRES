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
  detectProductLevelOutOfStock,
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

// 4b. Kilit ikonu (disabled yok) — Trendyol size-box OOS
{
  const html = htmlFixture(`
    <div data-testid="size-variant-section">
      <button data-testid="size-box">
        XS
        <svg class="i-lock" aria-label="kilit"><path d="M0 0"/></svg>
      </button>
      <button data-testid="size-box">S</button>
      <button data-testid="size-box">M</button>
      <button data-testid="size-box">L</button>
      <button data-testid="size-box">XL</button>
      <button data-testid="size-box">2XL</button>
      <button data-testid="size-box">
        3XL
        <i class="icon-lock"></i>
      </button>
    </div>
  `);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  assert(result.sizes.length === 7, "Kilit fixture: 7 beden (XS–3XL)");
  const xs = result.variants.find((v) => v.size.toUpperCase() === "XS");
  const s = result.variants.find((v) => v.size.toUpperCase() === "S");
  const xxxl = result.variants.find((v) => v.size.toUpperCase() === "3XL");
  assert(xs?.inStock === false, "Kilitli XS stokta değil");
  assert(s?.inStock === true, "S stokta");
  assert(xxxl?.inStock === false, "Kilitli 3XL stokta değil");
  assert(
    result.outOfStockVariants.some((v) => v.size.toUpperCase() === "XS"),
    "XS outOfStockVariants içinde",
  );
  assert(
    result.outOfStockVariants.some((v) => v.size.toUpperCase() === "3XL"),
    "3XL outOfStockVariants içinde",
  );
}

// 4c. size-box + locked class (SVG class yok)
{
  const html = htmlFixture(`
    <button data-testid="size-box" class="size-box locked">XS</button>
    <button data-testid="size-box">M</button>
  `);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({ html, $ });
  assert(
    result.variants.find((v) => v.size === "XS")?.inStock === false,
    "locked class XS stokta değil",
  );
  assert(result.variants.find((v) => v.size === "M")?.inStock === true, "M stokta");
}

// 4d. Çok renkte bir rengin OOS bedeni diğer renge sızmamalı
{
  const html = htmlFixture("", {
    product: {
      color: "Siyah",
      slicedAttributes: [
        {
          attributeName: "Renk",
          attributes: [
            { attributeValue: "Sarı", inStock: true },
            { attributeValue: "Siyah", inStock: true },
            { attributeValue: "Mavi", inStock: true },
          ],
        },
        {
          attributeName: "Beden",
          attributes: [
            { attributeValue: "S", stockState: "InStock", inStock: true },
            { attributeValue: "M", stockState: "OutOfStock", inStock: false },
            { attributeValue: "L", stockState: "InStock", inStock: true },
          ],
        },
      ],
      allVariants: [
        { attributes: { RENK: "Siyah", BEDEN: "S" }, stock: 3, inStock: true },
        { attributes: { RENK: "Siyah", BEDEN: "M" }, stock: 0, inStock: false },
        { attributes: { RENK: "Siyah", BEDEN: "L" }, stock: 2, inStock: true },
        { attributes: { RENK: "Sarı", BEDEN: "S" }, stock: 1, inStock: true },
        { attributes: { RENK: "Sarı", BEDEN: "M" }, stock: 4, inStock: true },
        { attributes: { RENK: "Sarı", BEDEN: "L" }, stock: 1, inStock: true },
      ],
    },
  });
  const result = normalizeTrendyolVariantStock({ html });
  const siyahM = result.variants.find(
    (v) => v.color === "Siyah" && v.size === "M",
  );
  const sariM = result.variants.find((v) => v.color === "Sarı" && v.size === "M");
  assert(siyahM?.inStock === false, "Siyah-M stokta değil");
  assert(sariM?.inStock === true, "Sarı-M stokta kalır (Siyah OOS sızmaz)");
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

// 7. Düşük güven — bedensiz üründe OOS zorlanmaz
{
  const html = htmlFixture(`<p>Ürün açıklaması</p>`);
  const $ = cheerio.load(html);
  const result = normalizeTrendyolVariantStock({
    html,
    $,
    title: "L'Oreal Paris Panorama Maskara Siyah",
  });
  assert(result.confidence === "low", "Stok bilgisi yoksa confidence low");
  assert(result.warnings.length > 0, "Uyarı üretilir");
  assert(
    result.variants.every((v) => v.inStock !== false) || result.variants.length === 0,
    "Bedensiz düşük güvende fallback OOS zorlanmaz",
  );
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
  assert(result.variants.length === 5, "Valiberta: mevcut renk × 5 beden (çapraz yok)");
  assert(result.outOfStockVariants.length === 2, "Valiberta: M ve 2XL tükenmiş");
  assert(result.confidence !== "low", "Valiberta: confidence low değil");
  assert(
    result.variants.every((v) => v.color === "Açık Haki"),
    "Valiberta: yalnızca mevcut renk (Açık Haki)",
  );
}

// 10. isValidTrendyolSizeLabel rejects noise
assert(!isValidTrendyolSizeLabel("Sepete Ekle"), "Sepete Ekle beden değil");
assert(isValidTrendyolSizeLabel("XL"), "XL geçerli beden");
assert(buildVariantStockKey("Kırmızı", "S") === "Kırmızı-S", "stock key formatı");

// 11. Ürün seviyesi OOS — "Stoklar Tükendi" + Tükendi CTA (bedensiz ürün)
{
  const html = htmlFixture(`
    <div class="product-overlay">Stoklar Tükendi</div>
    <p>Renk: Kırmızı</p>
    <button class="add-to-basket">Tükendi!</button>
  `);
  const $ = cheerio.load(html);
  const detected = detectProductLevelOutOfStock({ html });
  assert(detected.outOfStock === true, "Stoklar Tükendi algılanır");
  const result = normalizeTrendyolVariantStock({ html, $ });
  assert(result.productInStock === false, "Bedensiz ürün productInStock=false");
  assert(result.variants.length >= 1, "En az 1 varyant üretilir");
  assert(
    result.variants.every((v) => v.inStock === false),
    "Tüm varyantlar OOS",
  );
  assert(result.confidence !== "low", "Ürün OOS kanıtında confidence low değil");
}

// 11b. Sepete Ekle varken ilgili ürün "Stoklar Tükendi" → ürün OOS değil
{
  const html = htmlFixture(`
    <div class="product-button-container"><button class="add-to-basket">Sepete Ekle</button></div>
    <div class="recommendations"><div>Stoklar Tükendi</div><button>Tükendi!</button></div>
  `);
  const detected = detectProductLevelOutOfStock({ html });
  assert(detected.outOfStock === false, "Sepete Ekle varken öneri OOS yok sayılır");
  const result = normalizeTrendyolVariantStock({ html, $: cheerio.load(html) });
  assert(result.productInStock === true, "Ana ürün stokta kalır");
}

// 12. Açıklama metninde yalnız "tükendi" geçmesi ürün OOS sayılmaz
{
  const html = htmlFixture(`<p>Bu ürün daha önce tükendiğinde çok satılmıştı.</p>
    <button class="add-to-basket">Sepete Ekle</button>`);
  const detected = detectProductLevelOutOfStock({ html });
  assert(detected.outOfStock === false, "Yorum metnindeki tükendi ürün OOS değildir");
}

console.log(`\n=== Sonuç: ${passed} geçti, ${failed} başarısız ===\n`);
process.exit(failed > 0 ? 1 : 0);
