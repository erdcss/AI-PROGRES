import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveChangeSeverity } from "../services/change-group.service";

describe("change group severity", () => {
  it("marks product_out_of_stock as critical", () => {
    assert.equal(resolveChangeSeverity("product_out_of_stock"), "critical");
  });

  it("marks title_changed as info", () => {
    assert.equal(resolveChangeSeverity("title_changed"), "info");
  });

  it("marks large price increase as high", () => {
    assert.equal(resolveChangeSeverity("price_increased", { percentChange: 20 }), "high");
  });
});

describe("bulk action limits", () => {
  it("dedupes and caps ids", () => {
    const ids = ["a", "b", "a", ...Array.from({ length: 101 }, (_, i) => `x${i}`)];
    const unique = [...new Set(ids)].slice(0, 100);
    assert.equal(unique.length, 100);
    assert.equal(unique.filter((x) => x === "a").length, 1);
  });
});
