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
const injection = `  const coreReady = isCompleteScrapeData(coreFields);\n\n  // auto-fast toplu çekimde yorumlar ürünün kritik yolunu bloke etmez.\n  // Ürün preview'a düştükten / bulk turu bittikten sonra mevcut yorum akışı devam eder.\n  if (autoFast) {\n    result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };\n    result.reviews = Array.isArray(result.reviews) ? result.reviews : [];\n    result.reviewDeferred = true;\n    console.log("[trendyol-reviews] auto-fast: yorum çekimi ana pipeline dışında ertelendi");\n  } else {\n    // Ayrıntılı/tekli çekimde yorum davranışını koru; hata çekirdek ürünü bozmasın.\n    try {\n      await attachTrendyolReviews(\n        result,\n        url,\n        variantOpts?.html ?? result.htmlContent ?? null,\n      );\n    } catch (reviewError) {\n      console.warn(\n        "[trendyol-reviews] yorum entegrasyonu soft-fail:",\n        reviewError instanceof Error ? reviewError.message : reviewError,\n      );\n      result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };\n      result.reviews = Array.isArray(result.reviews) ? result.reviews : [];\n    }\n  }`;

if (!source.includes('[trendyol-reviews] auto-fast: yorum çekimi ana pipeline dışında ertelendi')) {
  if (!source.includes(anchor)) {
    throw new Error('Trendyol pipeline finalize anchor not found');
  }
  source = source.replace(anchor, injection);
}

if (!source.includes('result.reviewDeferred = true')) {
  throw new Error('auto-fast review defer uygulanamadı');
}

fs.writeFileSync(file, source);
console.log('Trendyol review integration injected: auto-fast=deferred, detailed=inline');
