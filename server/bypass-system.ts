/**
 * Advanced Bypass System - Trendyol Anti-Block
 * Ultra-stealth extraction with multiple bypass strategies
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface BypassResult {
  success: boolean;
  title?: string;
  brand?: string;
  price?: number;
  images?: string[];
  variants?: Array<{ color: string; size: string; inStock: boolean; }>;
  method?: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function randomDelay(min: number = 200, max: number = 800): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

export async function bypassExtraction(url: string): Promise<BypassResult> {
  console.log('🕵️ BYPASS SYSTEM: Starting advanced extraction');
  
  // Strategy 1: Google Cache bypass
  try {
    const cacheResult = await tryGoogleCache(url);
    if (cacheResult.success) {
      console.log('✅ BYPASS SUCCESS: Google Cache method');
      return { ...cacheResult, method: 'google-cache' };
    }
  } catch (error) {
    console.log('❌ Google Cache failed:', error.message);
  }

  await randomDelay();

  // Strategy 2: Alternative domain bypass
  try {
    const altResult = await tryAlternativeDomain(url);
    if (altResult.success) {
      console.log('✅ BYPASS SUCCESS: Alternative domain method');
      return { ...altResult, method: 'alternative-domain' };
    }
  } catch (error) {
    console.log('❌ Alternative domain failed:', error.message);
  }

  await randomDelay();

  // Strategy 3: Mobile app API simulation
  try {
    const mobileResult = await tryMobileAPIBypass(url);
    if (mobileResult.success) {
      console.log('✅ BYPASS SUCCESS: Mobile API bypass');
      return { ...mobileResult, method: 'mobile-api-bypass' };
    }
  } catch (error) {
    console.log('❌ Mobile API bypass failed:', error.message);
  }

  await randomDelay();

  // Strategy 4: Social media embedding bypass
  try {
    const socialResult = await trySocialEmbedBypass(url);
    if (socialResult.success) {
      console.log('✅ BYPASS SUCCESS: Social embed method');
      return { ...socialResult, method: 'social-embed' };
    }
  } catch (error) {
    console.log('❌ Social embed failed:', error.message);
  }

  console.log('❌ BYPASS SYSTEM: All strategies failed');
  return { success: false };
}

async function tryGoogleCache(url: string): Promise<BypassResult> {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
  
  const response = await axios.get(cacheUrl, {
    timeout: 10000,
    headers: {
      'User-Agent': getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });

  return parseProductData(response.data, url);
}

async function tryAlternativeDomain(url: string): Promise<BypassResult> {
  // Try m.trendyol.com (mobile version)
  const mobileUrl = url.replace('www.trendyol.com', 'm.trendyol.com');
  
  const response = await axios.get(mobileUrl, {
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache'
    }
  });

  return parseProductData(response.data, url);
}

async function tryMobileAPIBypass(url: string): Promise<BypassResult> {
  const productId = extractProductId(url);
  if (!productId) throw new Error('Product ID not found');

  // Alternative mobile API endpoints
  const endpoints = [
    `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
    `https://mobile-api.trendyol.com/api/v1/product/${productId}`,
    `https://mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(endpoint, {
        timeout: 5000,
        headers: {
          'User-Agent': 'TrendyolMobile/4.2.1 (iPhone; iOS 17.0; tr_TR)',
          'Accept': 'application/json',
          'Accept-Language': 'tr-TR',
          'X-Device-Type': 'mobile',
          'X-App-Version': '4.2.1'
        }
      });

      if (response.data && response.data.result) {
        return parseMobileAPIData(response.data.result);
      }
    } catch (error) {
      continue;
    }
  }

  throw new Error('All mobile API endpoints failed');
}

async function trySocialEmbedBypass(url: string): Promise<BypassResult> {
  // Try getting data through social media embed APIs
  const embedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
  
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      }
    });

    return parseProductData(response.data, url);
  } catch (error) {
    throw new Error('Social embed bypass failed');
  }
}

function extractProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : null;
}

function parseProductData(html: string, originalUrl: string): BypassResult {
  const $ = cheerio.load(html);
  
  // Extract title
  const title = $('h1').first().text().trim() || 
               $('[data-testid="product-name"]').text().trim() ||
               $('.product-name').text().trim() ||
               $('meta[property="og:title"]').attr('content')?.replace(' - Trendyol', '') ||
               $('title').text().replace(' - Trendyol', '').trim();

  if (!title || title === 'trendyol.com' || title.length < 5) {
    return { success: false };
  }

  // Extract brand
  const brand = $('.product-brand').text().trim() || 
               $('[data-testid="product-brand"]').text().trim() ||
               extractBrandFromTitle(title);

  // Extract price
  let price = 0;
  const priceSelectors = [
    '.prc-dsc', '.prc-org', '.price-current', '.price',
    '[data-testid="price"]', '.product-price .current-price'
  ];

  for (const selector of priceSelectors) {
    const priceText = $(selector).text().trim();
    if (priceText) {
      const extractedPrice = extractPrice(priceText);
      if (extractedPrice > 0) {
        price = extractedPrice;
        break;
      }
    }
  }

  // If no price found in selectors, search in meta tags
  if (price === 0) {
    const metaPrice = $('meta[property="product:price:amount"]').attr('content') ||
                     $('meta[property="og:price:amount"]').attr('content');
    if (metaPrice) {
      price = parseFloat(metaPrice);
    }
  }

  // Extract images
  const images: string[] = [];
  $('img').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
    if (src && src.includes('cdn.dsmcdn.com')) {
      // Convert to high resolution if needed
      const highResSrc = src.replace('_medium', '_zoom').replace('_small', '_zoom');
      if (!images.includes(highResSrc)) {
        images.push(highResSrc);
      }
    }
  });

  // Also check meta tags for images
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage && !images.includes(ogImage)) {
    images.unshift(ogImage);
  }

  // Create basic variant
  const variants = [{
    color: 'Standart',
    size: 'Standart',
    inStock: true
  }];

  console.log(`🔍 PARSED DATA: "${title}", ${price} TL, ${images.length} images`);

  return {
    success: !!(title && title !== 'trendyol.com'),
    title,
    brand,
    price,
    images: images.slice(0, 10), // Limit to 10 images
    variants
  };
}

function parseMobileAPIData(data: any): BypassResult {
  const title = data.name || data.title || '';
  const brand = data.brand?.name || data.brandName || extractBrandFromTitle(title);
  const price = data.price?.discountedPrice || data.price?.originalPrice || data.discountedPrice || 0;
  
  const images: string[] = [];
  if (data.images && Array.isArray(data.images)) {
    data.images.forEach((img: any) => {
      if (img.url || img.src) {
        images.push(img.url || img.src);
      }
    });
  }

  const variants = [{
    color: 'Standart',
    size: 'Standart', 
    inStock: data.hasStock !== false
  }];

  return {
    success: !!(title && title.length > 3),
    title,
    brand,
    price,
    images,
    variants
  };
}

function extractPrice(priceText: string): number {
  if (!priceText) return 0;
  
  const cleaned = priceText.replace(/[^\d.,]/g, '');
  
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Turkish format: 1.234,56
    const turkishFormat = cleaned.replace(/\./g, '').replace(',', '.');
    return parseFloat(turkishFormat);
  } else if (cleaned.includes(',')) {
    // Could be decimal or thousands separator
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal separator
      return parseFloat(cleaned.replace(',', '.'));
    } else {
      // Thousands separator
      return parseFloat(cleaned.replace(/,/g, ''));
    }
  }
  
  const price = parseFloat(cleaned);
  return (price > 0 && price < 1000000) ? price : 0;
}

function extractBrandFromTitle(title: string): string {
  if (!title) return 'Genel';
  
  const words = title.split(' ');
  const firstWord = words[0];
  
  if (firstWord && firstWord.length > 2 && firstWord.length < 25) {
    return firstWord;
  }
  
  return 'Genel';
}