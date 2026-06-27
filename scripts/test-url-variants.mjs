import axios from 'axios';

const withBoutique =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975?boutiqueId=689770';
const clean =
  'https://www.trendyol.com/samsung/galaxy-s25-fe-5g-8-256-gb-akilli-telefon-lacivert-p-984233975';

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
};

for (const u of [clean, withBoutique]) {
  const r = await axios.get(u, { timeout: 25000, validateStatus: () => true, headers });
  const html = String(r.data || '');
  console.log(u.includes('boutique') ? 'with' : 'clean', r.status, html.length, (html.match(/\/prod\//g) || []).length);
}
