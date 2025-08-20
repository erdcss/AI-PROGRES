/**
 * Trendyol Defense System - Ultimate Anti-Ban Protection
 * Comprehensive system to prevent all forms of blocking
 */

import { advancedStealthScraper } from './advanced-stealth-scraper';
import { proxyRotationSystem } from './proxy-rotation-system';
import { emergencyExtraction } from './emergency-scraper';
import { bypassCloudflare } from './cloudflare-bypass';

export interface DefenseResult {
  success: boolean;
  title?: string;
  brand?: string;
  price?: number;
  images?: string[];
  variants?: any[];
  method?: string;
  attempts?: number;
  error?: string;
}

// Comprehensive defense strategies ordered by effectiveness
const DEFENSE_STRATEGIES = [
  {
    name: 'Advanced Stealth',
    priority: 1,
    method: 'stealth',
    description: 'Human-like browser behavior with session management'
  },
  {
    name: 'Proxy Rotation',
    priority: 2,
    method: 'proxy',
    description: 'Multiple IP addresses with Turkish ISP simulation'
  },
  {
    name: 'Cloudflare Bypass',
    priority: 3,
    method: 'cloudflare',
    description: 'Anti-detection headers and request patterns'
  },
  {
    name: 'Emergency Archives',
    priority: 4,
    method: 'emergency',
    description: 'Wayback Machine and archive services'
  }
];

export class TrendyolDefenseSystem {
  private attemptHistory: Map<string, number> = new Map();
  private successfulMethods: Map<string, string> = new Map();
  private blockedDomains: Set<string> = new Set();

  // Intelligent strategy selection based on URL and history
  private selectStrategy(url: string): string {
    const urlKey = this.getUrlKey(url);
    
    // Use previously successful method for this URL pattern
    if (this.successfulMethods.has(urlKey)) {
      const method = this.successfulMethods.get(urlKey);
      console.log(`🎯 Using previously successful method: ${method}`);
      return method!;
    }

    // Check if domain is known to be problematic
    const domain = new URL(url).hostname;
    if (this.blockedDomains.has(domain)) {
      console.log(`⚠️ Domain ${domain} known to be problematic, using advanced stealth`);
      return 'stealth';
    }

    // Default to stealth for first attempt
    return 'stealth';
  }

  private getUrlKey(url: string): string {
    // Extract pattern from URL for method caching
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/');
    return `${urlObj.hostname}/${pathSegments[1] || 'root'}`;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Execute strategy with intelligent error handling
  private async executeStrategy(strategy: string, url: string): Promise<DefenseResult> {
    try {
      switch (strategy) {
        case 'stealth':
          console.log('🕵️ DEFENSE: Executing Advanced Stealth strategy...');
          const stealthResult = await advancedStealthScraper.extractProduct(url);
          if (stealthResult.success) {
            return {
              success: true,
              title: stealthResult.title,
              brand: stealthResult.brand,
              price: stealthResult.price,
              images: stealthResult.images,
              variants: stealthResult.variants,
              method: 'advanced-stealth'
            };
          }
          break;

        case 'proxy':
          console.log('🌐 DEFENSE: Executing Proxy Rotation strategy...');
          const proxyResult = await proxyRotationSystem.makeProxyRequest(url);
          if (proxyResult.success && proxyResult.html) {
            // Parse the HTML using stealth scraper's parser
            const parsed = this.parseHTML(proxyResult.html);
            if (parsed.success) {
              return {
                success: true,
                title: parsed.title,
                brand: parsed.brand,
                price: parsed.price,
                images: parsed.images,
                variants: parsed.variants,
                method: `proxy-${proxyResult.proxy}`
              };
            }
          }
          break;

        case 'cloudflare':
          console.log('🛡️ DEFENSE: Executing Cloudflare Bypass strategy...');
          const cfResult = await bypassCloudflare(url);
          if (cfResult.success && cfResult.html) {
            const parsed = this.parseHTML(cfResult.html);
            if (parsed.success) {
              return {
                success: true,
                title: parsed.title,
                brand: parsed.brand,
                price: parsed.price,
                images: parsed.images,
                variants: parsed.variants,
                method: 'cloudflare-bypass'
              };
            }
          }
          break;

        case 'emergency':
          console.log('🆘 DEFENSE: Executing Emergency Archives strategy...');
          const emergencyResult = await emergencyExtraction(url);
          if (emergencyResult.success) {
            return {
              success: true,
              title: emergencyResult.title,
              brand: emergencyResult.brand,
              price: emergencyResult.price,
              images: emergencyResult.images,
              variants: emergencyResult.variants,
              method: `emergency-${emergencyResult.method}`
            };
          }
          break;

        default:
          throw new Error(`Unknown strategy: ${strategy}`);
      }

      return { success: false, error: `Strategy ${strategy} failed` };

    } catch (error) {
      console.log(`❌ Strategy ${strategy} error:`, error.message);
      return { success: false, error: error.message };
    }
  }

  // Simple HTML parser for proxy results
  private parseHTML(html: string): any {
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    let title = $('h1').first().text().trim() || 
                $('meta[property="og:title"]').attr('content') ||
                $('title').text().replace(' - Trendyol', '');
    
    if (!title || title.length < 5) {
      return { success: false };
    }
    
    let brand = $('.product-brand').text().trim() || title.split(' ')[0];
    
    let price = 0;
    const priceSelectors = ['.prc-dsc', '.prc-org', '.price-current', '.price'];
    for (const selector of priceSelectors) {
      const priceText = $(selector).text().trim();
      if (priceText) {
        const turkishPriceMatch = priceText.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/);
        if (turkishPriceMatch) {
          const priceStr = turkishPriceMatch[1].replace(/\./g, '').replace(',', '.');
          price = parseFloat(priceStr);
          if (price > 0) break;
        }
      }
    }
    
    const images = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.includes('cdn.dsmcdn.com') && !src.includes('static')) {
        const highRes = src.includes('org_zoom') ? src : 
                       src.replace('_medium', '_org_zoom').replace('_small', '_org_zoom');
        if (!images.includes(highRes)) {
          images.push(highRes);
        }
      }
    });
    
    return {
      success: true,
      title,
      brand,
      price,
      images: images.slice(0, 10),
      variants: [{ color: 'Standart', size: 'Standart', inStock: true }]
    };
  }

  // Main defense execution with intelligent fallbacks
  public async defendAndExtract(url: string): Promise<DefenseResult> {
    console.log('🛡️ TRENDYOL DEFENSE SYSTEM: Starting comprehensive defense...');
    
    const urlKey = this.getUrlKey(url);
    const attempts = this.attemptHistory.get(urlKey) || 0;
    this.attemptHistory.set(urlKey, attempts + 1);

    // Try strategies in priority order
    for (const strategy of DEFENSE_STRATEGIES) {
      try {
        console.log(`🔄 Trying ${strategy.name} (Priority ${strategy.priority})`);
        
        const result = await this.executeStrategy(strategy.method, url);
        
        if (result.success) {
          console.log(`✅ DEFENSE SUCCESS: ${strategy.name} worked!`);
          
          // Cache successful method for this URL pattern
          this.successfulMethods.set(urlKey, strategy.method);
          
          return {
            ...result,
            attempts: attempts + 1
          };
        }

        // Add progressive delays between strategies
        await this.delay(2000 + (strategy.priority * 1000));
        
      } catch (error) {
        console.log(`❌ ${strategy.name} failed:`, error.message);
        
        // Mark domain as problematic if multiple failures
        if (attempts > 2) {
          const domain = new URL(url).hostname;
          this.blockedDomains.add(domain);
          console.log(`⚠️ Marked ${domain} as problematic domain`);
        }
      }
    }

    console.log('❌ DEFENSE SYSTEM: All strategies exhausted');
    return { 
      success: false, 
      error: 'All defense strategies failed',
      attempts: attempts + 1 
    };
  }

  // Get system statistics
  public getDefenseStats() {
    return {
      totalAttempts: Array.from(this.attemptHistory.values()).reduce((a, b) => a + b, 0),
      successfulMethods: this.successfulMethods.size,
      blockedDomains: this.blockedDomains.size,
      strategiesAvailable: DEFENSE_STRATEGIES.length
    };
  }

  // Reset defense system
  public resetDefenseSystem() {
    this.attemptHistory.clear();
    this.successfulMethods.clear();
    this.blockedDomains.clear();
    console.log('🔄 Defense system reset');
  }
}

export const trendyolDefenseSystem = new TrendyolDefenseSystem();