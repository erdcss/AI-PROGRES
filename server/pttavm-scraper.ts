/**
 * PttAvm Product Scraper
 * Uses Puppeteer to bypass Cloudflare protection and extract product data
 */

import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import { buildLaunchOptions } from './puppeteer-config.js';

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

function buildShopifyCSV(product: Omit<PttAvmProduct, 'csvContent'>): string {
  const headers = [
    'Title','URL handle','Description','Vendor','Product category','Type','Tags',
    'Published on online store','Status','SKU','Barcode',
    'Option1 name','Option1 value','Option1 Linked To',
    'Option2 name','Option2 value','Option2 Linked To',
    'Option3 name','Option3 value','Option3 Linked To',
    'Price','Compare-at price','Cost per item','Charge tax','Tax code',
    'Unit price total measure','Unit price total measure unit',
    'Unit price base measure','Unit price base measure unit',
    'Inventory tracking','Inventory policy','Inventory quantity',
    'Requires shipping','Weight','Weight unit','Product image URL','Image position',
    'Image alt text','Variant image','Google Shopping / Google product category',
    'Google Shopping / Gender','Google Shopping / Age group',
    'Google Shopping / MPN','Google Shopping / Condition','Google Shopping / Custom product',
    'Google Shopping / Custom label 0','Google Shopping / Custom label 1',
    'Google Shopping / Custom label 2','Google Shopping / Custom label 3',
    'Google Shopping / Custom label 4','SEO title','SEO description',
    'Status','Metafield: custom.renk [single_line_text_field]'
  ];

  const handle = product.title
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöçğüşıöç\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);

  const price = product.price.withProfit;
  const comparePrice = Math.round(price * 1.15);
  const tags = product.tags.join(', ');
  const images = product.images.filter(img => img.url && !img.url.endsWith('.svg'));

  const rows: string[][] = [];

  const makeRow = (
    isFirstRow: boolean,
    imgUrl: string,
    imgPos: number,
    optionName: string,
    optionValue: string
  ): string[] => {
    const row = new Array(headers.length).fill('');
    if (isFirstRow) {
      row[0] = product.title;
      row[1] = handle;
      row[2] = product.description || '';
      row[3] = product.brand;
      row[4] = product.category || 'Elektronik';
      row[5] = product.category || 'Elektronik';
      row[6] = tags;
      row[7] = 'TRUE';
      row[8] = 'active';
      row[9] = `${handle}-default`;
      row[20] = String(price);
      row[21] = String(comparePrice);
      row[23] = 'TRUE';
      row[29] = 'shopify';
      row[30] = 'continue';
      row[31] = '10';
      row[32] = 'TRUE';
      row[11] = optionName || 'Title';
      row[12] = optionValue || 'Default Title';
    }
    row[35] = imgUrl;
    row[36] = String(imgPos);
    row[37] = product.title;
    row[49] = 'active';
    return row;
  };

  if (images.length === 0) {
    rows.push(makeRow(true, '', 1, 'Title', 'Default Title'));
  } else {
    images.forEach((img, i) => {
      rows.push(makeRow(i === 0, img.url, i + 1, 'Title', 'Default Title'));
    });
  }

  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const lines = [
    headers.map(escape).join(','),
    ...rows.map(r => r.map(escape).join(','))
  ];

  return lines.join('\n');
}

export async function scrapePttAvm(url: string): Promise<PttAvmProduct> {
  console.log(`🛒 [PttAvm] Starting scrape: ${url}`);

  let browser: any = null;
  let page: any = null;

  try {
    browser = await puppeteer.launch(buildLaunchOptions({
      extraArgs: [
        '--disable-blink-features=AutomationControlled',
        '--lang=tr-TR,tr'
      ]
    }));

    page = await browser.newPage();

    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Referer': 'https://www.google.com/'
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log(`🌐 [PttAvm] Navigating...`);
    await page.goto(url.split('?')[0], {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    const $ = cheerio.load(html);

    const cleanUrl = url.split('?')[0];

    // --- Title ---
    let title = '';
    const titleSelectors = [
      'h1.product-title',
      'h1[class*="product"]',
      '.product-name h1',
      '.pr-new-br span',
      'h1',
      '[itemprop="name"]'
    ];
    for (const sel of titleSelectors) {
      const t = $(sel).first().text().trim();
      if (t && t.length > 3) { title = t; break; }
    }
    if (!title) {
      const match = html.match(/"name"\s*:\s*"([^"]{5,200})"/);
      if (match) title = match[1];
    }
    if (!title) title = $('title').text().replace(/\s*[-|].*$/, '').trim();
    console.log(`📦 [PttAvm] Title: ${title}`);

    // --- Brand ---
    let brand = '';
    const brandSelectors = ['[itemprop="brand"]', '.brand-name', '.product-brand', '.brand'];
    for (const sel of brandSelectors) {
      const b = $(sel).first().text().trim();
      if (b && b.length > 1) { brand = b; break; }
    }
    if (!brand) {
      const brandMatch = html.match(/"brand"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
      if (brandMatch) brand = brandMatch[1];
    }
    if (!brand) {
      const urlParts = cleanUrl.split('/');
      const lastPart = urlParts[urlParts.length - 1] || '';
      const firstWord = lastPart.split('-')[0];
      if (firstWord) brand = firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
    }
    console.log(`🏷️ [PttAvm] Brand: ${brand}`);

    // --- Price ---
    let priceRaw = 0;
    const priceSelectors = [
      '.price-box .special-price .price',
      '.product-price .price',
      '.regular-price .price',
      '[itemprop="price"]',
      '.prc-dsc',
      '.current-price',
      '.sale-price',
      '.product-price'
    ];
    for (const sel of priceSelectors) {
      const text = $(sel).first().text().trim().replace(/[^\d,\.]/g, '').replace(',', '.');
      const val = parseFloat(text);
      if (val > 0) { priceRaw = val; break; }
    }
    if (!priceRaw) {
      const priceAttr = $('[itemprop="price"]').attr('content');
      if (priceAttr) priceRaw = parseFloat(priceAttr) || 0;
    }
    if (!priceRaw) {
      const matches = html.match(/"price"\s*:\s*"?([\d.]+)"?/g);
      if (matches) {
        const vals = matches.map(m => parseFloat(m.replace(/[^\d.]/g, ''))).filter(v => v > 0 && v < 99999);
        if (vals.length) priceRaw = Math.min(...vals);
      }
    }
    const withProfit = Math.round(priceRaw * 1.10);
    const price = {
      original: priceRaw,
      withProfit,
      formatted: `${priceRaw.toFixed(2)} TL`,
      profitFormatted: `${withProfit.toFixed(2)} TL`,
      currency: 'TL'
    };
    console.log(`💰 [PttAvm] Price: ${priceRaw} TL`);

    // --- Images ---
    const imageUrls = new Set<string>();
    const imgSelectors = [
      '.product-image-gallery img',
      '.swiper-slide img',
      '.fotorama img',
      '.product-img img',
      '.gallery-image img',
      '[class*="product-image"] img',
      '[class*="gallery"] img',
      '.main-image img',
      '#main-image img'
    ];
    for (const sel of imgSelectors) {
      $(sel).each((_, el) => {
        const src = $(el).attr('data-zoom-image') || $(el).attr('data-large') || $(el).attr('src') || '';
        if (src && src.includes('http') && !src.includes('.svg') && !src.includes('placeholder')) {
          imageUrls.add(src.split('?')[0]);
        }
      });
    }
    // Also try JSON-LD images
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '');
        const imgs = data.image || data.images || [];
        (Array.isArray(imgs) ? imgs : [imgs]).forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : img.url || img.contentUrl;
          if (imgUrl && imgUrl.startsWith('http')) imageUrls.add(imgUrl);
        });
      } catch {}
    });
    const images = Array.from(imageUrls).slice(0, 20).map(url => ({ url, colorName: 'none' }));
    console.log(`📸 [PttAvm] Images: ${images.length}`);

    // --- Description ---
    let description = '';
    const descSelectors = [
      '.product-description',
      '[itemprop="description"]',
      '.description-content',
      '.product-desc',
      '#product-description',
      '.tab-content .tab-pane:first-child'
    ];
    for (const sel of descSelectors) {
      const text = $(sel).first().html()?.trim();
      if (text && text.length > 10) { description = text; break; }
    }
    if (!description) {
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) description = `<p>${metaDesc}</p>`;
    }

    // --- Features ---
    const features: Array<{ key: string; value: string }> = [];
    const featureSelectors = [
      '.product-attributes tr',
      '.specs-table tr',
      '.technical-specs tr',
      '[class*="specification"] tr',
      '[class*="attribute"] tr'
    ];
    for (const sel of featureSelectors) {
      $(sel).each((_, row) => {
        const cells = $(row).find('td, th');
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim();
          if (key && value) features.push({ key, value });
        }
      });
      if (features.length > 0) break;
    }
    console.log(`📋 [PttAvm] Features: ${features.length}`);

    // --- Category ---
    let category = 'Elektronik';
    const breadcrumb = $('.breadcrumb li, .breadcrumb-item, [class*="breadcrumb"] a').toArray()
      .map(el => $(el).text().trim())
      .filter(t => t && t !== 'Anasayfa' && t !== '>');
    if (breadcrumb.length > 0) category = breadcrumb[breadcrumb.length - 1];

    // --- Variants ---
    const colors: string[] = [];
    const sizes: string[] = [];
    $('[class*="color-option"], [class*="renk"], [class*="color"] option, [data-color]').each((_, el) => {
      const name = $(el).attr('title') || $(el).attr('data-color') || $(el).text().trim();
      if (name && name.length > 0 && name.length < 30) colors.push(name);
    });
    $('[class*="size-option"], [class*="beden"], [class*="size"] option').each((_, el) => {
      const name = $(el).attr('title') || $(el).text().trim();
      if (name && name.length > 0 && name.length < 20) sizes.push(name);
    });

    const allVariants = colors.length > 0
      ? colors.map(color => ({ color, colorCode: '#999999', size: sizes[0] || '', inStock: true }))
      : [{ color: '', colorCode: '', size: '', inStock: true }];

    const variants = { colors, sizes, allVariants };

    // --- Tags ---
    const tags = [brand, category, 'PttAvm'].filter(Boolean);
    features.slice(0, 3).forEach(f => {
      if (f.value && f.value.length < 30) tags.push(f.value);
    });

    const productBase = {
      success: true,
      title,
      brand,
      price,
      images,
      description,
      features,
      category,
      variants,
      tags,
      sourceUrl: cleanUrl,
      extractionMethod: 'pttavm-puppeteer'
    };

    const csvContent = buildShopifyCSV(productBase);

    console.log(`✅ [PttAvm] Extraction complete: "${title}", ${images.length} images, ${priceRaw} TL`);

    return { ...productBase, csvContent };

  } catch (error: any) {
    console.error(`❌ [PttAvm] Scrape failed: ${error.message}`);
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
      sourceUrl: url,
      extractionMethod: 'pttavm-puppeteer',
      message: error.message
    };
  } finally {
    if (page) { try { await page.close(); } catch {} }
    if (browser) { try { await browser.close(); } catch {} }
  }
}
