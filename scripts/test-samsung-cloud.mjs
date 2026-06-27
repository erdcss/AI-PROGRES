process.env.RAILWAY_ENVIRONMENT = 'production';

import { enrichTrendyolResult } from '../server/trendyol-result-normalizer.ts';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

const enriched = await enrichTrendyolResult(url, {
  title: 'Welcome to Trendyol',
  brand: 'Samsung',
  price: { original: 35590, withProfit: 39000, currency: 'TRY' },
  images: [],
  sourceUrl: url,
  extractionMethod: 'trendyol-api',
});

const ok = enriched.success && (enriched.images?.length ?? 0) > 0;
console.log({ success: enriched.success, title: enriched.title, price: enriched.price?.original, images: enriched.images?.length, sample: enriched.images?.[0], CLOUD_OK: ok });
process.exit(ok ? 0 : 1);
