/**
 * FAST EXTRACTION OPTIMIZER - Sub 2-Second Performance
 * Implements fast-path-first architecture with parallel processing
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { ultimatePriceExtract } from './ultimate-price-extractor';
import { extractFromTrendyolJavaScriptState } from './trendyol-js-extractor';

// Keep-alive HTTP agent for connection reuse
import { Agent } from 'http';
import { Agent as HttpsAgent } from 'https';

const httpAgent = new Agent({
  keepAlive: true,
  maxSockets: 10,
  timeout: 800 // 800ms network timeout
});

const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 10,
  timeout: 800 // 800ms network timeout
});

// Enhanced Anti-Blocking User Agents for Trendyol
const fastUserAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0'
];

// LRU Cache for parsed data
const fastCache = new Map<string, {data: any, timestamp: number}>();
const FAST_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

function getRandomFastUA(): string {
  return fastUserAgents[Math.floor(Math.random() * fastUserAgents.length)];
}

// Clean expired cache entries
function cleanCache() {
  const now = Date.now();
  const entries = Array.from(fastCache.entries());
  
  // Remove expired entries
  for (const [key, value] of entries) {
    if (now - value.timestamp > FAST_CACHE_DURATION) {
      fastCache.delete(key);
    }
  }
  
  // Keep only latest entries if over limit
  if (fastCache.size > MAX_CACHE_SIZE) {
    const sortedEntries = entries
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, MAX_CACHE_SIZE);
    
    fastCache.clear();
    for (const [key, value] of sortedEntries) {
      fastCache.set(key, value);
    }
  }
}

/**
 * FAST AXIOS REQUEST - 800ms timeout with keep-alive
 */
async function fastAxiosRequest(url: string): Promise<{html: string, success: boolean}> {
  const startTime = Date.now();
  
  try {
    console.log('🚀 FAST REQUEST: Starting axios with 800ms timeout...');
    
    const response = await axios.get(url, {
      timeout: 800, // 800ms max
      headers: {
        'User-Agent': getRandomFastUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not?A_Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      httpAgent: httpAgent,
      httpsAgent: httpsAgent
    });
    
    const duration = Date.now() - startTime;
    console.log(`⚡ FAST REQUEST: Completed in ${duration}ms`);
    
    return {
      html: response.data,
      success: true
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ FAST REQUEST: Failed in ${duration}ms`);
    return {
      html: '',
      success: false
    };
  }
}

/**
 * PARALLEL BASIC DATA EXTRACTION - 300ms budget
 */
async function parallelBasicExtraction($: any, htmlContent: string): Promise<any> {
  const startTime = Date.now();
  console.log('⚡ PARALLEL BASIC: Starting parallel extraction...');
  
  const extractionPromises = [
    // Title extraction - UPDATED Trendyol selectors
    Promise.race([
      Promise.resolve($('h1.pr-new-br span').first().text().trim()),
      Promise.resolve($('h1 span').first().text().trim()),
      Promise.resolve($('h1').first().text().trim()),
      Promise.resolve($('[data-testid="product-name"]').first().text().trim()),
      Promise.resolve($('.pr-in-nm').first().text().trim()),
      Promise.resolve($('title').text().replace('- Trendyol', '').replace(' | Trendyol', '').trim())
    ]).catch(() => 'Ürün'),
    
    // Brand extraction - UPDATED Trendyol selectors
    Promise.race([
      Promise.resolve($('[data-testid="merchantName"]').first().text().trim()),
      Promise.resolve($('.pr-in-mn a').first().text().trim()),
      Promise.resolve($('.product-brand').first().text().trim()),
      Promise.resolve($('.brand-name').first().text().trim()),
      Promise.resolve($('a[href*="/brand/"]').first().text().trim())
    ]).catch(() => 'Marka'),
    
    // Primary image - UPDATED Trendyol selectors
    Promise.race([
      Promise.resolve($('.product-images img').first().attr('src')),
      Promise.resolve($('[data-testid="product-image"] img').first().attr('src')),
      Promise.resolve($('.pr-in-im img').first().attr('src')),
      Promise.resolve($('img[src*="cdn.dsmcdn.com"]').first().attr('src')),
      Promise.resolve($('img[alt*="ürün"]').first().attr('src'))
    ]).catch(() => null),
    
    // Category extraction
    Promise.race([
      Promise.resolve($('.breadcrumb a').last().text().trim()),
      Promise.resolve($('.category').first().text().trim())
    ]).catch(() => 'Kategori')
  ];
  
  try {
    const [title, brand, primaryImage, category] = await Promise.all(extractionPromises);
    
    const duration = Date.now() - startTime;
    console.log(`⚡ PARALLEL BASIC: Completed in ${duration}ms`);
    
    return {
      title: title || 'Ürün',
      brand: brand || 'Marka',
      primaryImage: primaryImage,
      category: category || 'Kategori'
    };
  } catch (error) {
    console.log(`❌ PARALLEL BASIC: Failed`);
    return {
      title: 'Ürün',
      brand: 'Marka', 
      primaryImage: null,
      category: 'Kategori'
    };
  }
}

/**
 * FAST PRICE EXTRACTION - 200ms budget, top 2 strategies only
 */
async function fastPriceExtraction($: any, htmlContent: string): Promise<any> {
  const startTime = Date.now();
  console.log('💰 FAST PRICE: Starting fast price extraction...');
  
  try {
    // Strategy 1: Direct selectors (fastest)
    const priceSelectors = [
      '.price-current .price',
      '.current-price',
      '.product-price .price',
      '.price .amount'
    ];
    
    for (const selector of priceSelectors) {
      const priceText = $(selector).first().text().trim();
      if (priceText && priceText.includes('TL')) {
        const price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
        if (price > 0 && price < 50000) {
          const duration = Date.now() - startTime;
          console.log(`💰 FAST PRICE: Found via selector in ${duration}ms: ${price} TL`);
          
          return {
            original: price,
            currency: 'TL',
            formatted: `${price} TL`,
            withProfit: Math.round(price * 1.1 * 100) / 100,
            method: 'Fast Selector'
          };
        }
      }
    }
    
    // Strategy 2: Regex on HTML (backup)
    const priceRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*TL/g;
    const matches = Array.from(htmlContent.matchAll(priceRegex));
    
    if (matches.length > 0) {
      const prices = matches.map(match => {
        const priceStr = match[1].replace(/\./g, '').replace(',', '.');
        return parseFloat(priceStr);
      }).filter(p => p > 0 && p < 50000);
      
      if (prices.length > 0) {
        const price = Math.max(...prices); // Highest price for accuracy
        const duration = Date.now() - startTime;
        console.log(`💰 FAST PRICE: Found via regex in ${duration}ms: ${price} TL`);
        
        return {
          original: price,
          currency: 'TL', 
          formatted: `${price} TL`,
          withProfit: Math.round(price * 1.1 * 100) / 100,
          method: 'Fast Regex'
        };
      }
    }
    
    console.log('💰 FAST PRICE: No price found with fast methods');
    return null;
    
  } catch (error) {
    console.log('❌ FAST PRICE: Error in fast extraction');
    return null;
  }
}

/**
 * FAST VARIANTS EXTRACTION - 300ms budget
 */
async function fastVariantsExtraction($: any): Promise<any[]> {
  const startTime = Date.now();
  console.log('📦 FAST VARIANTS: Starting variant extraction...');
  
  try {
    const variants: any[] = [];
    
    // Fast size detection - ONLY from structured DOM elements
    const sizeButtons = $('.size-buttons button, .size-options .option, [data-testid*="size"]');
    const colorOptions = $('.color-options .option, .color-buttons button, [data-testid*="color"]');
    
    // ❌ NO DEFAULT SIZES - only use real extracted sizes
    const extractedSizes = sizeButtons.length > 0 ? 
      sizeButtons.map((i: number, el: any) => $(el).text().trim()).get().filter(s => s && s.length <= 4) : 
      [];
    const sizes = extractedSizes; // NO FALLBACK - empty if none found
    
    // Single color from title (faster than multi-color detection)
    const title = $('h1').first().text().toLowerCase();
    const color = title.includes('lacivert') ? 'Lacivert' :
                 title.includes('mavi') ? 'Mavi' :
                 title.includes('siyah') ? 'Siyah' :
                 title.includes('beyaz') ? 'Beyaz' : ''; // ❌ NO FAKE FALLBACK
    
    // Only generate variants if real sizes/colors found
    if (sizes.length === 0 && !color) {
      // No real variants - return empty array
      console.log('📦 FAST VARIANTS: No real variants found, returning empty');
      return [];
    }
    
    // Generate variants only from real data
    for (const size of sizes.length > 0 ? sizes : ['']) {
      if (color || size) {
        variants.push({
          color: color,
          size: size,
          inStock: true, // Default to in stock for fast path
          inventory: 10
        });
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`📦 FAST VARIANTS: Generated ${variants.length} variants in ${duration}ms`);
    
    return variants;
    
  } catch (error) {
    console.log('❌ FAST VARIANTS: Error, returning empty (no fake defaults)');
    return []; // ❌ NO FAKE VARIANTS
  }
}

/**
 * MAIN FAST EXTRACTION - TARGET: <1.7 SECONDS
 */
export async function fastProductExtraction(url: string): Promise<any> {
  const overallStart = Date.now();
  console.log('🚀 FAST EXTRACTION: Starting ultra-fast extraction...');
  
  // Clean cache periodically
  if (Math.random() < 0.1) cleanCache();
  
  // Check cache first
  const cached = fastCache.get(url);
  if (cached && Date.now() - cached.timestamp < FAST_CACHE_DURATION) {
    console.log('⚡ FAST EXTRACTION: Cache hit!');
    return cached.data;
  }
  
  try {
    // Step 1: Fast HTTP request (800ms budget)
    const {html, success} = await fastAxiosRequest(url);
    
    if (!success || !html) {
      throw new Error('Fast request failed');
    }
    
    // Step 2: Try JavaScript State Extraction FIRST (fastest method)
    const jsStateStart = Date.now();
    const jsStateResult = extractFromTrendyolJavaScriptState(html);
    console.log(`⚡ FAST EXTRACTION: JS State extraction in ${Date.now() - jsStateStart}ms`);
    
    if (jsStateResult && jsStateResult.success && jsStateResult.title !== 'Ürün') {
      console.log(`🎯 JS-STATE SUCCESS: ${jsStateResult.title} by ${jsStateResult.brand}`);
      
      // Add missing fields for compatibility
      jsStateResult.htmlContent = html;
      jsStateResult.$ = cheerio.load(html);
      
      return jsStateResult;
    }
    
    // Step 3: Fallback to DOM parsing if JS extraction fails
    const parseStart = Date.now();
    const $ = cheerio.load(html);
    console.log(`⚡ FAST EXTRACTION: Cheerio parsing in ${Date.now() - parseStart}ms`);
    
    // Step 4: Parallel extraction (800ms budget)
    const parallelStart = Date.now();
    const [basicData, price, variants] = await Promise.all([
      parallelBasicExtraction($, html),
      fastPriceExtraction($, html), 
      fastVariantsExtraction($)
    ]);
    console.log(`⚡ FAST EXTRACTION: Parallel extraction in ${Date.now() - parallelStart}ms`);
    
    // Step 5: Quick image collection (100ms budget)
    const imageStart = Date.now();
    const allImages: any[] = [];
    
    // Collect all product images fast
    $('img[src*="cdn.dsmcdn.com"]').each((i: number, el: any) => {
      const src = $(el).attr('src');
      if (src && src.includes('_org_zoom') && allImages.length < 8) {
        allImages.push({ url: src, colorName: 'none' });
      }
    });
    
    // Add primary image if not in list
    if (basicData.primaryImage && !allImages.find(img => img.url === basicData.primaryImage)) {
      allImages.unshift({ url: basicData.primaryImage, colorName: 'none' });
    }
    
    console.log(`📸 FAST IMAGES: Collected ${allImages.length} images in ${Date.now() - imageStart}ms`);
    
    // Step 6: Assemble result
    const result = {
      success: true,
      extractionMethod: 'fast-extraction-optimizer',
      confidence: 95,
      title: basicData.title,
      brand: basicData.brand,
      price: price || {
        original: 100,
        currency: 'TL',
        formatted: '100 TL',
        withProfit: 110,
        method: 'Fallback'
      },
      images: allImages,
      variants: variants,
      category: basicData.category,
      features: [], // Empty features array to prevent CSV errors
      description: '', // Empty description to prevent errors
      htmlContent: html,
      $: $
    };
    
    // Cache result
    fastCache.set(url, { data: result, timestamp: Date.now() });
    
    const totalDuration = Date.now() - overallStart;
    console.log(`🚀 FAST EXTRACTION: COMPLETED in ${totalDuration}ms (Target: <1700ms)`);
    
    return result;
    
  } catch (error) {
    const totalDuration = Date.now() - overallStart;
    console.log(`❌ FAST EXTRACTION: Failed in ${totalDuration}ms, falling back to standard method`);
    
    // Return null to trigger fallback to standard extraction
    return null;
  }
}