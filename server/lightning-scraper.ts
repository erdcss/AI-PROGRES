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
    
    // Lightning title extraction
    const title = html.match(/<h1[^>]*>([^<]+)/)?.[1]?.trim() || 'Product';
    
    // Lightning price extraction - same as ultra-fast but faster
    const priceMatches = html.match(/\b\d{2,4}\.\d{1,2}\b/g) || [];
    const price = priceMatches.length > 0 ? 
      Math.max(...priceMatches.map((p: string) => parseFloat(p)).filter((p: number) => p > 10 && p < 10000)) : 0;
    
    // Lightning image extraction - top 3 for speed
    const images = (html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*_org_zoom\.jpg/g) || []).slice(0, 3);
    
    // Minimal variants - default values for speed
    const colors = ['Tek Renk'];
    const sizes = ['Tek Beden'];
    const stockMap = { 'Tek Renk-Tek Beden': true };
    
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