import { strict as assert } from "node:assert";
import {
  buildTrackingVariantLabel,
  resolveTrackingVariantColorSize,
} from "../../shared/trendyol-variant-utils";
import { filterUploadedVariantsForTracking } from "../services/tracking.service";

function testFilterPrefersShopifyMappedVariants() {
  const variants = [
    { color: "Lacivert", size: "M", sku: "TY-1-M", shopifyVariantId: "111", inStock: true },
    { color: "Lacivert", size: "XL", sku: "TY-1-XL", inStock: false },
    { color: "Lacivert", size: "2XL", sku: "TY-1-2XL", inStock: false },
  ];
  const filtered = filterUploadedVariantsForTracking(variants);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.size, "M");
}

function testFilterInStockWhenNoShopifyIds() {
  const variants = [
    { color: "Lacivert", size: "M", sku: "TY-1-M", inStock: true },
    { color: "Lacivert", size: "XL", sku: "TY-1-XL", inStock: false },
  ];
  const filtered = filterUploadedVariantsForTracking(variants);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.size, "M");
}

testFilterPrefersShopifyMappedVariants();
testFilterInStockWhenNoShopifyIds();

function testResolveColorSizeFromCanonicalOptions() {
  const resolved = resolveTrackingVariantColorSize({
    option1Name: "Renk",
    option1Value: "Lacivert",
    option2Name: "Beden",
    option2Value: "M",
  });
  assert.equal(resolved.color, "Lacivert");
  assert.equal(resolved.size, "M");
  assert.equal(buildTrackingVariantLabel(resolved.color, resolved.size), "Lacivert · Beden M");
}

function testResolveBedenOnlyVariant() {
  const resolved = resolveTrackingVariantColorSize({
    option1Name: "Beden",
    option1Value: "XL",
  });
  assert.equal(resolved.color, null);
  assert.equal(resolved.size, "XL");
}

function testPlaceholderColorIgnored() {
  const resolved = resolveTrackingVariantColorSize({
    option1Name: "Renk",
    option1Value: "Tek Renk",
    option2Name: "Beden",
    option2Value: "Tek Beden",
  });
  assert.equal(resolved.color, null);
  assert.equal(resolved.size, null);
}

testResolveColorSizeFromCanonicalOptions();
testResolveBedenOnlyVariant();
testPlaceholderColorIgnored();
console.log("tracking-uploaded-variants.test.ts OK");
