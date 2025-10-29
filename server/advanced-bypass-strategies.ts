/**
 * Advanced Bypass Strategies for Trendyol
 * Ultra-advanced anti-detection techniques
 */

import axios from 'axios';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

export class AdvancedBypassStrategies {
  
  // Strategy 1: Use Google Shopping API endpoint
  async tryGoogleShoppingAPI(url: string): Promise<any> {
    try {
      console.log('🛒 Trying Google Shopping API...');
      
      const productId = url.match(/p-(\d+)/)?.[1];
      if (!productId) return null;
      
      // Try Google's cached version of the page
      const searchUrl = `https://www.google.com/search?q=site:trendyol.com+p-${productId}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        timeout: 10000
      });
      
      if (response.data.includes('trendyol.com')) {
        console.log('✅ Google Shopping API found results');
        return this.parseGoogleResults(response.data);
      }
      
      return null;
    } catch (error) {
      console.log(`❌ Google Shopping API failed: ${error}`);
      return null;
    }
  }

  // Strategy 2: Use Wayback Machine (Internet Archive)
  async tryWaybackMachine(url: string): Promise<any> {
    try {
      console.log('🏛️ Trying Wayback Machine...');
      
      // Get latest snapshot from Internet Archive
      const waybackUrl = `https://web.archive.org/web/timemap/link/${url}`;
      
      const timemapResponse = await axios.get(waybackUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ia_archiver/3.0; +http://www.alexa.com/ia_archiver)',
          'Accept': 'application/link-format'
        },
        timeout: 15000
      });
      
      // Parse the timemap to find the latest snapshot
      const links = timemapResponse.data.split('\n');
      const memento = links.find((link: string) => link.includes('rel="memento"'));
      
      if (memento) {
        const snapshotUrl = memento.match(/<([^>]+)>/)?.[1];
        if (snapshotUrl) {
          console.log('✅ Found Wayback Machine snapshot');
          
          const snapshotResponse = await axios.get(snapshotUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; ia_archiver/3.0)',
              'Accept': 'text/html,application/xhtml+xml'
            },
            timeout: 20000
          });
          
          return this.parseArchivedContent(snapshotResponse.data);
        }
      }
      
      return null;
    } catch (error) {
      console.log(`❌ Wayback Machine failed: ${error}`);
      return null;
    }
  }

  // Strategy 3: Use Bing Cache
  async tryBingCache(url: string): Promise<any> {
    try {
      console.log('🔍 Trying Bing Cache...');
      
      const bingCacheUrl = `https://cc.bingj.com/cache.aspx?q=${encodeURIComponent(url)}&d=1`;
      
      const response = await axios.get(bingCacheUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
          'Accept-Language': 'en-US,en;q=0.8'
        },
        timeout: 15000
      });
      
      if (response.data && response.data.includes('trendyol')) {
        console.log('✅ Bing Cache found content');
        return this.parseCachedContent(response.data);
      }
      
      return null;
    } catch (error) {
      console.log(`❌ Bing Cache failed: ${error}`);
      return null;
    }
  }

  // Strategy 4: Mobile-first stealth approach
  async tryMobileStealth(url: string): Promise<any> {
    let browser;
    try {
      console.log('📱 Trying Mobile Stealth...');
      
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
        ]
      });

      const page = await browser.newPage();
      
      // Set mobile viewport
      await page.setViewport({ width: 375, height: 667 });
      
      // Set mobile headers
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1'
      });

      // Navigate to mobile version
      const mobileUrl = url.replace('www.trendyol.com', 'm.trendyol.com');
      
      await page.goto(mobileUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Wait and extract
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const mobileData = await page.evaluate(() => {
        const title = document.querySelector('h1, .product-name, [data-testid="product-name"]')?.textContent?.trim();
        const priceElement = document.querySelector('.price, .prc-dsc, [data-testid="price"]');
        const priceText = priceElement?.textContent?.trim() || '';
        const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
        
        const images = Array.from(document.querySelectorAll('img[src*="cdn.dsmcdn.com"]'))
          .map(img => (img as HTMLImageElement).src)
          .filter(src => src.includes('prod/'));

        return {
          title: title || '',
          price: { original: price, currency: 'TL' },
          images: images, // NO LIMIT - Get ALL images
          source: 'mobile-stealth'
        };
      });

      if (mobileData.title && mobileData.price.original > 0) {
        console.log('✅ Mobile Stealth successful');
        return mobileData;
      }
      
      return null;

    } catch (error) {
      console.log(`❌ Mobile Stealth failed: ${error}`);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  // Strategy 5: RSS/Sitemap approach
  async tryRSSFeed(url: string): Promise<any> {
    try {
      console.log('📡 Trying RSS/Sitemap approach...');
      
      const productId = url.match(/p-(\d+)/)?.[1];
      if (!productId) return null;
      
      // Try to find product in sitemaps
      const sitemapUrls = [
        'https://www.trendyol.com/sitemap-products.xml',
        'https://www.trendyol.com/sitemap.xml'
      ];
      
      for (const sitemapUrl of sitemapUrls) {
        try {
          const response = await axios.get(sitemapUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
              'Accept': 'application/xml,text/xml'
            },
            timeout: 10000
          });
          
          if (response.data.includes(productId)) {
            console.log('✅ Found product in sitemap');
            // Extract basic info from sitemap if available
            return this.parseSitemapContent(response.data, productId);
          }
        } catch (sitemapError) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      console.log(`❌ RSS/Sitemap failed: ${error}`);
      return null;
    }
  }

  // Helper methods for parsing different sources
  private parseGoogleResults(html: string): any {
    try {
      const $ = cheerio.load(html);
      // Parse Google search results for product info
      const titleElement = $('h3').first();
      const title = titleElement.text().trim();
      
      if (title) {
        return {
          title: title,
          price: { original: 0, currency: 'TL' }, // Google results don't have price
          images: [],
          source: 'google-search'
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private parseArchivedContent(html: string): any {
    try {
      const $ = cheerio.load(html);
      
      const title = $('h1, .product-name, [data-testid="product-name"]').first().text().trim();
      const priceText = $('.price, .prc-dsc, [data-testid="price"]').first().text().trim();
      const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
      
      const images = $('img[src*="cdn.dsmcdn.com"]')
        .map((_, img) => $(img).attr('src'))
        .get()
        .filter(src => src && src.includes('prod/'));
        // NO LIMIT - Get ALL images

      if (title && price > 0) {
        return {
          title,
          price: { original: price, currency: 'TL' },
          images,
          source: 'wayback-machine'
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private parseCachedContent(html: string): any {
    try {
      const $ = cheerio.load(html);
      
      const title = $('h1, .product-name').first().text().trim();
      const priceText = $('.price, .prc-dsc').first().text().trim();
      const price = parseInt(priceText.replace(/[^\d]/g, '')) || 0;
      
      if (title && price > 0) {
        return {
          title,
          price: { original: price, currency: 'TL' },
          images: [],
          source: 'bing-cache'
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  private parseSitemapContent(xml: string, productId: string): any {
    try {
      // Basic sitemap parsing - usually just contains URLs
      if (xml.includes(productId)) {
        return {
          title: `Product ${productId}`,
          price: { original: 0, currency: 'TL' },
          images: [],
          source: 'sitemap'
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  // Main bypass method that tries all strategies
  async executeAllStrategies(url: string): Promise<any> {
    console.log('🛡️ ADVANCED BYPASS: Executing all strategies...');
    
    const strategies = [
      () => this.tryMobileStealth(url),
      () => this.tryGoogleShoppingAPI(url),
      () => this.tryBingCache(url),
      () => this.tryWaybackMachine(url),
      () => this.tryRSSFeed(url)
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result && result.title && result.price.original >= 0) {
          console.log(`✅ ADVANCED BYPASS SUCCESS via ${result.source}`);
          return result;
        }
        
        // Add delay between strategies
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.log(`❌ Strategy failed: ${error}`);
        continue;
      }
    }

    console.log('❌ All advanced bypass strategies failed');
    return null;
  }
}

export const advancedBypassStrategies = new AdvancedBypassStrategies();