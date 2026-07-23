import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatChangeDiff,
  formatChangeValue,
  getChangeDiffParts,
} from "./format-change-value.ts";
import { buildChangeDiagnosis } from "../../../../shared/tracking-change-diagnosis.ts";

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

  it("explains brand removal from title clearly", () => {
    const parts = getChangeDiffParts(
      "title_changed",
      "ESRAHELVACI Dantel Detaylı Askılı Midi Boy Elbise",
      "Dantel Detaylı Askılı Midi Boy Elbise",
    );
    assert.equal(parts.headline, "Başlık değişti");
    assert.match(parts.diagnosis, /ESRAHELVACI/);
    assert.match(parts.diagnosis, /kaldırıldı/);
  });

  it("explains price increase with amount", () => {
    const d = buildChangeDiagnosis({
      changeType: "price_changed",
      oldValue: 100,
      newValue: 120,
      profitMarginPercent: 10,
    });
    assert.equal(d.headline, "Alış fiyatı yükseldi");
    assert.match(d.diagnosis, /100/);
    assert.match(d.diagnosis, /120/);
    assert.match(d.diagnosis, /Kârlı satış/);
  });
});
