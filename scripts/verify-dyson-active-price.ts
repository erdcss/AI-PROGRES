import * as cheerio from "cheerio";
import { ultimatePriceExtract } from "../server/ultimate-price-extractor";
import { resolveTrendyolActivePayablePrice, parseTurkishPriceText } from "../server/trendyol-price-utils";
import { getTrendyolProductFromState } from "../server/trendyol-product-state";

const url =
  process.argv[2] ||
  "https://www.trendyol.com/dyson/v8-cyclone-kablosuz-supurge-p-1132668231?boutiqueId=61&merchantId=514600";

const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "tr-TR,tr;q=0.9",
  },
  redirect: "follow",
});
const html = await res.text();
const $ = cheerio.load(html);
const product = getTrendyolProductFromState(html);
const jsonLdPrice = (() => {
  let p = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "{}");
      const offers = Array.isArray(data.offers) ? data.offers[0] : data.offers;
      const raw = offers?.price;
      if (raw != null) p = parseTurkishPriceText(String(raw)) || Number(raw) || p;
    } catch {
      /* skip */
    }
  });
  return p;
})();
const domActive = parseTurkishPriceText($(".prc-dsc, [data-testid='price-current-price']").first().text());
const domList = parseTurkishPriceText($(".prc-org").first().text());
const resolved = resolveTrendyolActivePayablePrice({
  html,
  product: product ?? undefined,
  jsonLdPrice,
  domActivePrice: domActive,
  domListPrice: domList,
  url,
});
const upe = await ultimatePriceExtract($, html, url);
const margin = 0.1;
const sale = Math.round(upe.original * (1 + margin) * 100) / 100;

console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      finalUrl: res.url,
      title: $("title").text().trim().slice(0, 80),
      jsonLdPrice,
      domActive,
      domList,
      resolved,
      ultimate: { original: upe.original, withProfit: upe.withProfit, method: upe.method },
      saleWith10pct: sale,
      okActiveNotList: upe.original > 0 && (domList <= 0 || upe.original < domList || upe.original === jsonLdPrice),
    },
    null,
    2,
  ),
);
