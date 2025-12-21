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
    
    // Enhanced title extraction with multiple fallbacks
    const titlePatterns = [
      /<h1[^>]*class="[^"]*pr-new-br[^"]*"[^>]*>([^<]+)/i,
      /<h1[^>]*>([^<]+)<\/h1>/i,
      /"name"\s*:\s*"([^"]+)"/i,
      /<title>([^<-]+)/i
    ];
    
    let title = 'Product';
    for (const pattern of titlePatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const extracted = match[1].trim().replace(/\s+/g, ' ').replace(/&quot;/g, '"');
        if (!extracted.includes('Trendyol') && !extracted.includes('sayfa') && extracted.length > 10) {
          title = extracted;
          break;
        }
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
        images = Array.from(new Set(matches)).filter((img): img is string => typeof img === 'string').slice(0, 7); // Get 7 unique images
        break;
      }
    }
    
    // Enhanced variant extraction - only return real variants
    let colors: string[] = [];
    let sizes: string[] = [];
    let stockMap: Record<string, boolean> = {};
    
    // ❌ DISABLED - Regex-based size extraction was too aggressive
    // It extracted fake sizes from product descriptions
    // Only structured variant data (allVariants JSON) should be used
    // colors and sizes remain empty arrays - no fake variants
    console.log('📦 HYPER-FAST: Size extraction disabled - returning empty variants');
    
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