import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyProfitMargin,
  buildPricePairDisplay,
  resolveMarginPercentPreferringLive,
  resolveProfitMarginPercent,
} from "../tracking-price-display.ts";

describe("tracking-price-display", () => {
  it("applies margin to cost", () => {
    assert.equal(applyProfitMargin(100, 10), 110);
    assert.equal(applyProfitMargin(450, 10), 495);
  });

  it("builds old/new cost and sale pairs", () => {
    const pair = buildPricePairDisplay(500, 450, 10);
    assert.equal(pair.costOld, 500);
    assert.equal(pair.costNew, 450);
    assert.equal(pair.saleOld, 550);
    assert.equal(pair.saleNew, 495);
    assert.equal(pair.marginPercent, 10);
  });

  it("uses live Shopify price as saleOld when provided", () => {
    const pair = buildPricePairDisplay(743.75, 665.46, 10, { liveSalePrice: 822.05 });
    assert.equal(pair.saleOld, 822.05);
    assert.equal(pair.saleOldFromShopify, true);
    assert.equal(pair.saleNew, 732.01);
  });

  it("prefers live-derived margin when transfer expectation drifts", () => {
    const margin = resolveMarginPercentPreferringLive({
      transferProfitMargin: 10,
      baselineCost: 743.75,
      liveSalePrice: 822.05,
      fallbackPercent: 10,
    });
    assert.ok(margin != null && margin > 10);
    const saleNew = applyProfitMargin(665.46, margin!);
    assert.ok(saleNew != null && saleNew > 732);
  });

  it("resolves margin from transfer or fallback", () => {
    assert.equal(
      resolveProfitMarginPercent({ profitMargin: 15, fallbackPercent: 10 }),
      15,
    );
    assert.equal(
      resolveProfitMarginPercent({
        originalPrice: 100,
        shopifyPrice: 120,
        fallbackPercent: 10,
      }),
      20,
    );
    assert.equal(
      resolveProfitMarginPercent({ fallbackPercent: 10 }),
      10,
    );
  });
});
