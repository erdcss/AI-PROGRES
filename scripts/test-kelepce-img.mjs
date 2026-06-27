import { fetchTrendyolProductImages } from '../server/trendyol-image-fetcher.ts';
import { fetchTrendyolProxiedImage } from '../server/trendyol-image-proxy.ts';

const url =
  'https://www.trendyol.com/genel-markalar/3-lu-mineli-klasik-kelepce-seti-kis-bahcesi-p-1010648542?boutiqueId=61&merchantId=1072118';

const imgs = await fetchTrendyolProductImages(url);
console.log('count', imgs.length);
for (let i = 0; i < Math.min(3, imgs.length); i++) {
  const img = imgs[i];
  console.log('FULL', img);
  const proxied = await fetchTrendyolProxiedImage(img);
  console.log(i, proxied ? `OK ${proxied.data.length}b ${proxied.contentType}` : 'FAIL');
}
