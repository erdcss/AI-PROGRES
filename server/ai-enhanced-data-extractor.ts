/**
 * AI Destekli Veri Çıkarma Sistemi
 * Yapay zeka ile ürün bilgilerinin akıllı analizi, kategorilendirme ve doğrulama
 */

import Anthropic from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

// AI instance
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface AIEnhancedProductData {
  // Temel ürün bilgileri
  title: string;
  cleanTitle: string; // AI ile temizlenmiş başlık
  brand: string;
  category: string;
  subcategory: string;
  price: string;
  originalPrice?: string;
  currency: string;
  
  // AI ile çıkarılan bilgiler
  productType: string;
  targetAudience: 'erkek' | 'kadın' | 'çocuk' | 'unisex';
  ageGroup: 'bebek' | 'çocuk' | 'genç' | 'yetişkin' | 'yaşlı';
  season: 'ilkbahar' | 'yaz' | 'sonbahar' | 'kış' | 'tüm_sezonlar';
  occasion: string[]; // günlük, spor, resmi, özel vb.
  
  // Özellikler ve materyaller
  materials: string[];
  features: string[];
  specifications: Record<string, string>;
  
  // Varyantlar
  colors: string[];
  sizes: string[];
  variants: Array<{
    color: string;
    size: string;
    available: boolean;
    price?: string;
  }>;
  
  // Kalite ve güvenilirlik
  dataQuality: number; // 0-1 arası
  aiConfidence: number; // 0-1 arası
  extractionMethod: string[];
  
  // Shopify uyumluluğu
  shopifyReady: boolean;
  shopifyTags: string[];
  seoTitle: string;
  seoDescription: string;
}

/**
 * AI ile ürün başlığını temizleme ve optimize etme
 */
async function cleanProductTitleWithAI(rawTitle: string, brand: string): Promise<{cleanTitle: string, seoTitle: string}> {
  try {
    // Hızlı fallback temizleme
    const cleanTitle = rawTitle
      .replace(/[^\w\sÇŞĞÜÖİçşğüöı\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return { cleanTitle, seoTitle: cleanTitle };
    }
    
    console.log('🤖 AI ile ürün başlığı temizleniyor...');
    
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ 
        role: 'user', 
        content: `Başlık: "${rawTitle}" Marka: "${brand}" - Temizle ve SEO optimize et. JSON: {"cleanTitle": "temiz başlık", "seoTitle": "seo başlık"}` 
      }],
    });

    const result = JSON.parse(response.content[0].text);
    console.log(`✅ Başlık temizlendi: ${result.cleanTitle}`);
    
    return {
      cleanTitle: result.cleanTitle || cleanTitle,
      seoTitle: result.seoTitle || cleanTitle
    };
    
  } catch (error) {
    console.log(`⚠️ AI başlık temizleme hatası, yerel temizlik kullanılıyor`);
    const cleanTitle = rawTitle
      .replace(/[^\w\sÇŞĞÜÖİçşğüöı\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      cleanTitle,
      seoTitle: cleanTitle
    };
  }
}

/**
 * AI ile ürün kategorisi ve hedef kitle analizi
 */
async function analyzeProductCategoryWithAI(title: string, description: string): Promise<{
  category: string;
  subcategory: string;
  productType: string;
  targetAudience: string;
  ageGroup: string;
  season: string;
  occasion: string[];
}> {
  try {
    console.log('🎯 AI ile ürün kategorisi analiz ediliyor...');
    
    const prompt = `Bu ürünü kategorize et ve hedef kitlesini belirle.

Başlık: "${title}"
Açıklama: "${description.substring(0, 500)}..."

JSON formatında döndür:
{
  "category": "ana kategori (giyim, ayakkabı, aksesuar, elektronik vb.)",
  "subcategory": "alt kategori",
  "productType": "ürün tipi (tişört, pantolon, ceket vb.)",
  "targetAudience": "erkek|kadın|çocuk|unisex",
  "ageGroup": "bebek|çocuk|genç|yetişkin|yaşlı",
  "season": "ilkbahar|yaz|sonbahar|kış|tüm_sezonlar",
  "occasion": ["günlük", "spor", "resmi", "özel"]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = JSON.parse(response.content[0].text);
    console.log(`✅ Kategori analizi: ${analysis.category} > ${analysis.subcategory}`);
    
    return analysis;
    
  } catch (error) {
    console.log(`⚠️ AI kategori analizi hatası: ${error.message}`);
    return {
      category: 'Genel',
      subcategory: 'Diğer',
      productType: 'Ürün',
      targetAudience: 'unisex',
      ageGroup: 'yetişkin',
      season: 'tüm_sezonlar',
      occasion: ['günlük']
    };
  }
}

/**
 * AI ile malzeme ve özellik çıkarma
 */
async function extractMaterialsAndFeaturesWithAI(description: string, specifications: Record<string, string>): Promise<{
  materials: string[];
  features: string[];
  shopifyTags: string[];
}> {
  try {
    console.log('🧵 AI ile malzeme ve özellik çıkarımı...');
    
    const prompt = `Bu ürün açıklamasından malzemeleri ve önemli özellikleri çıkar.

Açıklama: "${description.substring(0, 1000)}..."

Özellikler: ${JSON.stringify(specifications)}

JSON formatında döndür:
{
  "materials": ["pamuk", "polyester", "elastan"],
  "features": ["su geçirmez", "nefes alabilir", "streç"],
  "shopifyTags": ["pamuk", "rahat", "günlük", "modern"]
}

Türkçe terimler kullan ve gereksiz detayları çıkar.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = JSON.parse(response.content[0].text);
    console.log(`✅ ${result.materials.length} malzeme, ${result.features.length} özellik tespit edildi`);
    
    return result;
    
  } catch (error) {
    console.log(`⚠️ AI malzeme analizi hatası: ${error.message}`);
    return {
      materials: [],
      features: [],
      shopifyTags: []
    };
  }
}

/**
 * AI ile veri kalitesi değerlendirmesi
 */
async function evaluateDataQualityWithAI(productData: any): Promise<{
  dataQuality: number;
  aiConfidence: number;
  qualityReport: string;
  improvementSuggestions: string[];
}> {
  try {
    console.log('📊 AI ile veri kalitesi değerlendirmesi...');
    
    const prompt = `Bu ürün verisinin kalitesini değerlendir (0-1 arası).

Ürün Verisi:
- Başlık: "${productData.title}"
- Marka: "${productData.brand}"
- Fiyat: "${productData.price}"
- Görsel sayısı: ${productData.images?.length || 0}
- Özellik sayısı: ${Object.keys(productData.specifications || {}).length}

Değerlendirme kriterleri:
- Başlık kalitesi ve netliği
- Fiyat bilgisi varlığı
- Görsel kalitesi ve sayısı
- Ürün özellikleri detayı
- Varyant bilgileri

JSON formatında döndür:
{
  "dataQuality": 0.85,
  "aiConfidence": 0.92,
  "qualityReport": "kısa rapor",
  "improvementSuggestions": ["öneri1", "öneri2"]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const evaluation = JSON.parse(response.content[0].text);
    console.log(`✅ Veri kalitesi: ${(evaluation.dataQuality * 100).toFixed(1)}%`);
    
    return evaluation;
    
  } catch (error) {
    console.log(`⚠️ AI kalite değerlendirme hatası: ${error.message}`);
    return {
      dataQuality: 0.7,
      aiConfidence: 0.6,
      qualityReport: 'Otomatik değerlendirme yapılamadı',
      improvementSuggestions: []
    };
  }
}

/**
 * Ana AI destekli veri çıkarma fonksiyonu
 */
export async function extractDataWithAI(
  htmlContent: string, 
  basicData: any
): Promise<AIEnhancedProductData> {
  
  console.log('🤖 AI destekli kapsamlı veri çıkarma başlatılıyor...');
  
  // 1. Başlık temizleme
  const titleResult = await cleanProductTitleWithAI(basicData.title, basicData.brand);
  
  // 2. Kategori analizi
  const categoryAnalysis = await analyzeProductCategoryWithAI(
    basicData.title, 
    basicData.description || ''
  );
  
  // 3. Malzeme ve özellik çıkarma
  const materialFeatures = await extractMaterialsAndFeaturesWithAI(
    basicData.description || '', 
    basicData.specifications || {}
  );
  
  // 4. Gelişmiş veri yapısı oluşturma
  const enhancedData: AIEnhancedProductData = {
    // Temel bilgiler
    title: basicData.title,
    cleanTitle: titleResult.cleanTitle,
    brand: basicData.brand,
    category: categoryAnalysis.category,
    subcategory: categoryAnalysis.subcategory,
    price: basicData.price,
    originalPrice: basicData.originalPrice,
    currency: 'TL',
    
    // AI analizleri
    productType: categoryAnalysis.productType,
    targetAudience: categoryAnalysis.targetAudience as any,
    ageGroup: categoryAnalysis.ageGroup as any,
    season: categoryAnalysis.season as any,
    occasion: categoryAnalysis.occasion,
    
    // Materyaller ve özellikler
    materials: materialFeatures.materials,
    features: materialFeatures.features,
    specifications: basicData.specifications || {},
    
    // Varyantlar
    colors: basicData.colors || [],
    sizes: basicData.sizes || [],
    variants: basicData.variants || [],
    
    // Kalite bilgileri
    dataQuality: 0,
    aiConfidence: 0,
    extractionMethod: ['ai-enhanced', 'dom-parsing', 'script-analysis'],
    
    // Shopify uyumluluğu
    shopifyReady: true,
    shopifyTags: materialFeatures.shopifyTags,
    seoTitle: titleResult.seoTitle,
    seoDescription: `${titleResult.cleanTitle} - ${basicData.brand} markasından ${categoryAnalysis.productType}. ${materialFeatures.features.slice(0, 3).join(', ')}.`
  };
  
  // 5. Veri kalitesi değerlendirmesi
  const qualityEvaluation = await evaluateDataQualityWithAI({
    ...basicData,
    ...enhancedData
  });
  
  enhancedData.dataQuality = qualityEvaluation.dataQuality;
  enhancedData.aiConfidence = qualityEvaluation.aiConfidence;
  
  console.log('✅ AI destekli veri çıkarma tamamlandı:');
  console.log(`   📊 Veri kalitesi: ${(enhancedData.dataQuality * 100).toFixed(1)}%`);
  console.log(`   🎯 AI güveni: ${(enhancedData.aiConfidence * 100).toFixed(1)}%`);
  console.log(`   🏷️ Kategori: ${enhancedData.category} > ${enhancedData.subcategory}`);
  console.log(`   🎨 Malzemeler: ${enhancedData.materials.join(', ')}`);
  console.log(`   ⭐ Özellikler: ${enhancedData.features.slice(0, 3).join(', ')}`);
  
  return enhancedData;
}

/**
 * AI ile Shopify CSV optimizasyonu
 */
export async function optimizeForShopifyWithAI(productData: AIEnhancedProductData): Promise<{
  optimizedTitle: string;
  optimizedDescription: string;
  optimizedTags: string[];
  handle: string;
  seoMetadata: {
    title: string;
    description: string;
    keywords: string[];
  };
}> {
  try {
    console.log('🛒 AI ile Shopify optimizasyonu...');
    
    const prompt = `Bu ürün verisini Shopify e-ticaret platformu için optimize et.

Ürün:
- Başlık: "${productData.cleanTitle}"
- Kategori: "${productData.category} > ${productData.subcategory}"
- Özellikler: ${productData.features.join(', ')}
- Malzemeler: ${productData.materials.join(', ')}

Shopify için optimize et:
1. SEO dostu başlık (60 karakter altı)
2. Satış odaklı açıklama (150-200 kelime)
3. Arama dostu etiketler
4. URL handle
5. Meta açıklama

JSON formatında döndür:
{
  "optimizedTitle": "SEO başlık",
  "optimizedDescription": "satış açıklaması",
  "optimizedTags": ["etiket1", "etiket2"],
  "handle": "url-handle",
  "seoMetadata": {
    "title": "meta başlık",
    "description": "meta açıklama",
    "keywords": ["anahtar1", "anahtar2"]
  }
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const optimization = JSON.parse(response.content[0].text);
    console.log(`✅ Shopify optimizasyonu tamamlandı`);
    
    return optimization;
    
  } catch (error) {
    console.log(`⚠️ AI Shopify optimizasyonu hatası: ${error.message}`);
    return {
      optimizedTitle: productData.cleanTitle,
      optimizedDescription: `${productData.cleanTitle} - ${productData.brand} markasından kaliteli ${productData.productType}.`,
      optimizedTags: productData.shopifyTags,
      handle: productData.cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      seoMetadata: {
        title: productData.seoTitle,
        description: productData.seoDescription,
        keywords: productData.shopifyTags
      }
    };
  }
}