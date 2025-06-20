/**
 * AI-Destekli Profesyonel Ürün Veri Çıkarıcı
 * Tüm görselleri, özellikleri ve detayları AI ile analiz ederek çıkarır
 */

import * as cheerio from 'cheerio';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AIEnhancedProductData {
  success: boolean;
  title: string;
  brand: string;
  price: string;
  description: string;
  images: string[];
  colors: Array<{
    name: string;
    images: string[];
    price?: string;
  }>;
  features: Array<{key: string, value: string}>;
  aiAnalysis: {
    category: string;
    targetAudience: string;
    season: string;
    materials: string[];
    style: string;
    priceRange: string;
  };
  shopifyData: {
    handle: string;
    tags: string[];
    vendor: string;
    productType: string;
    variants: Array<{
      title: string;
      price: string;
      sku: string;
      inventory: number;
      image: string;
    }>;
  };
  csvPreview: Array<Record<string, string>>;
}

/**
 * AI-destekli gelişmiş Trendyol ürün veri çıkarma
 */
export async function aiEnhancedScrape(url: string): Promise<AIEnhancedProductData> {
  console.log(`🚀 AI-destekli profesyonel veri çıkarma başlatılıyor: ${url}`);
  
  try {
    // 1. Ham veri çıkarma
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const htmlContent = response.data;
    
    console.log(`📊 AI analiz için veri hazırlanıyor - içerik uzunluğu: ${htmlContent.length}`);
    
    // 2. Temel veri çıkarma
    const basicData = extractBasicData($, htmlContent);
    
    // 2.1. Optimize görsel çıkarma
    const optimizedImages = extractOptimizedImages(htmlContent);
    basicData.images = optimizedImages;
    
    // 2.2. Stoklu varyantlar
    const stockVariants = extractStockVariants(htmlContent);
    basicData.variants = stockVariants;
    
    // 3. AI ile gelişmiş analiz
    const aiAnalysis = await performAIAnalysis(basicData, htmlContent);
    
    // 4. Shopify formatında veri hazırlama
    const shopifyData = generateShopifyData(basicData, aiAnalysis);
    
    // 5. CSV oluşturma ve önizleme
    const { generateProfessionalCSV } = await import('./csv-generator');
    const csvContent = generateProfessionalCSV({...basicData, aiAnalysis});
    const csvPreview = generateCSVPreview(basicData, shopifyData);
    
    console.log(`✅ AI-destekli çıkarma tamamlandı: ${basicData.images.length} görsel, ${basicData.colors.length} renk`);
    
    return {
      success: true,
      ...basicData,
      aiAnalysis,
      shopifyData,
      csvPreview
    };
    
  } catch (error) {
    console.error('AI-destekli scraping hatası:', error.message);
    throw error;
  }
}

/**
 * Temel veri çıkarma (gelişmiş)
 */
function extractBasicData($: cheerio.CheerioAPI, htmlContent: string) {
  // Başlık çıkarma
  const title = extractEnhancedTitle($);
  
  // Marka çıkarma
  const brand = extractEnhancedBrand($);
  
  // Fiyat çıkarma (tüm varyantlar)
  const prices = extractAllPrices($, htmlContent);
  
  // Açıklama çıkarma
  const description = extractEnhancedDescription($, title);
  
  // Tüm görselleri çıkar (ultra gelişmiş)
  const images = extractAllImagesEnhanced(htmlContent, $);
  
  // Renk varyantları ve görselleri eşleştir
  const colors = extractColorVariantsWithImages(htmlContent, $, images);
  
  // Özellikleri çıkar (detaylı)
  const features = extractEnhancedFeatures(htmlContent, $);
  
  return {
    title,
    brand,
    price: prices.main || '0',
    description,
    images,
    colors,
    features
  };
}

/**
 * AI ile ürün analizi - Gelişmiş version
 */
async function performAIAnalysis(basicData: any, htmlContent: string): Promise<any> {
  try {
    // Import the new AI analyzer
    const { analyzeProductWithAI, analyzeProductImages } = await import('./ai-product-analyzer');
    
    console.log('🧠 Gelişmiş AI analiz başlatılıyor...');
    
    // Comprehensive product analysis
    const productAnalysis = await analyzeProductWithAI(
      basicData.title,
      basicData.brand,
      basicData.price,
      basicData.description,
      basicData.images || []
    );
    
    // Image analysis
    const imageAnalysis = await analyzeProductImages(basicData.images || []);
    
    console.log('✅ Kapsamlı AI analiz tamamlandı');
    
    // Combine analyses
    return {
      // Basic fields for compatibility
      category: productAnalysis.category,
      targetAudience: productAnalysis.targetAudience,
      season: productAnalysis.season,
      materials: productAnalysis.materials,
      style: imageAnalysis.style,
      priceRange: productAnalysis.priceAnalysis.priceCategory,
      
      // Enhanced fields
      subcategory: productAnalysis.subcategory,
      ageGroup: productAnalysis.ageGroup,
      gender: productAnalysis.gender,
      features: productAnalysis.features,
      benefits: productAnalysis.benefits,
      keywords: productAnalysis.keywords,
      seoTitle: productAnalysis.seoTitle,
      seoDescription: productAnalysis.seoDescription,
      marketingCopy: productAnalysis.marketingCopy,
      
      // Price analysis
      priceAnalysis: productAnalysis.priceAnalysis,
      
      // Shopify optimization
      shopifyOptimization: productAnalysis.shopifyOptimization,
      
      // Image analysis
      imageAnalysis,
      
      // Usage instructions
      usageInstructions: productAnalysis.usageInstructions
    };
    
  } catch (error) {
    console.error('AI analiz hatası:', error.message);
    
    // Enhanced fallback analysis
    return {
      category: detectCategory(basicData.title),
      targetAudience: detectAudience(basicData.title),
      season: "Her Mevsim",
      materials: ["Belirtilmemiş"],
      style: "Standart",
      priceRange: detectPriceRange(parseFloat(basicData.price.replace(',', '.'))),
      
      // Enhanced fallback fields
      subcategory: "Genel",
      ageGroup: "18-65",
      gender: detectGender(basicData.title),
      features: extractBasicFeatures(basicData.title),
      benefits: ["Kaliteli ürün"],
      keywords: generateKeywords(basicData.title, basicData.brand),
      seoTitle: `${basicData.title} | ${basicData.brand}`.substring(0, 60),
      seoDescription: `${basicData.title} en uygun fiyatlarla. ${basicData.brand} kalitesi.`.substring(0, 160),
      marketingCopy: `${basicData.brand} kalitesi ile ${basicData.title}.`,
      
      priceAnalysis: {
        priceCategory: detectPriceRange(parseFloat(basicData.price.replace(',', '.'))),
        valueProposition: "Kalite ve uygun fiyat",
        competitiveAdvantage: ["Güvenilir marka"]
      },
      
      shopifyOptimization: {
        handle: basicData.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-').substring(0, 50),
        tags: [detectCategory(basicData.title), basicData.brand].filter(Boolean),
        productType: detectCategory(basicData.title),
        vendor: basicData.brand,
        metaTitle: `${basicData.title} - ${basicData.brand}`,
        metaDescription: `${basicData.title} ${basicData.brand} markasından.`
      },
      
      imageAnalysis: {
        dominantColors: ["Çok Renkli"],
        style: "Standart",
        setting: "Ürün Fotoğrafı",
        quality: "Orta"
      }
    };
  }
}

/**
 * Shopify formatında veri hazırlama
 */
function generateShopifyData(basicData: any, aiAnalysis: any) {
  const handle = basicData.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const variants = basicData.colors.map((color: any, index: number) => ({
    title: `${basicData.title} - ${color.name}`,
    price: color.price || basicData.price,
    sku: `SKU-${Date.now()}-${index}`,
    inventory: 100,
    image: color.images[0] || basicData.images[0]
  }));

  return {
    handle,
    tags: [aiAnalysis.category, aiAnalysis.style, aiAnalysis.targetAudience],
    vendor: basicData.brand,
    productType: aiAnalysis.category,
    variants
  };
}

/**
 * CSV önizleme oluşturma
 */
function generateCSVPreview(basicData: any, shopifyData: any): Array<Record<string, string>> {
  return shopifyData.variants.slice(0, 5).map((variant: any) => ({
    'Handle': shopifyData.handle,
    'Title': variant.title,
    'Body (HTML)': basicData.description,
    'Vendor': shopifyData.vendor,
    'Product Type': shopifyData.productType,
    'Tags': shopifyData.tags.join(', '),
    'Variant Price': variant.price,
    'Variant SKU': variant.sku,
    'Variant Inventory Qty': variant.inventory.toString(),
    'Image Src': variant.image
  }));
}

/**
 * Gelişmiş görsel çıkarma
 */
function extractAllImagesEnhanced(htmlContent: string, $: cheerio.CheerioAPI): string[] {
  const images = new Set<string>();
  
  // 1. Script verilerinden (JSON-LD, product state)
  const scriptMatches = htmlContent.matchAll(/"(https?:\/\/[^"]*(?:dsmcdn\.com|trendyol)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const match of scriptMatches) {
    if (match[1] && (match[1].includes('prod/QC') || match[1].includes('mnresize'))) {
      images.add(match[1]);
    }
  }
  
  // 2. Product detail state
  const productStateRegex = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/;
  const productStateMatch = htmlContent.match(productStateRegex);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      extractImagesFromState(productState, images);
    } catch (e) {}
  }
  
  // 3. DOM selectors
  const imageSelectors = [
    'img[src*="dsmcdn.com"]',
    'img[data-src*="dsmcdn.com"]',
    'img[src*="prod/QC"]',
    '.image-container img',
    '.product-image img'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src && src.includes('dsmcdn.com')) {
        images.add(src.startsWith('//') ? 'https:' + src : src);
      }
    });
  });
  
  return Array.from(images).slice(0, 12); // Maksimum 12 görsel
}

/**
 * Optimize görsel çıkarma - Sadece ürün görselleri
 */
function extractOptimizedImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  try {
    // Product state'den görseller
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      const productState = JSON.parse(productStateMatch[1]);
      
      // Ana ürün görselleri
      if (productState.product?.images) {
        productState.product.images.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : img?.url;
          if (imgUrl && imgUrl.includes('prod/QC') && !isExcludedImage(imgUrl)) {
            images.add(imgUrl);
          }
        });
      }
      
      // Varyant görselleri (sınırlı)
      if (productState.product?.allVariants) {
        productState.product.allVariants.slice(0, 3).forEach((variant: any) => {
          if (variant.images) {
            variant.images.slice(0, 2).forEach((img: string) => {
              if (img && img.includes('prod/QC') && !isExcludedImage(img)) {
                images.add(img);
              }
            });
          }
        });
      }
    }
  } catch (error) {
    console.log('Görsel çıkarma hatası:', error.message);
  }
  
  return Array.from(images).map(url => optimizeImageUrl(url)).slice(0, 12);
}

/**
 * Stoklu varyant çıkarma
 */
function extractStockVariants(htmlContent: string) {
  const variants = { colors: [], sizes: [] };
  
  try {
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.allVariants) {
        const colorMap = new Map();
        const sizeMap = new Map();
        
        productState.product.allVariants.forEach((variant: any) => {
          const isInStock = variant.inStock !== false && (variant.quantity === undefined || variant.quantity > 0);
          
          // Renkler
          const colorName = variant.attributeValue1 || variant.color;
          if (colorName) {
            colorMap.set(colorName, {
              name: colorName,
              inStock: colorMap.get(colorName)?.inStock || isInStock
            });
          }
          
          // Bedenler
          const sizeName = variant.attributeValue2 || variant.size;
          if (sizeName) {
            sizeMap.set(sizeName, {
              name: sizeName,
              inStock: sizeMap.get(sizeName)?.inStock || isInStock
            });
          }
        });
        
        variants.colors = Array.from(colorMap.values());
        variants.sizes = Array.from(sizeMap.values());
      }
    }
  } catch (error) {
    console.log('Varyant çıkarma hatası:', error.message);
  }
  
  return variants;
}

/**
 * Gereksiz görselleri filtrele
 */
function isExcludedImage(url: string): boolean {
  const excludePatterns = [
    'enerjietiketi',
    '/50/50/',
    '/64/64/', 
    '/80/80/',
    'badge',
    'icon',
    'logo',
    'button',
    'star',
    'rating',
    'watermark'
  ];
  
  return excludePatterns.some(pattern => url.toLowerCase().includes(pattern));
}

/**
 * Görsel URL optimize et
 */
function optimizeImageUrl(url: string): string {
  return url
    .replace('/170/247/', '/1200/1800/')
    .replace('/236/347/', '/1200/1800/')
    .replace('/300/300/', '/1200/1800/')
    .replace('/mnresize/300/', '/mnresize/1200/');
}

/**
 * State'den görsel çıkarma
 */
function extractImagesFromState(state: any, images: Set<string>) {
  if (state.product?.images) {
    state.product.images.forEach((img: any) => {
      const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
      if (imgUrl) images.add(imgUrl);
    });
  }
  
  if (state.product?.allVariants) {
    state.product.allVariants.forEach((variant: any) => {
      if (variant.images) {
        variant.images.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : (img.url || img.src);
          if (imgUrl) images.add(imgUrl);
        });
      }
    });
  }
}

/**
 * Renk varyantları ve görselleri eşleştirme
 */
function extractColorVariantsWithImages(htmlContent: string, $: cheerio.CheerioAPI, allImages: string[]) {
  const colors = new Map<string, {name: string, images: string[], price?: string}>();
  
  // Product state'den renk bilgileri
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.attributeValue) {
            const colorName = variant.attributeValue;
            const variantImages = variant.images || [];
            const price = variant.price?.toString();
            
            colors.set(colorName, {
              name: colorName,
              images: variantImages,
              price
            });
          }
        });
      }
    } catch (e) {}
  }
  
  // Eğer renk bulunamazsa, tüm görselleri tek renk olarak kabul et
  if (colors.size === 0) {
    colors.set('Tek Renk', {
      name: 'Tek Renk',
      images: allImages.slice(0, 10) // İlk 10 görsel
    });
  }
  
  return Array.from(colors.values());
}

/**
 * Gelişmiş özellik çıkarma
 */
function extractEnhancedFeatures(htmlContent: string, $: cheerio.CheerioAPI): Array<{key: string, value: string}> {
  const features: Array<{key: string, value: string}> = [];
  
  // Product state'den özellikler
  const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.properties) {
        productState.product.properties.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({
              key: prop.name,
              value: prop.value
            });
          }
        });
      }
    } catch (e) {}
  }
  
  // DOM'dan ek özellikler
  $('.product-detail-info table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({key, value});
      }
    }
  });
  
  return features;
}

// Yardımcı fonksiyonlar
function extractEnhancedTitle($: cheerio.CheerioAPI): string {
  const selectors = [
    'h1.pr-new-br',
    'h1[data-test-id="product-name"]',
    '.pr-new-br h1',
    'h1',
    '.product-name'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const title = element.first().text().trim();
      if (title && title.length > 5) return title;
    }
  }
  
  return 'Ürün Adı Bulunamadı';
}

function extractEnhancedBrand($: cheerio.CheerioAPI): string {
  const selectors = [
    'a[data-test-id="product-brand-name-link"]',
    '.pr-new-br a',
    '.product-brand a',
    'h1 a'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const brand = element.first().text().trim();
      if (brand && brand.length > 1) return brand;
    }
  }
  
  return 'Marka Bulunamadı';
}

function extractAllPrices($: cheerio.CheerioAPI, htmlContent: string): {main: string, variants: Record<string, string>} {
  const prices = {main: '0', variants: {}};
  
  // Ana fiyat
  const priceSelectors = ['.prc-dsc', '.prc-org', '.price-current'];
  for (const selector of priceSelectors) {
    const element = $(selector);
    if (element.length > 0) {
      const price = element.first().text().trim();
      const match = price.match(/(\d+(?:[.,]\d+)?)/);
      if (match) {
        prices.main = match[1];
        break;
      }
    }
  }
  
  return prices;
}

function extractEnhancedDescription($: cheerio.CheerioAPI, title: string): string {
  const selectors = [
    '.product-description',
    '.pr-in-dt',
    '.detail-desc',
    '.product-detail-description'
  ];
  
  for (const selector of selectors) {
    const element = $(selector);
    if (element.length > 0) {
      const desc = element.first().text().trim();
      if (desc && desc.length > 20) return desc;
    }
  }
  
  return `${title} - Profesyonel kalitede ürün.`;
}

function detectCategory(title: string): string {
  const categories = {
    'Giyim': ['tişört', 'tisört', 'şort', 'pantolon', 'elbise', 'gömlek', 'kazak'],
    'Ayakkabı': ['ayakkabı', 'spor ayakkabı', 'bot', 'sandalet'],
    'Aksesuar': ['çanta', 'saat', 'bilezik', 'kolye', 'yüzük'],
    'Elektronik': ['telefon', 'laptop', 'kulaklık', 'şarj']
  };
  
  const lowerTitle = title.toLowerCase();
  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => lowerTitle.includes(keyword))) {
      return category;
    }
  }
  
  return 'Genel';
}

function detectAudience(title: string): string {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('kadın') || lowerTitle.includes('bayan')) return 'Kadın';
  if (lowerTitle.includes('erkek') || lowerTitle.includes('adam')) return 'Erkek';
  if (lowerTitle.includes('çocuk') || lowerTitle.includes('bebek')) return 'Çocuk';
  return 'Unisex';
}

function detectPriceRange(price: number): string {
  if (price < 100) return 'budget';
  if (price < 500) return 'mid-range';
  if (price < 2000) return 'premium';
  return 'luxury';
}

function detectGender(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('kadın') || lower.includes('bayan')) return 'Kadın';
  if (lower.includes('erkek') || lower.includes('adam')) return 'Erkek';
  if (lower.includes('çocuk') || lower.includes('bebek')) return 'Çocuk';
  return 'Unisex';
}

function extractBasicFeatures(title: string): string[] {
  const features = [];
  const lower = title.toLowerCase();
  
  if (lower.includes('pamuk')) features.push('Pamuklu');
  if (lower.includes('doğal')) features.push('Doğal');
  if (lower.includes('organik')) features.push('Organik');
  if (lower.includes('su geçirmez')) features.push('Su Geçirmez');
  if (lower.includes('nefes alır')) features.push('Nefes Alır');
  if (lower.includes('antibakteriyel')) features.push('Antibakteriyel');
  
  return features.length > 0 ? features : ['Kaliteli Malzeme'];
}

function generateKeywords(title: string, brand: string): string[] {
  const words = title.toLowerCase().split(' ').filter(word => word.length > 2);
  const keywords = [
    brand?.toLowerCase() || '',
    ...words.slice(0, 5),
    'türkiye',
    'online',
    'kaliteli'
  ].filter(Boolean);
  
  return [...new Set(keywords)];
}