import axios from 'axios';

const id = '984233975';
const ep = `https://apigw.trendyol.com/discovery-web-productgw-service/api/productDetail/${id}`;
const r = await axios.get(ep, {
  timeout: 10000,
  validateStatus: () => true,
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Trendyol/4.2.1',
    Accept: 'application/json',
    Referer: 'https://www.trendyol.com/',
  },
});
console.log('status', r.status);
console.log('body', JSON.stringify(r.data).slice(0, 500));

const priceEp = `https://public.trendyol.com/discovery-web-productgw-service/api/price/${id}`;
try {
  const pr = await axios.get(priceEp, { timeout: 8000, validateStatus: () => true, headers: { Accept: 'application/json' } });
  console.log('price status', pr.status, JSON.stringify(pr.data).slice(0, 300));
} catch (e) {
  console.log('price err', e.message);
}
