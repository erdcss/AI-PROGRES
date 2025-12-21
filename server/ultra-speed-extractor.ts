import axios from 'axios';
import * as cheerio from 'cheerio';
import { ultimatePriceExtract } from './ultimate-price-extractor';
import { generateAdvancedTags } from './tag-generator';

// Cache for storing recent extractions
const extractionCache = new Map<string, any>();
const CACHE_DURATION = 60000; // 1 minute cache

// Concurrent axios instance with connection pooling
const fastAxios = axios.create({
  timeout: 2000, // 2 second max timeout for ULTRA SPEED
  maxRedirects: 2,
  validateStatus: (status) => status < 500,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Encoding': 'gzip, deflate',
    'Cache-Control': 'no-cache'
  }
});

// Rate limiting to prevent blocking
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // Increased to 2 seconds between requests
let consecutiveBlocks = 0; // Track consecutive blocks
const MAX_CONSECUTIVE_BLOCKS = 3;

// Ultra-fast single product extraction with rate limiting
export async function ultraSpeedExtract(url: string): Promise<any> {
  // Check cache first
  const cacheKey = url.toLowerCase();
  const cached = extractionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  // Enhanced rate limiting with circuit breaker
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  // If we've been blocked too many times, wait longer
  if (consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    console.log('⚠️ Circuit breaker activated - waiting 10 seconds...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    consecutiveBlocks = 0; // Reset counter after long wait
  }
  
  // Regular rate limiting
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  try {
    const response = await fastAxios.get(url);
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    // Check if we're blocked
    if (html.includes('Sorry, you have been blocked') || 
        html.includes('Access Denied') ||
        html.includes('Erişim Engellendi') ||
        html.includes('429') ||
        html.includes('403') ||
        html.length < 1000) {
      consecutiveBlocks++;
      console.log(`⚠️ Blocked by Trendyol (${consecutiveBlocks}/${MAX_CONSECUTIVE_BLOCKS}), waiting before retry...`);
      
      // Exponential backoff based on consecutive blocks
      const waitTime = Math.min(3000 * Math.pow(2, consecutiveBlocks), 30000);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      throw new Error('BLOCKED_BY_TRENDYOL');
    }
    
    // Reset counter on successful request
    consecutiveBlocks = 0;

    // Parallel extraction of all data
    const [title, brand, price, images, tags] = await Promise.all([
      extractTitle($),
      extractBrand(url),
      ultimatePriceExtract($, html),
      extractImages($, html),
      generateAdvancedTags($, html)
    ]);

    // Extract variants in parallel
    const [colors, sizes] = await Promise.all([
      extractColors($, html),
      extractSizes($, html)
    ]);

    const result = {
      success: true,
      title,
      brand,
      price,
      images,
      tags,
      variants: {
        colors,
        sizes,
        allVariants: generateVariants(colors, sizes)
      },
      extractionTime: Date.now()
    };

    // Cache the result
    extractionCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // Clean old cache entries
    if (extractionCache.size > 100) {
      const oldestKey = extractionCache.keys().next().value;
      extractionCache.delete(oldestKey);
    }

    return result;
  } catch (error: any) {
    console.log(`❌ Ultra-speed extraction failed: ${error.message}`);
    
    // If blocked, return a special error response
    if (error.message === 'BLOCKED_BY_TRENDYOL') {
      return {
        success: false,
        error: 'blocked',
        title: 'Yükleniyor...',
        brand: 'Lütfen bekleyin',
        price: { original: 0, currency: 'TL', formatted: '0 TL', withProfit: 0, profitFormatted: '0 TL' },
        images: [],
        tags: [],
        variants: { colors: [], sizes: [], allVariants: [] }
      };
    }
    
    // For other errors, return generic error
    return {
      success: false,
      error: error.message || 'Extraction failed',
      title: 'Hata oluştu',
      brand: 'Bilinmiyor',
      price: { original: 0, currency: 'TL', formatted: '0 TL', withProfit: 0, profitFormatted: '0 TL' },
      images: [],
      tags: [],
      variants: { colors: [], sizes: [], allVariants: [] }
    };
  }
}

// Sequential batch extraction with maximum safety
export async function ultraSpeedBatchExtract(urls: string[]): Promise<any[]> {
  console.log(`📦 Processing ${urls.length} URLs sequentially to avoid blocking...`);
  const results = [];
  
  // Process URLs one by one with delays to avoid any blocking
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`🔄 Processing ${i + 1}/${urls.length}: ${url}`);
    
    // Add delay before each request (except the first)
    if (i > 0) {
      const delay = 3000 + Math.random() * 2000; // 3-5 seconds random delay
      console.log(`⏳ Waiting ${Math.round(delay/1000)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const result = await ultraSpeedExtractWithRetry(url, 1); // Reduced retries
      results.push(result);
    } catch (error) {
      console.log(`❌ Failed to extract ${url}, using placeholder`);
      results.push({
        success: false,
        error: 'extraction_failed',
        title: 'Yüklenemiyor',
        brand: 'Bilinmiyor',
        price: { original: 0, currency: 'TL', formatted: '0 TL', withProfit: 0, profitFormatted: '0 TL' },
        images: [],
        tags: [],
        variants: { colors: [], sizes: [], allVariants: [] }
      });
    }
  }
  
  return results;
}

// Extract with retry logic for failed requests
async function ultraSpeedExtractWithRetry(url: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff - wait longer on each retry
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      console.log(`⏳ Retry attempt ${attempt} for ${url} after ${delay}ms delay...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    const result = await ultraSpeedExtract(url);
    
    if (result.success !== false) {
      return result;
    }
    
    // If blocked, don't retry immediately
    if (result.error === 'blocked' && attempt < retries) {
      continue;
    }
    
    // For non-blocking errors on last attempt, return the error
    if (attempt === retries) {
      return result;
    }
  }
  
  // Return error result if all retries failed
  return {
    success: false,
    error: 'timeout',
    title: 'Yüklenemiyor',
    brand: 'Lütfen bekleyin',
    price: { original: 0, currency: 'TL', formatted: '0 TL', withProfit: 0, profitFormatted: '0 TL' },
    images: [],
    tags: [],
    variants: { colors: [], sizes: [], allVariants: [] }
  };
}

// Fast extraction helpers
function extractTitle($: any): string {
  return $('h1').first().text().trim() || 
         $('.product-title').first().text().trim() || 
         $('[data-testid="product-title"]').first().text().trim() || 
         'Product';
}

function extractBrand(url: string): string {
  const match = url.match(/\.com\/([^\/]+)\//);
  return match ? match[1] : 'Brand';
}

function extractImages($: any, html: string): any[] {
  const images = [];
  
  // Fast image extraction from JSON-LD
  const jsonLdMatch = html.match(/"image":\s*\[(.*?)\]/);
  if (jsonLdMatch) {
    try {
      const imageUrls = jsonLdMatch[1].match(/"([^"]+)"/g);
      if (imageUrls) {
        imageUrls.forEach(url => {
          const cleanUrl = url.replace(/"/g, '');
          if (cleanUrl.includes('http')) {
            images.push({
              url: cleanUrl.replace('/ty/', '/ty/').replace(/_org$/, '_org_zoom'),
              position: images.length + 1
            });
          }
        });
      }
    } catch {}
  }

  // Fallback to DOM if needed
  if (images.length === 0) {
    $('.product-image-list img, .gallery-modal img').each((i, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && i < 8) {
        images.push({
          url: src.replace('/ty/', '/ty/').replace(/_org$/, '_org_zoom'),
          position: i + 1
        });
      }
    });
  }

  return images.slice(0, 8); // Max 8 images
}

function extractColors($: any, html: string): string[] {
  const colors = new Set<string>();
  
  // Fast pattern matching for colors
  const colorPattern = /"SelectedVariant":\s*"([^"]+)"/g;
  let match;
  while ((match = colorPattern.exec(html)) !== null) {
    colors.add(match[1]);
  }
  
  // Fallback patterns
  if (colors.size === 0) {
    const patterns = [
      /"color":\s*"([^"]+)"/gi,
      /data-color="([^"]+)"/gi,
      /renk[":]\s*["']([^"']+)/gi
    ];
    
    patterns.forEach(pattern => {
      let m;
      while ((m = pattern.exec(html)) !== null && colors.size < 5) {
        colors.add(m[1]);
      }
    });
  }
  
  return Array.from(colors).slice(0, 5); // Max 5 colors
}

function extractSizes($: any, html: string): string[] {
  // ❌ DISABLED - Regex-based size extraction was too aggressive
  // It scanned entire HTML and extracted single letters/numbers as sizes
  // from product descriptions that don't actually have size variants
  // Only structured DOM elements (variant buttons, dropdowns) should be used
  console.log('📦 ULTRA-SPEED: Size extraction disabled - returning empty');
  return []; // Return empty - no fake sizes
}

function generateVariants(colors: string[], sizes: string[]): any[] {
  const variants = [];
  
  if (colors.length > 0 && sizes.length > 0) {
    colors.forEach(color => {
      sizes.forEach(size => {
        variants.push({
          color,
          size,
          inStock: true
        });
      });
    });
  } else if (colors.length > 0) {
    colors.forEach(color => {
      variants.push({
        color,
        size: '',
        inStock: true
      });
    });
  } else if (sizes.length > 0) {
    sizes.forEach(size => {
      variants.push({
        color: '',
        size,
        inStock: true
      });
    });
  }
  
  return variants;
}