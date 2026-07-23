import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeTrendyolKurus,
  normalizeTrendyolPriceValue,
  parseTurkishPriceText,
  extractOriginalTrendyolPriceFromProduct,
  pickPlausibleTrendyolPrice,
  resolveTrendyolOriginalListPrice,
} from "../trendyol-price-utils.ts";

describe("parseTurkishPriceText — 5+ digit TL", () => {
  it("parses thousand-dot display prices", () => {
    assert.equal(parseTurkishPriceText("12.875 TL"), 12875);
    assert.equal(parseTurkishPriceText("12.885 TL"), 12885);
    assert.equal(parseTurkishPriceText("Sepette 12.875 TL"), 12875);
    assert.equal(parseTurkishPriceText("26.000 TL"), 26000);
    assert.equal(parseTurkishPriceText("23.500 TL"), 23500);
    assert.equal(parseTurkishPriceText("26.000,00 TL"), 26000);
  });

  it("keeps plain digit strings as TL", () => {
    assert.equal(parseTurkishPriceText("12875"), 12875);
    assert.equal(parseTurkishPriceText("23500"), 23500);
    assert.equal(parseTurkishPriceText("26000"), 26000);
  });

  it("parses normal apparel prices", () => {
    assert.equal(parseTurkishPriceText("799,00 TL"), 799);
    assert.equal(parseTurkishPriceText("279,92 TL"), 279.92);
  });
});

describe("normalizeTrendyolPriceValue — no false kuruş", () => {
  it("does not divide 5+ digit TL by 100", () => {
    assert.equal(normalizeTrendyolPriceValue(12875), 12875);
    assert.equal(normalizeTrendyolPriceValue(23500), 23500);
    assert.equal(normalizeTrendyolPriceValue(26000), 26000);
    assert.equal(normalizeTrendyolPriceValue("12.875"), 12875);
    assert.equal(normalizeTrendyolPriceValue("12.875 TL"), 12875);
    assert.equal(normalizeTrendyolPriceValue("23.500 TL"), 23500);
  });

  it("still converts explicit API kuruş", () => {
    assert.equal(normalizeTrendyolKurus(27992, "api"), 279.92);
    assert.equal(normalizeTrendyolKurus(1_287_500, "api"), 12875);
    assert.equal(normalizeTrendyolKurus(2_600_000, "api"), 26000);
  });

  it("reads nested API price.value as kuruş", () => {
    assert.equal(
      extractOriginalTrendyolPriceFromProduct({
        price: {
          originalPrice: { value: 1_287_500 },
          sellingPrice: { value: 1_287_500 },
        },
      }),
      12875,
    );
  });
});

describe("100x kuruş/TL confusion recovery", () => {
  it("picks real TL when API under-converted by 100x", () => {
    assert.equal(pickPlausibleTrendyolPrice(128.75, 12875), 12875);
    assert.equal(pickPlausibleTrendyolPrice(128.75, 12885), 12885);
  });

  it("resolver prefers DOM thousand-price over wrong API kuruş", () => {
    const resolved = resolveTrendyolOriginalListPrice({
      product: {
        price: {
          // Yanlış/eksik kuruş: 12875 → 128.75 TL sanılır
          originalPrice: { value: 12875 },
        },
      },
      domPrice: 12885,
    });
    assert.equal(resolved, 12885);
  });
});
