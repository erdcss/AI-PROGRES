import { fetchTrendyolDirectHtmlRaw } from '../server/trendyol-direct-html.ts';
import axios from 'axios';
import * as cheerio from 'cheerio';

const url =
  'https://www.trendyol.com/genel-markalar/3-lu-mineli-klasik-kelepce-seti-kis-bahcesi-p-1010648542?boutiqueId=61&merchantId=1072118';

const { html } = await fetchTrendyolDirectHtmlRaw(url, 4);
const $ = cheerio.load(html);
const og = $('meta[property="og:image"]').attr('content');
console.log('og:image', og);

const headers = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36',
  Referer: 'https://www.trendyol.com/',
};

for (const testUrl of [og, ...(html.match(/1_org_zoom\.jpg/gi) || []).slice(0,1).map(() => null)].filter(Boolean)) {
  const r = await axios.get(testUrl, { headers, responseType: 'arraybuffer', validateStatus: () => true, timeout: 10000 });
  console.log('GET', testUrl?.slice(0, 100), r.status, r.data?.byteLength);
}

const prodUrls = [...html.matchAll(/"url"\s*:\s*"(https:\\\/\\\/cdn\.dsmcdn\.com[^"]+)"/g)]
  .map((m) => m[1].replace(/\\\//g, '/'))
  .filter((u) => u.includes('org_zoom'));
console.log('state org_zoom count', prodUrls.length);
for (const img of prodUrls.slice(0, 3)) {
  const r = await axios.get(img, { headers, responseType: 'arraybuffer', validateStatus: () => true, timeout: 10000 });
  console.log('state', r.status, r.data?.byteLength, img.slice(0, 95));
}
