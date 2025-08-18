/**
 * Speed-Optimized Scraper - Ultra Fast Trendyol Data Extraction
 * Hız odaklı veri çekme sistemi - minimal gecikmeler
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

interface QuickProduct {
  title: string;
  price: number;
  brand: string;
  images: string[];
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
}

interface ExtractionResult {
  success: boolean;
  data?: QuickProduct;
  method: string;
  responseTime: number;
}

export class SpeedOptimizedScraper {
  private static instance: SpeedOptimizedScraper;
  private cache = new Map<string, QuickProduct>();
  private lastRequestTime = 0;
  private requestCount = 0;

  static getInstance(): SpeedOptimizedScraper {
    if (!SpeedOptimizedScraper.instance) {
      SpeedOptimizedScraper.instance = new SpeedOptimizedScraper();
    }
    return SpeedOptimizedScraper.instance;
  }

  // Ultra-fast extraction with minimal delays
  async extractProduct(url: string): Promise<ExtractionResult> {
    const startTime = Date.now();
    console.log(`🚀 SPEED SCRAPER: Starting ultra-fast extraction for ${this.getProductId(url)}`);

    // Check cache first
    const cached = this.getFromCache(url);
    if (cached) {
      return {
        success: true,
        data: cached,
        method: 'cache',
        responseTime: Date.now() - startTime
      };
    }

    // Try multiple methods simultaneously for speed
    const methods = [
      this.tryDirectAPI(url),
      this.tryMobileAPI(url),
      this.tryLightweightScrape(url)
    ];

    try {
      // Race all methods - use whichever completes first
      const result = await Promise.race(methods);
      
      if (result.success && result.data) {
        this.saveToCache(url, result.data);
        console.log(`✅ SPEED SCRAPER: Success via ${result.method} (${Date.now() - startTime}ms)`);
        return {
          ...result,
          responseTime: Date.now() - startTime
        };
      }

      // If race fails, try fallback
      console.log(`⚡ SPEED SCRAPER: Racing failed, trying fallback...`);
      return await this.tryFallbackMethod(url, startTime);

    } catch (error) {
      console.log(`❌ SPEED SCRAPER: All methods failed - ${error.message}`);
      return {
        success: false,
        method: 'failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  private async tryDirectAPI(url: string): Promise<ExtractionResult> {
    const productId = this.getProductId(url);
    const apiUrl = `https://public-mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`;
    
    try {
      const response = await axios.get(apiUrl, {
        timeout: 3000, // 3 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'application/json',
          'Accept-Language': 'tr-TR,tr;q=0.9'
        }
      });

      if (response.data && response.data.result) {
        const product = this.parseAPIResponse(response.data.result);
        return {
          success: true,
          data: product,
          method: 'direct-api',
          responseTime: 0
        };
      }

      return { success: false, method: 'direct-api', responseTime: 0 };
    } catch (error) {
      return { success: false, method: 'direct-api', responseTime: 0 };
    }
  }

  private async tryMobileAPI(url: string): Promise<ExtractionResult> {
    const productId = this.getProductId(url);
    const mobileApiUrl = `https://api.trendyol.com/webmobileapi/v1/product/${productId}`;
    
    try {
      const response = await axios.get(mobileApiUrl, {
        timeout: 3000,
        headers: {
          'User-Agent': 'TrendyolMobiOS/3.2.1',
          'Accept': 'application/json',
          'X-Device-Type': 'mobile'
        }
      });

      if (response.data) {
        const product = this.parseMobileResponse(response.data);
        return {
          success: true,
          data: product,
          method: 'mobile-api',
          responseTime: 0
        };
      }

      return { success: false, method: 'mobile-api', responseTime: 0 };
    } catch (error) {
      return { success: false, method: 'mobile-api', responseTime: 0 };
    }
  }

  private async tryLightweightScrape(url: string): Promise<ExtractionResult> {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          'Cache-Control': 'no-cache'
        }
      });

      const $ = cheerio.load(response.data);
      const product = this.parseHTMLResponse($, url);
      
      if (product.title) {
        return {
          success: true,
          data: product,
          method: 'lightweight-scrape',
          responseTime: 0
        };
      }

      return { success: false, method: 'lightweight-scrape', responseTime: 0 };
    } catch (error) {
      return { success: false, method: 'lightweight-scrape', responseTime: 0 };
    }
  }

  private async tryFallbackMethod(url: string, startTime: number): Promise<ExtractionResult> {
    // Last resort - simple extraction with basic patterns
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Extract basic info
      const title = $('h1').first().text().trim() || 
                   $('[data-testid="product-name"]').text().trim() ||
                   $('title').text().replace(' - Trendyol', '').trim();

      const priceText = $('.prc-dsc').text() || $('.price').text() || '';
      const price = this.extractPrice(priceText);

      const brand = $('.product-brand').text().trim() || 
                   $('[data-testid="product-brand"]').text().trim() ||
                   this.extractBrandFromTitle(title);

      const images: string[] = [];
      $('img[src*="cdn.dsmcdn.com"]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && src.includes('org_zoom')) {
          images.push(src);
        }
      });

      if (title && price > 0) {
        const product: QuickProduct = {
          title,
          price,
          brand,
          images: images.slice(0, 10), // Limit to 10 images
          variants: [{ color: 'Standart', size: 'Standart', inStock: true }]
        };

        this.saveToCache(url, product);
        
        return {
          success: true,
          data: product,
          method: 'fallback-scrape',
          responseTime: Date.now() - startTime
        };
      }

      return {
        success: false,
        method: 'fallback-scrape',
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        success: false,
        method: 'fallback-failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  // Helper methods
  private getProductId(url: string): string {
    const match = url.match(/p-(\d+)/);
    return match ? match[1] : '';
  }

  private parseAPIResponse(data: any): QuickProduct {
    return {
      title: data.name || data.productName || '',
      price: data.price?.discountedPrice || data.price?.originalPrice || 0,
      brand: data.brand?.name || '',
      images: data.images?.map((img: any) => img.url) || [],
      variants: this.parseVariants(data.variants || [])
    };
  }

  private parseMobileResponse(data: any): QuickProduct {
    return {
      title: data.productName || data.name || '',
      price: data.priceInfo?.discountedPrice || data.priceInfo?.price || 0,
      brand: data.brandName || '',
      images: data.productImages?.map((img: any) => img.imageUrl) || [],
      variants: this.parseVariants(data.productVariants || [])
    };
  }

  private parseHTMLResponse($: cheerio.CheerioAPI, url: string): QuickProduct {
    const title = $('h1').first().text().trim() || 
                 $('[data-testid="product-name"]').text().trim();

    const priceText = $('.prc-dsc').text() || $('.price').text() || '';
    const price = this.extractPrice(priceText);

    const brand = $('.product-brand').text().trim() || 
                 this.extractBrandFromTitle(title);

    const images: string[] = [];
    $('img[src*="cdn.dsmcdn.com"]').each((_, el) => {
      const src = $(el).attr('src');
      if (src && src.includes('org_zoom')) {
        images.push(src);
      }
    });

    return {
      title,
      price,
      brand,
      images: images.slice(0, 10),
      variants: [{ color: 'Standart', size: 'Standart', inStock: true }]
    };
  }

  private parseVariants(variants: any[]): Array<{ color: string; size: string; inStock: boolean }> {
    if (!Array.isArray(variants) || variants.length === 0) {
      return [{ color: 'Standart', size: 'Standart', inStock: true }];
    }

    return variants.map(v => ({
      color: v.color || v.attributeValue || 'Standart',
      size: v.size || v.value || 'Standart', 
      inStock: v.inStock !== false
    }));
  }

  private extractPrice(priceText: string): number {
    if (!priceText) return 0;
    
    // Turkish price patterns
    const patterns = [
      /(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/g,
      /(\d+(?:,\d+)?)\s*TL/g,
      /(\d+(?:\.\d+)?)/g
    ];

    for (const pattern of patterns) {
      const matches = priceText.match(pattern);
      if (matches && matches.length > 0) {
        const cleanPrice = matches[0]
          .replace(/[^\d,\.]/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
        
        const price = parseFloat(cleanPrice);
        if (price > 0 && price < 100000) {
          return price;
        }
      }
    }

    return 0;
  }

  private extractBrandFromTitle(title: string): string {
    const words = title.split(' ');
    return words[0] || 'Genel';
  }

  // Cache management
  private getFromCache(url: string): QuickProduct | null {
    const key = this.getProductId(url);
    return this.cache.get(key) || null;
  }

  private saveToCache(url: string, product: QuickProduct): void {
    const key = this.getProductId(url);
    this.cache.set(key, product);
    
    // Limit cache size to 1000 items
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }
}

// Export singleton instance
export const speedOptimizedScraper = SpeedOptimizedScraper.getInstance();