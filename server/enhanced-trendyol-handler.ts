/**
 * Gelişmiş Trendyol Handler - Kapsamlı ürün bilgisi çıkarma
 */

import * as cheerio from 'cheerio';

export interface TrendyolProductData {
  title: string;
  brand: string;
  price: number;
  description: string;
  images: string[];
  variants: Array<{
    color: string;
    size: string;
    stock: number;
    price: number;
    inStock: boolean;
    sku: string;
    images: string[];
  }>;
  features: Array<{
    key: string;
    value: string;
  }>;
  categories: string[];
  rating: {
    score: number;
    count: number;
  };
  seller: {
    name: string;
    rating: number;
  };
}

export class EnhancedTrendyolHandler {
  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  /**
   * URL çözümleyici - kısaltılmış URL'leri çözer
   */
  private static async resolveUrl(url: string): Promise<string> {
    try {
      console.log(`🔗 URL çözümleniyor: ${url}`);
      
      // ty.gl kısaltılmış URL kontrolü
      if (url.includes('ty.gl/')) {
        console.log('🔄 Trendyol kısaltılmış URL tespit edildi, çözümleniyor...');
        
        // Browser ile redirect takip et
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
          ]
        });
        
        try {
          const page = await browser.newPage();
          await page.setUserAgent(this.USER_AGENTS[0]);
          
          // Redirect'i takip et
          console.log('🌐 Tarayıcı ile URL takip ediliyor...');
          await page.goto(url, { 
            waitUntil: 'networkidle0',
            timeout: 15000 
          });
          
          const finalUrl = page.url();
          console.log(`✅ Çözümlenen URL: ${finalUrl}`);
          
          await browser.close();
          return finalUrl;
          
        } catch (error) {
          console.error('❌ Puppeteer URL çözümleme hatası:', error);
          await browser.close();
          throw error;
        }
      }
      
      // Normal URL ise direkt döndür
      return url;
      
    } catch (error) {
      console.error('❌ URL çözümleme hatası:', error);
      
      // Fallback: HTTP redirect takip
      try {
        console.log('🔄 Fallback: HTTP redirect takip ediliyor...');
        const axios = require('axios');
        
        const response = await axios.get(url, {
          maxRedirects: 10,
          timeout: 10000,
          headers: {
            'User-Agent': this.USER_AGENTS[0]
          },
          validateStatus: function (status) {
            return status < 400; // 3xx ve 2xx kabul et
          }
        });
        
        const finalUrl = response.request.res.responseUrl || url;
        console.log(`✅ HTTP redirect çözümlendi: ${finalUrl}`);
        return finalUrl;
        
      } catch (fallbackError) {
        console.error('❌ Fallback URL çözümleme de başarısız:', fallbackError);
        return url; // Orijinal URL'i döndür
      }
    }
  }
  
  /**
   * Ana ürün extraction fonksiyonu
   */
  static async extractProduct(url: string): Promise<{
    success: boolean;
    data?: TrendyolProductData;
    error?: string;
  }> {
    try {
      console.log(`🔍 Trendyol extraction başlatılıyor: ${url}`);
      
      // URL'yi çözümle (kısaltılmış URL'ler için)
      const resolvedUrl = await this.resolveUrl(url);
      console.log(`🔗 Çözümlenen URL: ${resolvedUrl}`);
      
      // HTML içeriği al
      const htmlContent = await this.fetchPageContent(resolvedUrl);
      
      // Cheerio ile parse
      const $ = cheerio.load(htmlContent);
      
      // Product state JSON'ını çıkar
      const productState = this.extractProductState(htmlContent);
      if (!productState) {
        throw new Error('Product state bulunamadı');
      }
      
      // Temel bilgileri çıkar
      const basicInfo = this.extractBasicInfo(productState, $);
      
      // Görselleri çıkar
      const images = this.extractImages(productState, htmlContent);
      
      // Varyantları çıkar
      const variants = this.extractVariants(productState);
      
      // Özellikleri çıkar
      const features = this.extractFeatures(productState, $);
      
      // Kategori bilgilerini çıkar
      const categories = this.extractCategories(productState, $);
      
      const productData: TrendyolProductData = {
        title: basicInfo.title,
        brand: basicInfo.brand,
        price: basicInfo.price,
        description: basicInfo.description,
        images,
        variants: variants.filter(v => v.inStock), // Sadece stokta olanlar
        features,
        categories,
        rating: basicInfo.rating,
        seller: basicInfo.seller
      };
      
      console.log(`✅ Extraction tamamlandı: ${variants.length} varyant, ${images.length} görsel`);
      
      return {
        success: true,
        data: productData
      };
      
    } catch (error) {
      console.error('❌ Extraction hatası:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Sayfa içeriğini fetch et
   */
  private static async fetchPageContent(url: string): Promise<string> {
    const userAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.text();
  }
  
  /**
   * Product state JSON'ını çıkar
   */
  private static extractProductState(htmlContent: string): any {
    const regex = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
    const match = htmlContent.match(regex);
    
    if (!match) {
      throw new Error('Product state bulunamadı');
    }
    
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      throw new Error('Product state parse edilemedi');
    }
  }
  
  /**
   * Temel bilgileri çıkar
   */
  private static extractBasicInfo(productState: any, $: cheerio.CheerioAPI): {
    title: string;
    brand: string;
    price: number;
    description: string;
    rating: { score: number; count: number };
    seller: { name: string; rating: number };
  } {
    const product = productState.product;
    
    return {
      title: product?.name || $('h1').first().text().trim() || 'Ürün',
      brand: product?.brand?.name || 'Bilinmiyor',
      price: product?.price?.sellingPrice?.value ? product.price.sellingPrice.value / 100 : 0,
      description: product?.description || product?.name || '',
      rating: {
        score: product?.ratingScore?.averageRating || 0,
        count: product?.ratingScore?.totalRatingCount || 0
      },
      seller: {
        name: product?.merchant?.name || 'Bilinmiyor',
        rating: product?.merchant?.rating || 0
      }
    };
  }
  
  /**
   * Görselleri çıkar
   */
  private static extractImages(productState: any, htmlContent: string): string[] {
    const images = new Set<string>();
    const product = productState.product;
    
    // Product state'den ana görseller
    if (product?.images) {
      product.images.forEach((img: any) => {
        if (img?.url && img.url.includes('dsmcdn.com')) {
          images.add(img.url);
        }
      });
    }
    
    // Varyant görselleri
    if (product?.allVariants) {
      product.allVariants.forEach((variant: any) => {
        if (variant?.images) {
          variant.images.forEach((img: any) => {
            const url = typeof img === 'string' ? img : img?.url;
            if (url && url.includes('dsmcdn.com')) {
              images.add(url);
            }
          });
        }
      });
    }
    
    // HTML'den ek görseller
    const imageMatches = htmlContent.matchAll(/"(https?:\/\/[^"]*dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp)[^"]*)"/gi);
    for (const match of imageMatches) {
      if (match[1] && 
          match[1].includes('prod/') && 
          !match[1].includes('web-pdp') &&
          !match[1].includes('placeholder')) {
        images.add(match[1]);
      }
    }
    
    return Array.from(images).slice(0, 10); // İlk 10 görsel
  }
  
  /**
   * Varyantları çıkar
   */
  private static extractVariants(productState: any): Array<{
    color: string;
    size: string;
    stock: number;
    price: number;
    inStock: boolean;
    sku: string;
    images: string[];
  }> {
    const product = productState.product;
    const variants: any[] = [];
    
    if (!product?.allVariants) {
      return variants;
    }
    
    product.allVariants.forEach((variant: any) => {
      const attributes = variant.attributes || {};
      const color = attributes.RENK || attributes.Renk || variant.color || '';
      const size = attributes.BEDEN || attributes.Beden || variant.size || '';
      
      // Skip variants with default/empty values
      if (!color || color.toLowerCase().includes('varsayılan') || 
          !size || size.toLowerCase().includes('standart') || size.toLowerCase().includes('tek beden')) {
        return;
      }
      
      const stock = variant.stock || variant.stockCount || 0;
      const inStock = stock > 0;
      
      let price = 0;
      if (variant.price?.sellingPrice?.value) {
        price = variant.price.sellingPrice.value / 100;
      } else if (product.price?.sellingPrice?.value) {
        price = product.price.sellingPrice.value / 100;
      }
      
      const variantImages = variant.images?.map((img: any) => 
        typeof img === 'string' ? img : img?.url
      ).filter(Boolean) || [];
      
      if (inStock && price > 0) {
        variants.push({
          color,
          size,
          stock,
          price,
          inStock,
          sku: `${color.toLowerCase().replace(/\s+/g, '-')}-${size.toLowerCase().replace(/\s+/g, '-')}`,
          images: variantImages
        });
      }
    });
    
    return variants;
  }
  
  /**
   * Özellikleri çıkar
   */
  private static extractFeatures(productState: any, $: cheerio.CheerioAPI): Array<{
    key: string;
    value: string;
  }> {
    const features: Array<{ key: string; value: string }> = [];
    const product = productState.product;
    
    // Product state'den özellikler
    if (product?.attributes) {
      Object.entries(product.attributes).forEach(([key, value]: [string, any]) => {
        if (key && value && typeof value === 'string' && value.length < 50) {
          features.push({ key, value });
        }
      });
    }
    
    // DOM'dan özellikler
    $('.product-feature-list li, .detail-attr-item').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes(':')) {
        const [key, ...valueParts] = text.split(':');
        const value = valueParts.join(':').trim();
        if (key && value && key.length < 30 && value.length < 50) {
          features.push({ 
            key: key.trim(), 
            value: value 
          });
        }
      }
    });
    
    return features.slice(0, 15); // İlk 15 özellik
  }
  
  /**
   * Kategorileri çıkar
   */
  private static extractCategories(productState: any, $: cheerio.CheerioAPI): string[] {
    const categories: string[] = [];
    const product = productState.product;
    
    // Product state'den kategoriler
    if (product?.category) {
      const categoryPath = product.category.hierarchy || product.category.name;
      if (categoryPath) {
        categories.push(categoryPath);
      }
    }
    
    // Breadcrumb'dan kategoriler
    $('.breadcrumb a, .breadcrumb-item').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text && text !== 'Ana Sayfa' && text.length > 2) {
        categories.push(text);
      }
    });
    
    return [...new Set(categories)]; // Tekrarları kaldır
  }
}

// Export the main function for external use
export async function scrapeTrendyolProduct(url: string): Promise<{
  success: boolean;
  data?: TrendyolProductData;
  error?: string;
}> {
  return EnhancedTrendyolHandler.extractProduct(url);
}