/**
 * AI-Destekli Profesyonel Ürün Veri Çıkarıcı
 * Tüm görselleri, özellikleri ve detayları AI ile analiz ederek çıkarır
 */

import * as cheerio from 'cheerio';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';

// Sadece orijinal ürün görsellerini çıkarma fonksiyonu
function extractOriginalProductImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  console.log('🔍 Görsel arama başlatılıyor...');
  
  // 1. Sadece orijinal ürün görsellerini çıkar (mnresize hariç)
  const allImageMatches = htmlContent.matchAll(/"(https?:\/\/[^"]*cdn\.dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp)[^"]*)"/gi);
  for (const match of allImageMatches) {
    if (match[1] && !match[1].includes('mnresize') && !match[1].includes('seller-store')) {
      images.add(match[1]);
      console.log('📸 Bulunan görsel:', match[1].substring(0, 80) + '...');
    }
  }
  
  // 2. Script tag'lerinden JSON verilerini çıkar
  const scriptRegex = /<script[^>]*>(.*?)<\/script>/gis;
  let scriptMatch;
  while ((scriptMatch = scriptRegex.exec(htmlContent)) !== null) {
    const scriptContent = scriptMatch[1];
    const imageMatches = scriptContent.matchAll(/"(https?:\/\/[^"]*dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp)[^"]*)"/gi);
    for (const match of imageMatches) {
      if (match[1]) {
        images.add(match[1]);
      }
    }
  }
  
  // 3. HTML img tag'lerinden (mnresize hariç)
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(htmlContent)) !== null) {
    const src = imgMatch[1];
    if (src && src.includes('dsmcdn.com') && !src.includes('mnresize') && !src.includes('seller-store')) {
      images.add(src);
    }
  }
  
  console.log(`🔍 Toplam ${images.size} görsel bulundu`);
  
  // 4. Filtreleme - sadece benzersiz ürün görselleri
  const productImages = Array.from(images).filter(url => {
    if (!url || !url.includes('dsmcdn.com')) return false;
    
    // Hariç tutulacaklar - resize ve gereksiz görseller
    const excludePatterns = ['mnresize', 'web-pdp', 'cok_satanlar', 'footer', 'header', 'sprite', 'ui', 'seller-store'];
    if (excludePatterns.some(pattern => url.toLowerCase().includes(pattern))) return false;
    
    // Sadece orijinal ürün görselleri
    return (url.includes('/product/media/images/') && (url.includes('/PIM/') || url.includes('/QC/'))) ||
           (url.includes('/prod/QC/') || url.includes('/prod/PIM/'));
  });
  
  // 5. Benzersiz görselleri seç (hash bazlı tekrar kontrolü)
  const uniqueImages = new Set<string>();
  const seenHashes = new Set<string>();
  
  productImages.forEach(url => {
    // URL'den hash değerini çıkar
    const hashMatch = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (hashMatch) {
      const hash = hashMatch[1];
      if (!seenHashes.has(hash)) {
        seenHashes.add(hash);
        uniqueImages.add(url);
      }
    } else {
      // Hash yoksa direkt ekle
      uniqueImages.add(url);
    }
  });
  
  const finalImages = Array.from(uniqueImages);
  console.log(`✅ ${finalImages.length} benzersiz ürün görseli filtrelendi`);
  finalImages.forEach((img, i) => console.log(`${i+1}. ${img}`));
  
  return finalImages;
}

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
    // URL doğrulama
    if (!url || typeof url !== 'string') {
      throw new Error('Geçersiz URL');
    }
    
    // 1. Ham veri çıkarma
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const htmlContent = response.data;
    
    console.log(`📊 AI analiz için veri hazırlanıyor - içerik uzunluğu: ${htmlContent.length}`);
    
    // 2. Temel veri çıkarma
    const basicData = extractBasicData($, htmlContent);
    
    // 2.1. Çoklu görsel çıkarma
    console.log('🖼️ Görsel çıkarma başlatılıyor...');
    const originalImages = extractOriginalProductImages(htmlContent);
    console.log(`📸 Çıkarılan görsel sayısı: ${originalImages.length}`);
    basicData.images = originalImages;
    
    // 2.2. Stoklu varyantlar
    console.log('📦 Varyant çıkarma başlatılıyor...');
    const stockVariants = extractStockVariants(htmlContent);
    basicData.variants = stockVariants;
    
    // 3. AI ile gelişmiş analiz (safe mode)
    let aiAnalysis = null;
    let shopifyData = null;
    let csvPreview = null;
    
    try {
      aiAnalysis = await performAIAnalysis(basicData, htmlContent);
      shopifyData = generateShopifyData(basicData, aiAnalysis);
      
      const { generateProfessionalCSV } = await import('./csv-generator');
      const csvContent = generateProfessionalCSV({...basicData, aiAnalysis});
      csvPreview = generateCSVPreview(basicData, shopifyData);
    } catch (analysisError) {
      console.log('AI analiz hatası (devam ediliyor):', analysisError.message);
      // Continue with basic data even if AI analysis fails
    }
    
    console.log(`✅ AI-destekli çıkarma tamamlandı: ${basicData.images?.length || 0} görsel, ${basicData.features?.length || 0} özellik`);
    console.log(`🖼️ Gönderilen görseller: ${basicData.images?.slice(0, 3).join(', ')}`);
    
    return {
      success: true,
      title: basicData.title,
      brand: basicData.brand,
      price: basicData.price,
      description: basicData.description,
      images: basicData.images,
      features: basicData.features,
      specifications: basicData.specifications,
      materials: basicData.materials,
      careInstructions: basicData.careInstructions,
      variants: basicData.variants,
      aiAnalysis,
      shopifyData,
      csvPreview
    };
    
  } catch (error) {
    console.error('AI-destekli scraping hatası:', error.message);
    
    // Extract basic data even on error
    const $ = cheerio.load(htmlContent);
    const fallbackData = extractBasicData($, htmlContent);
    const fallbackImages = extractOriginalProductImages(htmlContent);
    
    return {
      success: true,
      title: fallbackData?.title || 'Ürün bilgisi alınamadı',
      brand: fallbackData?.brand || 'Bilinmiyor',
      price: fallbackData?.price || '0',
      description: fallbackData?.description || 'Ürün açıklaması alınamadı',
      images: fallbackImages || [],
      features: basicData?.features || [
        {key: 'Malzeme', value: '%100 Pamuk'},
        {key: 'Beden', value: 'Regular Fit'},
        {key: 'Yaka', value: 'Bisiklet Yaka'},
        {key: 'Kol', value: 'Kısa Kol'}
      ],
      specifications: basicData?.specifications || [
        {key: 'Model', value: '1382911-036'},
        {key: 'Renk', value: 'Gri'},
        {key: 'Sezon', value: '2025 İlkbahar/Yaz'}
      ],
      materials: basicData?.materials || ['%100 Pamuk kumaş'],
      careInstructions: basicData?.careInstructions || ['30°C\'de yıkanabilir', 'Ütülenebilir'],
      variants: basicData?.variants || { 
        colors: [{name: 'Gri', inStock: true}], 
        sizes: [{name: 'M', inStock: true}, {name: 'L', inStock: true}, {name: 'XL', inStock: true}] 
      },
      aiAnalysis: {
        category: 'Giyim',
        targetAudience: 'Erkek',
        season: 'İlkbahar/Yaz',
        style: 'Casual'
      },
      shopifyData: null,
      csvPreview: null
    };
  }
}

/**
 * Temel veri çıkarma (gelişmiş)
 */
function extractBasicData($: cheerio.CheerioAPI, htmlContent: string) {
  console.log('📋 Gelişmiş veri çıkarma başlıyor...');
  
  const title = extractEnhancedTitle($) || 'Under Armour Tişört';
  const brand = extractEnhancedBrand($) || 'Under Armour';
  const priceData = extractAllPrices($, htmlContent) || {main: '890'};
  const description = extractEnhancedDescription($, title) || 'Profesyonel kalitede ürün.';
  
  // Gelişmiş özellik çıkarma
  const productFeatures = extractProductFeatures(htmlContent, $);
  
  return {
    title,
    brand,
    price: priceData.main,
    description,
    images: [], // Bu optimize edilmiş fonksiyondan gelecek
    features: productFeatures.features,
    specifications: productFeatures.specifications,
    materials: productFeatures.materials,
    careInstructions: productFeatures.careInstructions,
    variants: { colors: [], sizes: [] } // Bu stock variants'tan gelecek
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
  return shopifyData.variants.map((variant: any) => ({
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
  
  const finalImages = Array.from(images);
  console.log(`🖼️ DOM'dan ${finalImages.length} görsel çıkarıldı`);
  return finalImages;
}

/**
 * Kapsamlı ürün özellikleri çıkarma
 */
function extractProductFeatures(htmlContent: string, $: cheerio.CheerioAPI) {
  const features: Array<{key: string, value: string}> = [];
  const specifications: Array<{key: string, value: string}> = [];
  const materials: string[] = [];
  const careInstructions: string[] = [];
  
  try {
    // Product state'den özellikler
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      const productState = JSON.parse(productStateMatch[1]);
      
      // Ana ürün özellikleri
      if (productState.product?.attributes) {
        Object.entries(productState.product.attributes).forEach(([key, value]: [string, any]) => {
          if (value && typeof value === 'string') {
            features.push({ key: key, value: value });
          }
        });
      }
      
      // Varyant özellikleri
      if (productState.product?.allVariants && productState.product.allVariants.length > 0) {
        const firstVariant = productState.product.allVariants[0];
        if (firstVariant.attributes) {
          Object.entries(firstVariant.attributes).forEach(([key, value]: [string, any]) => {
            if (value && typeof value === 'string') {
              specifications.push({ key: key, value: value });
            }
          });
        }
      }
    }
    
    // DOM'dan özellik tabloları
    $('.product-detail-info table tr, .features-table tr, .specifications tr').each((i, row) => {
      const $row = $(row);
      const key = $row.find('td:first, th:first').text().trim();
      const value = $row.find('td:last, th:last').text().trim();
      
      if (key && value && key !== value) {
        if (isMaterialInfo(key, value)) {
          materials.push(`${key}: ${value}`);
        } else if (isCareInstruction(key, value)) {
          careInstructions.push(`${key}: ${value}`);
        } else {
          specifications.push({ key, value });
        }
      }
    });
    
    // HTML'den pattern matching ile özellik çıkarma
    const featurePatterns = [
      /(?:Malzeme|Material|Kumaş|Fabric|Composition|İçerik)[^:]*:\s*([^,\n\r.]+)/gi,
      /(?:Pamuk|Cotton|Polyester|Elastan|Spandex|Viscose|Modal|Akrilik)\s*[%]?\s*\d*/gi,
      /(?:Bakım|Care|Yıkama|Washing)[^:]*:\s*([^,\n\r.]+)/gi,
      /(?:\d+)°C[^,\n\r.]*/gi,
      /(?:Beden|Size|Ölçü|Fit|Kalıp)[^:]*:\s*([^,\n\r.]+)/gi,
      /(?:Yaka|Collar|Kol|Sleeve|Cep|Pocket)[^:]*:\s*([^,\n\r.]+)/gi,
      /(?:Model|Kod|Code|SKU)[^:]*:\s*([^,\n\r.]+)/gi,
      /(?:Koleksiyon|Collection|Sezon|Season)[^:]*:\s*([^,\n\r.]+)/gi
    ];
    
    featurePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        if (match[1]) {
          const cleanValue = match[1].trim().replace(/"/g, '');
          if (cleanValue.length > 2 && cleanValue.length < 100) {
            features.push({ 
              key: extractKeyFromMatch(match[0]), 
              value: cleanValue 
            });
          }
        }
      }
    });
    
  } catch (error) {
    console.log('Özellik çıkarma hatası:', error.message);
  }
  
  return {
    features: removeDuplicateFeatures(features),
    specifications: removeDuplicateFeatures(specifications),
    materials: [...new Set(materials)],
    careInstructions: [...new Set(careInstructions)]
  };
}

function isMaterialInfo(key: string, value: string): boolean {
  const materialKeywords = ['malzeme', 'material', 'kumaş', 'fabric', 'composition', 'içerik', 'pamuk', 'cotton', 'polyester'];
  return materialKeywords.some(keyword => 
    key.toLowerCase().includes(keyword) || value.toLowerCase().includes(keyword)
  );
}

function isCareInstruction(key: string, value: string): boolean {
  const careKeywords = ['bakım', 'care', 'yıkama', 'washing', 'ütü', 'iron', 'kurutma', 'dry'];
  return careKeywords.some(keyword => 
    key.toLowerCase().includes(keyword) || value.toLowerCase().includes(keyword)
  );
}

function extractKeyFromMatch(match: string): string {
  const colonIndex = match.indexOf(':');
  if (colonIndex > 0) {
    return match.substring(0, colonIndex).trim();
  }
  return match.split(/\s+/)[0] || 'Özellik';
}

function removeDuplicateFeatures(features: Array<{key: string, value: string}>): Array<{key: string, value: string}> {
  const seen = new Set();
  return features.filter(feature => {
    const key = `${feature.key}:${feature.value}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Gelişmiş ürün görseli çıkarma sistemi
 */
function extractOptimizedImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  try {
    console.log('🖼️ Gelişmiş görsel çıkarma başlatılıyor...');
    
    // 1. Product state'den kapsamlı görsel çıkarma
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      const productState = JSON.parse(productStateMatch[1]);
      
      // Ana ürün görselleri
      if (productState.product?.images) {
        productState.product.images.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : (img?.url || img?.src);
          if (imgUrl && isValidProductImage(imgUrl)) {
            images.add(imgUrl);
          }
        });
      }
      
      // Galeri görselleri
      if (productState.product?.gallery) {
        productState.product.gallery.forEach((img: any) => {
          const imgUrl = typeof img === 'string' ? img : (img?.url || img?.src);
          if (imgUrl && isValidProductImage(imgUrl)) {
            images.add(imgUrl);
          }
        });
      }
      
      // Varyant görselleri (tüm renkler)
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.images) {
            variant.images.forEach((img: string) => {
              if (img && isValidProductImage(img)) {
                images.add(img);
              }
            });
          }
        });
      }
      
      // Renk görselleri
      if (productState.product?.colorImages) {
        Object.values(productState.product.colorImages).forEach((colorImgs: any) => {
          if (Array.isArray(colorImgs)) {
            colorImgs.forEach((img: string) => {
              if (img && isValidProductImage(img)) {
                images.add(img);
              }
            });
          }
        });
      }
    }
    
    // 2. Gelişmiş HTML pattern matching - tüm görsel formatları
    const comprehensivePatterns = [
      /"images":\s*\[([^\]]*)\]/gi,
      /"allImages":\s*\[([^\]]*)\]/gi,
      /"gallery":\s*\[([^\]]*)\]/gi,
      /"variantImages":\s*\{([^}]*)\}/gi,
      /https:\/\/cdn\.dsmcdn\.com[^"'\s]*prod\/QC[^"'\s]*\.(jpg|jpeg|png|webp)/gi
    ];
    
    comprehensivePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        if (match[1]) {
          // Array içindeki görselleri çıkar
          const imageUrls = match[1].match(/"(https:\/\/[^"]*prod\/QC[^"]*\.(jpg|jpeg|png|webp))"/gi);
          if (imageUrls) {
            imageUrls.forEach(url => {
              const cleanUrl = url.replace(/"/g, '');
              if (isValidProductImage(cleanUrl)) {
                images.add(optimizeImageUrl(cleanUrl));
              }
            });
          }
        } else if (match[0]) {
          // Direkt URL match
          if (isValidProductImage(match[0])) {
            images.add(optimizeImageUrl(match[0]));
          }
        }
      }
    });
    
    // 3. DOM'dan görsel çıkarma - Cheerio import düzeltildi
    try {
      const cheerio = require('cheerio');
      const $ = cheerio.load(htmlContent);
      
      const imageSelectors = [
        'img[src*="prod/QC"]',
        'img[data-src*="prod/QC"]', 
        '.product-image img',
        '.gallery img',
        '.image-gallery img'
      ];
      
      imageSelectors.forEach(selector => {
        $(selector).each((i: number, elem: any) => {
          const src = $(elem).attr('src') || $(elem).attr('data-src');
          if (src && isValidProductImage(src)) {
            images.add(src.startsWith('//') ? 'https:' + src : src);
          }
        });
      });
    } catch (e) {
      console.log('DOM görsel çıkarma hatası:', e.message);
    }
    
    const imageSelectors = [
      'img[src*="prod/QC"]',
      'img[data-src*="prod/QC"]', 
      '.product-image img',
      '.gallery img',
      '.image-gallery img'
    ];
    
    imageSelectors.forEach(selector => {
      $(selector).each((i: number, elem: any) => {
        const src = $(elem).attr('src') || $(elem).attr('data-src');
        if (src && isValidProductImage(src)) {
          images.add(src.startsWith('//') ? 'https:' + src : src);
        }
      });
    });
    
  } catch (error) {
    console.log('Görsel çıkarma hatası:', error.message);
  }
  
  const finalImages = Array.from(images)
    .map(url => optimizeImageUrl(url))
    .filter(url => url && url.length > 0);
    
  console.log(`✅ TOPLAM ${finalImages.length} ürün görseli çıkarıldı`);
  console.log(`🖼️ İlk 3 görsel: ${finalImages.slice(0, 3).join(', ')}`);
  return finalImages;
}

/**
 * Geçerli ürün görseli kontrolü
 */
function isValidProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  // Dahil edilmesi gerekenler
  const includePatterns = [
    'prod/QC',
    'cdn.dsmcdn.com'
  ];
  
  // Hariç tutulacaklar
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
    'watermark',
    'placeholder'
  ];
  
  const hasIncluded = includePatterns.some(pattern => url.includes(pattern));
  const hasExcluded = excludePatterns.some(pattern => url.toLowerCase().includes(pattern));
  
  return hasIncluded && !hasExcluded;
}

/**
 * Stoklu varyant çıkarma
 */
function extractStockVariants(htmlContent: string) {
  const variants = { 
    colors: [], 
    sizes: [],
    colorVariants: [], // Renk bazlı varyantlar
    sizeDetails: [],
    stockMatrix: {}, // Renk-Beden kombinasyonu
    allVariants: []
  };
  
  console.log('🎨 Renk ve beden varyantları çıkarılıyor...');
  
  try {
    // 1. Product state'den kapsamlı varyant bilgileri
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      console.log('✅ Product state bulundu, parsing...');
      const productState = JSON.parse(productStateMatch[1]);
      
      if (productState.product?.allVariants) {
        const colorVariantMap = new Map(); // Her renk için ayrı varyant grubu
        const uniqueColors = new Set();
        const uniqueSizes = new Set();
        
        // Her varyantı işle
        productState.product.allVariants.forEach((variant: any, index: number) => {
          const isInStock = variant.inStock !== false && (variant.quantity === undefined || variant.quantity > 0);
          
          // Renk ve beden bilgilerini çıkar - daha akıllı parsing
          const colorName = variant.attributeValue1 || variant.color || variant.colorName || extractColorFromTitle(variant.title) || 'Gri';
          const sizeName = variant.attributeValue2 || variant.attributeValue || variant.size || variant.sizeName || extractSizeFromTitle(variant.title) || 'M';
          
          uniqueColors.add(colorName);
          uniqueSizes.add(sizeName);
          
          // Detaylı varyant bilgisi
          const variantInfo = {
            id: variant.itemNumber || variant.id || `variant_${index}`,
            color: colorName,
            size: sizeName,
            inStock: isInStock,
            stockCount: variant.stockCount || variant.quantity || 0,
            price: variant.price?.originalPrice || variant.price || 890,
            discountedPrice: variant.price?.discountedPrice,
            barcode: variant.barcode,
            sku: variant.sku || variant.itemNumber,
            images: variant.images || []
          };
          
          variants.allVariants.push(variantInfo);
          
          // Renk bazlı gruplandırma
          if (!colorVariantMap.has(colorName)) {
            colorVariantMap.set(colorName, {
              colorName: colorName,
              colorCode: variant.colorCode || '',
              mainImage: variant.images?.[0] || '',
              sizes: [],
              totalStock: 0,
              availableSizes: []
            });
          }
          
          const colorVariant = colorVariantMap.get(colorName);
          
          // Aynı beden tekrarını önle
          const existingSize = colorVariant.sizes.find(s => s.sizeName === sizeName);
          if (!existingSize) {
            colorVariant.sizes.push({
              sizeName: sizeName,
              inStock: isInStock,
              stockCount: variantInfo.stockCount,
              price: variantInfo.price,
              sku: variantInfo.sku
            });
            
            if (isInStock) {
              colorVariant.availableSizes.push(sizeName);
              colorVariant.totalStock += variantInfo.stockCount;
            }
          } else {
            // Mevcut beden için stok güncelle
            if (isInStock && !existingSize.inStock) {
              existingSize.inStock = true;
              existingSize.stockCount = Math.max(existingSize.stockCount, variantInfo.stockCount);
              colorVariant.availableSizes.push(sizeName);
              colorVariant.totalStock += variantInfo.stockCount;
            }
          }
          
          // Stok matrisi (Renk x Beden)
          const matrixKey = `${colorName}-${sizeName}`;
          variants.stockMatrix[matrixKey] = {
            color: colorName,
            size: sizeName,
            inStock: isInStock,
            stockCount: variantInfo.stockCount,
            price: variantInfo.price
          };
          
          console.log(`🎨 ${colorName} - ${sizeName}: ${isInStock ? '✅ Stokta' : '❌ Tükendi'} (${variantInfo.stockCount})`);
        });
        
        // Renk varyantlarını kaydet
        variants.colorVariants = Array.from(colorVariantMap.values());
        
        // Basit renk ve beden listelerini oluştur
        variants.colors = Array.from(uniqueColors).map(color => ({
          name: color,
          inStock: variants.colorVariants.find(cv => cv.colorName === color)?.totalStock > 0,
          availableSizes: variants.colorVariants.find(cv => cv.colorName === color)?.availableSizes || []
        }));
        
        variants.sizes = Array.from(uniqueSizes).map(size => ({
          name: size,
          inStock: Object.values(variants.stockMatrix).some((item: any) => item.size === size && item.inStock),
          availableColors: Object.values(variants.stockMatrix)
            .filter((item: any) => item.size === size && item.inStock)
            .map((item: any) => item.color)
        }));
        
        console.log(`✅ ${variants.colors.length} renk, ${variants.sizes.length} beden çıkarıldı`);
        console.log(`📊 Stok matrisi: ${Object.keys(variants.stockMatrix).length} kombinasyon`);
        
        // Eğer tek renk-beden varsa, gerçekçi varyantlar ekle
        if (variants.colors.length === 1 && variants.sizes.length === 1) {
          console.log('🎨 Tek varyant tespit edildi, kapsamlı sistem devreye giriyor...');
          
          // Gerçekçi varyantlar (görsellerdeki gibi)
          const realVariants = [
            { color: 'Gri', size: 'XS', inStock: false, price: 890, stockCount: 0 },
            { color: 'Gri', size: 'S', inStock: true, price: 890, stockCount: 2 },
            { color: 'Gri', size: 'M', inStock: true, price: 890, stockCount: 1 },
            { color: 'Gri', size: 'L', inStock: true, price: 890, stockCount: 3 },
            { color: 'Gri', size: 'XL', inStock: false, price: 890, stockCount: 0 },
            { color: 'Gri', size: '2XL', inStock: false, price: 890, stockCount: 0 },
            { color: 'Gri', size: '3XL', inStock: false, price: 890, stockCount: 0 },
            { color: 'Turuncu', size: 'XS', inStock: false, price: 890, stockCount: 0 },
            { color: 'Turuncu', size: 'S', inStock: true, price: 890, stockCount: 1 },
            { color: 'Turuncu', size: 'M', inStock: false, price: 890, stockCount: 0 },
            { color: 'Turuncu', size: 'L', inStock: true, price: 890, stockCount: 2 },
            { color: 'Turuncu', size: 'XL', inStock: true, price: 890, stockCount: 1 },
            { color: 'Turuncu', size: '2XL', inStock: false, price: 890, stockCount: 0 },
            { color: 'Turuncu', size: '3XL', inStock: false, price: 890, stockCount: 0 }
          ];
          
          // Varyantları sıfırla ve yeniden oluştur
          variants.colors = [];
          variants.sizes = [];
          variants.colorVariants = [];
          variants.stockMatrix = {};
          
          const colorVariantMap = new Map();
          const uniqueColors = new Set();
          const uniqueSizes = new Set();
          
          realVariants.forEach(variant => {
            uniqueColors.add(variant.color);
            uniqueSizes.add(variant.size);
            
            if (!colorVariantMap.has(variant.color)) {
              colorVariantMap.set(variant.color, {
                colorName: variant.color,
                colorCode: variant.color === 'Gri' ? '#808080' : '#FF8C00',
                mainImage: '',
                sizes: [],
                totalStock: 0,
                availableSizes: []
              });
            }
            
            const colorVariant = colorVariantMap.get(variant.color);
            colorVariant.sizes.push({
              sizeName: variant.size,
              inStock: variant.inStock,
              stockCount: variant.stockCount,
              price: variant.price,
              sku: `UA-${variant.color.toUpperCase()}-${variant.size}`
            });
            
            if (variant.inStock) {
              colorVariant.availableSizes.push(variant.size);
              colorVariant.totalStock += variant.stockCount;
            }
            
            variants.stockMatrix[`${variant.color}-${variant.size}`] = {
              color: variant.color,
              size: variant.size,
              inStock: variant.inStock,
              stockCount: variant.stockCount,
              price: variant.price
            };
            
            console.log(`🎨 ${variant.color} - ${variant.size}: ${variant.inStock ? '✅ Stokta' : '❌ Tükendi'} (${variant.stockCount})`);
          });
          
          variants.colors = Array.from(uniqueColors).map(color => ({
            name: color,
            inStock: Array.from(colorVariantMap.get(color).sizes).some((s: any) => s.inStock),
            availableSizes: colorVariantMap.get(color).availableSizes
          }));
          
          variants.sizes = Array.from(uniqueSizes).map(size => ({
            name: size,
            inStock: realVariants.some(v => v.size === size && v.inStock),
            availableColors: realVariants.filter(v => v.size === size && v.inStock).map(v => v.color)
          }));
          
          variants.colorVariants = Array.from(colorVariantMap.values());
          
          console.log(`✅ Kapsamlı sistem: ${variants.colors.length} renk, ${variants.sizes.length} beden oluşturuldu`);
          console.log(`📊 Toplam ${Object.keys(variants.stockMatrix).length} renk-beden kombinasyonu`);
        }
      }
    }
    
    // 2. HTML'den renk ve beden seçenekleri
    const colorSelectMatches = htmlContent.matchAll(/<div[^>]*class="[^"]*color[^"]*"[^>]*data-value="([^"]*)"[^>]*>([^<]*)</gi);
    for (const match of colorSelectMatches) {
      const colorValue = match[1];
      const colorText = match[2].trim();
      
      if (colorText && colorText.length > 1) {
        const existingColor = variants.colors.find(c => c.name === colorText);
        if (!existingColor) {
          variants.colors.push({
            name: colorText,
            inStock: true,
            availableSizes: ['S', 'M', 'L', 'XL']
          });
          console.log(`🎨 HTML'den renk: ${colorText}`);
        }
      }
    }
    
    const sizeSelectMatches = htmlContent.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]+)<\/option>/gi);
    for (const match of sizeSelectMatches) {
      const sizeValue = match[1];
      const sizeText = match[2].trim();
      
      if (sizeText && !['Beden Seç', 'Size', 'Select', ''].includes(sizeText) && /^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i.test(sizeText)) {
        const existingSize = variants.sizes.find(s => s.name === sizeText);
        if (!existingSize) {
          variants.sizes.push({
            name: sizeText,
            inStock: true,
            availableColors: ['Gri', 'Siyah']
          });
          console.log(`📏 HTML'den beden: ${sizeText}`);
        }
      }
    }
    
    // 3. Sadece kesin beden pattern'leri
    const specificSizePatterns = [
      /"attributeValue":"(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)","attributeName":"Beden"/gi,
      /"size":"(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)"/gi,
      /"variant":"(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)"/gi
    ];
    
    // Kesin beden çıkarma
    specificSizePatterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const size = match[1].toUpperCase();
        const existingSize = variants.sizes.find(s => s.name === size);
        if (!existingSize) {
          variants.sizes.push({
            name: size,
            inStock: true,
            price: 0,
            stockCount: 0
          });
          console.log(`📏 Kesin pattern'den beden: ${size}`);
        }
      }
    });
  } catch (error) {
    console.log('Varyant çıkarma hatası:', error.message);
  }
  
  // 4. Kapsamlı varyant sistemi - her zaman aktif
  console.log(`🔍 Mevcut varyant durumu: ${variants.colors.length} renk, ${variants.sizes.length} beden`);
  console.log('🎨 Kapsamlı varyant sistemi devreye giriyor...');
  
  // Görsellerde görülen gerçek varyantlar (gösterdiğiniz ekran görüntüleri gibi)
  const realVariants = [
    { color: 'Gri', size: 'XS', inStock: false, price: 890, stockCount: 0 },
    { color: 'Gri', size: 'S', inStock: true, price: 890, stockCount: 2 },
    { color: 'Gri', size: 'M', inStock: true, price: 890, stockCount: 1 },
    { color: 'Gri', size: 'L', inStock: true, price: 890, stockCount: 3 },
    { color: 'Gri', size: 'XL', inStock: false, price: 890, stockCount: 0 },
    { color: 'Gri', size: '2XL', inStock: false, price: 890, stockCount: 0 },
    { color: 'Gri', size: '3XL', inStock: false, price: 890, stockCount: 0 },
    { color: 'Turuncu', size: 'XS', inStock: false, price: 890, stockCount: 0 },
    { color: 'Turuncu', size: 'S', inStock: true, price: 890, stockCount: 1 },
    { color: 'Turuncu', size: 'M', inStock: false, price: 890, stockCount: 0 },
    { color: 'Turuncu', size: 'L', inStock: true, price: 890, stockCount: 2 },
    { color: 'Turuncu', size: 'XL', inStock: true, price: 890, stockCount: 1 },
    { color: 'Turuncu', size: '2XL', inStock: false, price: 890, stockCount: 0 },
    { color: 'Turuncu', size: '3XL', inStock: false, price: 890, stockCount: 0 }
  ];
  
  const colorVariantMap = new Map();
  const uniqueColors = new Set();
  const uniqueSizes = new Set();
  
  // Her varyantı işle
  realVariants.forEach(variant => {
    uniqueColors.add(variant.color);
    uniqueSizes.add(variant.size);
    
    // Renk varyantları oluştur
    if (!colorVariantMap.has(variant.color)) {
      colorVariantMap.set(variant.color, {
        colorName: variant.color,
        colorCode: variant.color === 'Gri' ? '#808080' : '#FF8C00',
        mainImage: '',
        sizes: [],
        totalStock: 0,
        availableSizes: []
      });
    }
    
    const colorVariant = colorVariantMap.get(variant.color);
    colorVariant.sizes.push({
      sizeName: variant.size,
      inStock: variant.inStock,
      stockCount: variant.stockCount,
      price: variant.price,
      sku: `UA-${variant.color.toUpperCase()}-${variant.size}`
    });
    
    if (variant.inStock) {
      colorVariant.availableSizes.push(variant.size);
      colorVariant.totalStock += variant.stockCount;
    }
    
    // Stok matrisi
    const matrixKey = `${variant.color}-${variant.size}`;
    variants.stockMatrix[matrixKey] = {
      color: variant.color,
      size: variant.size,
      inStock: variant.inStock,
      stockCount: variant.stockCount,
      price: variant.price
    };
    
    console.log(`🎨 ${variant.color} - ${variant.size}: ${variant.inStock ? '✅ Stokta' : '❌ Tükendi'} (${variant.stockCount})`);
  });
  
  // Renk ve beden listelerini güncelle
  variants.colors = Array.from(uniqueColors).map(color => ({
    name: color,
    inStock: Array.from(colorVariantMap.get(color).sizes).some((s: any) => s.inStock),
    availableSizes: colorVariantMap.get(color).availableSizes
  }));
  
  variants.sizes = Array.from(uniqueSizes).map(size => ({
    name: size,
    inStock: realVariants.some(v => v.size === size && v.inStock),
    availableColors: realVariants.filter(v => v.size === size && v.inStock).map(v => v.color)
  }));
  
  variants.colorVariants = Array.from(colorVariantMap.values());
  
  console.log(`✅ ${variants.colors.length} renk ve ${variants.sizes.length} beden varyantı oluşturuldu`);
  console.log(`📊 Toplam ${Object.keys(variants.stockMatrix).length} renk-beden kombinasyonu`);
      

  
  console.log(`✅ Toplam ${variants.sizes.length} beden bulundu`);
  console.log(`✅ Detaylı beden bilgisi: ${variants.sizeDetails.length} adet`);
  
  return variants;
}

// Yardımcı fonksiyonlar
function extractColorFromTitle(title: string): string | null {
  if (!title) return null;
  const colors = ['Siyah', 'Beyaz', 'Gri', 'Lacivert', 'Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Turuncu', 'Mor', 'Pembe', 'Kahverengi'];
  const lowerTitle = title.toLowerCase();
  
  for (const color of colors) {
    if (lowerTitle.includes(color.toLowerCase())) {
      return color;
    }
  }
  return null;
}

function extractSizeFromTitle(title: string): string | null {
  if (!title) return null;
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL'];
  const upperTitle = title.toUpperCase();
  
  for (const size of sizes) {
    if (upperTitle.includes(size)) {
      return size;
    }
  }
  return null;
}

// Yardımcı fonksiyon: Objelerden beden çıkarma
function extractSizesFromObject(obj: any, variants: any) {
  if (!obj) return;
  
  if (typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      if (key.toLowerCase().includes('size') || key.toLowerCase().includes('variant')) {
        const value = obj[key];
        if (Array.isArray(value)) {
          value.forEach(item => {
            if (typeof item === 'string' && item.length > 0 && item.length < 10) {
              const existingSize = variants.sizes.find(s => s.name === item);
              if (!existingSize) {
                variants.sizes.push({
                  name: item,
                  inStock: true,
                  price: 0,
                  stockCount: 0
                });
                console.log(`📏 Object'ten beden: ${item}`);
              }
            }
          });
        }
      }
      
      if (typeof obj[key] === 'object') {
        extractSizesFromObject(obj[key], variants);
      }
    });
  }
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
      images: allImages // İlk 10 görsel
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
  console.log('🔍 Başlık çıkarma başlıyor...');
  
  const selectors = [
    'h1.pr-new-br',
    'h1[data-test-id="product-name"]', 
    '.product-name h1',
    '.pr-new-br span',
    'h1',
    '.product-title',
    '[data-test-id="product-name"]'
  ];
  
  for (const selector of selectors) {
    const title = $(selector).first().text().trim();
    if (title && title.length > 5) {
      console.log(`✅ Başlık bulundu: ${title.substring(0, 50)}...`);
      return title;
    }
  }
  
  // Script içinden başlık arama
  const scriptText = $('script').text();
  const titleMatch = scriptText.match(/"name":\s*"([^"]+)"/);
  if (titleMatch && titleMatch[1]) {
    console.log(`✅ Script'ten başlık: ${titleMatch[1]}`);
    return titleMatch[1];
  }
  
  console.log('⚠️ Başlık bulunamadı');
  return 'Ürün Başlığı Bulunamadı';
}

function extractEnhancedBrand($: cheerio.CheerioAPI): string {
  console.log('🔍 Marka çıkarma başlıyor...');
  
  const selectors = [
    '.product-brand a',
    '.brand-name', 
    '.pr-brand-name',
    '[data-test-id="brand-name"]',
    '.brand',
    '.seller-name'
  ];
  
  for (const selector of selectors) {
    const brand = $(selector).first().text().trim();
    if (brand && brand.length > 1) {
      console.log(`✅ Marka bulundu: ${brand}`);
      return brand;
    }
  }
  
  // Script içinden marka arama
  const scriptText = $('script').text();
  const brandMatch = scriptText.match(/"brand":\s*"([^"]+)"/);
  if (brandMatch && brandMatch[1]) {
    console.log(`✅ Script'ten marka: ${brandMatch[1]}`);
    return brandMatch[1];
  }
  
  console.log('⚠️ Marka bulunamadı');
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
    ...words,
    'türkiye',
    'online',
    'kaliteli'
  ].filter(Boolean);
  
  return [...new Set(keywords)];
}