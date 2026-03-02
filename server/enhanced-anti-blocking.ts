/**
 * Enhanced Anti-Blocking System for Trendyol
 * Implements advanced evasion techniques and fallback strategies
 */

import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface AntiBlockingConfig {
  useProxy: boolean;
  rotateUserAgent: boolean;
  randomizeHeaders: boolean;
  useDelays: boolean;
  usePuppeteer: boolean;
}

// Enhanced User Agents - Latest versions from real browsers
const enhancedUserAgents = [
  // Chrome - Latest stable
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // Firefox - Latest stable
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  // Safari - Latest macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  // Edge - Latest stable
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70'
];

// Common browser headers to appear legitimate
const browserHeaders = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'DNT': '1',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0'
};

// Turkish residential-style headers for Turkey-focused sites
const turkishHeaders = {
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
  'CF-IPCountry': 'TR',
  'X-Forwarded-For': '85.105.78.42', // Turkish IP range
  'X-Real-IP': '85.105.78.42'
};

export class EnhancedAntiBlocking {
  private config: AntiBlockingConfig;
  private lastRequestTime: number = 0;
  
  constructor(config: Partial<AntiBlockingConfig> = {}) {
    this.config = {
      useProxy: false,
      rotateUserAgent: true,
      randomizeHeaders: true,
      useDelays: true,
      usePuppeteer: true,
      ...config
    };
  }

  // Smart delay to avoid rate limiting
  private async smartDelay(): Promise<void> {
    if (!this.config.useDelays) return;
    
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    const minDelay = 2000; // Minimum 2 seconds between requests
    
    if (timeSinceLastRequest < minDelay) {
      const delay = minDelay - timeSinceLastRequest + Math.random() * 1000;
      console.log(`⏱️ Smart delay: ${Math.round(delay)}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  // Generate realistic headers for the request
  private generateHeaders(): Record<string, string> {
    const headers = { ...browserHeaders };
    
    if (this.config.rotateUserAgent) {
      headers['User-Agent'] = enhancedUserAgents[Math.floor(Math.random() * enhancedUserAgents.length)];
    }
    
    if (this.config.randomizeHeaders) {
      // Add Turkish localization headers
      Object.assign(headers, turkishHeaders);
      
      // Add some randomization
      if (Math.random() > 0.5) {
        headers['Sec-CH-UA'] = '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"';
        headers['Sec-CH-UA-Mobile'] = '?0';
        headers['Sec-CH-UA-Platform'] = '"Windows"';
      }
    }
    
    return headers;
  }

  // Try extracting via mobile API endpoint (often less protected)
  private async tryMobileAPI(url: string): Promise<any> {
    try {
      console.log('📱 Trying mobile API endpoint...');
      
      // Convert to mobile API format
      const productId = url.match(/p-(\d+)/)?.[1];
      if (!productId) throw new Error('No product ID found');
      
      const mobileApiUrl = `https://public-mdc.trendyol.com/discovery-web-socialmediagw-service/api/product-detail/${productId}`;
      
      const response = await axios.get(mobileApiUrl, {
        headers: {
          ...this.generateHeaders(),
          'Referer': 'https://www.trendyol.com/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
      });
      
      if (response.data && response.data.result) {
        console.log('✅ Mobile API success!');
        return this.processMobileAPIData(response.data.result);
      }
    } catch (error) {
      console.log(`❌ Mobile API failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return null;
  }

  // Process mobile API response data
  private processMobileAPIData(data: any): any {
    try {
      return {
        title: data.name || '',
        price: {
          original: data.price?.originalPrice || data.price?.discountedPrice || 0,
          currency: 'TL'
        },
        images: data.images?.map((img: any) => img.url) || [],
        brand: data.brand?.name || '',
        description: data.description || '',
        variants: this.extractMobileVariants(data),
        source: 'mobile-api'
      };
    } catch (error) {
      console.error('❌ Mobile API data processing error:', error);
      return null;
    }
  }

  // Extract variants from mobile API data
  private extractMobileVariants(data: any): any {
    const variants = {
      colors: [],
      sizes: [],
      allVariants: []
    };

    try {
      if (data.variants && Array.isArray(data.variants)) {
        data.variants.forEach((variant: any) => {
          if (variant.attributeType === 'Color' && variant.attributes) {
            variants.colors = variant.attributes.map((attr: any) => attr.name);
          }
          if (variant.attributeType === 'Size' && variant.attributes) {
            variants.sizes = variant.attributes.map((attr: any) => attr.name);
          }
        });
      }
    } catch (error) {
      console.error('❌ Mobile variant extraction error:', error);
    }

    return variants;
  }

  // Advanced Puppeteer with stealth techniques
  private async tryAdvancedPuppeteer(url: string): Promise<any> {
    let browser;
    try {
      console.log('🎭 Launching advanced Puppeteer with stealth...');
      
      browser = await puppeteer.launch({
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser',
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--user-agent=' + enhancedUserAgents[0],
          '--lang=tr-TR',
          '--accept-lang=tr-TR,tr,en-US,en'
        ]
      });

      const page = await browser.newPage();

      // Set extra headers
      await page.setExtraHTTPHeaders({
        ...this.generateHeaders(),
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      });

      // Override the navigator.webdriver property
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      // Navigate with longer timeout
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Extract data using multiple strategies
      const extractedData = await page.evaluate(() => {
        // Try to extract basic product data
        const titleElement = document.querySelector('.pr-new-br h1, .product-name h1, h1');
        const priceElement = document.querySelector('.prc-dsc, .price-container .discounted, .price');
        
        const title = titleElement?.textContent?.trim() || '';
        const priceText = priceElement?.textContent?.trim() || '';
        const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;

        // Extract images
        const images = Array.from(document.querySelectorAll('img[src*="cdn.dsmcdn.com"]'))
          .map(img => (img as HTMLImageElement).src)
          .filter(src => src.includes('prod/') && !src.includes('thumbnail'));

        return {
          title,
          price: { original: price, currency: 'TL' },
          images: images, // NO LIMIT - Get ALL images
          source: 'advanced-puppeteer'
        };
      });

      console.log('✅ Advanced Puppeteer extraction successful!');
      return extractedData;

    } catch (error) {
      console.log(`❌ Advanced Puppeteer failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Try Google Cache as fallback
  private async tryGoogleCache(url: string): Promise<any> {
    try {
      console.log('🔍 Trying Google Cache...');
      
      const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
      
      const response = await axios.get(cacheUrl, {
        headers: this.generateHeaders(),
        timeout: 15000
      });

      if (response.data && response.data.includes('trendyol')) {
        console.log('✅ Google Cache found content!');
        return this.parseHtmlContent(response.data, 'google-cache');
      }
    } catch (error) {
      console.log(`❌ Google Cache failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return null;
  }

  // Parse HTML content and extract basic data
  private parseHtmlContent(html: string, source: string): any {
    try {
      const $ = cheerio.load(html);
      
      const title = $('h1, .product-name h1, .pr-new-br h1').first().text().trim();
      const priceText = $('.prc-dsc, .price-container .discounted, .price').first().text().trim();
      const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
      
      const images = $('img[src*="cdn.dsmcdn.com"]')
        .map((_, img) => $(img).attr('src'))
        .get()
        .filter(src => src && src.includes('prod/'));
        // NO LIMIT - Get ALL images

      return {
        title,
        price: { original: price, currency: 'TL' },
        images,
        source
      };
    } catch (error) {
      console.error(`❌ HTML parsing error for ${source}:`, error);
      return null;
    }
  }

  // Main method: Try all anti-blocking techniques
  async bypassBlocking(url: string): Promise<any> {
    console.log('🛡️ ENHANCED ANTI-BLOCKING: Starting bypass attempts...');
    
    await this.smartDelay();

    // Strategy 1: Mobile API (fastest and most reliable)
    let result = await this.tryMobileAPI(url);
    if (result && result.title && result.price.original > 0) {
      console.log('✅ SUCCESS via Mobile API');
      return result;
    }

    await this.smartDelay();

    // Strategy 2: Advanced Puppeteer with stealth
    if (this.config.usePuppeteer) {
      result = await this.tryAdvancedPuppeteer(url);
      if (result && result.title && result.price.original > 0) {
        console.log('✅ SUCCESS via Advanced Puppeteer');
        return result;
      }
    }

    await this.smartDelay();

    // Strategy 3: Google Cache fallback
    result = await this.tryGoogleCache(url);
    if (result && result.title && result.price.original > 0) {
      console.log('✅ SUCCESS via Google Cache');
      return result;
    }

    console.log('❌ All anti-blocking strategies failed');
    return null;
  }
}

// Export singleton instance
export const enhancedAntiBlocking = new EnhancedAntiBlocking({
  useProxy: false,
  rotateUserAgent: true,
  randomizeHeaders: true,
  useDelays: true,
  usePuppeteer: true
});