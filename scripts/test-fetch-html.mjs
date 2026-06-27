import { fetchTrendyolHtml } from '../server/http-scraper-fallback.ts';
import { extractTrendyolProductFromHtml } from '../server/trendyol-html-extractor.ts';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

const r = await fetchTrendyolHtml(url);
console.log('fetchTrendyolHtml:', r?.source, r?.html?.length, 'prod urls', (r?.html?.match(/cdn\.dsmcdn\.com\/ty\d+\/prod\//g) || []).length);

const ext = await extractTrendyolProductFromHtml(url);
console.log('extract:', ext?.htmlSource, ext?.images?.length, ext?.images?.[0]);
