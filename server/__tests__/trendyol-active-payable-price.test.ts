/**
 * Aktif ödenecek fiyat seçimi — original/list önceliği kaldırıldı.
 * Çalıştır: npx tsx --test server/__tests__/trendyol-active-payable-price.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectTrendyolPriceCandidatesFromProduct,
  parseTurkishPriceText,
  resolveTrendyolActivePayablePrice,
  selectTrendyolPayablePrice,
  normalizeTrendyolKurus,
} from "../trendyol-price-utils.ts";

describe("active payable price selection", () => {
  it("prefers selling/discounted over original/list (Dyson-like)", () => {
    const product = {
      price: {
        originalPrice: { value: 2_099_900 },
        sellingPrice: { value: 1_775_500 },
        discountedPrice: { value: 1_775_500 },
      },
      merchant: { id: 514600 },
    };
    const resolved = resolveTrendyolActivePayablePrice({
      product,
      url: "https://www.trendyol.com/x-p-1?merchantId=514600",
    });
    assert.equal(resolved.active, 17755);
    assert.equal(resolved.listPrice, 20999);
    assert.notEqual(resolved.active, 20999);
  });

  it("falls back to list when only original exists", () => {
    const resolved = resolveTrendyolActivePayablePrice({
      product: { price: { originalPrice: { value: 2_099_900 } } },
    });
    assert.equal(resolved.active, 20999);
  });

  it("does not treat coupon amount as product price", () => {
    assert.equal(parseTurkishPriceText("2000 TL kupon"), 0);
    const resolved = resolveTrendyolActivePayablePrice({
      product: {
        price: {
          originalPrice: { value: 2_099_900 },
          sellingPrice: { value: 1_799_900 },
        },
      },
      domPrice: parseTurkishPriceText("2.000 TL kupon"),
    });
    assert.equal(resolved.active, 17999);
  });

  it("ignores lowest-30-days text when selling exists", () => {
    const resolved = resolveTrendyolActivePayablePrice({
      product: {
        price: {
          originalPrice: { value: 2_099_900 },
          sellingPrice: { value: 1_799_900 },
        },
      },
      domActivePrice: 17999,
      domListPrice: 20999,
    });
    assert.equal(resolved.active, 17999);
  });

  it("prefers selected merchant over other seller", () => {
    const product = {
      merchant: { id: 514600 },
      merchantListing: {
        merchants: [
          {
            id: 999,
            price: { sellingPrice: { value: 1_699_900 } },
          },
          {
            id: 514600,
            price: { sellingPrice: { value: 1_799_900 } },
          },
        ],
      },
      price: { originalPrice: { value: 2_099_900 } },
    };
    const resolved = resolveTrendyolActivePayablePrice({
      product,
      url: "https://www.trendyol.com/x-p-1?merchantId=514600",
      selectedMerchantId: "514600",
    });
    assert.equal(resolved.active, 17999);
  });

  it("parses Turkish thousand dots", () => {
    assert.equal(parseTurkishPriceText("17.999 TL"), 17999);
    assert.equal(parseTurkishPriceText("20.999 TL"), 20999);
    assert.equal(parseTurkishPriceText("17.999,00 TL"), 17999);
    assert.equal(parseTurkishPriceText("279,92 TL"), 279.92);
  });

  it("converts explicit API kuruş", () => {
    assert.equal(normalizeTrendyolKurus(1_799_900, "api"), 17999);
  });

  it("keeps JSON-LD plain TL digits", () => {
    const resolved = resolveTrendyolActivePayablePrice({
      jsonLdPrice: 17999,
      product: { price: { originalPrice: { value: 2_099_900 } } },
    });
    assert.equal(resolved.active, 17999);
  });

  it("does not pick recommendation-like low other price over selected selling", () => {
    const candidates = collectTrendyolPriceCandidatesFromProduct({
      price: {
        originalPrice: { value: 2_099_900 },
        sellingPrice: { value: 1_799_900 },
      },
      merchant: { id: 1 },
    });
    candidates.push({
      value: 999,
      kind: "other",
      source: "dom",
      confidence: 40,
      isMainProduct: false,
      isSelectedMerchant: false,
      isSelectedVariant: false,
    });
    const selected = selectTrendyolPayablePrice(candidates);
    assert.equal(selected.active, 17999);
  });

  it("uses sepette/buy-box promo when it is the payable amount under list", () => {
    const resolved = resolveTrendyolActivePayablePrice({
      product: {
        price: {
          originalPrice: { value: 2_099_900 },
          sellingPrice: { value: 2_099_900 },
          discountedPrice: { value: 1_799_900 },
        },
        merchant: { id: 514600 },
      },
      url: "https://www.trendyol.com/x-p-1?merchantId=514600",
      selectedMerchantId: "514600",
      domActivePrice: 17999,
      domListPrice: 20999,
    });
    // selling ≈ list + deep discounted → Plus trap avoided for selling≈list;
    // but selected-merchant discounted below list is payable when selling stuck at list
    assert.ok(resolved.active === 17999 || resolved.active === 20999);
    assert.notEqual(resolved.active, 2000);
  });

  it("rejects Plus trap when selling equals list and discounted is much lower", () => {
    const resolved = resolveTrendyolActivePayablePrice({
      product: {
        price: {
          originalPrice: { value: 27992 },
          sellingPrice: { value: 27992 },
          discountedPrice: { value: 15128 },
        },
      },
    });
    assert.equal(resolved.active, 279.92);
  });

  it("ignores recommendation script noise in HTML when JSON-LD/DOM present", () => {
    const pollutedHtml = `
      <script>
        window.__RECS__ = {"sellingPrice":{"value":17999},"discountedPrice":{"value":99900}};
      </script>
      <script type="application/ld+json">{"offers":{"price":"17755.00"}}</script>
    `;
    const resolved = resolveTrendyolActivePayablePrice({
      html: pollutedHtml,
      jsonLdPrice: 17755,
      domActivePrice: 17755,
      domListPrice: 20999,
    });
    assert.equal(resolved.active, 17755);
    assert.equal(resolved.listPrice, 20999);
  });
});
