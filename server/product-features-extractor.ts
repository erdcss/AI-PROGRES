/**
 * Advanced Product Features Extractor for Trendyol
 * Extracts comprehensive product specifications and features
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
}

export function extractProductFeatures(html: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  const featureMap = new Set<string>();

  console.log('🔍 Gelişmiş ürün özellikleri çıkarılıyor...');

  // 1. Enhanced JSON-LD structured data extraction
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const jsonContent = $(el).html() || '';
      const jsonData = JSON.parse(jsonContent);
      
      // Extract additionalProperty array
      if (jsonData.additionalProperty && Array.isArray(jsonData.additionalProperty)) {
        jsonData.additionalProperty.forEach((prop: any) => {
          if (prop.name && (prop.value || prop.unitText)) {
            const key = String(prop.name).trim();
            const value = String(prop.value || prop.unitText).trim();
            const featureKey = `${key}:${value}`;
            
            if (key && value && !featureMap.has(featureKey) && key.length < 50 && value.length < 200) {
              features.push({
                key,
                value,
                category: categorizeFeature(key)
              });
              featureMap.add(featureKey);
              console.log(`✅ JSON-LD özellik: ${key}: ${value}`);
            }
          }
        });
      }
      
      // Skip nested extraction to avoid noise - focus on additionalProperty
      
      // Extract brand information
      if (jsonData.brand) {
        let brandName = '';
        if (typeof jsonData.brand === 'string') {
          brandName = jsonData.brand;
        } else if (jsonData.brand.name) {
          brandName = jsonData.brand.name;
        }
        
        if (brandName && !featureMap.has(`Marka:${brandName}`)) {
          features.push({
            key: 'Marka',
            value: brandName,
            category: 'Marka'
          });
          featureMap.add(`Marka:${brandName}`);
          console.log(`✅ Marka: ${brandName}`);
        }
      }
      
    } catch (e) {
      // JSON parse error, continue
    }
  });

  // 2. Extract from product detail attributes
  $('.detail-attr-item, .pr-in-at-item, .product-attribute').each((i, el) => {
    const keyEl = $(el).find('.detail-attr-item-key, .attr-key, .attribute-key');
    const valueEl = $(el).find('.detail-attr-item-value, .attr-value, .attribute-value');
    
    if (keyEl.length && valueEl.length) {
      const key = keyEl.text().trim();
      const value = valueEl.text().trim();
      const featureKey = `${key}:${value}`;
      
      if (key && value && !featureMap.has(featureKey) && key.length < 50 && value.length < 200) {
        features.push({
          key,
          value,
          category: categorizeFeature(key)
        });
        featureMap.add(featureKey);
        console.log(`✅ Detay özellik: ${key}: ${value}`);
      }
    }
  });

  // 3. Extract from script content - Trendyol specific patterns
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    
    // Look for product attributes in scripts
    const attributeMatches = scriptContent.match(/"attributes":\s*\[([^\]]+)\]/);
    if (attributeMatches) {
      try {
        const attrContent = attributeMatches[1];
        // Parse individual attributes
        const matches = attrContent.matchAll(/{[^}]*"key":\s*"([^"]+)"[^}]*"value":\s*"([^"]+)"[^}]*}/g);
        
        for (const match of matches) {
          const [, key, value] = match;
          const featureKey = `${key}:${value}`;
          
          if (key && value && !featureMap.has(featureKey) && key.length < 50 && value.length < 200) {
            features.push({
              key: key.trim(),
              value: value.trim(),
              category: categorizeFeature(key)
            });
            featureMap.add(featureKey);
            console.log(`✅ Script özellik: ${key}: ${value}`);
          }
        }
      } catch (e) {
        // Parse error, continue
      }
    }
    
    // Look for productDetails object
    const productDetailsMatch = scriptContent.match(/"productDetails":\s*{([^}]+)}/);
    if (productDetailsMatch) {
      try {
        const detailsContent = productDetailsMatch[1];
        const detailMatches = detailsContent.matchAll(/"([^"]+)":\s*"([^"]+)"/g);
        
        for (const match of detailMatches) {
          const [, key, value] = match;
          const featureKey = `${key}:${value}`;
          
          if (key && value && !featureMap.has(featureKey) && key.length < 50 && value.length < 200) {
            features.push({
              key: formatFeatureKey(key),
              value: value.trim(),
              category: categorizeFeature(key)
            });
            featureMap.add(featureKey);
            console.log(`✅ Detay özellik: ${key}: ${value}`);
          }
        }
      } catch (e) {
        // Parse error, continue
      }
    }
  });

  // 4. Extract from meta properties and data attributes
  $('[data-attribute], [data-property]').each((i, el) => {
    const key = $(el).attr('data-attribute') || $(el).attr('data-property');
    const value = $(el).text().trim() || $(el).attr('data-value');
    const featureKey = `${key}:${value}`;
    
    if (key && value && !featureMap.has(featureKey) && key.length < 50 && value.length < 200) {
      features.push({
        key: formatFeatureKey(key),
        value: String(value).trim(),
        category: categorizeFeature(key)
      });
      featureMap.add(featureKey);
      console.log(`✅ Data özellik: ${key}: ${value}`);
    }
  });

  // 5. Text pattern extraction for common features
  const htmlText = $.text();
  const featurePatterns = [
    { pattern: /Materyal[:\s]*([^\n\r,;\.]{2,50})/gi, key: 'Materyal' },
    { pattern: /Kumaş[:\s]*([^\n\r,;\.]{2,50})/gi, key: 'Kumaş' },
    { pattern: /Kalıp[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Kalıp' },
    { pattern: /Kol\s+Tipi[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Kol Tipi' },
    { pattern: /Yaka\s+Tipi[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Yaka Tipi' },
    { pattern: /Desen[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Desen' },
    { pattern: /Kapama\s+Şekli[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Kapama Şekli' },
    { pattern: /Cep\s+Tipi[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Cep Tipi' },
    { pattern: /Boy[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Boy' },
    { pattern: /Renk[:\s]*([^\n\r,;\.]{2,30})/gi, key: 'Renk' }
  ];

  featurePatterns.forEach(({ pattern, key }) => {
    let match;
    while ((match = pattern.exec(htmlText)) !== null) {
      const value = match[1].trim();
      const featureKey = `${key}:${value}`;
      
      if (value && !featureMap.has(featureKey) && value.length > 1 && value.length < 100) {
        features.push({
          key,
          value,
          category: categorizeFeature(key)
        });
        featureMap.add(featureKey);
        console.log(`✅ Pattern özellik: ${key}: ${value}`);
      }
    }
  });

  console.log(`🎯 Toplam ${features.length} benzersiz özellik çıkarıldı`);
  return features;
}

function categorizeFeature(key: string): string {
  const normalizedKey = key.toLowerCase().replace(/[^a-zçğüöş]/g, '');
  
  if (normalizedKey.includes('marka') || normalizedKey.includes('brand')) return 'Marka';
  if (normalizedKey.includes('renk') || normalizedKey.includes('color')) return 'Renk';
  if (normalizedKey.includes('materyal') || normalizedKey.includes('material') || 
      normalizedKey.includes('kumaş') || normalizedKey.includes('fabric') ||
      normalizedKey.includes('bileşen') || normalizedKey.includes('composition')) return 'Materyal';
  if (normalizedKey.includes('beden') || normalizedKey.includes('size') ||
      normalizedKey.includes('ölçü') || normalizedKey.includes('boy')) return 'Beden';
  if (normalizedKey.includes('model') || normalizedKey.includes('tip') ||
      normalizedKey.includes('type') || normalizedKey.includes('style')) return 'Model';
  if (normalizedKey.includes('kalip') || normalizedKey.includes('siluet') ||
      normalizedKey.includes('kesim') || normalizedKey.includes('fit')) return 'Tasarım';
  if (normalizedKey.includes('kol') || normalizedKey.includes('yaka') ||
      normalizedKey.includes('cep') || normalizedKey.includes('kapama')) return 'Detay';
  if (normalizedKey.includes('desen') || normalizedKey.includes('pattern') ||
      normalizedKey.includes('motif') || normalizedKey.includes('baskı')) return 'Desen';
  
  return 'Genel';
}

function formatFeatureKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase to spaces
    .replace(/_/g, ' ') // underscores to spaces
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}