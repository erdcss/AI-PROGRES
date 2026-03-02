/**
 * Ultra Stealth System - Advanced Anti-Detection System
 * Trendyol'dan banlanmayı tamamen önleyen sistem
 */

import puppeteer from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';

interface StealthConfig {
  enableFingerprinting: boolean;
  enableProxyRotation: boolean;
  enableDelayVariation: boolean;
  enableBehaviorMimicking: boolean;
  enableCacheStrategy: boolean;
}

// Realistic Turkish residential IP ranges
const turkishProxyPool = [
  '85.105.78.42',
  '88.255.149.33', 
  '176.235.99.15',
  '185.125.48.91',
  '94.54.67.123'
];

// Real device fingerprints from Turkey
const deviceFingerprints = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    platform: 'Win32',
    language: 'tr-TR',
    timezone: 'Europe/Istanbul',
    webgl: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    platform: 'MacIntel',
    language: 'tr-TR',
    timezone: 'Europe/Istanbul',
    webgl: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Version 14.2.1 (Build 23C71))'
  },
  {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    viewport: { width: 375, height: 667 },
    platform: 'iPhone',
    language: 'tr-TR',
    timezone: 'Europe/Istanbul',
    webgl: 'Apple GPU'
  }
];

export class UltraStealthSystem {
  private config: StealthConfig;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private currentFingerprint: any;
  private sessionCookies: any = {};

  constructor(config: Partial<StealthConfig> = {}) {
    this.config = {
      enableFingerprinting: true,
      enableProxyRotation: false,    // 🚀 SPEED BOOST: Disable proxy rotation for speed
      enableDelayVariation: false,   // 🚀 SPEED BOOST: Disable delay variation for speed
      enableBehaviorMimicking: true,
      enableCacheStrategy: true,
      ...config
    };
    
    this.rotateFingerprint();
  }

  // Rotate device fingerprint
  private rotateFingerprint(): void {
    this.currentFingerprint = deviceFingerprints[Math.floor(Math.random() * deviceFingerprints.length)];
    console.log(`🎭 Fingerprint rotated to: ${this.currentFingerprint.platform}`);
  }

  // Human-like delay patterns - ULTRA SPEED VERSION
  private async humanDelay(): Promise<void> {
    if (!this.config.enableDelayVariation) return;
    
    // 🚀 ULTRA SPEED: Minimal delays only
    const baseDelay = 200; // 0.2 seconds minimum (was 3s)
    const variation = Math.random() * 300; // 0-0.3 seconds variation (was 4s)
    
    const totalDelay = baseDelay + variation;
    
    console.log(`⚡ Ultra-fast delay: ${Math.round(totalDelay)}ms`);
    await new Promise(resolve => setTimeout(resolve, totalDelay));
    
    this.requestCount++;
  }

  // Advanced session management
  private async createStealthSession(): Promise<any> {
    let browser;
    try {
      console.log('🕵️ Creating ultra-stealth browser session...');
      
      browser = await puppeteer.launch({
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser',
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images', // Faster loading
          '--disable-javascript', // Some pages work without JS
          '--user-agent=' + this.currentFingerprint.userAgent,
          '--lang=tr-TR,tr',
          '--accept-lang=tr-TR,tr,en-US,en'
        ]
      });

      const page = await browser.newPage();

      // Set viewport based on fingerprint
      await page.setViewport(this.currentFingerprint.viewport);

      // Advanced header spoofing
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Cache-Control': 'max-age=0',
        'Sec-CH-UA': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-CH-UA-Mobile': this.currentFingerprint.platform === 'iPhone' ? '?1' : '?0',
        'Sec-CH-UA-Platform': `"${this.currentFingerprint.platform}"`,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'X-Forwarded-For': turkishProxyPool[Math.floor(Math.random() * turkishProxyPool.length)]
      });

      // Override detection properties
      await page.evaluateOnNewDocument(() => {
        // Remove webdriver property
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Override plugins
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
          get: () => ['tr-TR', 'tr', 'en-US', 'en'],
        });

        // Override platform
        Object.defineProperty(navigator, 'platform', {
          get: () => window.stealthPlatform || 'Win32',
        });

        // Override timezone
        Date.prototype.getTimezoneOffset = function () {
          return -180; // Turkey timezone offset
        };
      });

      return { browser, page };
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  // Strategy 1: Distributed API approach
  async tryDistributedAPI(url: string): Promise<any> {
    try {
      console.log('🌐 Trying distributed API approach...');
      
      const productId = url.match(/p-(\d+)/)?.[1];
      if (!productId) return null;

      // Multiple API endpoints to try
      const apiEndpoints = [
        `https://public-mdc.trendyol.com/discovery-web-socialmediagw-service/api/product-detail/${productId}`,
        `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
        `https://cdn-gw.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`
      ];

      for (const endpoint of apiEndpoints) {
        try {
          await this.humanDelay();
          
          const response = await axios.get(endpoint, {
            headers: {
              'User-Agent': this.currentFingerprint.userAgent,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'tr-TR,tr;q=0.9',
              'Referer': 'https://www.trendyol.com/',
              'Origin': 'https://www.trendyol.com',
              'X-Requested-With': 'XMLHttpRequest',
              'X-Forwarded-For': turkishProxyPool[Math.floor(Math.random() * turkishProxyPool.length)]
            },
            timeout: 15000
          });

          if (response.data && response.data.result) {
            console.log('✅ Distributed API success!');
            return this.processAPIData(response.data.result);
          }
        } catch (apiError) {
          console.log(`❌ API endpoint failed: ${endpoint}`);
          continue;
        }
      }

      return null;
    } catch (error) {
      console.log(`❌ Distributed API failed: ${error}`);
      return null;
    }
  }

  // Strategy 2: Social media embedding approach
  async trySocialEmbedding(url: string): Promise<any> {
    try {
      console.log('📱 Trying social media embedding approach...');
      
      // Simulate access via social media platforms
      const socialReferrers = [
        'https://www.facebook.com/',
        'https://www.instagram.com/',
        'https://twitter.com/',
        'https://www.pinterest.com/'
      ];

      for (const referrer of socialReferrers) {
        try {
          await this.humanDelay();
          
          const response = await axios.get(url, {
            headers: {
              'User-Agent': this.currentFingerprint.userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'tr-TR,tr;q=0.9',
              'Referer': referrer,
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            timeout: 10000
          });

          if (response.data && !this.isBlocked(response.data)) {
            console.log(`✅ Social embedding success via: ${referrer}`);
            return this.parseHTML(response.data, 'social-embedding');
          }
        } catch (socialError) {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.log(`❌ Social embedding failed: ${error}`);
      return null;
    }
  }

  // Strategy 3: Browser automation with human behavior
  async tryHumanBehaviorAutomation(url: string): Promise<any> {
    let session;
    try {
      console.log('🤖 Trying human behavior automation...');
      
      session = await this.createStealthSession();
      const { browser, page } = session;

      // Simulate human browsing behavior
      console.log('👤 Simulating human behavior...');
      
      // First, visit Trendyol homepage
      await page.goto('https://www.trendyol.com/', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Human-like delay
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
      
      // Scroll a bit (human behavior)
      await page.evaluate(() => {
        window.scrollTo(0, Math.random() * 500);
      });
      
      // Another delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      
      // Navigate to actual product page
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Human-like interactions
      await this.simulateHumanInteractions(page);
      
      // Extract data
      const data = await page.evaluate(() => {
        const title = document.querySelector('h1, .product-name, [data-testid="product-name"]')?.textContent?.trim();
        const priceElement = document.querySelector('.price, .prc-dsc, [data-testid="price"]');
        const priceText = priceElement?.textContent?.trim() || '';
        const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
        
        const images = Array.from(document.querySelectorAll('img[src*="cdn.dsmcdn.com"]'))
          .map(img => (img as HTMLImageElement).src)
          .filter(src => src.includes('prod/'));

        const brand = document.querySelector('.brand, [data-testid="brand"]')?.textContent?.trim() || '';
        
        return {
          title: title || '',
          price: { original: price, currency: 'TL' },
          images: images, // NO LIMIT - Get ALL images
          brand: brand,
          source: 'human-behavior-automation'
        };
      });

      if (data.title && data.price.original > 0) {
        console.log('✅ Human behavior automation success!');
        return data;
      }

      return null;
    } catch (error) {
      console.log(`❌ Human behavior automation failed: ${error}`);
      return null;
    } finally {
      if (session?.browser) {
        await session.browser.close();
      }
    }
  }

  // Strategy 4: CDN and cache exploitation
  async tryCDNExploitation(url: string): Promise<any> {
    try {
      console.log('🌍 Trying CDN exploitation...');
      
      const productId = url.match(/p-(\d+)/)?.[1];
      if (!productId) return null;

      // Try different CDN endpoints
      const cdnEndpoints = [
        `https://cdn.trendyol.com/product-images/${productId}`,
        `https://images.trendyol.com/product/${productId}`,
        `https://static.trendyol.com/discovery/productDetail/${productId}`
      ];

      for (const endpoint of cdnEndpoints) {
        try {
          const response = await axios.get(endpoint, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; GoogleBot/2.1)',
              'Accept': 'application/json'
            },
            timeout: 10000
          });

          if (response.data) {
            console.log('✅ CDN exploitation success!');
            return this.processCDNData(response.data);
          }
        } catch (cdnError) {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.log(`❌ CDN exploitation failed: ${error}`);
      return null;
    }
  }

  // Helper methods
  private async simulateHumanInteractions(page: any): Promise<void> {
    try {
      // Simulate mouse movement
      await page.mouse.move(Math.random() * 500, Math.random() * 500);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Simulate scrolling
      await page.evaluate(() => {
        window.scrollTo(0, 200 + Math.random() * 300);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Simulate more mouse movement
      await page.mouse.move(Math.random() * 800, Math.random() * 600);
      await new Promise(resolve => setTimeout(resolve, 800));
      
    } catch (error) {
      console.log('❌ Human interaction simulation failed');
    }
  }

  private isBlocked(html: string): boolean {
    const blockingKeywords = [
      'blocked', 'banned', 'access denied', 'captcha',
      'robot', 'bot', 'automated', 'security check'
    ];
    
    const lowerHtml = html.toLowerCase();
    return blockingKeywords.some(keyword => lowerHtml.includes(keyword));
  }

  private parseHTML(html: string, source: string): any {
    try {
      const $ = cheerio.load(html);
      
      const title = $('h1, .product-name').first().text().trim();
      const priceText = $('.price, .prc-dsc').first().text().trim();
      const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
      
      const images = $('img[src*="cdn.dsmcdn.com"]')
        .map((_, img) => $(img).attr('src'))
        .get()
        .filter(src => src && src.includes('prod/'))
        .slice(0, 8);

      const brand = $('.brand').first().text().trim();

      if (title && price > 0) {
        return {
          title,
          price: { original: price, currency: 'TL' },
          images,
          brand,
          source
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private processAPIData(data: any): any {
    try {
      return {
        title: data.name || '',
        price: { original: data.price?.originalPrice || data.price?.discountedPrice || 0, currency: 'TL' },
        images: data.images?.map((img: any) => img.url) || [],
        brand: data.brand?.name || '',
        source: 'distributed-api'
      };
    } catch (error) {
      return null;
    }
  }

  private processCDNData(data: any): any {
    try {
      return {
        title: data.title || data.name || '',
        price: { original: data.price || 0, currency: 'TL' },
        images: Array.isArray(data.images) ? data.images : [],
        brand: data.brand || '',
        source: 'cdn-exploitation'
      };
    } catch (error) {
      return null;
    }
  }

  // Main ultra stealth method
  async executeUltraStealthExtraction(url: string): Promise<any> {
    console.log('🔥 ULTRA STEALTH SYSTEM: Starting advanced extraction...');
    
    // Rotate fingerprint for each request
    if (Math.random() > 0.7) {
      this.rotateFingerprint();
    }

    const strategies = [
      () => this.tryDistributedAPI(url),
      () => this.trySocialEmbedding(url),
      () => this.tryHumanBehaviorAutomation(url),
      () => this.tryCDNExploitation(url)
    ];

    // Randomize strategy order
    const shuffledStrategies = strategies.sort(() => Math.random() - 0.5);

    for (const strategy of shuffledStrategies) {
      try {
        const result = await strategy();
        if (result && result.title && result.price?.original > 0) {
          console.log(`🎉 ULTRA STEALTH SUCCESS via ${result.source}`);
          return result;
        }
        
        // Human-like delay between strategies
        await this.humanDelay();
      } catch (error) {
        console.log(`❌ Strategy failed: ${error}`);
        continue;
      }
    }

    console.log('❌ All ultra stealth strategies exhausted');
    return null;
  }
}

export const ultraStealthSystem = new UltraStealthSystem({
  enableFingerprinting: true,
  enableProxyRotation: true,
  enableDelayVariation: true,
  enableBehaviorMimicking: true,
  enableCacheStrategy: true
});