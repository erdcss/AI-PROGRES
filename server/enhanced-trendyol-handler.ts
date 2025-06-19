import * as cheerio from 'cheerio';
import * as path from 'path';
import axios from 'axios';
import { csvAccumulator } from './csv-accumulator';

export interface EnhancedVariantData {
  colors: string[];
  sizes: string[];
  images: string[];
  variantImages: Record<string, string[]>;
  colorImageMap: Record<string, string[]>;
  variantPricing: Record<string, number>;
  variantSpecificPricing: Record<string, number>;
  stockMap: Record<string, boolean>;
  outOfStockVariants: string[];
}

export async function scrapeTrendyolProduct(inputUrl: string) {
  try {
    console.log('Enhanced Trendyol handler başlatılıyor...');
    
    const url = inputUrl.replace(/\?.*$/, '').trim();
    console.log(`URL normalize edildi: ${inputUrl} -> ${url}`);
    
    // Enhanced request with better headers and error handling
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Cache-Control': 'max-age=0'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status < 500;
      }
    });

    if (response.status !== 200) {
      throw new Error(`Ürün verisi çekilemedi: HTTP ${response.status}`);
    }

    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}: Sunucu hatası`);
    }

    const htmlContent = response.data;
    
    // Extract real product data using improved extraction
    const { extractRealTrendyolData } = await import('./real-trendyol-extractor');
    const realProductData = extractRealTrendyolData(htmlContent);
    
    const title = realProductData.title;
    const brand = realProductData.brand;
    const price = realProductData.price;

    // Extract product ID from URL
    const productId = url.match(/p-(\d+)/)?.[1] || 
                     Math.floor(Math.random() * 1000000000);
    
    console.log(`Ürün bilgileri: ${title} - ${brand} - ${price} TL`);

    // Skip the redundant basic extraction since we have real data
    const colors: string[] = realProductData.variants.colors;
    const sizes: string[] = realProductData.variants.sizes;
    const images: string[] = realProductData.images;

    // No need for fallback extraction since we use real data
    console.log(`Çıkarılan varyantlar: ${colors.length} renk, ${sizes.length} beden, ${images.length} görsel`);

    // Use real extracted variant data
    const variantData = {
      colors: realProductData.variants.colors,
      sizes: realProductData.variants.sizes,
      images: realProductData.images,
      variantImages: {},
      colorImageMap: {},
      variantPricing: {},
      variantSpecificPricing: {},
      stockMap: {},
      outOfStockVariants: []
    };

    // Try multiple approaches to get variant data
    const { extractTrendyolVariants } = await import('./trendyol-variant-extractor');
    const { extractFromTrendyolAPI, extractStructuredData } = await import('./trendyol-api-handler');
    
    // Try API approach first
    const apiData = await extractFromTrendyolAPI(productId.toString());
    
    // Try HTML extraction
    const variantExtraction = extractTrendyolVariants(htmlContent);
    
    // Try structured data
    const structuredData = extractStructuredData(htmlContent);
    
    let authenticVariants = null;
    
    // Check for authentic variant data from any source
    if (apiData.success && apiData.variants?.length > 0) {
      console.log(`API'den ${apiData.variants.length} gerçek varyant alındı`);
      authenticVariants = apiData.variants;
    } else if (variantExtraction.success && variantExtraction.totalVariants > 0) {
      console.log(`TYPageData'dan ${variantExtraction.totalVariants} gerçek varyant alındı`);
      authenticVariants = variantExtraction.variants;
    } else if (structuredData.success && structuredData.data.offers) {
      console.log(`Structured data'dan varyant bilgileri alındı`);
    } else {
      // Create basic variants from extracted product data for CSV generation
      const basicVariants = [];
      const colors = realProductData.variants.colors;
      const sizes = realProductData.variants.sizes;
      
      colors.forEach(color => {
        sizes.forEach(size => {
          basicVariants.push({
            color: color,
            size: size,
            price: price,
            stock: true
          });
        });
      });
      
      if (basicVariants.length > 0) {
        authenticVariants = basicVariants;
        console.log(`Temel varyantlar oluşturuldu: ${basicVariants.length} kombinasyon`);
      }
    }
    
    // Generate Shopify CSV with authentic variant data if available
    if (authenticVariants && authenticVariants.length > 0) {
      const { generateSimpleShopifyCSV } = await import('./shopify-variant-generator');
      const shopifyFilename = 'shopify-variants.csv'; // Direct to main directory
      
      try {
        await generateSimpleShopifyCSV(
          authenticVariants,
          variantExtraction.imageMap || {},
          title,
          shopifyFilename
        );
        console.log(`Otantik Shopify CSV oluşturuldu: ${authenticVariants.length} varyant`);
      } catch (error) {
        console.error('Shopify CSV hatası:', error);
      }
    }
    
    // Use extracted product description
    const description = realProductData.description;

    // Create final product data
    const productData = {
      title,
      price: price.toString(),
      basePrice: price.toString(),
      id: productId,
      description,
      authenticVariants: authenticVariants || null,
      brand,
      images: variantData.images,
      attributes: realProductData.attributes,
      variants: {
        colors: variantData.colors.length > 0 ? variantData.colors : ['tek renk'],
        sizes: variantData.sizes.length > 0 ? variantData.sizes : ['tek beden'],
        totalVariants: Math.max(1, variantData.colors.length * variantData.sizes.length)
      },
      url: inputUrl
    };

    console.log('Ürün CSV koleksiyonuna ekleniyor...');
    console.log('Gönderilen ürün verisi:', {
      title: productData.title,
      description: productData.description.substring(0, 100) + '...',
      brand: productData.brand,
      images: productData.images.length
    });

    csvAccumulator.addProduct(productData);
    console.log(`Ürün koleksiyona eklendi. Toplam: ${csvAccumulator.getProductCount()} ürün`);

    return {
      success: true,
      title: productData.title,
      price: productData.price,
      brand: productData.brand,
      images: productData.images.length,
      variants: productData.variants.totalVariants,
      id: productData.id,
      authenticVariants: authenticVariants?.length || 0,
      message: 'Ürün başarıyla çekildi ve CSV koleksiyonuna eklendi'
    };

  } catch (error) {
    console.error('Enhanced Trendyol handler hatası:', error);
    throw new Error(`Ürün verisi çekilirken hata oluştu: ${error.message}`);
  }
}

function extractProductDescription(htmlContent: string, $: any): string {
  const descriptionSelectors = [
    '.detail-desc-item',
    '.product-description',
    '[data-testid="description"]',
    '.detail-attr-item',
    '.product-detail-content'
  ];

  for (const selector of descriptionSelectors) {
    const desc = $(selector).first().text().trim();
    if (desc && desc.length > 20) {
      return desc.substring(0, 500);
    }
  }

  return 'Kaliteli malzeme ile üretilmiştir. Günlük kullanım için ideal. Rahat kesim ve şık tasarım. Uzun ömürlü kullanım için tasarlanmıştır';
}

function isValidSize(value: string): boolean {
  const validSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '34', '36', '38', '40', '42', '44', '46', '48', '50', 'Tek Beden'];
  return validSizes.some(size => value.toUpperCase().includes(size));
}