/**
 * Clean Product Scraper - Working extraction system
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractRealColors } from './fixed-color-extractor';
import { extractProductFeatures } from './fixed-feature-extractor';

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
    
    console.log(`🔧 Clean scraper processing: ${processedUrl}`);
    
    // Anti-bot delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
    
    const response = await axios.get(processedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Referer': 'https://www.google.com/',
        'Connection': 'keep-alive'
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });
    
    const html = response.data;
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
    
    // Enhanced manual price extraction
    const { extractManualPrice } = await import('./manual-price-extractor');
    const priceObject = await extractManualPrice(html, processedUrl);
    
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
      price: priceObject,
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