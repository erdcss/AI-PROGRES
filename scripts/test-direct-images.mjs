import { fetchTrendyolDirectHtmlRaw } from '../server/trendyol-direct-html.ts';
import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

console.log('1) Direct HTML raw...');
const direct = await fetchTrendyolDirectHtmlRaw(url, 6);
console.log('direct:', direct ? direct.html.length + ' bytes' : 'null');

console.log('2) fetchTrendyolProductImages...');
const imgs = await fetchTrendyolProductImages(url);
console.log('images:', imgs.length, imgs[0]);
process.exit(imgs.length > 0 ? 0 : 1);
