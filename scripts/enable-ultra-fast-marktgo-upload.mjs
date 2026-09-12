import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

// 1) Client: do not block bulk upload on full Trendyol review scraping.
const scraperPath = path.join(root, "client/src/pages/scraper.tsx");
let sp = fs.readFileSync(scraperPath, "utf8");

sp = sp.replaceAll(
  "const SHOPIFY_UPLOAD_CONCURRENCY = 3;",
  "const SHOPIFY_UPLOAD_CONCURRENCY = 8;",
);

const blockingReviewPrefetch = `      setUploadProgress((current) => current ? { ...current, detail: "Yorumlar ürünlerle birlikte hazırlanıyor...", percent: 5 } : current);\n      await Promise.all(eligiblePreviews.map(async (preview) => {\n        const sourceUrl = String(preview.sourceUrl || "").trim();\n        if (!isTrendyolProductUrl(sourceUrl) || getCachedTrendyolReviewsForProduct(sourceUrl)) return;\n        try { await scrapeTrendyolReviewsForProduct(sourceUrl); } catch { /* ürün aktarımı yorum hatasıyla tamamen durmasın */ }\n      }));\n\n`;
if (sp.includes(blockingReviewPrefetch)) {
  sp = sp.replace(
    blockingReviewPrefetch,
    `      setUploadProgress((current) => current ? { ...current, detail: "Ürünler MARKT-GO'ya ultra hızlı aktarılıyor; yorumlar arka planda tamamlanıyor...", percent: 5 } : current);\n\n`,
  );
}

if (!sp.includes("fastUpload: true,")) {
  sp = sp.replaceAll(
    "            expectedReviewCount: Number(preview.reviewSummary?.commentCount || preview.reviewSummary?.reviewCount || 0),\n",
    "            expectedReviewCount: Number(preview.reviewSummary?.commentCount || preview.reviewSummary?.reviewCount || 0),\n            fastUpload: true,\n",
  );
}

fs.writeFileSync(scraperPath, sp);

// 2) Mapping/types: carry the fast-upload intent into MARKT-GO sync.
const typesPath = path.join(root, "server/services/marktgo/types.ts");
let ty = fs.readFileSync(typesPath, "utf8");
if (!ty.includes("fastUpload?: boolean;")) {
  ty = ty.replace(
    "  expectedReviewCount?: number | null;\n",
    "  expectedReviewCount?: number | null;\n  /** Ürünü yorum taramasını beklemeden oluştur; yorumları arka planda tamamla. */\n  fastUpload?: boolean;\n",
  );
}
fs.writeFileSync(typesPath, ty);

const poolMapPath = path.join(root, "server/services/marktgo/pool-map.ts");
let pm = fs.readFileSync(poolMapPath, "utf8");
if (!pm.includes("fastUpload: product.fastUpload === true,")) {
  pm = pm.replace(
    "    expectedReviewCount,\n    variants,\n",
    "    expectedReviewCount,\n    fastUpload: product.fastUpload === true,\n    variants,\n",
  );
}
fs.writeFileSync(poolMapPath, pm);

// 3) Server: product-first. Use already-cached reviews immediately, but never wait for a
// full Browser Worker review crawl before creating the product. Missing reviews are
// backfilled asynchronously after the MARKT-GO product ID is available.
const syncPath = path.join(root, "server/services/marktgo/sync.service.ts");
let sy = fs.readFileSync(syncPath, "utf8");

const oldResolution = `  const images = await prepareMarktGoImages(input.images || [], 12);\n  const brand = input.brand ? String(input.brand).trim() : \"\";\n  const reviewResolution = await resolveProductReviews(input);\n  const reviews = reviewResolution.reviews;\n  if (reviewResolution.error) failed.push(\"reviews\");`;

const newResolution = `  const images = await prepareMarktGoImages(input.images || [], 12);\n  const brand = input.brand ? String(input.brand).trim() : \"\";\n  const fastUpload = input.fastUpload === true;\n  const fastProvidedReviews = fastUpload ? sanitizeProvidedReviews(input.reviews) : [];\n  const reviewResolution = fastUpload\n    ? {\n        reviews: fastProvidedReviews,\n        attempted: fastProvidedReviews.length > 0 || reviewCountHint(input) > 0,\n        expectedCount: Math.max(reviewCountHint(input), fastProvidedReviews.length),\n        source: fastProvidedReviews.length > 0 ? (\"provided\" as const) : (\"none\" as const),\n        error: undefined as string | undefined,\n      }\n    : await resolveProductReviews(input);\n  const reviews = reviewResolution.reviews;\n  if (reviewResolution.error) failed.push(\"reviews\");`;

if (sy.includes(oldResolution)) {
  sy = sy.replace(oldResolution, newResolution);
}

const backfillAnchor = `  if (!externalProductId) {\n    throw new MarktGoApiError(\"MARKT-GO ürün ID alınamadı\", 0, \"no_id\");\n  }\n\n  let remoteReviewCount = 0;`;

if (sy.includes(backfillAnchor) && !sy.includes("[marktgo-fast] review backfill")) {
  sy = sy.replace(
    backfillAnchor,
    `  if (!externalProductId) {\n    throw new MarktGoApiError(\"MARKT-GO ürün ID alınamadı\", 0, \"no_id\");\n  }\n\n  if (fastUpload && reviewCountHint(input) > reviews.length) {\n    const backfillProductId = externalProductId;\n    void (async () => {\n      try {\n        const full = await resolveProductReviews(input);\n        if (full.reviews.length > reviews.length) {\n          await syncReviewsToExistingProduct(client, backfillProductId, full.reviews);\n          console.log(\"[marktgo-fast] review backfill success\", {\n            productId: backfillProductId,\n            reviews: full.reviews.length,\n          });\n        }\n      } catch (err) {\n        console.warn(\"[marktgo-fast] review backfill soft-fail\", {\n          productId: backfillProductId,\n          error: err instanceof Error ? err.message : String(err),\n        });\n      }\n    })();\n  }\n\n  let remoteReviewCount = 0;`,
  );
}

fs.writeFileSync(syncPath, sy);

console.log("[marktgo-ultra-fast] concurrency=8; product-first upload active; review backfill runs in background");
