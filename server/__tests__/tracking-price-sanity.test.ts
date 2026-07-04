import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assessPriceChange,
  isPlausibleProductPrice,
  looksLikeStockMisread,
  resolveReliableBaselinePrice,
  stableVariantKey,
  validateFetchedPrice,
} from "../../shared/tracking-price-sanity.ts";

describe("tracking-price-sanity", () => {
  it("rejects implausible prices", () => {
    assert.equal(isPlausibleProductPrice(2), false);
    assert.equal(isPlausibleProductPrice(799), true);
    assert.equal(isPlausibleProductPrice(100), true);
  });

  it("detects stock misread", () => {
    assert.equal(looksLikeStockMisread(2, 799), true);
    assert.equal(looksLikeStockMisread(799, 800), false);
  });

  it("rejects bad fetch against baseline", () => {
    const r = validateFetchedPrice(2, 799);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /makul/i);
  });

  it("rejects extreme ratio", () => {
    const r = validateFetchedPrice(3200, 799);
    assert.equal(r.ok, false);
  });

  it("accepts normal price drift", () => {
    const r = validateFetchedPrice(849, 799);
    assert.equal(r.ok, true);
  });

  it("flags extreme change for manual review", () => {
    const a = assessPriceChange(799, 2400);
    assert.equal(a.status, "manual_review");
    assert.equal(a.shouldRecord, true);
  });

  it("skips recording when old price unreliable", () => {
    const a = assessPriceChange(2, 799);
    assert.equal(a.shouldRecord, false);
  });

  it("uses baseline when snapshot price is stock-like", () => {
    assert.equal(resolveReliableBaselinePrice(2, 799), 799);
  });

  it("stable variant key ignores index", () => {
    assert.equal(
      stableVariantKey({ color: "Siyah", size: "M", key: "Siyah::M::3" }),
      "siyah::m",
    );
  });
});
