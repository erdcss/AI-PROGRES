import assert from "node:assert/strict";
import {
  extractVerifiedTryPrice, matchesTrackedProduct, parseTurkishPrice,
} from "../services/tracking-price-research.service";

assert.equal(parseTurkishPrice("2.248,00 TL"), 2248);
assert.equal(parseTurkishPrice("2,248.90"), 2248.9);
assert.equal(parseTurkishPrice("2.248"), 2248);
assert.equal(parseTurkishPrice("1.250,50 ₺"), 1250.5);
assert.equal(parseTurkishPrice("0"), null);
assert.equal(parseTurkishPrice("Piyasa fiyatı"), null);

const title = "Arzum AR2052 Tostçu Mini 750W Tost Makinesi Siyah";
assert.equal(matchesTrackedProduct(title, "Arzum AR2052 Tostçu Mini Tost Makinesi"), true);
assert.equal(matchesTrackedProduct(title, "Arzum AR2053 Tost Makinesi"), false);
assert.equal(matchesTrackedProduct(title, "Bosch AR2052 Elektrikli Süpürge"), false);

const jsonLd = '<script type="application/ld+json">' +
  JSON.stringify({
    "@context": "https://schema.org", "@type": "Product", name: title,
    offers: { "@type": "Offer", price: "2.248,00", priceCurrency: "TRY" },
  }) + '</script>';
assert.equal(extractVerifiedTryPrice(jsonLd), 2248);
assert.equal(extractVerifiedTryPrice(
  '<meta property="product:price:currency" content="TRY">' +
  '<meta property="product:price:amount" content="3.149,90">',
), 3149.9);
assert.equal(extractVerifiedTryPrice(
  '<script type="application/ld+json">' +
  '{"@type":"Product","offers":{"@type":"Offer","price":"130","priceCurrency":"USD"}}' +
  '</script>',
), null);
assert.equal(extractVerifiedTryPrice("<div>Ucuz fiyat sadece 199 TL!</div>"), null);
assert.equal(extractVerifiedTryPrice('<div class="prc-dsc">2.248,90 TL</div>'), 2248.9);
assert.equal(extractVerifiedTryPrice('<div class="old-price">2.999 TL</div>'), null);


import { deepProductMatch, variantConflict } from "../services/tracking-price-research.service";
assert.ok(deepProductMatch(
  "Maybelline New York Lash Sensational Yelpaze Etkili Siyah Maskara - Fiyatı",
  "Maybelline Lash Sensational Yelpaze Etkili Siyah Maskara",
) >= 0.46);
assert.equal(deepProductMatch("Maybelline Lash Sensational Siyah Maskara",
  "Arzum AR2052 Tost Makinesi"), 0);
assert.ok(deepProductMatch("Arzum AR2052 Tost Makinesi", "Arzum AR2053 Tost Makinesi") === 0);
assert.equal(variantConflict("Maybelline Lash Sensational Siyah Maskara",
  "Maybelline Lash Sensational Kahverengi Maskara"), true);
assert.equal(variantConflict("Maybelline Lash Sensational Siyah Maskara",
  "Maybelline Lash Sensational Siyah Maskara"), false);

console.log("Tracking web price research regression tests passed");
