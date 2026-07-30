/**
 * Takip fiyat tespiti + Shopify düzeltme eşlemesi regression.
 * Çalıştır: npx tsx --test shared/__tests__/tracking-price-shopify-fix.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessPriceChange,
  looksLikeListToActiveCorrection,
} from "../tracking-price-sanity.ts";
import {
  extractSourceCostFromChangeValue,
  matchTrackedVariantByKey,
  parseStableVariantKey,
} from "../tracking-variant-resolve.ts";
import {
  applyProfitMargin,
  resolveProfitMarginPercent,
} from "../tracking-price-display.ts";
import { parseSourcePrice } from "../scrape-validity.ts";

describe("list → active price detection", () => {
  it("detects typical list-to-active drop", () => {
    assert.equal(looksLikeListToActiveCorrection(20999, 17755), true);
    const a = assessPriceChange(20999, 17755);
    assert.equal(a.shouldRecord, true);
    assert.equal(a.status, "pending");
    assert.ok((a.reason ?? "").toLowerCase().includes("aktif"));
  });

  it("does not treat tiny noise as change", () => {
    const a = assessPriceChange(17755, 17755.2);
    assert.equal(a.shouldRecord, false);
  });

  it("rejects 100x kuruş/TL scale bug", () => {
    const a = assessPriceChange(17755, 177.55);
    assert.equal(a.shouldRecord, false);
  });

  it("sends sharp increases to manual review", () => {
    const a = assessPriceChange(880, 1149);
    assert.equal(a.shouldRecord, true);
    assert.equal(a.status, "manual_review");
  });
});

describe("variant key resolve for Shopify sync", () => {
  it("parses color::size keys", () => {
    assert.deepEqual(parseStableVariantKey("Beyaz::M"), {
      color: "Beyaz",
      size: "M",
      raw: "Beyaz::M",
    });
  });

  it("matches tracked variant by key when price values are plain numbers", () => {
    const rows = [
      {
        id: 1,
        option1: "Beyaz",
        option2: "S",
        shopifyVariantId: "111",
        sourceSku: null,
      },
      {
        id: 2,
        option1: "Beyaz",
        option2: "M",
        shopifyVariantId: "222",
        sourceSku: null,
      },
    ];
    const matched = matchTrackedVariantByKey(rows, "beyaz::m");
    assert.equal(matched?.id, 2);
    assert.equal(matched?.shopifyVariantId, "222");
  });
});

describe("source cost extraction + margin → Shopify sale", () => {
  it("reads plain number or nested price object", () => {
    assert.equal(extractSourceCostFromChangeValue(17755), 17755);
    assert.equal(extractSourceCostFromChangeValue({ price: 17755 }), 17755);
    assert.equal(extractSourceCostFromChangeValue({ active: 17755 }), 17755);
  });

  it("prefers active/original over withProfit for tracking cost", () => {
    assert.equal(
      parseSourcePrice({ original: 17755, withProfit: 19530.5 }),
      17755,
    );
    assert.equal(parseSourcePrice({ active: 17755, withProfit: 19530.5 }), 17755);
  });

  it("computes Shopify sale with stored margin", () => {
    const margin = resolveProfitMarginPercent({ profitMargin: 10, fallbackPercent: 10 });
    assert.equal(margin, 10);
    assert.equal(applyProfitMargin(17755, margin), 19530.5);
  });

  it("falls back to 10% when transfer margin missing", () => {
    assert.equal(resolveProfitMarginPercent({ fallbackPercent: 10 }), 10);
  });
});
