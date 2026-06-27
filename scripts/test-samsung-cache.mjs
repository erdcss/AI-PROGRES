import axios from 'axios';

const url =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';
const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
const r = await axios.get(cacheUrl, {
  timeout: 15000,
  validateStatus: () => true,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
});
const html = String(r.data || '');
console.log('len', html.length);
console.log('og:image', html.match(/og:image[^>]+content="([^"]+)"/i)?.[1]);
console.log('cdn mentions', (html.match(/cdn\.dsmcdn\.com/g) || []).length);
console.log('snippet', html.slice(0, 800));

// Direct trendyol with scenario headers
try {
  const d = await axios.get(url, {
    timeout: 8000,
    validateStatus: () => true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  console.log('direct status', d.status, 'len', String(d.data).length);
  console.log('direct cdn', (String(d.data).match(/cdn\.dsmcdn\.com\/ty\d+\/prod\//g) || []).length);
} catch (e) {
  console.log('direct err', e.message);
}
