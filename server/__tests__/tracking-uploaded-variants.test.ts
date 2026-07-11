import { strict as assert } from "node:assert";
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
console.log("tracking-uploaded-variants.test.ts OK");
