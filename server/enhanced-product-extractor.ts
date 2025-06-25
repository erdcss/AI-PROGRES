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
  
  // Trendyol özellik tabloları - Gelişmiş selector'lar
  $('.detail-attr, .product-detail-attributes, .pr-in-at, .detail-attr-item').each((i, el) => {
    const keyEl = $(el).find('.detail-attr-item-key, .attr-key, dt, .detail-attr-key');
    const valueEl = $(el).find('.detail-attr-item-value, .attr-value, dd, .detail-attr-value');
    
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
  
  // Gelişmiş özellik çıkarma - Trendyol'un yeni yapısı
  $('.product-detail-module .detail-attribute-list li, .detail-attr-list li').each((i, el) => {
    const key = $(el).find('.detail-attr-item-key, .attr-name, .attribute-name').text().trim();
    const value = $(el).find('.detail-attr-item-value, .attr-value, .attribute-value').text().trim();
    
    if (key && value) {
      features.push({
        key,
        value,
        category: categorizeFeature(key)
      });
    }
  });
  
  // JSON-LD yapılandırılmış veri arama - Gelişmiş
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const jsonData = JSON.parse($(el).html() || '{}');
      
      // additionalProperty array'i
      if (jsonData.additionalProperty && Array.isArray(jsonData.additionalProperty)) {
        jsonData.additionalProperty.forEach((prop: any) => {
          if (prop.name && (prop.value || prop.unitText)) {
            const key = prop.name;
            const value = prop.value || prop.unitText;
            
            if (key && value && key.length < 50 && String(value).length < 200) {
              features.push({
                key,
                value: String(value),
                category: categorizeFeature(key)
              });
              console.log(`✅ JSON-LD özellik: ${key}: ${value}`);
            }
          }
        });
      }
      
      // Product specifications
      if (jsonData.model && jsonData.model.length > 0) {
        features.push({
          key: 'Model',
          value: jsonData.model,
          category: 'Model'
        });
      }
      
      if (jsonData.brand && typeof jsonData.brand === 'object' && jsonData.brand.name) {
        features.push({
          key: 'Marka',
          value: jsonData.brand.name,
          category: 'Marka'
        });
      }
      
      if (jsonData.color && jsonData.color.length > 0) {
        features.push({
          key: 'Renk',
          value: jsonData.color,
          category: 'Renk'
        });
      }
      
      if (jsonData.material && jsonData.material.length > 0) {
        features.push({
          key: 'Materyal',
          value: jsonData.material,
          category: 'Materyal'
        });
      }
      
    } catch (e) {
      console.log('JSON-LD parse hatası:', e);
    }
  });
  
  // Script içindeki product data'dan özellik çıkarma
  $('script').each((i, elem) => {
    const scriptContent = $(elem).html() || '';
    
    // Trendyol product data JSON'unu ara
    const productDataMatch = scriptContent.match(/"product":\s*({[^}]+})/);
    if (productDataMatch) {
      try {
        const productData = JSON.parse(productDataMatch[1]);
        
        // Özellikler çıkar
        if (productData.attributes && Array.isArray(productData.attributes)) {
          productData.attributes.forEach((attr: any) => {
            if (attr.key && attr.value) {
              features.push({
                key: attr.key,
                value: String(attr.value),
                category: categorizeFeature(attr.key)
              });
            }
          });
        }
        
        // Brand bilgisi
        if (productData.brand) {
          features.push({
            key: 'Marka',
            value: productData.brand,
            category: 'Marka'
          });
        }
        
        // Category bilgisi
        if (productData.category) {
          features.push({
            key: 'Kategori',
            value: productData.category,
            category: 'Kategori'
          });
        }
      } catch (e) {
        // JSON parse hatası
      }
    }
    
    // Attributes array'ini ara
    const attributesMatch = scriptContent.match(/"attributes":\s*\[([^\]]+)\]/);
    if (attributesMatch) {
      try {
        const attributesJson = `[${attributesMatch[1]}]`;
        const attributes = JSON.parse(attributesJson);
        
        attributes.forEach((attr: any) => {
          if (attr.key && attr.value) {
            const key = attr.key.replace(/[^a-zA-ZÇĞÜÖŞçğüöş\s]/g, '').trim();
            const value = String(attr.value).replace(/[^a-zA-ZÇĞÜÖŞçğüöş0-9\s%.,/-]/g, '').trim();
            
            if (key && value && key.length < 50 && value.length < 200) {
              features.push({
                key,
                value,
                category: categorizeFeature(key)
              });
            }
          }
        });
      } catch (e) {
        // JSON parse hatası
      }
    }
  });
  
  // Ürün açıklama listelerinden özellik çıkarma
  $('.pr-in-dt-cn ul li, .product-description li, .product-detail ul li, .product-features li').each((i, el) => {
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
  
  // Tablo formatındaki özellikler
  $('table tr, .table tr, .product-table tr').each((i, el) => {
    const cells = $(el).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (key && value && key.length < 50 && value.length < 200) {
        features.push({
          key,
          value,
          category: categorizeFeature(key)
        });
      }
    }
  });
  
  // HTML içinde metin kalıpları ile özellik arama
  const htmlText = $.text();
  const featurePatterns = [
    /Kalıp\s*:?\s*([^\n\r,;]+)/gi,
    /Materyal\s*:?\s*([^\n\r,;]+)/gi,
    /Cep\s*:?\s*([^\n\r,;]+)/gi,
    /Astar\s*Durumu\s*:?\s*([^\n\r,;]+)/gi,
    /Kol\s*Tipi\s*:?\s*([^\n\r,;]+)/gi,
    /Desen\s*:?\s*([^\n\r,;]+)/gi,
    /Yaka\s*Tipi\s*:?\s*([^\n\r,;]+)/gi,
    /Kumaş\s*Tipi\s*:?\s*([^\n\r,;]+)/gi,
    /Renk\s*:?\s*([^\n\r,;]+)/gi,
    /Kapama\s*Şekli\s*:?\s*([^\n\r,;]+)/gi,
    /Kol\s*Boyu\s*:?\s*([^\n\r,;]+)/gi,
    /Koleksiyon\s*:?\s*([^\n\r,;]+)/gi,
    /Kalınlık\s*:?\s*([^\n\r,;]+)/gi,
    /Boy\s*:?\s*([^\n\r,;]+)/gi,
    /Siluet\s*:?\s*([^\n\r,;]+)/gi,
    /Ortam\s*:?\s*([^\n\r,;]+)/gi,
    /Ek\s*Özellik\s*:?\s*([^\n\r,;]+)/gi,
    /Dokuma\s*Tipi\s*:?\s*([^\n\r,;]+)/gi,
    /Sürdürülebilirlik\s*Detayı\s*:?\s*([^\n\r,;]+)/gi
  ];
  
  featurePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlText)) !== null) {
      const fullMatch = match[0];
      const value = match[1]?.trim();
      const key = fullMatch.split(':')[0]?.trim();
      
      if (key && value && value.length < 100) {
        features.push({
          key,
          value,
          category: categorizeFeature(key)
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
  
  // 1. Renk seçici butonları - Gelişmiş selectors
  $('.pr-in-dt-sz-wr .pr-in-dt-cl, .variant-color, .color-variant, .color-option, .product-color').each((i, el) => {
    const colorText = $(el).attr('title') || $(el).attr('data-color') || $(el).attr('data-value') || $(el).text().trim();
    if (colorText && colorText.length > 1 && colorText.length < 30) {
      realColors.push(colorText);
    }
  });
  
  // 2. Beden seçici butonları - Gelişmiş selectors
  $('.pr-in-dt-sz-wr .pr-in-dt-sz, .variant-size, .size-variant, .size-option, .product-size, .size-selector span').each((i, el) => {
    const sizeText = $(el).attr('title') || $(el).attr('data-size') || $(el).attr('data-value') || $(el).text().trim();
    if (sizeText && sizeText.length > 0 && sizeText.length < 10) {
      realSizes.push(sizeText);
    }
  });
  
  // 3. Data attribute'lardan beden çıkarma
  $('[data-size], [data-option-value]').each((i, el) => {
    const sizeData = $(el).attr('data-size') || $(el).attr('data-option-value');
    if (sizeData && /^[0-9]{2,3}$/.test(sizeData)) { // 36, 42 gibi sayısal bedenler
      realSizes.push(sizeData);
    }
  });
  
  // 4. Stok durumu ile beden tespiti
  $('.size-list li, .variant-list li, .size-option').each((i, el) => {
    const sizeText = $(el).find('span, .size-text').text().trim();
    const isInStock = !$(el).hasClass('disabled') && !$(el).hasClass('soldout') && !$(el).hasClass('unavailable');
    
    if (sizeText && /^[0-9]{2,3}$/.test(sizeText) && isInStock) {
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