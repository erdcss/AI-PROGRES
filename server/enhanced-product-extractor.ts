/**
 * Enhanced Product Data Extractor
 * Comprehensive extraction of variants and features from Trendyol products
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
}

export interface ProductVariant {
  color: string;
  size: string;
  inStock: boolean;
  price?: number;
  sku?: string;
}

export interface EnhancedProductData {
  features: ProductFeature[];
  variants: ProductVariant[];
  hasRealVariants: boolean;
  specifications: {
    brand: string;
    model?: string;
    material?: string;
    color?: string;
    size?: string;
    weight?: string;
    dimensions?: string;
  };
}

export function extractEnhancedProductData(html: string): EnhancedProductData {
  const $ = cheerio.load(html);
  
  console.log('🔍 Gelişmiş ürün verisi çıkarılıyor...');
  
  // 1. Özellikler (Features) çıkarma
  const features: ProductFeature[] = [];
  
  // Trendyol özellik tabloları
  $('.detail-attr, .product-detail-attributes, .pr-in-at').each((i, el) => {
    const keyEl = $(el).find('.detail-attr-item-key, .attr-key, dt');
    const valueEl = $(el).find('.detail-attr-item-value, .attr-value, dd');
    
    if (keyEl.length && valueEl.length) {
      const key = keyEl.text().trim();
      const value = valueEl.text().trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({
          key,
          value,
          category: categorizeFeature(key)
        });
      }
    }
  });
  
  // Ürün açıklama listelerinden özellik çıkarma
  $('.pr-in-dt-cn ul li, .product-description li').each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes(':') && text.length < 150) {
      const [key, ...valueParts] = text.split(':');
      const value = valueParts.join(':').trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({
          key: key.trim(),
          value: value,
          category: categorizeFeature(key.trim())
        });
      }
    }
  });
  
  // Script içindeki ürün özelliklerini çıkar
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    
    // Product details JSON'ı ara
    const productMatch = scriptContent.match(/"productDetails":\s*({[^}]+})/);
    if (productMatch) {
      try {
        const productDetails = JSON.parse(productMatch[1]);
        Object.entries(productDetails).forEach(([key, value]) => {
          if (typeof value === 'string' && key && value) {
            features.push({
              key: formatFeatureKey(key),
              value: String(value),
              category: categorizeFeature(key)
            });
          }
        });
      } catch (e) {
        console.log('Product details parse error:', e);
      }
    }
    
    // Attributes array'i ara
    const attrMatch = scriptContent.match(/"attributes":\s*\[([^\]]+)\]/);
    if (attrMatch) {
      try {
        const attrContent = attrMatch[1];
        const attrMatches = attrContent.matchAll(/"name":\s*"([^"]+)".*?"value":\s*"([^"]+)"/g);
        for (const match of attrMatches) {
          const [, key, value] = match;
          if (key && value) {
            features.push({
              key: key,
              value: value,
              category: categorizeFeature(key)
            });
          }
        }
      } catch (e) {
        console.log('Attributes parse error:', e);
      }
    }
  });
  
  // 2. Gerçek varyantları algıla
  const variantData = detectRealVariants($, html);
  
  // 3. Spesifikasyonları çıkar
  const specifications = extractSpecifications(features);
  
  // Tekrar eden özellikleri temizle
  const uniqueFeatures = removeDuplicateFeatures(features);
  
  console.log(`✅ ${uniqueFeatures.length} benzersiz özellik çıkarıldı`);
  console.log(`✅ ${variantData.variants.length} varyant tespit edildi`);
  
  return {
    features: uniqueFeatures,
    variants: variantData.variants,
    hasRealVariants: variantData.hasRealVariants,
    specifications
  };
}

function detectRealVariants($: cheerio.CheerioAPI, html: string): { hasRealVariants: boolean; variants: ProductVariant[] } {
  let realColors: string[] = [];
  let realSizes: string[] = [];
  
  // 1. Renk seçici butonları
  $('.pr-in-dt-sz-wr .pr-in-dt-cl, .variant-color, .color-variant').each((i, el) => {
    const colorText = $(el).attr('title') || $(el).attr('data-color') || $(el).text().trim();
    if (colorText && colorText.length > 1 && colorText.length < 30) {
      realColors.push(colorText);
    }
  });
  
  // 2. Beden seçici butonları
  $('.pr-in-dt-sz-wr .pr-in-dt-sz, .variant-size, .size-variant').each((i, el) => {
    const sizeText = $(el).attr('title') || $(el).attr('data-size') || $(el).text().trim();
    if (sizeText && sizeText.length > 0 && sizeText.length < 10) {
      realSizes.push(sizeText);
    }
  });
  
  // 3. Script içindeki varyant verilerini kontrol et
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    
    // Variants array kontrolü
    const variantMatch = scriptContent.match(/"variants":\s*\[([^\]]+)\]/);
    if (variantMatch) {
      const variantContent = variantMatch[1];
      
      // Renk varyantları
      const colorMatches = variantContent.match(/"color":\s*"([^"]+)"/g);
      if (colorMatches && colorMatches.length > 1) {
        colorMatches.forEach(match => {
          const color = match.match(/"color":\s*"([^"]+)"/)?.[1];
          if (color && !realColors.includes(color)) {
            realColors.push(color);
          }
        });
      }
      
      // Beden varyantları
      const sizeMatches = variantContent.match(/"size":\s*"([^"]+)"/g);
      if (sizeMatches && sizeMatches.length > 1) {
        sizeMatches.forEach(match => {
          const size = match.match(/"size":\s*"([^"]+)"/)?.[1];
          if (size && !realSizes.includes(size)) {
            realSizes.push(size);
          }
        });
      }
    }
  });
  
  // Tekrarları kaldır ve temizle
  realColors = [...new Set(realColors)].filter(c => c && c !== 'undefined');
  realSizes = [...new Set(realSizes)].filter(s => s && s !== 'undefined');
  
  console.log(`🎨 Gerçek renkler: ${realColors.length} -> ${realColors.join(', ')}`);
  console.log(`📏 Gerçek bedenler: ${realSizes.length} -> ${realSizes.join(', ')}`);
  
  // Varyant kombinasyonları oluştur
  const variants: ProductVariant[] = [];
  
  if (realColors.length === 0 && realSizes.length === 0) {
    console.log('🚫 Gerçek varyant seçenekleri bulunamadı');
    return { hasRealVariants: false, variants: [] };
  }
  
  if (realColors.length > 0 && realSizes.length > 0) {
    // Hem renk hem beden var
    realColors.forEach(color => {
      realSizes.forEach(size => {
        variants.push({
          color,
          size,
          inStock: true
        });
      });
    });
  } else if (realColors.length > 0) {
    // Sadece renk var
    realColors.forEach(color => {
      variants.push({
        color,
        size: 'Tek Beden',
        inStock: true
      });
    });
  } else if (realSizes.length > 0) {
    // Sadece beden var
    realSizes.forEach(size => {
      variants.push({
        color: 'Standart',
        size,
        inStock: true
      });
    });
  }
  
  console.log(`✅ ${variants.length} gerçek varyant kombinasyonu oluşturuldu`);
  
  return { hasRealVariants: true, variants };
}

function categorizeFeature(key: string): string {
  const lowerKey = key.toLowerCase();
  
  if (lowerKey.includes('malzeme') || lowerKey.includes('kumaş') || lowerKey.includes('material')) {
    return 'Malzeme';
  }
  if (lowerKey.includes('renk') || lowerKey.includes('color')) {
    return 'Renk';
  }
  if (lowerKey.includes('beden') || lowerKey.includes('size') || lowerKey.includes('ölçü')) {
    return 'Beden';
  }
  if (lowerKey.includes('marka') || lowerKey.includes('brand')) {
    return 'Marka';
  }
  if (lowerKey.includes('model') || lowerKey.includes('tip')) {
    return 'Model';
  }
  if (lowerKey.includes('ağırlık') || lowerKey.includes('weight')) {
    return 'Ağırlık';
  }
  if (lowerKey.includes('boyut') || lowerKey.includes('dimension')) {
    return 'Boyut';
  }
  
  return 'Genel';
}

function formatFeatureKey(key: string): string {
  // camelCase'i düz metne çevir
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function extractSpecifications(features: ProductFeature[]): any {
  const specs: any = {};
  
  features.forEach(feature => {
    const lowerKey = feature.key.toLowerCase();
    
    if (lowerKey.includes('marka') || lowerKey.includes('brand')) {
      specs.brand = feature.value;
    } else if (lowerKey.includes('model')) {
      specs.model = feature.value;
    } else if (lowerKey.includes('malzeme') || lowerKey.includes('kumaş')) {
      specs.material = feature.value;
    } else if (lowerKey.includes('renk')) {
      specs.color = feature.value;
    } else if (lowerKey.includes('beden') || lowerKey.includes('size')) {
      specs.size = feature.value;
    } else if (lowerKey.includes('ağırlık')) {
      specs.weight = feature.value;
    } else if (lowerKey.includes('boyut') || lowerKey.includes('ölçü')) {
      specs.dimensions = feature.value;
    }
  });
  
  return specs;
}

function removeDuplicateFeatures(features: ProductFeature[]): ProductFeature[] {
  const seen = new Set<string>();
  const unique: ProductFeature[] = [];
  
  features.forEach(feature => {
    const key = `${feature.key}:${feature.value}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(feature);
    }
  });
  
  return unique;
}