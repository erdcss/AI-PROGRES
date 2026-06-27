import axios from 'axios';
import { normalizeTrendyolImages, filterValidProductImages } from '../server/trendyol-image-utils.ts';
import { extractProductImagesFromHtmlRegex } from '../shared/trendyol-bot-detection.ts';

const productId = '984233975';
const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';

const endpoints = [
  `https://apigw.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://apigw.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://public-mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://public.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
];

const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Trendyol/4.2.1',
  Accept: 'application/json',
  Referer: 'https://www.trendyol.com/',
  Origin: 'https://www.trendyol.com',
};

for (const ep of endpoints) {
  try {
    const r = await axios.get(ep, { timeout: 10000, validateStatus: () => true, headers });
    const root = r.data?.result || r.data?.product || r.data;
    const imgs = filterValidProductImages(normalizeTrendyolImages(root?.images || root?.productImages || []));
    console.log(r.status, ep.split('.com')[1]?.slice(0, 40), 'imgs', imgs.length);
  } catch (e) {
    console.log('ERR', ep.slice(0, 60), e.message);
  }
}

const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
const cr = await axios.get(cacheUrl, { timeout: 15000, validateStatus: () => true, headers: { 'User-Agent': headers['User-Agent'] } });
const html = String(cr.data || '');
const regex = extractProductImagesFromHtmlRegex(html);
console.log('cache len', html.length, 'regex imgs', regex.length, filterValidProductImages(regex).length);
