import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { arcelikImageExtractor } from './arcelik-image-extractor';

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
    // Enhanced Turkish price extraction for Arçelik
    // Handle formats like: 38.988 TL, 38,988 TL, 38988 TL
    const pricePatterns = [
      /(\d{1,3}(?:\.\d{3})+)\s*(?:TL|₺)/g,  // 38.988 TL format
      /(\d{1,3}(?:,\d{3})+)\s*(?:TL|₺)/g,   // 38,988 TL format  
      /(\d+)\s*(?:TL|₺)/g                    // 38988 TL format
    ];
    
    for (const pattern of pricePatterns) {
      const matches = text.match(pattern);
      if (matches) {
        // Extract the number part
        const numberPart = matches[0].replace(/[^\d\.,]/g, '');
        
        // Handle Turkish thousands separator (. or ,)
        let cleanNumber;
        if (numberPart.includes('.') && numberPart.lastIndexOf('.') !== numberPart.length - 3) {
          // Has thousands separator (dots)
          cleanNumber = numberPart.replace(/\./g, '');
        } else if (numberPart.includes(',') && numberPart.lastIndexOf(',') !== numberPart.length - 3) {
          // Has thousands separator (commas)
          cleanNumber = numberPart.replace(/,/g, '');
        } else {
          cleanNumber = numberPart;
        }
        
        const price = parseFloat(cleanNumber);
        if (price > 0) return price;
      }
    }
    
    return 0;
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
      
      // Extract product information using Arçelik-specific selectors
      const title = $('h1').first().text().trim() ||
                   $('.product-name, .product-title').first().text().trim() ||
                   'Arçelik Ürün';
      
      const brand = 'Arçelik';
      
      // Price extraction with Arçelik-specific selectors
      let price = 0;
      const priceSelectors = [
        '.price-value',
        '.current-price', 
        '.product-price',
        '[class*="price"]',
        'script[type="application/ld+json"]' // JSON-LD structured data
      ];
      
      // First try direct price selectors
      for (const selector of priceSelectors.slice(0, -1)) {
        const priceText = $(selector).text();
        if (priceText) {
          price = this.extractPrice(priceText);
          if (price > 0) break;
        }
      }
      
      // If no price found, try JSON-LD structured data
      if (price === 0) {
        $('script[type="application/ld+json"]').each((_, script) => {
          try {
            const jsonData = JSON.parse($(script).html() || '');
            if (jsonData.offers && jsonData.offers.price) {
              price = parseFloat(jsonData.offers.price);
            } else if (jsonData['@type'] === 'Product' && jsonData.offers) {
              const offers = Array.isArray(jsonData.offers) ? jsonData.offers[0] : jsonData.offers;
              if (offers.price) {
                price = parseFloat(offers.price);
              }
            }
          } catch (e) {
            // Ignore JSON parsing errors
          }
          if (price > 0) return false; // Break out of each loop
        });
      }
      
      // Fallback: search all text content for price patterns
      if (price === 0) {
        const allText = $('body').text();
        price = this.extractPrice(allText);
      }
      
      // Enhanced image extraction for Arçelik
      const images: string[] = [];
      const imageSelectors = [
        'img[src*="media/resize"]', // Arçelik specific image CDN
        'img[src*="arcelik.com.tr"]',
        '.product-gallery img',
        '.gallery img',
        '.product-images img',
        '.swiper-slide img',
        '.slider img',
        'img[alt*="Arçelik"]',
        'img[src*="2000Wx2000H"]', // High-res Arçelik images
        'img[src*="1920Wx1920H"]', // High-res images
        'img[src*="800Wx800H"]', // Medium-res images
        'img[src*="400Wx400H"]', // Thumbnail images
        'img[data-src]',
        'img[data-original]',
        'img[data-lazy]',
        'img[src]'
      ];
      
      for (const selector of imageSelectors) {
        $(selector).each((_, img) => {
          let src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
          if (src) {
            // Convert to full URL
            if (src.startsWith('//')) {
              src = 'https:' + src;
            } else if (src.startsWith('/')) {
              src = 'https://www.arcelik.com.tr' + src;
            }
            
            // Filter valid Arçelik product images
            if (src && src.length > 20 && 
                (src.includes('arcelik.com.tr') || src.includes('media/resize') || src.includes('product') || 
                 src.includes('_LOW_') || src.includes('klima') || src.includes('.jpg') || src.includes('.png') || src.includes('.webp')) &&
                !src.includes('logo') && !src.includes('icon') && !src.includes('favicon') && 
                !src.includes('sprite') && !images.includes(src)) {
              images.push(src);
            }
          }
        });
      }
      
      // Also check for images in JavaScript/JSON data
      const scriptContent = $('script').text();
      const imageUrlMatches = scriptContent.match(/https?:\/\/[^"'\s]*\.(jpg|jpeg|png|webp|gif)/gi);
      if (imageUrlMatches) {
        imageUrlMatches.forEach(url => {
          if (!images.includes(url) && url.length > 20 && 
              (url.includes('product') || url.includes('klima') || url.includes('arcelik'))) {
            images.push(url);
          }
        });
      }
      
      // Extract images from data attributes and lazy loading
      $('img, [data-src], [data-image]').each((_, img) => {
        const dataSrc = $(img).attr('data-src') || $(img).attr('data-image') || $(img).attr('data-lazy');
        if (dataSrc && dataSrc.includes('http') && !images.includes(dataSrc)) {
          images.push(dataSrc);
        }
      });
      
      // Enhanced features extraction for Arçelik technical specifications
      const features: Array<{ key: string; value: string }> = [];
      
      // Extract technical specifications table
      $('table tr, .spec-row, .specification-item, .product-spec tr, .features-table tr').each((_, row) => {
        const cells = $(row).find('td, .spec-key, .spec-value, th');
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim();
          if (key && value && key !== value && value.length > 0) {
            features.push({ key, value });
          }
        }
      });
      
      // Extract from product details sections
      $('.product-detail, .product-info, .details-section').each((_, section) => {
        const title = $(section).find('h3, h4, .title').text().trim();
        const content = $(section).find('p, .content, .desc').text().trim();
        if (title && content && title !== content) {
          features.push({ key: title, value: content });
        }
      });
      
      // Extract from definition lists
      $('dl dt').each((_, dt) => {
        const key = $(dt).text().trim();
        const value = $(dt).next('dd').text().trim();
        if (key && value) {
          features.push({ key, value });
        }
      });
      
      // Extract from structured feature sections
      $('.product-feature, .feature-item, [class*="spec"], .attribute, .property').each((_, elem) => {
        const text = $(elem).text().trim();
        if (text.includes(':')) {
          const parts = text.split(':');
          if (parts.length >= 2) {
            features.push({
              key: parts[0].trim(),
              value: parts.slice(1).join(':').trim()
            });
          }
        }
      });
      
      // Extract energy efficiency and technical specs from meta data
      const energyMatch = bodyText.match(/Enerji Sınıfı[:\s]*([A-Z\+\-]+)/i);
      if (energyMatch) {
        features.push({ key: 'Enerji Sınıfı', value: energyMatch[1] });
      }
      
      const btuMatch = bodyText.match(/(\d+\.?\d*)\s*Btu/i);
      if (btuMatch) {
        features.push({ key: 'Soğutma Kapasitesi', value: btuMatch[1] + ' Btu/h' });
      }
      
      const powerMatch = bodyText.match(/(\d+\.?\d*)\s*kW/i);
      if (powerMatch) {
        features.push({ key: 'Güç Tüketimi', value: powerMatch[1] + ' kW' });
      }
      
      // Extract specific Arçelik features from visible text patterns
      const bodyText = $('body').text();
      const featurePatterns = [
        /Soğutma Kapasitesi[:\s]*(\d+[^#\n]*)/i,
        /Isıtma Kapasitesi[:\s]*([^#\n]*)/i,
        /Enerji Sınıfı[:\s]*([^#\n]*)/i,
        /Voltaj[:\s]*([^#\n]*)/i,
        /Soğutucu Akışkan[:\s]*([^#\n]*)/i,
        /Dış Ünite[:\s]*([^#\n]*)/i,
        /İç Ünite[:\s]*([^#\n]*)/i
      ];
      
      featurePatterns.forEach(pattern => {
        const match = bodyText.match(pattern);
        if (match) {
          const key = match[0].split(/[:\s]/)[0];
          const value = match[1].trim();
          if (value) {
            features.push({ key, value });
          }
        }
      });
      
      // Add product category specific features
      if (title.toLowerCase().includes('klima')) {
        if (!features.some(f => f.key.includes('Kategori'))) {
          features.push({ key: 'Kategori', value: 'Klima Sistemi' });
        }
        if (!features.some(f => f.key.includes('Tip'))) {
          features.push({ key: 'Tip', value: 'Split Klima' });
        }
      }
      
      // Add standard Arçelik features
      const defaultFeatures = [
        { key: 'Marka', value: 'Arçelik' },
        { key: 'Menşei', value: 'Türkiye' },
        { key: 'Garanti', value: '2 Yıl Resmi Garanti' },
        { key: 'Üretici', value: 'Arçelik A.Ş.' }
      ];
      
      defaultFeatures.forEach(defaultFeature => {
        if (!features.some(f => f.key === defaultFeature.key)) {
          features.push(defaultFeature);
        }
      });
      
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
      
      // Enhanced image extraction using dedicated extractor
      const imageData = await arcelikImageExtractor.extractImages(url);
      const images = imageData.images;
      
      // Enhanced features extraction
      const features: Array<{ key: string; value: string }> = [];
      
      // Extract from tables and specification sections
      $('table tr, .spec-table tr, .features tr, .product-features li').each((_, elem) => {
        const cells = $(elem).find('td, th');
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim();
          if (key && value && key !== value) {
            features.push({ key, value });
          }
        }
        
        // Also check list items with colon separation
        const text = $(elem).text().trim();
        if (text.includes(':')) {
          const [key, ...valueParts] = text.split(':');
          const value = valueParts.join(':').trim();
          if (key && value) {
            features.push({ key: key.trim(), value });
          }
        }
      });
      
      // Extract from meta tags and structured data
      $('meta[property], meta[name]').each((_, meta) => {
        const property = $(meta).attr('property') || $(meta).attr('name');
        const content = $(meta).attr('content');
        if (property && content) {
          if (property.includes('product') || property.includes('price') || property.includes('brand')) {
            features.push({ key: property, value: content });
          }
        }
      });
      
      // Extract technical specifications from page text
      const pageText = $('body').text();
      const specPatterns = [
        /Enerji Sınıfı[:\s]*([A-Z\+\-]+)/i,
        /(\d+\.?\d*)\s*BTU/i,
        /(\d+\.?\d*)\s*kW/i,
        /Soğutma Kapasitesi[:\s]*([^\n]+)/i,
        /Isıtma Kapasitesi[:\s]*([^\n]+)/i,
        /Soğutucu Akışkan[:\s]*([^\n]+)/i,
        /Voltaj[:\s]*([^\n]+)/i,
        /Garanti[:\s]*([^\n]+)/i
      ];
      
      specPatterns.forEach(pattern => {
        const match = pageText.match(pattern);
        if (match) {
          let key = 'Özellik';
          let value = match[0];
          
          if (match[0].includes('Enerji')) key = 'Enerji Sınıfı';
          else if (match[0].includes('BTU')) key = 'Soğutma Kapasitesi';
          else if (match[0].includes('kW')) key = 'Güç Tüketimi';
          else if (match[0].includes('Soğutma')) key = 'Soğutma Kapasitesi';
          else if (match[0].includes('Isıtma')) key = 'Isıtma Kapasitesi';
          else if (match[0].includes('Akışkan')) key = 'Soğutucu Akışkan';
          else if (match[0].includes('Voltaj')) key = 'Voltaj';
          else if (match[0].includes('Garanti')) key = 'Garanti Süresi';
          
          value = match[1] || match[0];
          features.push({ key, value: value.trim() });
        }
      });
      
      // Add default Arçelik features if not found
      const defaultFeatures = [
        { key: 'Marka', value: 'Arçelik' },
        { key: 'Menşei', value: 'Türkiye' },
        { key: 'Garanti', value: '2 Yıl Resmi Garanti' },
        { key: 'Üretici', value: 'Arçelik A.Ş.' }
      ];
      
      defaultFeatures.forEach(defaultFeature => {
        if (!features.some(f => f.key === defaultFeature.key)) {
          features.push(defaultFeature);
        }
      });
      
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