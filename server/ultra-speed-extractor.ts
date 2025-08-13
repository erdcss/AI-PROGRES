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

// Ultra-fast single product extraction
export async function ultraSpeedExtract(url: string): Promise<any> {
  // Check cache first
  const cacheKey = url.toLowerCase();
  const cached = extractionCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fastAxios.get(url);
    const $ = cheerio.load(response.data);
    const html = response.data;

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
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Parallel batch extraction for multiple URLs
export async function ultraSpeedBatchExtract(urls: string[]): Promise<any[]> {
  // Process all URLs in parallel with max concurrency of 10
  const batchSize = 10;
  const results = [];
  
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(url => ultraSpeedExtract(url))
    );
    results.push(...batchResults);
  }
  
  return results;
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
  const sizes = new Set<string>();
  
  // Fast pattern matching for sizes
  const sizePatterns = [
    /"size":\s*"([^"]+)"/gi,
    /beden[":]\s*["']([^"']+)/gi,
    /\b(XS|S|M|L|XL|XXL|XXXL|\d{2})\b/g
  ];
  
  sizePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null && sizes.size < 10) {
      const size = match[1].toUpperCase();
      if (size.length <= 5) { // Avoid false positives
        sizes.add(size);
      }
    }
  });
  
  return Array.from(sizes).slice(0, 10); // Max 10 sizes
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