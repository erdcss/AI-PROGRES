/**
 * Gelişmiş Ürün Özellikleri Çıkarma Sistemi
 * AI destekli kapsamlı ürün özelliklerini ve teknik detayları çıkarır
 */

import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface ProductFeature {
  name: string;
  value: string;
  category: 'material' | 'size' | 'color' | 'technical' | 'care' | 'general';
  importance: 'high' | 'medium' | 'low';
}

export interface EnhancedProductFeatures {
  basicFeatures: ProductFeature[];
  technicalSpecs: ProductFeature[];
  materialInfo: ProductFeature[];
  careInstructions: ProductFeature[];
  sizeGuide: ProductFeature[];
  aiExtractedFeatures: ProductFeature[];
  structuredData: {
    brand: string;
    model: string;
    category: string;
    materials: string[];
    colors: string[];
    sizes: string[];
    weight?: string;
    dimensions?: string;
    origin?: string;
  };
}

/**
 * AI ile ürün özelliklerini analiz eder
 */
async function extractFeaturesWithAI(description: string, htmlContent: string): Promise<ProductFeature[]> {
  try {
    console.log('🤖 AI ile ürün özellikleri çıkarılıyor...');
    
    const prompt = `Bu ürün açıklamasından detaylı özellikleri çıkar ve JSON formatında döndür:

Açıklama: "${description.substring(0, 1000)}..."

HTML içeriğinden de özellik bilgileri:
${htmlContent.substring(0, 2000)}...

Çıkaracağın özellikler:
- Malzeme bilgileri
- Teknik özellikler  
- Beden/ölçü bilgileri
- Bakım talimatları
- Renk seçenekleri
- Özel özellikler

JSON formatı:
{
  "features": [
    {
      "name": "özellik adı",
      "value": "özellik değeri", 
      "category": "material|size|color|technical|care|general",
      "importance": "high|medium|low"
    }
  ]
}

Türkçe terimler kullan, tekrarlama ve gereksiz bilgilerden kaçın.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = JSON.parse(response.content[0].text);
    console.log(`✅ AI ile ${result.features?.length || 0} özellik çıkarıldı`);
    
    return result.features || [];
    
  } catch (error) {
    console.log(`⚠️ AI özellik çıkarma hatası: ${error.message}`);
    return [];
  }
}

/**
 * HTML'den yapılandırılmış ürün özelliklerini çıkarır
 */
function extractStructuredFeatures($: cheerio.CheerioAPI): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  // Özellik tabloları
  $('.product-detail-info table tr, .product-features table tr, .specifications table tr').each((i, row) => {
    const cells = $(row).find('td');
    if (cells.length >= 2) {
      const name = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (name && value && name.length < 50 && value.length < 200) {
        features.push({
          name,
          value,
          category: categorizeFeature(name),
          importance: getFeatureImportance(name)
        });
      }
    }
  });
  
  // Özellik listesi
  $('.product-details li, .product-features li, .features li').each((i, item) => {
    const text = $(item).text().trim();
    const parts = text.split(':');
    
    if (parts.length === 2) {
      const name = parts[0].trim();
      const value = parts[1].trim();
      
      features.push({
        name,
        value,
        category: categorizeFeature(name),
        importance: getFeatureImportance(name)
      });
    } else if (text.length > 0 && text.length < 100) {
      features.push({
        name: 'Özellik',
        value: text,
        category: 'general',
        importance: 'medium'
      });
    }
  });
  
  // Meta verilerden özellikler
  $('script[type="application/ld+json"]').each((i, script) => {
    try {
      const data = JSON.parse($(script).html() || '{}');
      if (data.additionalProperty) {
        data.additionalProperty.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({
              name: prop.name,
              value: prop.value.toString(),
              category: categorizeFeature(prop.name),
              importance: 'high'
            });
          }
        });
      }
    } catch (e) {}
  });
  
  return features;
}

/**
 * Özellik kategorisini belirler
 */
function categorizeFeature(name: string): 'material' | 'size' | 'color' | 'technical' | 'care' | 'general' {
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('malzeme') || nameLower.includes('kumaş') || nameLower.includes('materyal')) {
    return 'material';
  }
  if (nameLower.includes('beden') || nameLower.includes('ölçü') || nameLower.includes('boyut')) {
    return 'size';
  }
  if (nameLower.includes('renk') || nameLower.includes('color')) {
    return 'color';
  }
  if (nameLower.includes('bakım') || nameLower.includes('yıkama') || nameLower.includes('temizlik')) {
    return 'care';
  }
  if (nameLower.includes('ağırlık') || nameLower.includes('boyut') || nameLower.includes('teknik')) {
    return 'technical';
  }
  
  return 'general';
}

/**
 * Özellik önemini belirler
 */
function getFeatureImportance(name: string): 'high' | 'medium' | 'low' {
  const nameLower = name.toLowerCase();
  
  const highImportance = ['malzeme', 'kumaş', 'beden', 'renk', 'marka', 'model'];
  const lowImportance = ['not', 'dipnot', 'uyarı', 'bilgi'];
  
  if (highImportance.some(term => nameLower.includes(term))) {
    return 'high';
  }
  if (lowImportance.some(term => nameLower.includes(term))) {
    return 'low';
  }
  
  return 'medium';
}

/**
 * Ana özellik çıkarma fonksiyonu
 */
export async function extractEnhancedProductFeatures(
  htmlContent: string, 
  productDescription: string
): Promise<EnhancedProductFeatures> {
  
  const $ = cheerio.load(htmlContent);
  
  console.log('🔍 Gelişmiş ürün özellikleri çıkarılıyor...');
  
  // 1. Yapılandırılmış özellikler
  const structuredFeatures = extractStructuredFeatures($);
  
  // 2. AI ile özellik çıkarma
  const aiFeatures = await extractFeaturesWithAI(productDescription, htmlContent);
  
  // 3. Kategori bazında gruplandırma
  const allFeatures = [...structuredFeatures, ...aiFeatures];
  
  const basicFeatures = allFeatures.filter(f => f.category === 'general');
  const technicalSpecs = allFeatures.filter(f => f.category === 'technical');
  const materialInfo = allFeatures.filter(f => f.category === 'material');
  const careInstructions = allFeatures.filter(f => f.category === 'care');
  const sizeGuide = allFeatures.filter(f => f.category === 'size');
  
  // 4. Yapılandırılmış veri oluşturma
  const structuredData = {
    brand: extractFromFeatures(allFeatures, 'marka') || '',
    model: extractFromFeatures(allFeatures, 'model') || '',
    category: extractFromFeatures(allFeatures, 'kategori') || '',
    materials: extractMultipleValues(allFeatures, 'malzeme'),
    colors: extractMultipleValues(allFeatures, 'renk'),
    sizes: extractMultipleValues(allFeatures, 'beden'),
    weight: extractFromFeatures(allFeatures, 'ağırlık'),
    dimensions: extractFromFeatures(allFeatures, 'boyut'),
    origin: extractFromFeatures(allFeatures, 'menşei')
  };
  
  console.log(`✅ Toplam ${allFeatures.length} özellik çıkarıldı:`);
  console.log(`   📋 Temel: ${basicFeatures.length}`);
  console.log(`   🔧 Teknik: ${technicalSpecs.length}`);
  console.log(`   🧵 Malzeme: ${materialInfo.length}`);
  console.log(`   🧽 Bakım: ${careInstructions.length}`);
  console.log(`   📏 Beden: ${sizeGuide.length}`);
  
  return {
    basicFeatures,
    technicalSpecs,
    materialInfo,
    careInstructions,
    sizeGuide,
    aiExtractedFeatures: aiFeatures,
    structuredData
  };
}

/**
 * Özelliklerden belirli bir değeri çıkarır
 */
function extractFromFeatures(features: ProductFeature[], searchTerm: string): string | undefined {
  const feature = features.find(f => 
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.value.toLowerCase().includes(searchTerm.toLowerCase())
  );
  return feature?.value;
}

/**
 * Özelliklerden çoklu değerleri çıkarır
 */
function extractMultipleValues(features: ProductFeature[], searchTerm: string): string[] {
  return features
    .filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .map(f => f.value)
    .filter(v => v && v.length > 0);
}