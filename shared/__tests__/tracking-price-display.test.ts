import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyProfitMargin,
  buildPricePairDisplay,
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
