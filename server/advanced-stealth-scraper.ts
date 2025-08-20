/**
 * Advanced Stealth Scraper - Ultra Anti-Detection System
 * Designed to bypass Trendyol's most aggressive blocking measures
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface StealthResult {
  success: boolean;
  title?: string;
  brand?: string;
  price?: number;
  images?: string[];
  variants?: any[];
  method?: string;
  error?: string;
}

// Advanced browser fingerprints that mimic real users
const STEALTH_FINGERPRINTS = [
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLanguage: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    secChUaPlatform: '"Windows"',
    viewport: '1920x1080'
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLanguage: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    secChUaPlatform: '"macOS"',
    viewport: '1440x900'
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    acceptLanguage: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    secChUa: '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    secChUaPlatform: '"Linux"',
    viewport: '1366x768'
  }
];

// Turkish ISP headers to appear local
const TURKISH_ISP_HEADERS = {
  'X-Forwarded-For': '176.88.0.1', // Turknet
  'X-Real-IP': '176.88.0.1',
  'CF-Connecting-IP': '176.88.0.1'
};

export class AdvancedStealthScraper {
  private sessionCookies: string = '';
  private currentFingerprint: any;
  private requestCount: number = 0;

  constructor() {
    this.rotateFingerprint();
  }

  private rotateFingerprint() {
    this.currentFingerprint = STEALTH_FINGERPRINTS[Math.floor(Math.random() * STEALTH_FINGERPRINTS.length)];
    console.log(`🎭 Fingerprint rotated to: ${this.currentFingerprint.secChUaPlatform}`);
  }

  private getStealthHeaders(referer?: string) {
    return {
      'User-Agent': this.currentFingerprint.userAgent,
      'Accept': this.currentFingerprint.accept,
      'Accept-Language': this.currentFingerprint.acceptLanguage,
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': referer ? 'same-origin' : 'none',
      'Sec-Fetch-User': '?1',
      'Sec-Ch-Ua': this.currentFingerprint.secChUa,
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': this.currentFingerprint.secChUaPlatform,
      'Cache-Control': 'max-age=0',
      'Referer': referer || 'https://www.trendyol.com/',
      ...TURKISH_ISP_HEADERS,
      ...(this.sessionCookies && { 'Cookie': this.sessionCookies })
    };
  }

  // Human-like delay patterns
  private async humanDelay(min: number = 2000, max: number = 5000) {
    const delay = Math.random() * (max - min) + min;
    // Add small random variations to appear more human
    const jitter = Math.random() * 200 - 100;
    await new Promise(resolve => setTimeout(resolve, delay + jitter));
  }

  // Establish session like a real user
  private async establishSession(): Promise<boolean> {
    try {
      console.log('🔐 Establishing authentic session...');
      
      // First visit homepage
      const homeResponse = await axios.get('https://www.trendyol.com', {
        timeout: 15000,
        headers: this.getStealthHeaders(),
        maxRedirects: 3,
        withCredentials: true
      });

      // Extract session cookies
      const setCookies = homeResponse.headers['set-cookie'];
      if (setCookies) {
        this.sessionCookies = setCookies.map(cookie => cookie.split(';')[0]).join('; ');
        console.log('✅ Session established with cookies');
      }

      await this.humanDelay(1500, 3000);

      // Browse a category to appear more human
      await axios.get('https://www.trendyol.com/butik/liste/1/kadin', {
        timeout: 10000,
        headers: this.getStealthHeaders('https://www.trendyol.com'),
        maxRedirects: 2
      });

      await this.humanDelay(1000, 2000);
      return true;

    } catch (error) {
      console.log('❌ Session establishment failed:', error.message);
      return false;
    }
  }

  // Advanced request with multiple fallback strategies
  private async makeStealthRequest(url: string, attempt: number = 1): Promise<any> {
    try {
      // Rotate fingerprint every 5 requests
      if (this.requestCount % 5 === 0) {
        this.rotateFingerprint();
      }
      this.requestCount++;

      const response = await axios.get(url, {
        timeout: 20000,
        headers: this.getStealthHeaders(this.requestCount > 1 ? 'https://www.trendyol.com' : undefined),
        maxRedirects: 3,
        validateStatus: (status) => status < 500
      });

      // Check for blocking indicators
      if (this.isBlocked(response.data)) {
        console.log(`🚫 Blocked detected on attempt ${attempt}`);
        
        if (attempt < 3) {
          await this.humanDelay(3000, 8000);
          
          // Re-establish session on second attempt
          if (attempt === 2) {
            await this.establishSession();
          }
          
          return this.makeStealthRequest(url, attempt + 1);
        }
        
        throw new Error('Request blocked after all attempts');
      }

      return response;

    } catch (error) {
      if (attempt < 3) {
        console.log(`⚠️ Request failed, retrying... (${attempt}/3)`);
        await this.humanDelay(5000, 10000);
        return this.makeStealthRequest(url, attempt + 1);
      }
      throw error;
    }
  }

  private isBlocked(html: string): boolean {
    const blockingIndicators = [
      'sorry, you have been blocked',
      'please enable javascript',
      'cloudflare',
      'security check',
      'rate limit',
      'bot detection'
    ];

    const lowercaseHtml = html.toLowerCase();
    return blockingIndicators.some(indicator => lowercaseHtml.includes(indicator));
  }

  // Extract product data with enhanced selectors
  private extractProductData(html: string, url: string): StealthResult {
    try {
      const $ = cheerio.load(html);
      
      // Enhanced title extraction
      let title = $('h1.pr-new-br').text().trim() ||
                  $('h1[data-test-id="product-title"]').text().trim() ||
                  $('h1').first().text().trim() ||
                  $('meta[property="og:title"]').attr('content') ||
                  $('title').text().replace(' - Trendyol', '').trim();

      if (!title || title.length < 5) {
        console.log('❌ Title extraction failed');
        return { success: false, error: 'Title not found' };
      }

      // Enhanced brand extraction
      let brand = $('.product-brand-name-with-link').text().trim() ||
                  $('.pr-brand-nm').text().trim() ||
                  $('[data-test-id="product-brand"]').text().trim() ||
                  title.split(' ')[0];

      // Enhanced price extraction with Turkish format support
      let price = 0;
      const priceSelectors = [
        '.prc-dsc',
        '.prc-org', 
        '[data-test-id="price-current-price"]',
        '.pr-new-price',
        '.price-current',
        '.current-price'
      ];

      for (const selector of priceSelectors) {
        const priceElement = $(selector);
        if (priceElement.length) {
          const priceText = priceElement.text().trim();
          console.log(`💰 Found price text: "${priceText}"`);
          
          // Turkish price format: 2.957,52 TL
          const turkishPriceMatch = priceText.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/);
          if (turkishPriceMatch) {
            const priceStr = turkishPriceMatch[1].replace(/\./g, '').replace(',', '.');
            price = parseFloat(priceStr);
            console.log(`✅ Extracted Turkish price: ${price} TL`);
            break;
          }
          
          // Standard format
          const standardMatch = priceText.match(/[\d,\.]+/);
          if (standardMatch) {
            price = parseFloat(standardMatch[0].replace(',', '.'));
            if (price > 0) {
              console.log(`✅ Extracted standard price: ${price} TL`);
              break;
            }
          }
        }
      }

      // Enhanced image extraction
      const images: string[] = [];
      const imageSelectors = [
        '.product-detail-image img',
        '.gallery-image img',
        '[data-test-id="product-image"] img',
        '.product-image img',
        'img[src*="cdn.dsmcdn.com"]'
      ];

      imageSelectors.forEach(selector => {
        $(selector).each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
          if (src && src.includes('cdn.dsmcdn.com') && !src.includes('static')) {
            // Convert to high resolution
            const highRes = src.includes('org_zoom') ? src : 
                           src.replace(/_medium|_small|_thumb/g, '_org_zoom');
            if (!images.includes(highRes)) {
              images.push(highRes);
            }
          }
        });
      });

      // Basic variant detection
      const variants = [{ color: 'Standart', size: 'Standart', inStock: true }];

      console.log(`✅ STEALTH EXTRACTION SUCCESS: ${title}, ${price} TL, ${images.length} images`);

      return {
        success: true,
        title,
        brand,
        price,
        images: images.slice(0, 15),
        variants,
        method: 'advanced-stealth'
      };

    } catch (error) {
      console.log('❌ Data extraction failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Main extraction method
  public async extractProduct(url: string): Promise<StealthResult> {
    console.log('🕵️ ADVANCED STEALTH SCRAPER: Starting ultra-stealth extraction...');
    
    try {
      // Establish session first
      await this.establishSession();
      await this.humanDelay(2000, 4000);

      // Make the main request
      const response = await this.makeStealthRequest(url);
      
      if (!response || !response.data) {
        throw new Error('Empty response received');
      }

      // Extract product data
      return this.extractProductData(response.data, url);

    } catch (error) {
      console.log('❌ ADVANCED STEALTH SCRAPER failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
export const advancedStealthScraper = new AdvancedStealthScraper();