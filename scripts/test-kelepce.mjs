import { fetchTrendyolDirectHtmlRaw } from '../server/trendyol-direct-html.ts';
import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';
import { extractTrendyolProductFromHtml } from '../server/trendyol-html-extractor.ts';
import { fetchTrendyolProductByUrl } from '../server/trendyol-product-api.ts';
import * as cheerio from 'cheerio';

const url =
  'https://www.trendyol.com/genel-markalar/3-lu-mineli-klasik-kelepce-seti-kis-bahcesi-p-1010648542?boutiqueId=61&merchantId=1072118';

const api = await fetchTrendyolProductByUrl(url);
console.log('API price:', api?.price?.original, 'imgs:', api?.images?.length);

const direct = await fetchTrendyolDirectHtmlRaw(url, 4);
console.log('direct html:', direct?.html?.length ?? 0);

if (direct?.html) {
  const $ = cheerio.load(direct.html);
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item['@type'] === 'Product') {
          console.log('JSON-LD price:', item.offers?.price ?? item.offers?.[0]?.price);
        }
      }
    } catch {}
  });
  const m = direct.html.match(/"discountedPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
  console.log('script discountedPrice:', m?.[1]);
}

const html = await extractTrendyolProductFromHtml(url);
console.log('extractor price:', html?.price?.original, 'imgs:', html?.images?.length, html?.images?.[0]?.slice(0,70));

const imgs = await fetchTrendyolProductImages(url);
console.log('fetchImages:', imgs.length, imgs[0]?.slice(0,70));
