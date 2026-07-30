/**
 * Shopify GraphQL bulk variant input şema uyumu.
 * Çalıştır: npx tsx --test server/__tests__/shopify-bulk-variant-input.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildProductVariantsBulkInput,
  buildVariantOptionValues,
} from "../shopify-bulk-variant-input.ts";

describe("buildProductVariantsBulkInput", () => {
  it("puts sku under inventoryItem and never top-level", () => {
    const input = buildProductVariantsBulkInput(
      {
        price: "219.99",
        sku: "TM-FUME-M",
        option1: "Füme",
        option2: "M",
        inventoryPolicy: "DENY",
        tracked: true,
      },
      { option1Name: "Renk", option2Name: "Beden" },
    );

    assert.equal("sku" in input, false);
    assert.deepEqual(input.inventoryItem, { tracked: true, sku: "TM-FUME-M" });
    assert.equal(input.price, "219.99");
    assert.equal(input.inventoryPolicy, "DENY");
  });

  it("uses optionName+name instead of name+value", () => {
    const opts = buildVariantOptionValues(
      { price: "1", option1: "Füme", option2: "XL" },
      { option1Name: "Renk", option2Name: "Beden" },
    );
    assert.deepEqual(opts, [
      { optionName: "Renk", name: "Füme" },
      { optionName: "Beden", name: "XL" },
    ]);
    for (const o of opts) {
      assert.equal("value" in o, false);
    }
  });

  it("attaches optionId when provided", () => {
    const input = buildProductVariantsBulkInput(
      { price: "10", option1: "Siyah", sku: "X" },
      {
        option1Name: "Renk",
        optionIdsByName: { Renk: "gid://shopify/ProductOption/1" },
      },
    );
    assert.deepEqual(input.optionValues, [
      {
        optionName: "Renk",
        name: "Siyah",
        optionId: "gid://shopify/ProductOption/1",
      },
    ]);
  });

  it("includes compareAtPrice only when positive", () => {
    const withCompare = buildProductVariantsBulkInput(
      { price: "10", compareAtPrice: "12.5", option1: "A" },
      { option1Name: "Renk" },
    );
    assert.equal(withCompare.compareAtPrice, "12.5");

    const without = buildProductVariantsBulkInput(
      { price: "10", compareAtPrice: "0", option1: "A" },
      { option1Name: "Renk" },
    );
    assert.equal("compareAtPrice" in without, false);
  });
});
