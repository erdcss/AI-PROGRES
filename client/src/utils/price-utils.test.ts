import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizePrice,
  normalizeTrendyolDisplayPrice,
} from "./price-utils.ts";

describe("normalizeTrendyolDisplayPrice", () => {
  it("keeps 5+ digit TL prices (Dyson 20.999)", () => {
    const d = normalizeTrendyolDisplayPrice({ original: 20999, withProfit: 23098.9 }, 0.1);
    assert.equal(d.original, 20999);
    assert.ok(d.withProfit >= 23000);
  });

  it("keeps formatted thousand-dot strings", () => {
    const d = normalizeTrendyolDisplayPrice({ formatted: "20.999,00 TL" }, 0.1);
    assert.equal(d.original, 20999);
  });

  it("keeps mid-range apparel prices", () => {
    const d = normalizeTrendyolDisplayPrice({ original: 799, withProfit: 878.9 }, 0.1);
    assert.equal(d.original, 799);
  });
});

describe("normalizePrice turkish display", () => {
  it("parses 12.875 TL text", () => {
    const d = normalizePrice({ formatted: "12.875 TL" }, 0.1);
    assert.equal(d.original, 12875);
  });
});
