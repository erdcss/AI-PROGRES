import fs from 'node:fs';

const file = 'server/trendyol-scrape-pipeline.ts';
let source = fs.readFileSync(file, 'utf8');

const importNeedle = 'import { consumeLastDirectHtmlBlockSignal } from "./trendyol-direct-html";';
const importLine = 'import { attachTrendyolReviews } from "./trendyol-reviews";';

if (!source.includes(importLine)) {
  if (!source.includes(importNeedle)) {
    throw new Error('Trendyol pipeline import anchor not found');
  }
  source = source.replace(importNeedle, `${importNeedle}\n${importLine}`);
}

const anchor = '  const coreReady = isCompleteScrapeData(coreFields);';
const injection = `  const coreReady = isCompleteScrapeData(coreFields);\n\n  // Product reviews are best-effort and must never break core scraping.\n  try {\n    await attachTrendyolReviews(\n      result,\n      url,\n      variantOpts?.html ?? result.htmlContent ?? null,\n    );\n  } catch (reviewError) {\n    console.warn(\n      "[trendyol-reviews] yorum entegrasyonu soft-fail:",\n      reviewError instanceof Error ? reviewError.message : reviewError,\n    );\n    result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };\n    result.reviews = Array.isArray(result.reviews) ? result.reviews : [];\n  }`;

if (!source.includes('[trendyol-reviews] yorum entegrasyonu soft-fail:')) {
  if (!source.includes(anchor)) {
    throw new Error('Trendyol pipeline finalize anchor not found');
  }
  source = source.replace(anchor, injection);
}

fs.writeFileSync(file, source);
console.log('Trendyol review integration injected into scrape pipeline');
