import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';
import { enrichTrendyolResult } from '../server/trendyol-result-normalizer.ts';

const url =
  'https://www.trendyol.com/neon-shoes/madrid-unisex-ortopedik-tabanli-terlik-cift-bantli-tokali-gunluk-rahat-ev-disari-terligi-p-270541104';

console.log('Testing Madrid terlik...');
const imgs = await fetchTrendyolProductImages(url);
console.log('images:', imgs.length, imgs[0]);

const enriched = await enrichTrendyolResult(url, {
  title: '',
  brand: 'neon shoes',
  price: { original: 0, withProfit: 0, currency: 'TRY' },
  images: [],
  sourceUrl: url,
});
console.log('enriched:', enriched.success, enriched.title, enriched.price?.original, enriched.images?.length);
console.log('variants:', enriched.variants?.allVariants?.length ?? 0, 'colors:', enriched.variants?.colors?.length);
process.exit(enriched.success && (enriched.images?.length ?? 0) > 0 ? 0 : 1);
