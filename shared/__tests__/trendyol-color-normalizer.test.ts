import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeTrendyolColorName } from "../trendyol-color-normalizer.ts";

describe("trendyol-color-normalizer product tokens", () => {
  it("rejects kalın/taban as colors", () => {
    assert.equal(normalizeTrendyolColorName("Kalin"), null);
    assert.equal(normalizeTrendyolColorName("Kalın"), null);
    assert.equal(normalizeTrendyolColorName("taban"), null);
    assert.equal(normalizeTrendyolColorName("sneaker"), null);
  });

  it("extracts real color from kalın-taban slug phrases", () => {
    assert.equal(normalizeTrendyolColorName("Kalın Taban Beyaz"), "Beyaz");
    assert.equal(normalizeTrendyolColorName("kalin-taban-lacivert"), "Lacivert");
  });

  it("keeps known colors", () => {
    assert.equal(normalizeTrendyolColorName("Beyaz"), "Beyaz");
    assert.equal(normalizeTrendyolColorName("Lacivert"), "Lacivert");
    assert.equal(normalizeTrendyolColorName("Siyah-Beyaz"), "Siyah-Beyaz");
  });
});
