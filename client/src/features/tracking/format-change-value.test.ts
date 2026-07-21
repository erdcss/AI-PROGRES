import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatChangeDiff,
  formatChangeValue,
} from "./format-change-value.ts";

describe("formatChangeValue", () => {
  it("formats price numbers", () => {
    assert.equal(formatChangeValue(799, "price_changed"), "799 ₺");
  });

  it("formats stock numbers", () => {
    assert.equal(formatChangeValue(2, "stock_changed"), "2 adet");
  });

  it("parses variant hashtable strings", () => {
    const raw = "@{key=Tek Renk::S::0; size=S; color=Tek Renk; inStock=True}";
    assert.equal(
      formatChangeValue(raw, "variant_added"),
      "Beden S · Stokta",
    );
  });

  it("builds readable diff", () => {
    assert.equal(
      formatChangeDiff("price_changed", 799, 899),
      "799 ₺ → 899 ₺",
    );
    assert.equal(
      formatChangeDiff("variant_added", null, "@{size=S; color=Tek Renk; inStock=True}"),
      "Beden S · Stokta",
    );
  });
});
