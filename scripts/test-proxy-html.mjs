import axios from 'axios';
import { extractProductImagesFromHtmlRegex } from '../shared/trendyol-bot-detection.ts';
import { filterValidProductImages } from '../server/trendyol-image-utils.ts';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975';

const proxies = [
  `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

for (const p of proxies) {
  try {
    const r = await axios.get(p, { timeout: 30000, validateStatus: () => true });
    const html = String(r.data || '');
    const imgs = filterValidProductImages(extractProductImagesFromHtmlRegex(html));
    console.log(p.slice(0, 40), 'status', r.status, 'len', html.length, 'imgs', imgs.length);
    if (imgs[0]) console.log(' sample', imgs[0]);
  } catch (e) {
    console.log('ERR', p.slice(0, 40), e.message);
  }
}
