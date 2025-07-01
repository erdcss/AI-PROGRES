/**
 * Trendyol-specific Product Features Extractor
 * Targets actual Trendyol HTML structure for product specifications
 */

import * as cheerio from 'cheerio';

export interface TrendyolProductFeature {
  key: string;
  value: string;
  category?: string;
}

export function extractTrendyolFeatures(html: string): TrendyolProductFeature[] {
  const $ = cheerio.load(html);
  const features: TrendyolProductFeature[] = [];
  const featureMap = new Set<string>();

  console.log('🔍 Trendyol özellik çıkarma başlatıldı...');

  // 1. Extract from JSON-LD structured data (most reliable)
  $('script[type="application/ld+json"]').each((i, script) => {
    try {
      const jsonText = $(script).html();
      if (jsonText) {
        const data = JSON.parse(jsonText);
        
        // Check for Product schema
        if (data['@type'] === 'Product' || (Array.isArray(data) && data.some(item => item['@type'] === 'Product'))) {
          const productData = Array.isArray(data) ? data.find(item => item['@type'] === 'Product') : data;
          
          if (productData && productData.additionalProperty) {
            productData.additionalProperty.forEach((prop: any) => {
              if (prop.name && prop.value) {
                const key = String(prop.name).trim();
                const value = String(prop.value).trim();
                
                if (isValidTrendyolFeature(key, value)) {
                  const featureKey = `${key}:${value}`;
                  if (!featureMap.has(featureKey)) {
                    features.push({
                      key: cleanKey(key),
                      value: value,
                      category: categorizeFeature(key)
                    });
                    featureMap.add(featureKey);
                    console.log(`✅ JSON-LD: ${key} = ${value}`);
                  }
                }
              }
            });
          }
        }
      }
    } catch (e) {
      // JSON parse error, continue
    }
  });

  // 2. Extract from script tags containing product data
  $('script').each((i, script) => {
    const scriptContent = $(script).html();
    if (scriptContent && scriptContent.includes('productDetail')) {
      
      // Look for attributes array
      const attributeMatch = scriptContent.match(/"attributes":\s*\[([^\]]+)\]/);
      if (attributeMatch) {
        try {
          const attrContent = attributeMatch[1];
          const attrRegex = /"key":\s*"([^"]+)"[^}]*"value":\s*"([^"]+)"/g;
          let attrMatch;
          
          while ((attrMatch = attrRegex.exec(attrContent)) !== null) {
            const [, key, value] = attrMatch;
            if (isValidTrendyolFeature(key, value)) {
              const featureKey = `${key}:${value}`;
              if (!featureMap.has(featureKey)) {
                features.push({
                  key: cleanKey(key),
                  value: value,
                  category: categorizeFeature(key)
                });
                featureMap.add(featureKey);
                console.log(`✅ Script: ${key} = ${value}`);
              }
            }
          }
        } catch (e) {
          // Parse error, continue
        }
      }

      // Look for productDetails object
      const detailsMatch = scriptContent.match(/"productDetails":\s*{([^}]+)}/);
      if (detailsMatch) {
        try {
          const detailsContent = detailsMatch[1];
          const detailRegex = /"([^"]+)":\s*"([^"]+)"/g;
          let detailMatch;
          
          while ((detailMatch = detailRegex.exec(detailsContent)) !== null) {
            const [, key, value] = detailMatch;
            if (isValidTrendyolFeature(key, value)) {
              const featureKey = `${key}:${value}`;
              if (!featureMap.has(featureKey)) {
                features.push({
                  key: cleanKey(key),
                  value: value,
                  category: categorizeFeature(key)
                });
                featureMap.add(featureKey);
                console.log(`✅ Details: ${key} = ${value}`);
              }
            }
          }
        } catch (e) {
          // Parse error, continue
        }
      }
    }
  });

  // 3. Extract from DOM elements (fallback)
  $('.detail-attr, .product-attribute, .spec-item').each((i, item) => {
    const keyEl = $(item).find('.detail-attr-item-key, .attr-key, .spec-key').first();
    const valueEl = $(item).find('.detail-attr-item-value, .attr-value, .spec-value').first();
    
    if (keyEl.length && valueEl.length) {
      const key = keyEl.text().trim();
      const value = valueEl.text().trim();
      
      if (isValidTrendyolFeature(key, value)) {
        const featureKey = `${key}:${value}`;
        if (!featureMap.has(featureKey)) {
          features.push({
            key: cleanKey(key),
            value: value,
            category: categorizeFeature(key)
          });
          featureMap.add(featureKey);
          console.log(`✅ DOM: ${key} = ${value}`);
        }
      }
    }
  });

  // 4. Extract from table rows
  $('table tr').each((i, row) => {
    const cells = $(row).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (isValidTrendyolFeature(key, value)) {
        const featureKey = `${key}:${value}`;
        if (!featureMap.has(featureKey)) {
          features.push({
            key: cleanKey(key),
            value: value,
            category: categorizeFeature(key)
          });
          featureMap.add(featureKey);
          console.log(`✅ Table: ${key} = ${value}`);
        }
      }
    }
  });

  console.log(`🎯 Toplam ${features.length} Trendyol özelliği çıkarıldı`);
  return features;
}

function isValidTrendyolFeature(key: string, value: string): boolean {
  if (!key || !value || key.length < 2 || value.length < 1) return false;
  if (value.length > 200) return false;
  
  // Skip invalid patterns
  const invalidPatterns = [
    /^[a-z]$/, /unluk/, /asi-/, /x-c/, /x-g/, /-seti-/,
    /görselleri/, /açıcı/, /kalemi/, /http/, /www\./,
    /\.com/, /\.jpg/, /\.png/, /^["'}]+$/, /^u"$/, /^a"$/,
    /^ler$/, /^"}$/, /^"$/, /^}$/
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(value)) return false;
  }
  
  // Only allow meaningful product attributes
  const validKeyPatterns = [
    /materyal/i, /kumaş/i, /renk/i, /kalıp/i, /kol/i, /yaka/i,
    /desen/i, /kapama/i, /yıkama/i, /marka/i, /beden/i, /boy/i,
    /astar/i, /koleksiyon/i, /cep/i, /ortam/i, /siluet/i,
    /kalınlık/i, /dokuma/i, /persona/i, /kemer/i, /kuşak/i,
    /sürdürülebilirlik/i, /detay/i, /tipi/i, /boyu/i, /durumu/i,
    /ürün/i, /ek/i, /özellik/i, /bileşen/i, /talimat/i
  ];
  
  return validKeyPatterns.some(pattern => pattern.test(key));
}

function cleanKey(key: string): string {
  return key
    .replace(/[:"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function categorizeFeature(key: string): string {
  const keyLower = key.toLowerCase();
  
  if (keyLower.includes('materyal') || keyLower.includes('kumaş')) return 'Malzeme';
  if (keyLower.includes('renk') || keyLower.includes('desen')) return 'Görünüm';
  if (keyLower.includes('beden') || keyLower.includes('kalıp') || keyLower.includes('boy')) return 'Ölçü';
  if (keyLower.includes('kol') || keyLower.includes('yaka') || keyLower.includes('cep')) return 'Tasarım';
  if (keyLower.includes('yıkama') || keyLower.includes('bakım')) return 'Bakım';
  if (keyLower.includes('marka') || keyLower.includes('koleksiyon')) return 'Marka';
  
  return 'Genel';
}