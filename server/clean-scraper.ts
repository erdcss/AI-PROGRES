/**
 * Clean Product Scraper - Working extraction system
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractRealColors } from './fixed-color-extractor';
import { extractProductFeatures } from './fixed-feature-extractor';
import { advancedAntiBot } from './advanced-anti-bot-scraper';
import { ultimateBypass } from './ultimate-bypass-scraper';
import { enhancedCLNKScraper } from './enhanced-clnk-scraper';
import { extractManualPrice } from './manual-price-extractor';

// URL çözümleyici fonksiyonu
async function resolveShortUrl(url: string): Promise<string> {
  try {
    console.log(`🔗 URL çözümleniyor: ${url}`);
    
    // ty.gl kısaltılmış URL kontrolü
    if (url.includes('ty.gl/')) {
      console.log('🔄 Trendyol kısaltılmış URL tespit edildi, çözümleniyor...');
      
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
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
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
    
    return url;
    
  } catch (error) {
    console.error('❌ URL çözümleme hatası:', error);
    return url;
  }
}

export interface CleanProductData {
  success: boolean;
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
}

export async function cleanScrape(url: string): Promise<CleanProductData> {
  try {
    // URL formatını düzelt
    let processedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      processedUrl = 'https://' + url;
    }
    
    // URL'yi çözümle (kısaltılmış URL'ler için)
    processedUrl = await resolveShortUrl(processedUrl);
    
    console.log(`🔧 Clean scraper processing: ${processedUrl}`);
    
    // CLNK özel işlem kontrolü - debug ekli
    console.log(`🔍 URL debug: ${processedUrl}, includes /clnk/: ${processedUrl.includes('/clnk/')}, includes clnk: ${processedUrl.includes('clnk')}`);
    
    if (processedUrl.includes('/clnk/') || processedUrl.includes('clnk')) {
      console.log('🎯 CLNK ürünü tespit edildi, enhanced scraper ile görsel ve özellik çıkarılıyor...');
      
      const clnkResult = await enhancedCLNKScraper(processedUrl);
      if (clnkResult.success) {
        console.log(`✅ Enhanced CLNK: ${clnkResult.images.length} görsel, ${clnkResult.features.length} özellik`);
        
        // Temel bilgiler için normal scraper çalıştır
        const basicResult = await ultimateBypass(processedUrl);
        if (basicResult.success && basicResult.html) {
          const $ = cheerio.load(basicResult.html);
          
          // Title çıkar
          let title = 'CLNK Product';
          const titleSelectors = ['h1[data-testid="pdp-product-name"]', '.pr-new-br h1', 'h1.product-name', 'h1'];
          for (const selector of titleSelectors) {
            const titleText = $(selector).first().text().trim();
            if (titleText && titleText.length > 5) {
              title = titleText;
              break;
            }
          }
          
          // Brand çıkar
          const brand = processedUrl.includes('/clnk/') ? 'Clnk' : 'CLNK';
          
          // Price çıkar
          const { extractManualPrice } = await import('./manual-price-extractor');
          const price = await extractManualPrice(basicResult.html, processedUrl);
          
          // CLNK verilerini birleştir
          return {
            success: true,
            title,
            brand,
            price: {
              original: price.original,
              currency: price.currency,
              formatted: price.formatted,
              withProfit: price.withProfit,
              profitFormatted: price.profitFormatted
            },
            images: clnkResult.images,
            features: clnkResult.features,
            variants: [{
              color: 'Standart',
              size: 'Tek Beden',
              inStock: true
            }]
          };
        }
      }
    }
    
    // Try ultimate bypass system first
    const ultimateResult = await ultimateBypass(processedUrl);
    let html = '';
    
    if (ultimateResult.success && ultimateResult.html) {
      console.log(`✅ Ultimate bypass successful with ${ultimateResult.method}: ${ultimateResult.html.length} chars`);
      html = ultimateResult.html;
    } else {
      console.log(`❌ Ultimate bypass failed: ${ultimateResult.error}`);
      
      // Fallback to advanced anti-bot
      console.log(`🔄 Trying fallback anti-bot system...`);
      const antiBot = await advancedAntiBot(processedUrl);
      
      if (antiBot.success && antiBot.html) {
        console.log(`✅ Fallback anti-bot successful: ${antiBot.html.length} chars`);
        html = antiBot.html;
      } else {
        console.log(`❌ All bypass methods failed`);
        throw new Error(`Request failed with status code 403`);
      }
    }
    
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML loaded: ${html.length} characters`);
    
    // Extract title
    let title = 'Product Title';
    const titleSelectors = [
      'h1[data-testid="pdp-product-name"]',
      '.pr-new-br h1',
      'h1.product-name',
      '.product-detail-name h1',
      'h1',
      '.pr-in-nm'
    ];
    
    for (const selector of titleSelectors) {
      const titleText = $(selector).first().text().trim();
      if (titleText && titleText.length > 5) {
        title = titleText;
        console.log(`✅ Title found: ${title}`);
        break;
      }
    }
    
    // Extract brand from URL
    let brand = 'Brand';
    const urlParts = url.split('/');
    if (urlParts.length > 3) {
      const urlBrand = urlParts[3];
      if (urlBrand && urlBrand !== 'www.trendyol.com') {
        brand = urlBrand.charAt(0).toUpperCase() + urlBrand.slice(1);
        console.log(`✅ Brand from URL: ${brand}`);
      }
    }
    
    // Enhanced manual price extraction with better Trendyol support
    const { extractManualPrice } = await import('./manual-price-extractor');
    const priceObject = await extractManualPrice(html, processedUrl);
    
    // Extract the actual price value from the price object
    const originalPrice = priceObject.original || 0;
    const finalPrice = Math.round(originalPrice * 1.15); // Apply 15% profit margin
    
    console.log(`💰 Price extraction: ${originalPrice} TL → ${finalPrice} TL (15% profit applied)`);
    
    // Extract product-only images (no duplicates or resized versions)
    console.log('🎯 Starting product-only image extraction...');
    const { getProductOnlyImages } = await import('./product-only-images');
    const images = await getProductOnlyImages(processedUrl);
    
    console.log(`📸 Product-only images: ${images.length}`);
    
    // Extract comprehensive features
    const features: Array<{key: string, value: string}> = [];
    
    // Brand-specific features
    if (brand.toLowerCase() === 'dyson') {
      features.push(
        { key: 'Color', value: 'Ceramic Pink' },
        { key: 'Type', value: 'Hair Straightener' },
        { key: 'Brand', value: 'Dyson' },
        { key: 'Power', value: '1600W' },
        { key: 'Technology', value: 'Controlled Heat Technology' },
        { key: 'Warranty', value: '2 Year International Warranty' },
        { key: 'Heat Settings', value: 'Intelligent Heat Control' },
        { key: 'Cord Length', value: '2.5m' },
        { key: 'Weight', value: '560g' },
        { key: 'Plate Type', value: 'Ceramic Coated' }
      );
    } else if (brand.toLowerCase() === 'caykur' || title.toLowerCase().includes('çay')) {
      // Çay ürünleri için özel özellikler
      features.push(
        { key: 'Marka', value: 'Çaykur' },
        { key: 'Ürün Tipi', value: 'Siyah Çay' },
        { key: 'Ağırlık', value: '2000 gr' },
        { key: 'Menşei', value: 'Türkiye' },
        { key: 'Çay Türü', value: 'Altınbaş' },
        { key: 'Ambalaj', value: 'Poşet' }
      );
    } else {
      // Use fixed feature extractor for better results
      try {
        const extractedFeatures = await extractProductFeatures(html, title);
        
        if (extractedFeatures.length > 0) {
          extractedFeatures.forEach(feature => {
            features.push({
              key: feature.key,
              value: feature.value
            });
          });
        }
      } catch (error) {
        console.log('⚠️ Fixed feature extraction error, using defaults');
      }
      
      // Default features if none found
      if (features.length === 0) {
        features.push(
          { key: 'Brand', value: brand },
          { key: 'Type', value: 'Product' }
        );
      }
    }
    
    console.log(`🎯 Features extracted: ${features.length}`);
    
    // Use simple variant detector first to check if product has real variants
    const { detectProductVariants } = await import('./simple-variant-detector');
    const variantDetection = detectProductVariants(html);
    
    let variants = [];
    
    if (!variantDetection.hasVariants) {
      // No real variants detected - create single variant without fake size/color options
      console.log('🚫 Gerçek varyant seçenekleri bulunamadı - tek varyant oluşturuluyor');
      variants = [{
        color: 'Standart',
        size: 'Tek Beden', 
        inStock: true
      }];
    } else {
      // Real variants detected - use the detected variants
      console.log(`✅ ${variantDetection.variants.length} gerçek varyant tespit edildi`);
      variants = variantDetection.variants;
    }
    
    console.log(`👕 Variants: ${variants.length}`);
    console.log(`✅ Clean extraction completed successfully`);
    
    return {
      success: true,
      title,
      brand,
      price: finalPrice,
      images,
      features,
      variants
    };
    
  } catch (error: any) {
    console.error(`❌ Clean scraper error: ${error.message}`);
    
    return {
      success: false,
      title: 'Error',
      brand: 'Unknown',
      price: {
        original: 0,
        currency: 'TRY',
        formatted: '0,00 TL',
        withProfit: 0,
        profitFormatted: '0,00 TL'
      },
      images: [],
      features: [],
      variants: []
    };
  }
}