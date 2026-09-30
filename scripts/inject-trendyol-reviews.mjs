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
const injection = `  const coreReady = isCompleteScrapeData(coreFields);\\n\\n  // Hızlı modda yorum Browser Worker'ı ürün sonucunu bloke etmez.\\n  // Ürün önce döner; yorumlar kart/MarktGo arka plan akışında tamamlanabilir.\\n  if (variantOpts?.scrapeMode === "auto-fast") {\\n    result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };\\n    result.reviews = Array.isArray(result.reviews) ? result.reviews : [];\\n    result.reviewDeferred = true;\\n  } else {\\n    try {\\n      await attachTrendyolReviews(\\n        result,\\n        url,\\n        variantOpts?.html ?? result.htmlContent ?? null,\\n      );\\n      result.reviewDeferred = false;\\n    } catch (reviewError) {\\n      console.warn(\\n        "[trendyol-reviews] yorum entegrasyonu soft-fail:",\\n        reviewError instanceof Error ? reviewError.message : reviewError,\\n      );\\n      result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };\\n      result.reviews = Array.isArray(result.reviews) ? result.reviews : [];\\n      result.reviewDeferred = true;\\n    }\\n  }`;

const legacyStart = '  const coreReady = isCompleteScrapeData(coreFields);\n\n  // auto-fast toplu çekimde yorumlar ürünün kritik yolunu bloke etmez.';
if (source.includes(legacyStart)) {
  const legacyEnd = '  }';
  const startIndex = source.indexOf(legacyStart);
  const marker = '\n\n  if (!coreReady';
  const endIndex = source.indexOf(marker, startIndex);
  if (endIndex === -1) throw new Error('Legacy Trendyol review block end anchor not found');
  source = source.slice(0, startIndex) + injection + source.slice(endIndex);
} else if (!source.includes('result.reviewDeferred = false')) {
  if (!source.includes(anchor)) {
    throw new Error('Trendyol pipeline finalize anchor not found');
  }
  source = source.replace(anchor, injection);
}

if (!source.includes('result.reviewDeferred = false')) {
  throw new Error('inline Trendyol review integration uygulanamadı');
}

fs.writeFileSync(file, source);
console.log('Trendyol review integration injected: auto-fast=deferred, direct-html=inline');
