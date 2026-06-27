import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';
import { enrichTrendyolResult } from '../server/trendyol-result-normalizer.ts';

process.env.RAILWAY_ENVIRONMENT = 'production';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

console.log('Testing image fetch...');
const imgs = await fetchTrendyolProductImages(url);
console.log('fetchTrendyolProductImages:', imgs.length, imgs[0]);

const enriched = await enrichTrendyolResult(url, {
  title: 'Welcome to Trendyol',
  brand: 'Samsung',
  price: { original: 35590, withProfit: 39000, currency: 'TRY' },
  images: [],
  sourceUrl: url,
});
console.log('enriched:', enriched.success, enriched.images?.length, enriched.images?.[0]);
process.exit((enriched.images?.length ?? 0) > 0 ? 0 : 1);
