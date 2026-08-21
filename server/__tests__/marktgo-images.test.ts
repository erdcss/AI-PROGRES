/**
 * MARKT-GO / Trendyol image URL hygiene.
 * Run: npx tsx server/__tests__/marktgo-images.test.ts
 */
import {
  collectTrendyolTyFolders,
  getTrendyolImageFallbackUrls,
  mergeTrendyolImageLists,
  prioritizeProductImagesForPreview,
} from "../../shared/trendyol-product-images";
import { extractProductImages } from "../trendyol-image-extractor";
import * as cheerio from "cheerio";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

{
  console.log("A) merge dedupes ty-folder rewrites of the same asset");
  const merged = mergeTrendyolImageLists(
    [
      "https://cdn.dsmcdn.com/ty1856/prod/QC_ENRICHMENT/20260417/11/50dc5015-bc4b-3809-857a-073df340390c/1_org_zoom.jpg",
    ],
    [
      "https://cdn.dsmcdn.com/ty1660/prod/QC_ENRICHMENT/20260417/11/50dc5015-bc4b-3809-857a-073df340390c/1_org_zoom.jpg",
      "https://cdn.dsmcdn.com/ty1694/prod/QC/20250329/16/317a2bee-01a4-39bb-ad0a-b335097cb00c/1_org_zoom.jpg",
    ],
  );
  assert(merged.length === 2, `merged length 2 (got ${merged.length})`);
  assert(merged[0].includes("ty1856"), "keeps original ty1856 cover");
  assert(!merged.some((u) => u.includes("ty1660")), "drops ty1660 duplicate");
}

{
  console.log("B) extractor no longer rewrites ty folders to ty1660");
  const html = `
    <html><body>
    <script>
    window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ = ${JSON.stringify({
      product: {
        images: [
          "https://cdn.dsmcdn.com/ty1856/prod/QC_ENRICHMENT/20260417/11/50dc5015-bc4b-3809-857a-073df340390c/1_org_zoom.jpg",
          "https://cdn.dsmcdn.com/ty1694/prod/QC/20250329/16/317a2bee-01a4-39bb-ad0a-b335097cb00c/2_org_zoom.jpg",
        ],
      },
    })};
    </script>
    </body></html>
  `;
  const $ = cheerio.load(html);
  const { images } = extractProductImages(html, $);
  assert(images.some((u) => u.includes("ty1856")), "preserves ty1856");
  assert(images.some((u) => u.includes("ty1694")), "preserves ty1694");
  assert(!images.some((u) => /\/ty1660\//.test(u)), "does not force ty1660");
}

{
  console.log("C) fallback prefers gallery ty folders");
  const preferred = collectTrendyolTyFolders([
    "https://cdn.dsmcdn.com/ty1856/prod/QC/x/1_org_zoom.jpg",
  ]);
  const variants = getTrendyolImageFallbackUrls(
    "https://cdn.dsmcdn.com/ty1660/prod/QC/x/2_org_zoom.jpg",
    preferred,
  );
  assert(preferred[0] === "ty1856", "collects ty1856");
  assert(
    variants.some((u) => u.includes("/ty1856/prod/QC/x/2_org_zoom.jpg")),
    "fallback includes preferred ty1856",
  );
}

{
  console.log("D) prioritize keeps one URL per asset identity");
  const ranked = prioritizeProductImagesForPreview([
    "https://cdn.dsmcdn.com/ty1856/prod/QC/x/hash/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/ty1660/prod/QC/x/hash/1_org_zoom.jpg",
  ]);
  assert(ranked.length === 1, `ranked length 1 (got ${ranked.length})`);
}

{
  console.log("E) prioritize prefers real ty over ty1660 rewrite");
  const ranked = prioritizeProductImagesForPreview([
    "https://cdn.dsmcdn.com/ty1660/prod/QC_PREP/20260204/20/1d12b7d1-3f85-3348-9ec6-2c975f25983a/1_org_zoom.jpg",
    "https://cdn.dsmcdn.com/ty1819/prod/QC_PREP/20260204/20/1d12b7d1-3f85-3348-9ec6-2c975f25983a/1_org_zoom.jpg",
  ]);
  assert(ranked.length === 1, `ranked length 1 (got ${ranked.length})`);
  assert(ranked[0].includes("ty1819"), "keeps ty1819 over ty1660");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
