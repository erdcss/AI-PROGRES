import { fetchTrendyolHtml } from '../server/http-scraper-fallback.ts';
import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

await new Promise((r) => setTimeout(r, 2000));

const html = await fetchTrendyolHtml(url);
console.log('fetchTrendyolHtml:', html?.source, html?.html?.length);

const imgs = await fetchTrendyolProductImages(url);
console.log('images:', imgs.length, imgs[0]);
process.exit(imgs.length > 0 ? 0 : 1);
