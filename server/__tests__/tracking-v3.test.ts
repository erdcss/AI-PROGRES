import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveChangeSeverity } from "../services/change-group.service";
import {
  isActionableTrackingChangeStatus,
  isDirectlyApplicableTrackingChange,
} from "../../shared/tracking-change-policy";
import { hasSufficientVariantCoverage } from "../services/source-fetcher.service";

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

describe("direct Shopify correction policy", () => {
  it("allows actionable supported changes", () => {
    assert.equal(isActionableTrackingChangeStatus("pending"), true);
    assert.equal(isActionableTrackingChangeStatus("failed"), true);
    assert.equal(isDirectlyApplicableTrackingChange("price_changed", "price"), true);
    assert.equal(
      isDirectlyApplicableTrackingChange("stock_changed", "available"),
      false,
    );
    assert.equal(
      isDirectlyApplicableTrackingChange("variant_stock_changed", "inStock", false),
      true,
    );
    assert.equal(
      isDirectlyApplicableTrackingChange("variant_stock_changed", "inStock", true),
      false,
    );
  });

  it("hides historical and unsafe aggregate changes", () => {
    assert.equal(isActionableTrackingChangeStatus("applied"), false);
    assert.equal(isActionableTrackingChangeStatus("superseded"), false);
    assert.equal(isDirectlyApplicableTrackingChange("stock_changed", "stock"), false);
    assert.equal(isDirectlyApplicableTrackingChange("variant_added", "variant"), false);
    assert.equal(isDirectlyApplicableTrackingChange("variant_removed", "variant"), false);
  });
});

describe("tracking variant snapshot quality", () => {
  it("rejects materially incomplete variant snapshots", () => {
    assert.equal(hasSufficientVariantCoverage(10, 5), false);
    assert.equal(hasSufficientVariantCoverage(10, 6), true);
    assert.equal(hasSufficientVariantCoverage(1, 0), true);
  });
});
