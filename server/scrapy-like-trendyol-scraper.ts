/**
 * Scrapy-like Trendyol Variants Scraper
 * Based on the Python Scrapy code provided by user
 * Implements the same two-phase approach:
 * 1. Parse main page for variant links
 * 2. Parse each variant page for detailed data
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

interface VariantData {
  product_name: string;
  url: string;
  price: string | null;
  images: string[];
  stock_info: StockInfo[];
  attributes: Record<string, string>;
  color?: string;
  productId?: string;
}

interface StockInfo {
  size?: string;
  inStock?: boolean;
  variantId?: string;
}

export class TrendyolVariantsSpider {
  private allowedDomains = ['trendyol.com'];
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor() {
    console.log('🕷️ Scrapy-like Trendyol Variants Spider initialized');
  }

  /**
   * Main entry point - equivalent to start_urls in Scrapy
   */
  async start(startUrl: string): Promise<VariantData[]> {
    console.log(`🚀 Starting spider with URL: ${startUrl}`);
    
    try {
      const response = await this.makeRequest(startUrl);
      return await this.parse(response, startUrl);
    } catch (error) {
      console.error('❌ Spider failed:', error);
      throw error;
    }
  }

  /**
   * Parse main page - equivalent to parse() method in Scrapy
   * 1) Find all variant links
   * 2) Send requests to each variant URL
   */
  private async parse(html: string, baseUrl: string): Promise<VariantData[]> {
    console.log('📄 Parsing main page for variant links...');
    
    const $ = cheerio.load(html);
    const variantLinks: string[] = [];

    // Method 1: Product variants from CSS selectors
    $('.product-variants a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const fullUrl = this.resolveUrl(href, baseUrl);
        variantLinks.push(fullUrl);
      }
    });

    // Method 2: Color variant selectors
    $('.color-variant a, .pr-in-dt-cl a, [data-color] a').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        const fullUrl = this.resolveUrl(href, baseUrl);
        variantLinks.push(fullUrl);
      }
    });

    // Method 3: Script-based variant detection
    const scriptVariants = this.extractVariantsFromScripts(html, baseUrl);
    variantLinks.push(...scriptVariants);

    // Remove duplicates
    const uniqueLinks = [...new Set(variantLinks)];
    
    console.log(`✅ Found ${uniqueLinks.length} variant links`);

    // Parse each variant - equivalent to yielding scrapy.Request with callback
    const results: VariantData[] = [];
    for (const link of uniqueLinks) {
      try {
        console.log(`🎨 Processing variant: ${link}`);
        const variantHtml = await this.makeRequest(link);
        const variantData = await this.parseVariant(variantHtml, link);
        results.push(variantData);
      } catch (error) {
        console.error(`❌ Failed to process variant ${link}:`, error);
      }
    }

    return results;
  }

  /**
   * Parse individual variant page - equivalent to parse_variant() method in Scrapy
   */
  private async parseVariant(html: string, url: string): Promise<VariantData> {
    console.log(`🔍 Parsing variant page: ${url}`);
    
    const $ = cheerio.load(html);

    // 1) Product name - equivalent to response.css('h1.pr-new-br::text').get()
    let productName = $('h1.pr-new-br').text().trim();
    if (!productName) {
      productName = $('h1').first().text().trim();
    }

    // 2) Price - equivalent to price extraction in Scrapy
    let price: string | null = null;
    const priceSelectors = [
      'span.prc-dsc',
      'span.prc-org', 
      '.price-current',
      '.current-price',
      '[data-price]'
    ];

    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length) {
        price = priceElement.text().trim();
        break;
      }
    }

    // 3) Extract JSON data - equivalent to __PRELOADED_STATE__ extraction
    const stockInfo: StockInfo[] = [];
    const attributes: Record<string, string> = {};
    
    const scriptTags = $('script').toArray();
    for (const script of scriptTags) {
      const scriptContent = $(script).html() || '';
      
      if (scriptContent.includes('__PRELOADED_STATE__') || 
          scriptContent.includes('product') ||
          scriptContent.includes('variants')) {
        
        try {
          const jsonData = this.extractJsonFromScript(scriptContent);
          if (jsonData) {
            // Extract variants and stock info
            const product = jsonData.product || {};
            const variants = product.variants || [];
            
            for (const variant of variants) {
              stockInfo.push({
                size: variant.size,
                inStock: variant.inStock,
                variantId: variant.variantId
              });
            }

            // Extract attributes
            const attr = product.attributes || [];
            for (const a of attr) {
              if (a.attributeName && a.attributeValue) {
                attributes[a.attributeName] = a.attributeValue;
              }
            }
          }
        } catch (error) {
          // JSON parse error - continue to next script
        }
      }
    }

    // 4) Product images - equivalent to response.css('.product-image-container img::attr(src)')
    const images: string[] = [];
    $('.product-image-container img, .product-gallery img, [data-image-id] img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src) {
        images.push(src);
      }
    });

    // Extract color and product ID from URL
    const color = this.extractColorFromUrl(url);
    const productId = this.extractProductIdFromUrl(url);

    return {
      product_name: productName,
      url: url,
      price: price,
      images: images,
      stock_info: stockInfo,
      attributes: attributes,
      color: color,
      productId: productId
    };
  }

  /**
   * Make HTTP request with proper headers
   */
  private async makeRequest(url: string): Promise<string> {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });

    return response.data;
  }

  /**
   * Extract variant URLs from script tags
   */
  private extractVariantsFromScripts(html: string, baseUrl: string): string[] {
    const variants: string[] = [];
    
    // Look for variant URLs in script content
    const scriptPattern = /"url":\s*"([^"]*\/p-\d+[^"]*)"/g;
    let match;
    
    while ((match = scriptPattern.exec(html)) !== null) {
      const variantUrl = match[1];
      if (variantUrl.includes('trendyol.com')) {
        variants.push(variantUrl);
      } else {
        variants.push(this.resolveUrl(variantUrl, baseUrl));
      }
    }

    return variants;
  }

  /**
   * Extract JSON data from script content
   */
  private extractJsonFromScript(scriptContent: string): any {
    // Try to find JSON in various formats
    const patterns = [
      /window\.__PRELOADED_STATE__\s*=\s*({.+?});/s,
      /window\.APP_STATE\s*=\s*({.+?});/s,
      /"product":\s*({.+?})/s,
      /({.*"product".*})/s
    ];

    for (const pattern of patterns) {
      const match = scriptContent.match(pattern);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  }

  /**
   * Resolve relative URLs to absolute URLs
   */
  private resolveUrl(href: string, baseUrl: string): string {
    if (href.startsWith('http')) {
      return href;
    }
    if (href.startsWith('//')) {
      return 'https:' + href;
    }
    if (href.startsWith('/')) {
      const base = new URL(baseUrl);
      return base.origin + href;
    }
    return new URL(href, baseUrl).href;
  }

  /**
   * Extract color from URL
   */
  private extractColorFromUrl(url: string): string {
    const colorPatterns = [
      /\/([^\/]+)-p-\d+/,  // Extract from product slug
      /color[=:]([^&\/]+)/i,
      /renk[=:]([^&\/]+)/i
    ];

    for (const pattern of colorPatterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1].replace(/-/g, ' ');
      }
    }

    return 'Unknown';
  }

  /**
   * Extract product ID from URL
   */
  private extractProductIdFromUrl(url: string): string {
    const match = url.match(/p-(\d+)/);
    return match ? match[1] : 'unknown';
  }
}

/**
 * Main function to run the spider - equivalent to running Scrapy
 */
export async function runTrendyolVariantsSpider(startUrl: string): Promise<VariantData[]> {
  const spider = new TrendyolVariantsSpider();
  return await spider.start(startUrl);
}

/**
 * Generate JSON output in Scrapy format
 */
export function generateScrapyOutput(variants: VariantData[]): string {
  return JSON.stringify(variants, null, 2);
}

/**
 * Generate CSV output
 */
export function generateScrapyCSV(variants: VariantData[]): string {
  if (variants.length === 0) return '';

  const headers = [
    'product_name',
    'url', 
    'price',
    'color',
    'productId',
    'images_count',
    'attributes_count',
    'stock_variants',
    'sample_image'
  ];

  const rows = variants.map(variant => [
    `"${variant.product_name || ''}"`,
    `"${variant.url || ''}"`,
    `"${variant.price || ''}"`,
    `"${variant.color || ''}"`,
    `"${variant.productId || ''}"`,
    variant.images.length,
    Object.keys(variant.attributes).length,
    variant.stock_info.length,
    `"${variant.images[0] || ''}"`
  ]);

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}