import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';

// Arçelik color mapping for Turkish colors
const arcelikColorMap: { [key: string]: string } = {
  'beyaz': '#FFFFFF',
  'siyah': '#000000',
  'gri': '#808080',
  'kırmızı': '#FF0000',
  'mavi': '#0000FF',
  'yeşil': '#008000',
  'sarı': '#FFFF00',
  'pembe': '#FFC0CB',
  'mor': '#800080',
  'turuncu': '#FFA500',
  'kahverengi': '#8B4513',
  'lacivert': '#000080',
  'bordo': '#800000',
  'gümüş': '#C0C0C0',
  'altın': '#FFD700',
  'metalik': '#464451',
  'antrasit': '#36454F',
  'bej': '#F5F5DC',
  'krem': '#FFFDD0',
  'ekru': '#F4F2E7'
};

interface ArcelikProduct {
  success: boolean;
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
  };
  images: string[];
  features: Array<{ key: string; value: string }>;
  variants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }>;
  tags: string[];
  extractionDetails: {
    scenario: string;
    confidence: number;
    evidence: string[];
    strategy: string;
  };
  error?: string;
}

class ArcelikScraper {
  private async initializeBrowser() {
    return await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });
  }

  private extractPrice(text: string): number {
    // Turkish price extraction for Arçelik
    const priceMatches = text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*(?:TL|₺)/g);
    if (!priceMatches) return 0;

    // Convert Turkish format to number
    const cleanPrice = priceMatches[0]
      .replace(/[^\d,]/g, '')
      .replace(',', '.');
    
    return parseFloat(cleanPrice) || 0;
  }

  private getColorCode(colorName: string): string {
    const normalizedColor = colorName.toLowerCase().trim();
    return arcelikColorMap[normalizedColor] || '#808080';
  }

  private async extractWithPuppeteer(url: string): Promise<ArcelikProduct> {
    let browser;
    
    try {
      browser = await this.initializeBrowser();
      const page = await browser.newPage();
      
      // Set user agent and headers
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });
      
      console.log('🌐 Arçelik sayfası yükleniyor...');
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for content to load
      await page.waitForTimeout(3000);
      
      const content = await page.content();
      const $ = cheerio.load(content);
      
      // Extract basic product information
      const title = $('h1[data-testid="product-title"], .product-title, h1.title').first().text().trim() ||
                   $('h1').first().text().trim() ||
                   'Arçelik Ürün';
      
      const brand = 'Arçelik';
      
      // Price extraction
      let price = 0;
      const priceSelectors = [
        '[data-testid="price"], .price, .current-price, .product-price',
        '.price-current, .price-value, .amount',
        'span[class*="price"], div[class*="price"]'
      ];
      
      for (const selector of priceSelectors) {
        const priceText = $(selector).text();
        if (priceText) {
          price = this.extractPrice(priceText);
          if (price > 0) break;
        }
      }
      
      // Image extraction
      const images: string[] = [];
      const imageSelectors = [
        'img[data-testid="product-image"]',
        '.product-images img',
        '.gallery img',
        'img[src*="arcelik"]',
        'img[alt*="ürün"], img[alt*="product"]'
      ];
      
      for (const selector of imageSelectors) {
        $(selector).each((_, img) => {
          const src = $(img).attr('src') || $(img).attr('data-src');
          if (src && !images.includes(src)) {
            const fullUrl = src.startsWith('http') ? src : `https://www.arcelik.com.tr${src}`;
            images.push(fullUrl);
          }
        });
      }
      
      // Features extraction
      const features: Array<{ key: string; value: string }> = [];
      
      // Try multiple feature selectors
      const featureSelectors = [
        '.specifications .spec-item',
        '.product-features li',
        '.features-list li',
        '[data-testid="feature"]'
      ];
      
      for (const selector of featureSelectors) {
        $(selector).each((_, elem) => {
          const text = $(elem).text().trim();
          if (text.includes(':')) {
            const [key, ...valueParts] = text.split(':');
            features.push({
              key: key.trim(),
              value: valueParts.join(':').trim()
            });
          } else if (text) {
            features.push({
              key: 'Özellik',
              value: text
            });
          }
        });
        if (features.length > 0) break;
      }
      
      // Add default features if none found
      if (features.length === 0) {
        features.push(
          { key: 'Marka', value: 'Arçelik' },
          { key: 'Menşei', value: 'Türkiye' },
          { key: 'Garanti', value: '2 Yıl Resmi Garanti' },
          { key: 'Kalite', value: 'Yüksek Kalite' }
        );
      }
      
      // Variants extraction (Arçelik usually has limited variants)
      const variants: Array<{
        color: string;
        colorCode: string;
        size: string;
        inStock: boolean;
      }> = [];
      
      // Try to find color/size variants
      const colorElements = $('.color-selector .color-option, .variant-color');
      const sizeElements = $('.size-selector .size-option, .variant-size');
      
      if (colorElements.length > 0) {
        colorElements.each((_, elem) => {
          const colorName = $(elem).attr('title') || $(elem).text().trim() || 'Standart';
          variants.push({
            color: colorName,
            colorCode: this.getColorCode(colorName),
            size: 'Standart',
            inStock: true
          });
        });
      } else if (sizeElements.length > 0) {
        sizeElements.each((_, elem) => {
          const sizeName = $(elem).text().trim() || 'Standart';
          variants.push({
            color: 'Standart',
            colorCode: '#808080',
            size: sizeName,
            inStock: !$(elem).hasClass('disabled')
          });
        });
      }
      
      // Generate tags
      const tags = [
        'Arçelik',
        'Beyaz Eşya',
        'Ev Aletleri',
        'Türk Malı',
        'Kaliteli'
      ];
      
      if (title.toLowerCase().includes('buzdolabı')) tags.push('Buzdolabı');
      if (title.toLowerCase().includes('çamaşır')) tags.push('Çamaşır Makinesi');
      if (title.toLowerCase().includes('bulaşık')) tags.push('Bulaşık Makinesi');
      if (title.toLowerCase().includes('fırın')) tags.push('Fırın');
      if (title.toLowerCase().includes('ocak')) tags.push('Ocak');
      if (title.toLowerCase().includes('aspiratör')) tags.push('Aspiratör');
      
      await browser.close();
      
      return {
        success: true,
        title,
        brand,
        price: {
          original: price,
          currency: 'TL',
          formatted: `${price.toFixed(2)} TL`
        },
        images: images.slice(0, 10), // Limit to 10 images
        features,
        variants,
        tags,
        extractionDetails: {
          scenario: 'arcelik-puppeteer',
          confidence: 85,
          evidence: [
            `Başlık: ${title}`,
            `Fiyat: ${price} TL`,
            `Görseller: ${images.length} adet`,
            `Özellikler: ${features.length} adet`
          ],
          strategy: 'Puppeteer + Cheerio çıkarma'
        }
      };
      
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  }

  private async extractWithCheerio(url: string): Promise<ArcelikProduct> {
    try {
      console.log('🔍 Arçelik Cheerio ile çıkarılıyor...');
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 15000
      });
      
      const $ = cheerio.load(response.data);
      
      const title = $('h1').first().text().trim() || 'Arçelik Ürün';
      const brand = 'Arçelik';
      
      // Basic price extraction
      let price = 0;
      $('*').each((_, elem) => {
        const text = $(elem).text();
        if (text.includes('TL') || text.includes('₺')) {
          const extractedPrice = this.extractPrice(text);
          if (extractedPrice > price) {
            price = extractedPrice;
          }
        }
      });
      
      // Basic image extraction
      const images: string[] = [];
      $('img').each((_, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src');
        if (src && src.includes('arcelik')) {
          const fullUrl = src.startsWith('http') ? src : `https://www.arcelik.com.tr${src}`;
          if (!images.includes(fullUrl)) {
            images.push(fullUrl);
          }
        }
      });
      
      // Basic features
      const features = [
        { key: 'Marka', value: 'Arçelik' },
        { key: 'Menşei', value: 'Türkiye' },
        { key: 'Garanti', value: '2 Yıl Resmi Garanti' }
      ];
      
      return {
        success: true,
        title,
        brand,
        price: {
          original: price,
          currency: 'TL',
          formatted: `${price.toFixed(2)} TL`
        },
        images: images.slice(0, 8),
        features,
        variants: [],
        tags: ['Arçelik', 'Beyaz Eşya', 'Türk Malı'],
        extractionDetails: {
          scenario: 'arcelik-cheerio',
          confidence: 70,
          evidence: [
            `Başlık: ${title}`,
            `Fiyat: ${price} TL`,
            `Görseller: ${images.length} adet`
          ],
          strategy: 'Cheerio HTML parsing'
        }
      };
      
    } catch (error) {
      throw new Error(`Cheerio çıkarma hatası: ${error.message}`);
    }
  }

  async extractProduct(url: string): Promise<ArcelikProduct> {
    try {
      console.log(`🔄 Arçelik ürün çıkarma başlatılıyor: ${url}`);
      
      // Try Puppeteer first for better results
      try {
        const puppeteerResult = await this.extractWithPuppeteer(url);
        if (puppeteerResult.success && puppeteerResult.price.original > 0) {
          console.log('✅ Puppeteer ile başarılı çıkarma');
          return puppeteerResult;
        }
      } catch (puppeteerError) {
        console.log('⚠️ Puppeteer hatası, Cheerio deneniyor...', puppeteerError.message);
      }
      
      // Fallback to Cheerio
      try {
        const cheerioResult = await this.extractWithCheerio(url);
        if (cheerioResult.success) {
          console.log('✅ Cheerio ile başarılı çıkarma');
          return cheerioResult;
        }
      } catch (cheerioError) {
        console.log('❌ Cheerio hatası:', cheerioError.message);
      }
      
      // If both fail, return minimal result
      return {
        success: false,
        title: '',
        brand: 'Arçelik',
        price: {
          original: 0,
          currency: 'TL',
          formatted: '0.00 TL'
        },
        images: [],
        features: [],
        variants: [],
        tags: [],
        extractionDetails: {
          scenario: 'failed',
          confidence: 0,
          evidence: ['Çıkarma başarısız'],
          strategy: 'Tüm yöntemler denendi'
        },
        error: 'Arçelik ürün bilgileri çıkarılamadı'
      };
      
    } catch (error) {
      console.error('❌ Arçelik scraper genel hatası:', error);
      return {
        success: false,
        title: '',
        brand: 'Arçelik',
        price: {
          original: 0,
          currency: 'TL',
          formatted: '0.00 TL'
        },
        images: [],
        features: [],
        variants: [],
        tags: [],
        extractionDetails: {
          scenario: 'error',
          confidence: 0,
          evidence: [error.message],
          strategy: 'Hata oluştu'
        },
        error: error.message
      };
    }
  }
}

export const arcelikScraper = new ArcelikScraper();