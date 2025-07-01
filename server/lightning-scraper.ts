import axios from 'axios';

export interface LightningProductData {
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
 * LIGHTNING FAST SCRAPER - Target: 0.1 second (100ms)
 * Strategy: Direct API calls + minimal processing
 */
export async function lightningFastScrape(url: string): Promise<LightningProductData | null> {
  try {
    const startTime = Date.now();
    console.log(`[LIGHTNING] Lightning scraping: ${url}`);
    
    // STEP 1: Extract product ID from URL (0ms processing)
    const productIdMatch = url.match(/p-(\d+)/);
    if (!productIdMatch) return null;
    const productId = productIdMatch[1];
    
    // STEP 2: Extract brand from URL (0ms processing)
    const brand = url.split('/')[3] || 'Brand';
    
    // STEP 3: Ultra-lightning fetch (minimum possible settings)
    const response = await axios.get(url, {
      timeout: 1000, // 1 second max for realistic speed
      headers: { 'User-Agent': 'Mozilla' }, // Minimal header
      maxRedirects: 0,
      validateStatus: () => true,
      decompress: false, // Skip compression for speed
      responseType: 'text'
    });
    
    // STEP 4: Lightning regex extraction (no DOM parsing)
    const html = response.data;
    if (!html) return null;
    
    // Enhanced title extraction with multiple patterns
    let title = html.match(/<h1[^>]*class="[^"]*pr-new-br[^"]*"[^>]*>([^<]+)/)?.[1]?.trim() ||
                html.match(/<title>([^<]*Trendyol[^<]*)<\/title>/)?.[1]?.replace(/\s*-\s*Trendyol.*$/, '').trim() ||
                html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() || 'Product';
    
    // Enhanced price extraction with Turkish number format support
    const pricePatterns = [
      /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/g,
      /price[^>]*>([^<]*\d[^<]*)/gi,
      /\b(\d{2,6}(?:[.,]\d{2})?)\s*TL/g
    ];
    
    let price = 0;
    for (const pattern of pricePatterns) {
      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        const prices = matches.map(match => {
          const priceStr = match[1].replace(/\./g, '').replace(',', '.');
          return parseFloat(priceStr);
        }).filter(p => p > 10 && p < 100000);
        
        if (prices.length > 0) {
          price = Math.max(...prices);
          break;
        }
      }
    }
    
    // Enhanced image extraction with better patterns
    const imagePatterns = [
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product[^"'\s]*_org_zoom\.jpg/g,
      /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/pim[^"'\s]*_org_zoom\.jpg/g,
      /https:\/\/cdn\.dsmcdn\.com[^"'\s]*_org_zoom\.jpg/g
    ];
    
    let images: string[] = [];
    for (const pattern of imagePatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        const uniqueImages = matches.filter((img, index, arr) => arr.indexOf(img) === index);
        images = uniqueImages.slice(0, 5);
        break;
      }
    }
    
    // Enhanced variant extraction with real data detection
    const colorMatches = html.match(/variants.*?colors.*?\[([^\]]+)\]/);
    const sizeMatches = html.match(/variants.*?sizes.*?\[([^\]]+)\]/);
    
    let colors = ['Tek Renk'];
    let sizes = ['Tek Beden'];
    
    if (colorMatches) {
      const colorData = colorMatches[1];
      const extractedColors = [...colorData.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]);
      if (extractedColors.length > 0) {
        colors = extractedColors;
      }
    }
    
    if (sizeMatches) {
      const sizeData = sizeMatches[1];
      const extractedSizes = [...sizeData.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]);
      if (extractedSizes.length > 0) {
        sizes = extractedSizes;
      }
    }
    
    // Build stock map for variants
    const stockMap: Record<string, boolean> = {};
    for (const color of colors) {
      for (const size of sizes) {
        stockMap[`${color}-${size}`] = true; // Default to in stock
      }
    }
    
    // Skip complex attributes for speed
    const attributes: Record<string, string> = {};
    
    const description = `${title} - ${brand}`;
    
    const endTime = Date.now();
    console.log(`[LIGHTNING] Lightning extraction completed in ${endTime - startTime}ms`);
    
    return {
      title,
      brand,
      price,
      images,
      variants: { colors, sizes, stockMap },
      description,
      attributes
    };
    
  } catch (error) {
    console.log(`[LIGHTNING] Lightning error: ${error}`);
    return null;
  }
}

function debug(message: string) {
  console.log(message);
}