import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reviewsClient = path.join(root, "client/src/lib/trendyol-reviews-client.ts");
const scraper = path.join(root, "client/src/pages/scraper.tsx");

let rc = fs.readFileSync(reviewsClient, "utf8");

// Product cards must not wait for every previous card. Keep a small shared pool instead.
if (!rc.includes("const REVIEW_FETCH_CONCURRENCY = 3;")) {
  rc = rc.replace(
    "export function createTrendyolReviewsClient(\n",
    `const REVIEW_FETCH_CONCURRENCY = 3;\nlet activeReviewFetches = 0;\nconst reviewFetchWaiters: Array<() => void> = [];\nconst sharedReviewResults = new Map<string, TrendyolReviewsResult>();\n\nasync function acquireReviewSlot() {\n  if (activeReviewFetches < REVIEW_FETCH_CONCURRENCY) { activeReviewFetches += 1; return; }\n  await new Promise<void>((resolve) => reviewFetchWaiters.push(resolve));\n  activeReviewFetches += 1;\n}\nfunction releaseReviewSlot() {\n  activeReviewFetches = Math.max(0, activeReviewFetches - 1);\n  reviewFetchWaiters.shift()?.();\n}\nexport function getCachedTrendyolReviewsForProduct(url: string): TrendyolReviewsResult | null {\n  return sharedReviewResults.get(url.trim()) || null;\n}\n\nexport function createTrendyolReviewsClient(\n`,
  );
}

rc = rc.replace("  let tail: Promise<unknown> = Promise.resolve();\n", "");
rc = rc.replace(
  "    const task = tail.catch(() => undefined).then(async () => {\n",
  "    const task = (async () => {\n      await acquireReviewSlot();\n      try {\n",
);
rc = rc.replace(
  "      await sleep(2_500);\n      return result;\n    });\n    pending.set(key, task);\n    tail = task;\n",
  "      sharedReviewResults.set(url.trim(), result);\n      await sleep(250);\n      return result;\n      } finally { releaseReviewSlot(); }\n    })();\n    pending.set(key, task);\n",
);
rc = rc.replaceAll("await sleep(2_500);", "await sleep(250);");
fs.writeFileSync(reviewsClient, rc);

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
console.log("[inline-reviews] concurrency=3, card reviews cached, MARKT-GO payload includes reviews");
