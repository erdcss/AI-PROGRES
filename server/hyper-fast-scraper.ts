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
    
    // STEP 3: Hyper-minimal fetch with optimal timeout
    const response = await axios.get(url, {
      timeout: 250, // 250ms balanced timeout
      headers: { 'User-Agent': 'Mozilla' }, // Minimal but valid header
      maxRedirects: 0,
      validateStatus: () => true,
      decompress: false,
      responseType: 'text',
      transformResponse: (data) => data // Skip any transformations
    });
    
    // STEP 4: Hyper-fast regex extraction (single pass)
    const html = response.data;
    if (!html) return null;
    
    // Pre-compiled regex patterns for speed
    const titleMatch = html.match(/<h1[^>]*>([^<]+)/);
    const priceMatches = html.match(/\b\d{2,4}\.\d{1,2}\b/g);
    const imageMatches = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*_org_zoom\.jpg/g);
    
    const title = titleMatch?.[1]?.trim() || 'Product';
    const price = priceMatches ? Math.max(...priceMatches.map(p => parseFloat(p)).filter(p => p > 10 && p < 10000)) : 0;
    const images = imageMatches?.slice(0, 2) || []; // Only 2 images for speed
    
    // Minimal data structure
    const result: HyperFastProductData = {
      title,
      brand,
      price,
      images,
      variants: {
        colors: ['Tek Renk'],
        sizes: ['Tek Beden'],
        stockMap: { 'Tek Renk-Tek Beden': true }
      },
      description: `${title} - ${brand}`,
      attributes: {}
    };
    
    const endTime = Date.now();
    debug(`Hyper-fast extraction completed in ${endTime - startTime}ms`);
    
    return result;
    
  } catch (error) {
    debug(`Hyper-fast extraction failed: ${error.message}`);
    return null;
  }
}