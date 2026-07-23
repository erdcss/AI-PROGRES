import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChangeDiagnosis } from "../../shared/tracking-change-diagnosis.ts";

describe("buildChangeDiagnosis", () => {
  it("detects brand prefix removed from title", () => {
    const d = buildChangeDiagnosis({
      changeType: "title_changed",
      oldValue: "ESRAHELVACI Dantel Detaylı Askılı Midi Boy Elbise",
      newValue: "Dantel Detaylı Askılı Midi Boy Elbise",
    });
    assert.equal(d.headline, "Başlık değişti");
    assert.equal(
      d.diagnosis,
      'Kaynak sitede ürün başlığından “ESRAHELVACI” kısmı kaldırıldı.',
    );
  });

  it("describes price drop with profitable sale", () => {
    const d = buildChangeDiagnosis({
      changeType: "price_changed",
      oldValue: 500,
      newValue: 450,
      profitMarginPercent: 10,
    });
    assert.equal(d.headline, "Alış fiyatı düştü");
    assert.match(d.diagnosis, /Eski alış/);
    assert.match(d.diagnosis, /Kârlı satış/);
    assert.match(d.diagnosis, /495/);
  });

  it("describes variant out of stock without closing product", () => {
    const d = buildChangeDiagnosis({
      changeType: "variant_stock_changed",
      oldValue: true,
      newValue: false,
      variantLabel: "Beden M",
    });
    assert.equal(d.headline, "Beden M tükendi");
    assert.match(d.diagnosis, /Beden M/);
    assert.match(d.diagnosis, /tükendi/);
    assert.match(d.diagnosis, /tamamı kapanmadı/);
    assert.match(d.advice || "", /ürünü kapatmayın/i);
  });
});
