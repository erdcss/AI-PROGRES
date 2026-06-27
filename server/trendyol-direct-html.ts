/**
 * Trendyol doğrudan HTML — Puppeteer/cache gerektirmez.
 * Scenario scraper'ın çalışan axios fallback'i ile aynı strateji.
 */
import axios from 'axios';
import { extractProductImagesFromHtmlRegex } from '@shared/trendyol-bot-detection';

const DIRECT_HEADERS: Record<string, string>[] = [
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    Referer: 'https://www.google.com/',
    'Accept-Language': 'tr-TR,tr;q=0.9',
  },
  {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    Referer: 'https://www.trendyol.com/',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  },
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function htmlHasProductData(html: string): boolean {
  if (!html || html.length < 5000) return false;
  if (html.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')) return true;
  if (html.includes('__NEXT_DATA__') && html.includes('cdn.dsmcdn.com')) return true;
  if (extractProductImagesFromHtmlRegex(html).length >= 1) return true;
  return (
    html.length > 40000 &&
    /cdn\.dsmcdn\.com\/ty\d+\/(?:prod|product|media)\//i.test(html)
  );
}

async function tryOneFetch(
  targetUrl: string,
  headers: Record<string, string>,
): Promise<string | null> {
  try {
    const response = await axios.get(targetUrl, {
      timeout: 20000,
      maxRedirects: 5,
      headers: { ...headers, 'Cache-Control': 'no-cache' },
      validateStatus: (s) => s < 500,
    });
    if (response.status === 403 || response.status === 429) return null;
    const html = String(response.data || '');
    return htmlHasProductData(html) ? html : null;
  } catch {
    return null;
  }
}

async function tryScenarioExactFetch(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: 25000,
      maxRedirects: 5,
      validateStatus: (s) => s < 500,
    });
    if (response.status === 403 || response.status === 429) return null;
    const html = String(response.data || '');
    return htmlHasProductData(html) ? html : null;
  } catch {
    return null;
  }
}

/** Tam URL önce (boutiqueId vb.), ardından retry + paralel header denemeleri */
export async function fetchTrendyolDirectHtmlRaw(
  url: string,
  retries = 8,
): Promise<{ html: string; source: string } | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt);

    const exact = await tryScenarioExactFetch(url);
    if (exact) {
      console.log(`✅ Direct HTML (scenario-exact, ${exact.length} bytes, deneme ${attempt + 1})`);
      return { html: exact, source: 'direct-scenario-exact' };
    }

    const urlsToTry = [...new Set([url, url.split('?')[0]])];
    const tasks: Promise<string | null>[] = [];
    for (const targetUrl of urlsToTry) {
      for (const headers of DIRECT_HEADERS) {
        tasks.push(tryOneFetch(targetUrl, headers));
      }
    }

    const results = await Promise.all(tasks);
    for (const html of results) {
      if (html) {
        console.log(`✅ Direct HTML (${html.length} bytes, deneme ${attempt + 1})`);
        return { html, source: 'direct-retry' };
      }
    }
  }

  return null;
}
