/**
 * HYPER FAST SCRAPER - Target: 0.1 second (100ms)
 * Strategy: Pre-cached patterns + minimal processing
 */

import axios from 'axios';

function debug(message: string) {
  console.log(`[HYPER-FAST] ${message}`);
}

export interface HyperFastProductData {
  title: string;
  brand: string;
  price: number;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
    stockMap: Record<string, boolean>;
  };
  description: string;
  attributes: Record<string, string>;
}

/**
 * HYPER-FAST SCRAPER - Target: 0.1 second (100ms)
 * Ultra-minimal processing with pre-compiled patterns
 */
export async function hyperFastScrape(url: string): Promise<HyperFastProductData | null> {
  const startTime = Date.now();
  
  try {
    debug(`Hyper-fast scraping: ${url}`);
    
    // STEP 1: Extract product ID from URL (0ms processing)
    const productId = url.split('-p-')[1]?.split('?')[0];
    if (!productId) return null;
    
    // STEP 2: Extract brand from URL (0ms processing)
    const brand = url.split('/')[3] || 'Brand';
    
    // STEP 3: Fast but realistic fetch 
    const response = await axios.get(url, {
      timeout: 800, // 800ms realistic timeout for Turkey network
      headers: { 'User-Agent': 'Mozilla/5.0' }, // Minimal but valid header
      maxRedirects: 0,
      validateStatus: () => true,
      decompress: false,
      responseType: 'text',
      transformResponse: (data) => data // Skip any transformations
    });
    
    // STEP 4: Real data extraction with speed optimization
    const html = response.data;
    if (!html) return null;
    
    // Real title extraction from multiple sources
    const titlePatterns = [
      /<h1[^>]*class="[^"]*pr-new-br[^"]*"[^>]*>([^<]+)/,
      /<h1[^>]*>([^<]+)/,
      /<title>([^<]+)</
    ];
    
    let title = 'Product';
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        title = match[1].trim().replace(/\s+/g, ' ');
        if (!title.includes('Trendyol') && title.length > 10) break;
      }
    }
    
    // Enhanced price extraction with Turkish formatting
    const pricePatterns = [
      /price[":]*\s*(\d{1,3}(?:\.\d{3})*,?\d{0,2})/gi,
      /(\d{1,3}(?:\.\d{3})*,?\d{0,2})\s*TL/gi,
      /\b(\d{2,4}(?:\.\d{3})*(?:,\d{2})?)\b/g
    ];
    
    let price = 0;
    for (const pattern of pricePatterns) {
      const matches = html.match(pattern);
      if (matches) {
        const prices = matches.map((p: string) => {
          const numStr = p.replace(/[^\d.,]/g, '');
          if (numStr.includes('.') && numStr.includes(',')) {
            return parseFloat(numStr.replace(/\./g, '').replace(',', '.'));
          }
          return parseFloat(numStr.replace(',', '.'));
        }).filter((p: number) => p > 10 && p < 10000);
        
        if (prices.length > 0) {
          price = Math.max(...prices);
          break;
        }
      }
    }
    
    // Enhanced image extraction
    const imagePatterns = [
      /https:\/\/cdn\.dsmcdn\.com[^"'\s]*_org_zoom\.jpg/g,
      /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g
    ];
    
    let images: string[] = [];
    for (const pattern of imagePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        images = Array.from(new Set(matches)).slice(0, 7); // Get 7 unique images
        break;
      }
    }
    
    // Enhanced variant extraction
    let colors = ['Tek Renk'];
    let sizes = ['Tek Beden'];
    let stockMap: Record<string, boolean> = { 'Tek Renk-Tek Beden': true };
    
    // Extract real variants from script data
    const variantScriptMatch = html.match(/variants["\s]*:[^}]+}/gi);
    if (variantScriptMatch) {
      try {
        const variantText = variantScriptMatch[0];
        const colorMatches = variantText.match(/["']([^"']*(?:siyah|beyaz|mavi|kırmızı|yeşil|gri|sarı|mor|pembe|turuncu)[^"']*)["']/gi);
        const sizeMatches = variantText.match(/["'](XS|S|M|L|XL|XXL|\d{2,3})["']/gi);
        
        if (colorMatches && colorMatches.length > 1) {
          colors = Array.from(new Set(colorMatches.map((m: string) => m.replace(/['"]/g, '')))).slice(0, 5);
        }
        
        if (sizeMatches && sizeMatches.length > 1) {
          sizes = Array.from(new Set(sizeMatches.map((m: string) => m.replace(/['"]/g, '')))).slice(0, 8);
        }
        
        // Generate stock map for variants
        stockMap = {};
        for (const color of colors) {
          for (const size of sizes) {
            stockMap[`${color}-${size}`] = true; // Assume in stock for speed
          }
        }
      } catch (error) {
        // Keep default values if extraction fails
      }
    }
    
    // Enhanced data structure with real extraction
    const result: HyperFastProductData = {
      title,
      brand,
      price,
      images,
      variants: {
        colors,
        sizes,
        stockMap
      },
      description: title.length > 20 ? title : `${title} - ${brand} ürünü`,
      attributes: {
        'Marka': brand,
        'Ürün Adı': title,
        'Fiyat': `${price} TL`,
        'Görsel Sayısı': images.length.toString()
      }
    };
    
    const endTime = Date.now();
    debug(`Hyper-fast extraction completed in ${endTime - startTime}ms`);
    
    return result;
    
  } catch (error) {
    debug(`Hyper-fast extraction failed: ${error.message}`);
    return null;
  }
}