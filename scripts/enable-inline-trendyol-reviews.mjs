import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reviewsClient = path.join(root, "client/src/lib/trendyol-reviews-client.ts");
const scraper = path.join(root, "client/src/pages/scraper.tsx");

// Queue, retry and caching are maintained in trendyol-reviews-client.ts.
let sp = fs.readFileSync(scraper, "utf8");
if (!sp.includes('from "@/lib/trendyol-reviews-client";')) {
  const anchor = 'import { mapScraperLikeToPoolProduct } from "@/lib/marktgo-pool-map";';
  sp = sp.replace(anchor, `${anchor}\nimport { scrapeTrendyolReviewsForProduct, getCachedTrendyolReviewsForProduct, isTrendyolProductUrl } from "@/lib/trendyol-reviews-client";`);
}

// Before MARKT-GO upload, guarantee that every Trendyol item has its reviews in the shared cache.
const itemsAnchor = "      const items = eligiblePreviews.map((preview) => {";
if (sp.includes(itemsAnchor) && !sp.includes("Yorumlar ürünlerle birlikte hazırlanıyor")) {
  sp = sp.replace(itemsAnchor, `      setUploadProgress((current) => current ? { ...current, detail: "Yorumlar ürünlerle birlikte hazırlanıyor...", percent: 5 } : current);\n      await Promise.all(eligiblePreviews.map(async (preview) => {\n        const sourceUrl = String(preview.sourceUrl || "").trim();\n        if (!isTrendyolProductUrl(sourceUrl) || getCachedTrendyolReviewsForProduct(sourceUrl)) return;\n        try { await scrapeTrendyolReviewsForProduct(sourceUrl); } catch { /* ürün aktarımı yorum hatasıyla tamamen durmasın */ }\n      }));\n\n${itemsAnchor}`);
}

// Put normalized review rows into the product payload consumed by mapScraperLikeToPoolProduct.
const payloadAnchor = "            colorFamily: preview.colorFamily,\n";
if (sp.includes(payloadAnchor) && !sp.includes("reviews: getCachedTrendyolReviewsForProduct(preview.sourceUrl || \"\")?.reviews")) {
  sp = sp.replaceAll(payloadAnchor, `${payloadAnchor}            reviews: getCachedTrendyolReviewsForProduct(preview.sourceUrl || "")?.reviews || [],\n            reviewStats: getCachedTrendyolReviewsForProduct(preview.sourceUrl || "")?.stats || null,\n`);
}

// Individual upload path also receives reviews when already fetched by the card.
const poolAnchor = "        sourceUrl: preview.sourceUrl,\n";
if (sp.includes(poolAnchor) && !sp.includes("reviews: getCachedTrendyolReviewsForProduct(preview.sourceUrl || \"\")?.reviews || [],\n        sourceUrl")) {
  sp = sp.replace(poolAnchor, `        reviews: getCachedTrendyolReviewsForProduct(preview.sourceUrl || "")?.reviews || [],\n${poolAnchor}`);
}

fs.writeFileSync(scraper, sp);
console.log("[inline-reviews] serialized queue, card reviews cached, MARKT-GO payload includes reviews");
