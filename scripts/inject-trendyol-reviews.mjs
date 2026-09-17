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
const injection = `  const coreReady = isCompleteScrapeData(coreFields);\n\n  // Yorum özeti + ilk gerçek yorum sayfası ürünle aynı scrape yanıtında hazır olmalı.\n  // Böylece toplu/auto-fast modunda kart MARKT-GO gönderiminden önce yorum verisini taşır.\n  try {\n    await attachTrendyolReviews(\n      result,\n      url,\n      variantOpts?.html ?? result.htmlContent ?? null,\n    );\n    result.reviewDeferred = false;\n\n    const reportedComments = Number(\n      result.reviewSummary?.commentCount || result.reviewSummary?.reviewCount || 0,\n    );\n    const loadedComments = Array.isArray(result.reviews) ? result.reviews.length : 0;\n    if (autoFast && reportedComments > 0 && loadedComments === 0) {\n      throw new Error(\n        \`Trendyol yorum doğrulaması başarısız: \${reportedComments} yorum bildiriliyor ancak yorum verisi alınamadı\`,\n      );\n    }\n  } catch (reviewError) {\n    if (autoFast) {\n      // Toplu otomatik aktarımda yorumlu bir ürünü 0 yorumla başarılı kabul etme.\n      // Bulk worker bu ürünü kontrollü retry akışına sokar.\n      throw reviewError;\n    }\n    console.warn(\n      "[trendyol-reviews] yorum entegrasyonu soft-fail:",\n      reviewError instanceof Error ? reviewError.message : reviewError,\n    );\n    result.reviewSummary = result.reviewSummary || { rating: 0, reviewCount: 0, commentCount: 0 };\n    result.reviews = Array.isArray(result.reviews) ? result.reviews : [];\n  }`;

if (source.includes('[trendyol-reviews] auto-fast: yorum çekimi ana pipeline dışında ertelendi')) {
  const oldStart = source.indexOf('  // auto-fast toplu çekimde yorumlar ürünün kritik yolunu bloke etmez.');
  const oldEndMarker = '\n  const providerId =';
  const oldEnd = oldStart >= 0 ? source.indexOf(oldEndMarker, oldStart) : -1;
  if (oldStart >= 0 && oldEnd > oldStart) {
    source = `${source.slice(0, oldStart)}${injection.slice(anchor.length + 2)}${source.slice(oldEnd)}`;
  }
}

if (!source.includes('result.reviewDeferred = false')) {
  if (!source.includes(anchor)) {
    throw new Error('Trendyol pipeline finalize anchor not found');
  }
  source = source.replace(anchor, injection);
}

if (!source.includes('Trendyol yorum doğrulaması başarısız')) {
  throw new Error('inline auto-fast review gate uygulanamadı');
}

fs.writeFileSync(file, source);
console.log('Trendyol review integration injected: bulk+detailed=inline; comment gate=on');
