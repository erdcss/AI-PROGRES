/**
 * Live price candidate dump for a Trendyol URL (no secrets).
 * Usage: npx tsx scripts/debug-trendyol-price-candidates.ts <url>
 */
import * as cheerio from "cheerio";
import { getTrendyolProductFromState } from "../server/trendyol-product-state";
import {
  extractOriginalTrendyolPriceFromProduct,
  normalizeTrendyolKurus,
  parseTurkishPriceText,
  resolveTrendyolOriginalListPrice,
} from "../server/trendyol-price-utils";

const url = process.argv[2] || "";
if (!url) {
  console.error("Usage: npx tsx scripts/debug-trendyol-price-candidates.ts <url>");
  process.exit(1);
}

function nestValue(field: unknown): number {
  if (field == null) return 0;
  if (typeof field === "object" && field !== null && "value" in field) {
    return normalizeTrendyolKurus(Number((field as { value: unknown }).value), "api");
  }
  if (typeof field === "number") return normalizeTrendyolKurus(field, "api");
  return 0;
}

const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "tr-TR,tr;q=0.9",
    Accept: "text/html",
  },
  redirect: "follow",
});
const html = await res.text();
const finalUrl = res.url;
const $ = cheerio.load(html);
const product = getTrendyolProductFromState(html) as Record<string, unknown> | null;
const price = (product?.price || {}) as Record<string, unknown>;
const priceInfo = (product?.priceInfo || {}) as Record<string, unknown>;
const merchant = (product?.merchant || {}) as Record<string, unknown>;
const urlMerchant = url.match(/merchantId=(\d+)/)?.[1] || "";

console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      finalUrl,
      title: $("title").text().trim().slice(0, 120),
      urlMerchantId: urlMerchant,
      stateMerchantId: String(merchant.id || merchant.merchantId || ""),
      productId: String(product?.id || ""),
      statePrice: {
        originalPrice: nestValue(price.originalPrice),
        sellingPrice: nestValue(price.sellingPrice),
        discountedPrice: nestValue(price.discountedPrice),
        raw: price,
      },
      priceInfo: {
        originalPrice: nestValue(priceInfo.originalPrice),
        sellingPrice: nestValue(priceInfo.sellingPrice),
        discountedPrice: nestValue(priceInfo.discountedPrice),
      },
      merchantPrice: {
        originalPrice: nestValue(merchant.originalPrice),
        sellingPrice: nestValue(merchant.sellingPrice),
        discountedPrice: nestValue(merchant.discountedPrice),
        price: nestValue(merchant.price),
      },
      extractOriginal: product ? extractOriginalTrendyolPriceFromProduct(product) : 0,
      jsonLd: (() => {
        const out: unknown[] = [];
        $('script[type="application/ld+json"]').each((_, el) => {
          try {
            const data = JSON.parse($(el).html() || "{}");
            const offers = Array.isArray(data.offers) ? data.offers[0] : data.offers;
            out.push({
              name: String(data.name || "").slice(0, 60),
              price: offers?.price,
              parsed: parseTurkishPriceText(String(offers?.price ?? "")),
            });
          } catch {
            /* skip */
          }
        });
        return out;
      })(),
      domTexts: (() => {
        const texts: string[] = [];
        $(
          ".prc-org, .prc-dsc, .product-price-container, [data-testid='price-current-price'], .price-container",
        ).each((_, el) => {
          const t = $(el).text().replace(/\s+/g, " ").trim();
          if (t && t.length < 120) texts.push(t);
        });
        return [...new Set(texts)].slice(0, 20);
      })(),
      resolvedListPrice: resolveTrendyolOriginalListPrice({
        html,
        product: product ?? undefined,
        jsonLdPrice: 0,
        domPrice: 0,
      }),
    },
    null,
    2,
  ),
);
