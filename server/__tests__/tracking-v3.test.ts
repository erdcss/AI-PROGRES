import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveChangeSeverity } from "../services/change-group.service";
import {
  isActionableTrackingChangeStatus,
  isDirectlyApplicableTrackingChange,
  isShopifySyncableTrackingChange,
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
      isDirectlyApplicableTrackingChange("stock_changed", "available", false),
      true,
    );
    assert.equal(
      isDirectlyApplicableTrackingChange("variant_stock_changed", "inStock", false),
      true,
    );
    assert.equal(
      isDirectlyApplicableTrackingChange("variant_stock_changed", "inStock", true),
      false,
    );
    assert.equal(
      isDirectlyApplicableTrackingChange("variant_stock_changed", "inStock", {
        inStock: false,
        key: "siyah::m",
      }),
      true,
    );
  });

  it("hides historical and unsafe aggregate changes", () => {
    assert.equal(isActionableTrackingChangeStatus("applied"), false);
    assert.equal(isActionableTrackingChangeStatus("superseded"), false);
    assert.equal(isDirectlyApplicableTrackingChange("stock_changed", "stock"), false);
    assert.equal(isDirectlyApplicableTrackingChange("variant_added", "variant"), true);
    assert.equal(isDirectlyApplicableTrackingChange("variant_removed", "variant"), true);
    assert.equal(isDirectlyApplicableTrackingChange("product_removed", "product"), true);
  });

  it("requires variant link for Shopify-syncable stock/price changes", () => {
    assert.equal(
      isShopifySyncableTrackingChange({
        status: "approved",
        changeType: "variant_stock_changed",
        newValue: false,
        trackingUid: "TRK-1",
        shopifyProductId: "1",
        trackedVariantId: null,
        shopifyVariantId: null,
      }),
      false,
    );
    assert.equal(
      isShopifySyncableTrackingChange({
        status: "approved",
        changeType: "variant_stock_changed",
        newValue: false,
        trackingUid: "TRK-1",
        shopifyProductId: "1",
        trackedVariantId: 42,
        shopifyVariantId: null,
      }),
      true,
    );
    assert.equal(
      isShopifySyncableTrackingChange({
        status: "approved",
        changeType: "price_changed",
        newValue: 100,
        trackingUid: "TRK-1",
        shopifyProductId: "1",
      }),
      true,
    );
  });
});

describe("tracking variant snapshot quality", () => {
  it("rejects materially incomplete variant snapshots", () => {
    assert.equal(hasSufficientVariantCoverage(10, 5), false);
    assert.equal(hasSufficientVariantCoverage(10, 6), true);
    assert.equal(hasSufficientVariantCoverage(1, 0), true);
  });
});
