import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Failover Extraction Service
 * Ana sistem başarısız olduğunda alternatif stratejilerle veri çeker
 */
export class FailoverExtractionService {
  private static instance: FailoverExtractionService;
  
  private constructor() {}
  
  public static getInstance(): FailoverExtractionService {
    if (!FailoverExtractionService.instance) {
      FailoverExtractionService.instance = new FailoverExtractionService();
    }
    return FailoverExtractionService.instance;
  }

  /**
   * Strateji bazlı extraction
   */
  async extractWithStrategy(url: string, strategy: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    console.log(`🔄 Failover extraction: ${strategy} strategy for ${url}`);
    
    switch (strategy) {
      case 'mobile-api':
        return await this.extractFromMobileAPI(url);
      
      case 'cheerio':
        return await this.extractWithCheerio(url);
      
      case 'cached':
        return await this.extractFromCache(url);
      
      case 'puppeteer':
      default:
        return {
          success: false,
          error: 'Puppeteer strategy should be handled by main service'
        };
    }
  }

  /**
   * Trendyol Mobile API'den veri çekme
   */
  private async extractFromMobileAPI(url: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      // URL'den product ID çıkar
      const productIdMatch = url.match(/\/p-(\d+)/);
      if (!productIdMatch) {
        return {
          success: false,
          error: 'Product ID not found in URL'
        };
      }
      
      const productId = productIdMatch[1];
      
      // Mobile API endpoint
      const apiUrl = `https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`;
      
      console.log(`📱 Fetching from Mobile API: ${apiUrl}`);
      
      const response = await axios.get(apiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
          'Accept': 'application/json',
          'Accept-Language': 'tr-TR,tr;q=0.9'
        },
        timeout: 15000
      });
      
      if (!response.data || !response.data.result) {
        return {
          success: false,
          error: 'Invalid API response'
        };
      }
      
      const product = response.data.result;
      
      // Varyantları çıkar
      const variants = [];
      if (product.allVariants && Array.isArray(product.allVariants)) {
        for (const variant of product.allVariants) {
          variants.push({
            color: variant.attributeValue || variant.value || 'Varsayılan',
            size: 'Tek Beden',
            price: variant.price?.sellingPrice || product.price?.sellingPrice || 0,
            inStock: variant.inStock !== false,
            stockCount: variant.inStock ? 1 : 0
          });
        }
      }
      
      // Fiyat bilgisi
      const price = product.price?.sellingPrice || 0;
      const originalPrice = product.price?.originalPrice || price;
      
      return {
        success: true,
        data: {
          title: product.name || '',
          brand: product.brand?.name || '',
          price,
          originalPrice,
          inStock: product.productGroupId ? true : false,
          variants,
          images: product.images?.map((img: any) => img.url) || [],
          strategy: 'mobile-api',
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('❌ Mobile API extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cheerio ile lightweight scraping
   */
  private async extractWithCheerio(url: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      console.log(`🧹 Fetching with Cheerio: ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 20000
      });
      
      const $ = cheerio.load(response.data);
      
      // JSON-LD verisi çıkar
      let jsonLdData: any = null;
      $('script[type="application/ld+json"]').each((_, elem) => {
        try {
          const jsonData = JSON.parse($(elem).html() || '');
          if (jsonData['@type'] === 'Product') {
            jsonLdData = jsonData;
          }
        } catch (e) {
          // Ignore parse errors
        }
      });
      
      // __NEXT_DATA__ veya __PRODUCT_DETAIL_APP_INITIAL_STATE__ çıkar
      let productData: any = null;
      $('script').each((_, elem) => {
        const scriptContent = $(elem).html() || '';
        
        if (scriptContent.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')) {
          try {
            const match = scriptContent.match(/__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/);
            if (match) {
              productData = JSON.parse(match[1]);
            }
          } catch (e) {
            // Ignore
          }
        }
        
        if (scriptContent.includes('__NEXT_DATA__')) {
          try {
            const match = scriptContent.match(/__NEXT_DATA__\s*=\s*({.+?})\s*;?$/m);
            if (match) {
              const nextData = JSON.parse(match[1]);
              if (nextData.props?.pageProps?.product) {
                productData = nextData.props.pageProps;
              }
            }
          } catch (e) {
            // Ignore
          }
        }
      });
      
      // Veri birleştirme
      const extractedData: any = {
        strategy: 'cheerio',
        timestamp: new Date().toISOString()
      };
      
      if (jsonLdData) {
        extractedData.title = jsonLdData.name;
        extractedData.brand = jsonLdData.brand?.name || '';
        extractedData.price = parseFloat(jsonLdData.offers?.price || '0');
        extractedData.inStock = jsonLdData.offers?.availability === 'https://schema.org/InStock';
        extractedData.images = Array.isArray(jsonLdData.image) ? jsonLdData.image : [jsonLdData.image].filter(Boolean);
      }
      
      if (productData) {
        const product = productData.product || productData;
        extractedData.title = extractedData.title || product.name;
        extractedData.brand = extractedData.brand || product.brand?.name;
        extractedData.price = extractedData.price || product.price?.sellingPrice;
        extractedData.originalPrice = product.price?.originalPrice;
        
        // Varyantlar
        if (product.allVariants && Array.isArray(product.allVariants)) {
          extractedData.variants = product.allVariants.map((v: any) => ({
            color: v.attributeValue || v.value || 'Varsayılan',
            size: 'Tek Beden',
            price: v.price?.sellingPrice || extractedData.price || 0,
            inStock: v.inStock !== false,
            stockCount: v.inStock ? 1 : 0
          }));
        }
        
        if (product.images && Array.isArray(product.images)) {
          extractedData.images = product.images.map((img: any) => img.url || img);
        }
      }
      
      // Eksik veriler için DOM'dan çıkarma
      if (!extractedData.title) {
        extractedData.title = $('h1.pr-new-br').first().text().trim() ||
                              $('.product-detail-name').first().text().trim() ||
                              $('meta[property="og:title"]').attr('content') || '';
      }
      
      if (!extractedData.price) {
        const priceText = $('.prc-slg').first().text().trim() ||
                         $('.prc-dsc').first().text().trim();
        if (priceText) {
          extractedData.price = parseFloat(priceText.replace(/[^\d,]/g, '').replace(',', '.'));
        }
      }
      
      // Başarı kontrolü
      if (!extractedData.title || !extractedData.price) {
        return {
          success: false,
          error: 'Insufficient data extracted'
        };
      }
      
      return {
        success: true,
        data: extractedData
      };
      
    } catch (error) {
      console.error('❌ Cheerio extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Cache'den veri çekme (Google Cache, Wayback Machine)
   */
  private async extractFromCache(url: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      console.log(`📦 Attempting cache extraction for: ${url}`);
      
      // Google Cache deneme
      const googleCacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
      
      try {
        const response = await axios.get(googleCacheUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 15000
        });
        
        // Cheerio ile parse et
        const result = await this.parseHtmlContent(response.data);
        if (result.success) {
          return {
            ...result,
            data: {
              ...result.data,
              strategy: 'cached-google',
              cacheSource: 'Google Cache'
            }
          };
        }
      } catch (googleError) {
        console.log('⚠️ Google Cache failed, trying alternatives...');
      }
      
      // Wayback Machine deneme
      try {
        const waybackApiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
        const waybackResponse = await axios.get(waybackApiUrl, { timeout: 10000 });
        
        if (waybackResponse.data?.archived_snapshots?.closest?.available) {
          const snapshotUrl = waybackResponse.data.archived_snapshots.closest.url;
          
          const snapshotContent = await axios.get(snapshotUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
          });
          
          const result = await this.parseHtmlContent(snapshotContent.data);
          if (result.success) {
            return {
              ...result,
              data: {
                ...result.data,
                strategy: 'cached-wayback',
                cacheSource: 'Wayback Machine',
                snapshotDate: waybackResponse.data.archived_snapshots.closest.timestamp
              }
            };
          }
        }
      } catch (waybackError) {
        console.log('⚠️ Wayback Machine failed');
      }
      
      return {
        success: false,
        error: 'No cache source available'
      };
      
    } catch (error) {
      console.error('❌ Cache extraction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * HTML içeriğini parse et
   */
  private async parseHtmlContent(html: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    // Cheerio extraction kullan
    return {
      success: false,
      error: 'Cache parsing not fully implemented'
    };
  }
}

export const failoverExtractionService = FailoverExtractionService.getInstance();
