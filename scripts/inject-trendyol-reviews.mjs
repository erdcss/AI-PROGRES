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
const injection = `  const coreReady = isCompleteScrapeData(coreFields);

  // Hızlı modda yorum Browser Worker'ı ürün sonucunu bloke etmez.
  // Ürün önce döner; yorumlar kart/MarktGo arka plan akışında tamamlanabilir.
  if (variantOpts?.scrapeMode === "auto-fast") {
    result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };
    result.reviews = Array.isArray(result.reviews) ? result.reviews : [];
    result.reviewDeferred = true;
  } else {
    try {
      await attachTrendyolReviews(
        result,
        url,
        variantOpts?.html ?? result.htmlContent ?? null,
      );
      result.reviewDeferred = false;
    } catch (reviewError) {
      console.warn(
        "[trendyol-reviews] yorum entegrasyonu soft-fail:",
        reviewError instanceof Error ? reviewError.message : reviewError,
      );
      result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };
      result.reviews = Array.isArray(result.reviews) ? result.reviews : [];
      result.reviewDeferred = true;
    }
  }`;

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
