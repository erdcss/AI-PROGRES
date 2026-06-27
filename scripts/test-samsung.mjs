import { fetchTrendyolProductByUrl } from '../server/trendyol-product-api.ts';
import { extractTrendyolProductFromHtml } from '../server/trendyol-html-extractor.ts';
import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';
import { enrichTrendyolResult } from '../server/trendyol-result-normalizer.ts';
import { fetchTrendyolHtml } from '../server/http-scraper-fallback.ts';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

console.log('=== Samsung S25 FE ===\n');

const api = await fetchTrendyolProductByUrl(url);
console.log('API:', { title: api?.title, price: api?.price?.original, images: api?.images?.length, sample: api?.images?.[0] });

const fetched = await fetchTrendyolHtml(url);
if (fetched?.html) {
  const urls = fetched.html.match(/https?:\/\/cdn\.dsmcdn\.com[^\s"'<>\\]+/gi) || [];
  const prefixes = [...new Set(urls.map((u) => u.match(/\/ty\d+\/[^/]+/)?.[0]).filter(Boolean))];
  console.log('CDN prefixes:', prefixes.slice(0, 10));
  console.log('CDN sample:', urls.slice(0, 5));
}

console.log('HTML fetch:', { source: fetched?.source, len: fetched?.html?.length, prodUrls: (fetched?.html?.match(/cdn\.dsmcdn\.com\/ty\d+\/prod\//g) || []).length });

const html = await extractTrendyolProductFromHtml(url);
console.log('HTML extractor:', { source: html?.htmlSource, images: html?.images?.length, sample: html?.images?.slice(0, 2) });

const imgs = await fetchTrendyolProductImages(url);
console.log('Image fetcher:', imgs.length, imgs.slice(0, 2));

const enriched = await enrichTrendyolResult(url, {
  title: api?.title || 'Galaxy S25 Fe 5g 8 256 Gb Akilli Telefon Lacivert',
  brand: 'Samsung',
  price: api?.price || { original: 0, withProfit: 0, currency: 'TRY' },
  images: api?.images || [],
  sourceUrl: url,
});
console.log('Enriched:', { success: enriched.success, images: enriched.images?.length, sample: enriched.images?.[0] });
