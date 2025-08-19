/**
 * Emergency Scraper - Last Resort Product Extraction
 * Basit ama etkili acil durum veri çekme sistemi
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface EmergencyResult {
  success: boolean;
  title?: string;
  brand?: string;
  price?: number;
  images?: string[];
  variants?: Array<{ color: string; size: string; inStock: boolean; }>;
  method?: string;
}

// Minimal but effective headers that work
const STEALTH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0'
};

async function delay(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

export async function emergencyExtraction(url: string): Promise<EmergencyResult> {
  console.log('🆘 EMERGENCY SCRAPER: Starting last resort extraction');
  
  // Method 1: Archive.org Wayback Machine
  try {
    console.log('📚 Trying Wayback Machine...');
    const archiveResult = await tryWaybackMachine(url);
    if (archiveResult.success) {
      console.log('✅ EMERGENCY SUCCESS: Wayback Machine');
      return { ...archiveResult, method: 'wayback-machine' };
    }
  } catch (error) {
    console.log('❌ Wayback Machine failed:', error.message);
  }

  await delay(500);

  // Method 2: Direct Product ID API with different approaches
  try {
    console.log('🔍 Trying Product ID APIs...');
    const apiResult = await tryProductAPIs(url);
    if (apiResult.success) {
      console.log('✅ EMERGENCY SUCCESS: Product API');
      return { ...apiResult, method: 'product-api' };
    }
  } catch (error) {
    console.log('❌ Product APIs failed:', error.message);
  }

  await delay(500);

  // Method 3: Web.archive.org snapshot
  try {
    console.log('📸 Trying archive snapshot...');
    const snapshotResult = await tryArchiveSnapshot(url);
    if (snapshotResult.success) {
      console.log('✅ EMERGENCY SUCCESS: Archive snapshot');
      return { ...snapshotResult, method: 'archive-snapshot' };
    }
  } catch (error) {
    console.log('❌ Archive snapshot failed:', error.message);
  }

  await delay(500);

  // Method 4: Minimal direct request with long delay
  try {
    console.log('⏳ Trying slow direct request...');
    const directResult = await trySlowDirectRequest(url);
    if (directResult.success) {
      console.log('✅ EMERGENCY SUCCESS: Slow direct');
      return { ...directResult, method: 'slow-direct' };
    }
  } catch (error) {
    console.log('❌ Slow direct failed:', error.message);
  }

  console.log('❌ EMERGENCY SCRAPER: All methods exhausted');
  return { success: false };
}

async function tryWaybackMachine(url: string): Promise<EmergencyResult> {
  // Get latest snapshot from Wayback Machine
  const archiveUrl = `https://web.archive.org/web/20240101000000*/${url}`;
  
  try {
    const response = await axios.get(archiveUrl, {
      timeout: 15000,
      headers: STEALTH_HEADERS,
      maxRedirects: 5
    });

    return parseProductFromHTML(response.data, 'wayback');
  } catch (error) {
    // Try alternative archive format
    const altArchiveUrl = `https://archive.today/newest/${url}`;
    const response = await axios.get(altArchiveUrl, {
      timeout: 15000,
      headers: STEALTH_HEADERS
    });

    return parseProductFromHTML(response.data, 'archive-today');
  }
}

async function tryProductAPIs(url: string): Promise<EmergencyResult> {
  const productId = extractProductId(url);
  if (!productId) throw new Error('Product ID not found');

  const endpoints = [
    `https://public-mdc.trendyol.com/discovery-web-gw-service/api/productDetail/${productId}`,
    `https://public.trendyol.com/discovery-web-gw-service/api/productDetail/${productId}`,
    `https://www.trendyol.com/sr?wc=${productId}&qt=${productId}&st=${productId}&os=1`,
    `https://api-gateway.trendyol.com/websearchgw/api/v2/search?q=${productId}`
  ];

  for (const endpoint of endpoints) {
    try {
      await delay(300); // Small delay between requests
      
      const response = await axios.get(endpoint, {
        timeout: 8000,
        headers: {
          ...STEALTH_HEADERS,
          'Accept': 'application/json,text/plain,*/*',
          'Referer': 'https://www.trendyol.com/'
        }
      });

      if (response.data) {
        const result = parseAPIResponse(response.data);
        if (result.success) {
          return result;
        }
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error('All API endpoints failed');
}

async function tryArchiveSnapshot(url: string): Promise<EmergencyResult> {
  // Try archive.org API to get snapshots
  const snapshotUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&limit=1&output=json&fl=timestamp,original,urlkey,digest`;
  
  const snapshotResponse = await axios.get(snapshotUrl, {
    timeout: 10000,
    headers: STEALTH_HEADERS
  });

  if (snapshotResponse.data && snapshotResponse.data.length > 1) {
    const snapshot = snapshotResponse.data[1];
    const archivePageUrl = `https://web.archive.org/web/${snapshot[0]}/${snapshot[1]}`;
    
    const pageResponse = await axios.get(archivePageUrl, {
      timeout: 15000,
      headers: STEALTH_HEADERS
    });

    return parseProductFromHTML(pageResponse.data, 'archive-api');
  }

  throw new Error('No archive snapshots found');
}

async function trySlowDirectRequest(url: string): Promise<EmergencyResult> {
  // Very slow, human-like request
  await delay(2000); // 2 second initial delay
  
  const response = await axios.get(url, {
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Cache-Control': 'max-age=0',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    }
  });

  return parseProductFromHTML(response.data, 'slow-direct');
}

function extractProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : null;
}

function parseProductFromHTML(html: string, source: string): EmergencyResult {
  const $ = cheerio.load(html);
  
  // Extract title with multiple fallbacks
  let title = '';
  const titleSelectors = [
    'h1',
    '.pr-new-br',
    '[data-testid="product-name"]',
    '.product-name',
    'meta[property="og:title"]',
    'title'
  ];

  for (const selector of titleSelectors) {
    if (selector.includes('meta')) {
      title = $(selector).attr('content') || '';
    } else if (selector === 'title') {
      title = $(selector).text().replace(' - Trendyol', '');
    } else {
      title = $(selector).first().text().trim();
    }
    
    if (title && title.length > 5 && !title.includes('trendyol.com')) {
      break;
    }
  }

  if (!title || title.length < 5) {
    return { success: false };
  }

  // Extract brand
  let brand = '';
  const brandSelectors = ['.product-brand', '[data-testid="product-brand"]', '.brand'];
  for (const selector of brandSelectors) {
    brand = $(selector).text().trim();
    if (brand) break;
  }
  
  if (!brand) {
    brand = extractBrandFromTitle(title);
  }

  // Extract price
  let price = 0;
  const priceSelectors = [
    '.prc-dsc',
    '.prc-org', 
    '.price-current',
    '.price',
    '[data-testid="price"]'
  ];

  for (const selector of priceSelectors) {
    const priceText = $(selector).text().trim();
    if (priceText) {
      price = extractPrice(priceText);
      if (price > 0) break;
    }
  }

  // Extract images
  const images: string[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    if (src && src.includes('cdn.dsmcdn.com') && src.includes('zoom')) {
      if (!images.includes(src)) {
        images.push(src);
      }
    }
  });

  const variants = [{
    color: 'Standart',
    size: 'Standart',
    inStock: true
  }];

  console.log(`🔍 EMERGENCY PARSED: "${title}", ${price} TL, ${images.length} images (${source})`);

  return {
    success: !!(title && title.length > 5),
    title,
    brand,
    price,
    images: images.slice(0, 8),
    variants
  };
}

function parseAPIResponse(data: any): EmergencyResult {
  try {
    let product = data;
    
    // Navigate through common API structures
    if (data.result) product = data.result;
    if (data.products && data.products[0]) product = data.products[0];
    if (data.data) product = data.data;

    const title = product.name || product.title || product.productName || '';
    const brand = product.brand?.name || product.brandName || extractBrandFromTitle(title);
    const price = product.price?.discountedPrice || product.price?.originalPrice || product.discountedPrice || product.price || 0;
    
    const images: string[] = [];
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach((img: any) => {
        const url = img.url || img.src || img;
        if (typeof url === 'string' && url.includes('cdn.dsmcdn.com')) {
          images.push(url);
        }
      });
    }

    if (title && title.length > 3) {
      return {
        success: true,
        title,
        brand,
        price,
        images,
        variants: [{ color: 'Standart', size: 'Standart', inStock: true }]
      };
    }
  } catch (error) {
    // Ignore parsing errors
  }
  
  return { success: false };
}

function extractPrice(priceText: string): number {
  if (!priceText) return 0;
  
  const cleaned = priceText.replace(/[^\d.,]/g, '');
  
  if (cleaned.includes('.') && cleaned.includes(',')) {
    const turkishFormat = cleaned.replace(/\./g, '').replace(',', '.');
    return parseFloat(turkishFormat);
  }
  
  const price = parseFloat(cleaned.replace(',', '.'));
  return (price > 0 && price < 500000) ? price : 0;
}

function extractBrandFromTitle(title: string): string {
  if (!title) return 'Genel';
  const words = title.split(' ');
  const firstWord = words[0];
  return (firstWord && firstWord.length > 2 && firstWord.length < 25) ? firstWord : 'Genel';
}