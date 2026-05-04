/**
 * PttAvm Product Scraper — Cloudflare Bypass via puppeteer-extra-plugin-stealth
 *
 * Strategy order:
 * 1. Axios with realistic mobile headers (fast, low overhead)
 * 2. puppeteer-extra + StealthPlugin (bypasses Cloudflare JS challenges)
 * 3. Build Shopify-compatible CSV from extracted data
 */

import { createRequire } from 'module';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { getChromiumPath } from './puppeteer-config.js';

// Use createRequire to load CJS modules (puppeteer-extra is CJS)
const require = createRequire(import.meta.url);
const puppeteerExtraLib = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const puppeteerExtra = puppeteerExtraLib.default || puppeteerExtraLib;
puppeteerExtra.use(StealthPlugin());

export interface PttAvmProduct {
  success: boolean;
  title: string;
  brand: string;
  price: {
    original: number;
    withProfit: number;
    formatted: string;
    profitFormatted: string;
    currency: string;
  };
  images: Array<{ url: string; colorName: string }>;
  description: string;
  features: Array<{ key: string; value: string }>;
  category: string;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{ color: string; colorCode: string; size: string; inStock: boolean }>;
  };
  tags: string[];
  csvContent: string;
  sourceUrl: string;
  extractionMethod: string;
  message?: string;
}

// ── CSV Builder ──────────────────────────────────────────────────────────────

function buildShopifyCSV(product: Omit<PttAvmProduct, 'csvContent'>): string {
  const headers = [
    'Title', 'URL handle', 'Description', 'Vendor', 'Product category', 'Type', 'Tags',
    'Published on online store', 'Status', 'SKU', 'Barcode',
    'Option1 name', 'Option1 value', 'Option1 Linked To',
    'Option2 name', 'Option2 value', 'Option2 Linked To',
    'Option3 name', 'Option3 value', 'Option3 Linked To',
    'Price', 'Compare-at price', 'Cost per item', 'Charge tax', 'Tax code',
    'Unit price total measure', 'Unit price total measure unit',
    'Unit price base measure', 'Unit price base measure unit',
    'Inventory tracking', 'Inventory policy', 'Inventory quantity',
    'Requires shipping', 'Weight', 'Weight unit',
    'Product image URL', 'Image position', 'Image alt text', 'Variant image',
    'Google Shopping / Google product category', 'Google Shopping / Gender',
    'Google Shopping / Age group', 'Google Shopping / MPN',
    'Google Shopping / Condition', 'Google Shopping / Custom product',
    'Google Shopping / Custom label 0', 'Google Shopping / Custom label 1',
    'Google Shopping / Custom label 2', 'Google Shopping / Custom label 3',
    'Google Shopping / Custom label 4',
    'SEO title', 'SEO description', 'Status',
    'Metafield: custom.renk [single_line_text_field]',
  ];

  const handle = product.title
    .toLowerCase()
    .replace(/[ğ]/g, 'g').replace(/[ü]/g, 'u').replace(/[ş]/g, 's')
    .replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ç]/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);

  const price = product.price.withProfit || product.price.original || 0;
  const comparePrice = Math.round(price * 1.15);
  const tags = [...new Set(product.tags)].join(', ');
  const images = product.images.filter(img => img.url && !img.url.endsWith('.svg'));

  const esc = (val: string) => {
    const s = String(val ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const makeRow = (isFirst: boolean, imgUrl: string, imgPos: number): string[] => {
    const row = new Array(headers.length).fill('');
    if (isFirst) {
      row[0]  = product.title;
      row[1]  = handle;
      row[2]  = product.description || '';
      row[3]  = product.brand;
      row[4]  = product.category || 'Elektronik';
      row[5]  = product.category || 'Elektronik';
      row[6]  = tags;
      row[7]  = 'TRUE';
      row[8]  = 'active';
      row[9]  = `${handle}-default`;
      row[11] = 'Title';
      row[12] = 'Default Title';
      row[20] = String(price);
      row[21] = String(comparePrice);
      row[23] = 'TRUE';
      row[29] = 'shopify';
      row[30] = 'continue';
      row[31] = '10';
      row[32] = 'TRUE';
      row[52] = 'active';
    }
    row[35] = imgUrl;
    row[36] = String(imgPos);
    row[37] = product.title;
    return row;
  };

  const rows = images.length > 0
    ? images.map((img, i) => makeRow(i === 0, img.url, i + 1))
    : [makeRow(true, '', 1)];

  return [
    headers.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ].join('\n');
}

// ── HTML Parser (shared between strategies) ───────────────────────────────────

function parseHtml(html: string, sourceUrl: string): Partial<PttAvmProduct> {
  const $ = cheerio.load(html);

  // Title
  let title = '';
  for (const sel of ['h1.product-title', 'h1[class*="product"]', '.product-name h1',
                     '[itemprop="name"]', 'h1', '.pr-new-br span']) {
    const t = $(sel).first().text().trim();
    if (t && t.length > 3 && !t.toLowerCase().includes('blocked')) { title = t; break; }
  }
  if (!title) {
    const m = html.match(/"name"\s*:\s*"([^"]{5,200})"/);
    if (m) title = m[1];
  }
  if (!title) title = $('title').text().replace(/\s*[-|].*$/, '').trim();

  // Brand
  let brand = '';
  for (const sel of ['[itemprop="brand"] [itemprop="name"]', '[itemprop="brand"]',
                     '.brand-name', '.product-brand', '.brand']) {
    const b = $(sel).first().text().trim();
    if (b && b.length > 1) { brand = b; break; }
  }
  if (!brand) {
    const m = html.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    if (m) brand = m[1];
  }
  if (!brand) {
    const m = html.match(/"brand"\s*:\s*"([^"]{2,30})"/);
    if (m) brand = m[1];
  }

  // Price
  let priceRaw = 0;
  const priceSelectors = [
    '.price-box .special-price .price', '.product-price .price',
    '.regular-price .price', '[itemprop="price"]', '.prc-dsc',
    '.current-price', '.sale-price', '.product-price',
    '.pdp-price', '.discounted-price', '[class*="price"]',
  ];
  for (const sel of priceSelectors) {
    const el = $(sel).first();
    const text = el.attr('content') || el.text().trim();
    const val = parseFloat(text.replace(/[^\d,\.]/g, '').replace(',', '.'));
    if (val > 0 && val < 999999) { priceRaw = val; break; }
  }
  if (!priceRaw) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (priceRaw) return;
      try {
        const d = JSON.parse($(el).html() || '');
        const p = d?.offers?.price || d?.price;
        if (p && !isNaN(parseFloat(String(p)))) priceRaw = parseFloat(String(p));
      } catch {}
    });
  }
  if (!priceRaw) {
    const matches = html.match(/[\d]{1,4}[.,]\d{2}\s*TL/g) || [];
    const vals = matches
      .map(m => parseFloat(m.replace(/[^\d,\.]/g, '').replace(',', '.')))
      .filter(v => v > 0 && v < 99999);
    if (vals.length) priceRaw = Math.min(...vals);
  }

  // Images
  const imageSet = new Set<string>();
  for (const sel of ['.product-image-gallery img', '.swiper-slide img', '.fotorama img',
                     '.product-img img', '.gallery-image img', '[class*="product-image"] img',
                     '[class*="gallery"] img', '.main-image img', '#main-image img',
                     '[class*="slider"] img', 'figure img', '.pdp-images img',
                     '.product-images img', '.product-gallery img']) {
    $(sel).each((_, el) => {
      const src = $(el).attr('data-zoom-image') || $(el).attr('data-large') ||
                  $(el).attr('data-src') || $(el).attr('src') || '';
      if (src && src.startsWith('http') && !src.includes('.svg') &&
          !src.includes('placeholder') && !src.includes('logo') && src.length > 20) {
        imageSet.add(src.split('?')[0]);
      }
    });
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const d = JSON.parse($(el).html() || '');
      const imgs = d.image || d.images || [];
      (Array.isArray(imgs) ? imgs : [imgs]).forEach((img: any) => {
        const u = typeof img === 'string' ? img : (img.url || img.contentUrl || '');
        if (u?.startsWith('http')) imageSet.add(u.split('?')[0]);
      });
    } catch {}
  });
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) imageSet.add(ogImage.split('?')[0]);

  const images = Array.from(imageSet).slice(0, 20).map(u => ({ url: u, colorName: 'none' }));

  // Description
  let description = '';
  for (const sel of ['.product-description', '[itemprop="description"]',
                     '.description-content', '.product-desc', '#product-description',
                     '.tab-content .tab-pane:first-child', '.product-detail-description']) {
    const html2 = $(sel).first().html()?.trim();
    if (html2 && html2.length > 10) { description = html2; break; }
  }
  if (!description) {
    const meta = $('meta[name="description"]').attr('content');
    if (meta) description = `<p>${meta}</p>`;
  }

  // Features
  const features: Array<{ key: string; value: string }> = [];
  for (const sel of ['.product-attributes tr', '.specs-table tr', '.technical-specs tr',
                     '[class*="specification"] tr', '[class*="attribute"] tr',
                     '.product-features tr']) {
    $(sel).each((_, row) => {
      const cells = $(row).find('td, th');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        if (key && value) features.push({ key, value });
      }
    });
    if (features.length) break;
  }

  // Category from breadcrumb
  const crumbs = $('.breadcrumb li, .breadcrumb-item, [class*="breadcrumb"] a, [class*="breadcrumb"] span')
    .toArray().map(el => $(el).text().trim())
    .filter(t => t && t !== 'Anasayfa' && t !== '>' && t !== '/');
  const category = crumbs.length > 0 ? crumbs[crumbs.length - 1] : 'Elektronik';

  return { title, brand, price: {
    original: priceRaw,
    withProfit: Math.round(priceRaw * 1.10),
    formatted: `${priceRaw.toFixed(2)} TL`,
    profitFormatted: `${Math.round(priceRaw * 1.10).toFixed(2)} TL`,
    currency: 'TL',
  }, images, description, features, category };
}

// ── Strategy 1: Axios with stealth headers (fast path) ────────────────────────

async function tryAxios(url: string): Promise<Partial<PttAvmProduct> | null> {
  console.log(`📡 [PttAvm Axios] Trying stealth HTTP request...`);
  const candidates = [
    // Googlebot — Cloudflare usually doesn't challenge Google
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    // Facebook crawler — often passes Cloudflare
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    // Mobile Safari (sometimes lighter Cloudflare check)
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ];

  for (const ua of candidates) {
    try {
      const resp = await axios.get(url.split('?')[0], {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache',
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: s => s < 500,
      });
      if (resp.status !== 200) continue;
      const html = String(resp.data);
      // Detect Cloudflare block page
      if (html.includes('cf-wrapper') || html.includes('blocked') ||
          html.includes('Just a moment') || html.includes('DDoS protection')) {
        console.log(`⚠️ [PttAvm Axios] CF blocked: UA=${ua.slice(0, 40)}`);
        continue;
      }
      console.log(`✅ [PttAvm Axios] Success (${html.length} chars)`);
      const parsed = parseHtml(html, url);
      if (parsed.title && !parsed.title.toLowerCase().includes('blocked')) return parsed;
    } catch (e: any) {
      console.log(`⚠️ [PttAvm Axios] ${ua.slice(0, 40)}: ${e.message}`);
    }
  }
  return null;
}

// ── Strategy 2: puppeteer-extra + StealthPlugin (Cloudflare bypass) ────────────

async function tryStealthPuppeteer(url: string): Promise<Partial<PttAvmProduct> | null> {
  console.log(`🥷 [PttAvm Stealth] Launching puppeteer-extra with StealthPlugin...`);

  let browser: any = null;
  let page: any = null;

  try {
    const chromePath = getChromiumPath();
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-blink-features=AutomationControlled',
      '--lang=tr-TR,tr',
      '--window-size=1366,768',
    ];

    browser = await puppeteerExtra.launch({
      headless: true,
      executablePath: chromePath,
      protocolTimeout: 120000,
      timeout: 120000,
      args: launchArgs,
    });

    page = await browser.newPage();

    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
    });

    // Block unnecessary resources to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req: any) => {
      const rt = req.resourceType();
      if (['image', 'font', 'media'].includes(rt)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const cleanUrl = url.split('?')[0];
    console.log(`🌐 [PttAvm Stealth] Navigating to: ${cleanUrl}`);

    await page.goto(cleanUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for Cloudflare challenge to resolve (CF redirects after JS challenge)
    await new Promise(r => setTimeout(r, 6000));

    let html = await page.content();

    // Check if still on CF challenge page — wait more
    if (html.includes('cf-wrapper') || html.includes('Just a moment') ||
        html.includes('DDoS') || html.includes('Enable JavaScript')) {
      console.log(`⏳ [PttAvm Stealth] CF challenge detected, waiting 15s more...`);
      await new Promise(r => setTimeout(r, 15000));
      html = await page.content();
    }

    // Check block page
    const lowerHtml = html.toLowerCase();
    if (lowerHtml.includes('sorry, you have been blocked') || lowerHtml.includes('access denied')) {
      console.log(`❌ [PttAvm Stealth] Still blocked after waiting`);
      return null;
    }

    console.log(`✅ [PttAvm Stealth] Got page (${html.length} chars)`);
    const parsed = parseHtml(html, url);

    if (!parsed.title || parsed.title.toLowerCase().includes('blocked')) {
      console.log(`❌ [PttAvm Stealth] Title extraction failed or blocked: "${parsed.title}"`);
      return null;
    }

    return parsed;

  } catch (err: any) {
    console.error(`❌ [PttAvm Stealth] Error: ${err.message}`);
    return null;
  } finally {
    if (page) { try { await page.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
  }
}

// ── Cookie Relay Store ────────────────────────────────────────────────────────
// User pastes their cf_clearance cookie once → server uses it for all requests

let _cfClearance = '';
let _cfUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
let _cfSetAt = 0;

export function setPttAvmCookie(cfClearance: string, userAgent?: string) {
  _cfClearance = cfClearance.trim();
  if (userAgent) _cfUserAgent = userAgent.trim();
  _cfSetAt = Date.now();
  console.log(`🍪 [PttAvm Cookie] Stored cf_clearance (${_cfClearance.length} chars)`);
}

export function getPttAvmCookieStatus() {
  const ageMin = _cfSetAt ? Math.round((Date.now() - _cfSetAt) / 60000) : null;
  return {
    hasCookie: !!_cfClearance,
    preview: _cfClearance ? `${_cfClearance.slice(0, 24)}...` : '',
    ageMinutes: ageMin,
    setAt: _cfSetAt || null,
  };
}

// ── Strategy 0: Cookie Relay (user's own Cloudflare session) ──────────────────

async function tryWithCfCookie(url: string): Promise<Partial<PttAvmProduct> | null> {
  if (!_cfClearance) return null;
  console.log(`🍪 [PttAvm Cookie] Trying with stored cf_clearance...`);

  const uaList = [
    _cfUserAgent,
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];

  for (const ua of uaList) {
    try {
      const resp = await axios.get(url.split('?')[0], {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cookie': `cf_clearance=${_cfClearance}`,
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: s => s < 500,
      });

      if (resp.status !== 200) {
        console.log(`⚠️ [PttAvm Cookie] HTTP ${resp.status}`);
        continue;
      }

      const html = String(resp.data);
      if (
        html.includes('cf-wrapper') || html.includes('Just a moment') ||
        html.includes('Sorry, you have been blocked') || html.includes('DDoS protection') ||
        html.includes('Enable JavaScript')
      ) {
        console.log(`⚠️ [PttAvm Cookie] Still blocked — cookie may be IP-bound or expired`);
        continue;
      }

      console.log(`✅ [PttAvm Cookie] Success! (${html.length} chars)`);
      const parsed = parseHtml(html, url);
      if (parsed.title) return parsed;
    } catch (e: any) {
      console.log(`⚠️ [PttAvm Cookie] ${e.message}`);
    }
  }
  return null;
}

// ── Bookmarklet JSON Import Export ───────────────────────────────────────────
// Accepts pre-extracted JSON from the browser bookmarklet (no Cloudflare issue)

export function importJsonProduct(data: {
  url: string;
  title: string;
  brand?: string;
  price?: number | string;
  images?: Array<{ url: string; colorName: string }>;
  description?: string;
  features?: Array<{ key: string; value: string }>;
  category?: string;
}): PttAvmProduct {
  const brand = data.brand || '';
  const priceRaw = typeof data.price === 'number'
    ? data.price
    : parseFloat(String(data.price || '0').replace(/[^\d,.]/g, '').replace(',', '.')) || 0;
  const category = data.category || 'Elektronik';
  const tags = [brand, category, 'PttAvm'].filter(Boolean);

  if (!data.title || data.title.length < 3) {
    return {
      success: false, title: '', brand: '',
      price: { original: 0, withProfit: 0, formatted: '0 TL', profitFormatted: '0 TL', currency: 'TL' },
      images: [], description: '', features: [], category: '',
      variants: { colors: [], sizes: [], allVariants: [] },
      tags: [], csvContent: '', sourceUrl: data.url,
      extractionMethod: 'bookmarklet',
      message: 'Ürün başlığı bulunamadı. Doğru sayfada olduğunuzdan emin olun.',
    };
  }

  const product: Omit<PttAvmProduct, 'csvContent'> = {
    success: true,
    title: data.title,
    brand,
    price: {
      original: priceRaw,
      withProfit: Math.round(priceRaw * 1.10),
      formatted: `${priceRaw.toFixed(2)} TL`,
      profitFormatted: `${Math.round(priceRaw * 1.10).toFixed(2)} TL`,
      currency: 'TL',
    },
    images: (data.images || []).filter(img => img.url && img.url.startsWith('http')),
    description: data.description || '',
    features: data.features || [],
    category,
    variants: { colors: [], sizes: [], allVariants: [] },
    tags,
    sourceUrl: data.url,
    extractionMethod: 'bookmarklet',
  };

  return { ...product, csvContent: buildShopifyCSV(product) };
}

// ── Public HTML Parser Export ─────────────────────────────────────────────────
// Used by /api/pttavm-parse-html for client-side bypass flow

export function parsePttAvmHtml(html: string, sourceUrl: string): PttAvmProduct {
  const partial = parseHtml(html, sourceUrl);

  if (!partial.title || partial.title.toLowerCase().includes('blocked')) {
    return {
      success: false,
      title: '',
      brand: '',
      price: { original: 0, withProfit: 0, formatted: '0 TL', profitFormatted: '0 TL', currency: 'TL' },
      images: [],
      description: '',
      features: [],
      category: '',
      variants: { colors: [], sizes: [], allVariants: [] },
      tags: [],
      csvContent: '',
      sourceUrl,
      extractionMethod: 'html-parse',
      message: 'HTML içeriğinden ürün başlığı çıkarılamadı.',
    };
  }

  const brand = partial.brand || '';
  const category = partial.category || 'Elektronik';
  const tags = [brand, category, 'PttAvm'].filter(Boolean);

  const product: Omit<PttAvmProduct, 'csvContent'> = {
    success: true,
    title: partial.title,
    brand,
    price: partial.price || { original: 0, withProfit: 0, formatted: '0 TL', profitFormatted: '0 TL', currency: 'TL' },
    images: partial.images || [],
    description: partial.description || '',
    features: partial.features || [],
    category,
    variants: { colors: [], sizes: [], allVariants: [] },
    tags,
    sourceUrl,
    extractionMethod: 'html-parse-client',
  };

  return { ...product, csvContent: buildShopifyCSV(product) };
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function scrapePttAvm(url: string): Promise<PttAvmProduct> {
  console.log(`🛒 [PttAvm] Starting scrape: ${url}`);
  const cleanUrl = url.split('?')[0];

  let partial: Partial<PttAvmProduct> | null = null;

  // Strategy 0: Cookie relay — user's own cf_clearance cookie (fastest if available)
  if (_cfClearance) {
    partial = await tryWithCfCookie(cleanUrl);
    if (partial?.title) console.log(`✅ [PttAvm] Cookie relay strategy succeeded`);
  }

  // Strategy 1: Fast Axios (Googlebot/Facebook UA)
  if (!partial?.title) {
    partial = await tryAxios(cleanUrl);
  }

  // Strategy 2: Full stealth Puppeteer with puppeteer-extra-plugin-stealth
  if (!partial?.title) {
    partial = await tryStealthPuppeteer(cleanUrl);
  }

  if (!partial?.title) {
    console.error(`❌ [PttAvm] All strategies exhausted`);
    const hasCookie = !!_cfClearance;
    return {
      success: false,
      title: '',
      brand: '',
      price: { original: 0, withProfit: 0, formatted: '0 TL', profitFormatted: '0 TL', currency: 'TL' },
      images: [],
      description: '',
      features: [],
      category: '',
      variants: { colors: [], sizes: [], allVariants: [] },
      tags: [],
      csvContent: '',
      sourceUrl: cleanUrl,
      extractionMethod: 'failed',
      message: hasCookie
        ? 'Cookie ile denendi ancak Cloudflare engeli devam ediyor. Cookie süresi dolmuş olabilir — yeni cf_clearance değeri yapıştırın.'
        : 'PttAvm Cloudflare koruması tüm yöntemleri engelledi. cf_clearance Cookie yapıştırın veya Bookmarklet kullanın.',
    };
  }

  const brand = partial.brand || '';
  const category = partial.category || 'Elektronik';
  const tags = [brand, category, 'PttAvm'].filter(Boolean);

  const product: Omit<PttAvmProduct, 'csvContent'> = {
    success: true,
    title: partial.title,
    brand,
    price: partial.price || { original: 0, withProfit: 0, formatted: '0 TL', profitFormatted: '0 TL', currency: 'TL' },
    images: partial.images || [],
    description: partial.description || '',
    features: partial.features || [],
    category,
    variants: { colors: [], sizes: [], allVariants: [] },
    tags,
    sourceUrl: cleanUrl,
    extractionMethod: 'pttavm-stealth',
  };

  const csvContent = buildShopifyCSV(product);

  console.log(`✅ [PttAvm] Done: "${product.title}", ${product.images.length} images, ${product.price.original} TL`);

  return { ...product, csvContent };
}
