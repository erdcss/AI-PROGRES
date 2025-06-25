/**
 * Clean Product Features Extractor
 * Only extracts meaningful, valid product specifications
 */

import * as cheerio from 'cheerio';

export interface CleanProductFeature {
  key: string;
  value: string;
  category?: string;
}

export function extractCleanFeatures(html: string): CleanProductFeature[] {
  const $ = cheerio.load(html);
  const features: CleanProductFeature[] = [];
  const featureMap = new Set<string>();

  // 1. Extract from Trendyol product specifications section (like Scrapy example)
  $('.product-detail .product-detail-specs .row, .detail-attr-container .detail-attr').each((i, row) => {
    // Method 1: Using column-based layout (col-lg-4, col-md-4 etc.)
    const key1 = $(row).find('.col-lg-4, .col-md-4, .detail-attr-item-key').first().text().trim();
    const value1 = $(row).find('.col-lg-8, .col-md-8, .detail-attr-item-value').first().text().trim();
    
    if (key1 && value1 && isValidFeature(key1, value1)) {
      const featureKey = `${key1}:${value1}`;
      if (!featureMap.has(featureKey)) {
        features.push({
          key: cleanFeatureKey(key1),
          value: value1,
          category: categorizeFeature(key1)
        });
        featureMap.add(featureKey);
        console.log(`✅ Spec özellik: ${key1}: ${value1}`);
      }
    }
  });

  // 2. Extract from attribute lists and tables
  $('table tr, .attributes tr, .product-attributes tr').each((i, row) => {
    const cells = $(row).find('td, th');
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim();
      const value = $(cells[1]).text().trim();
      
      if (isValidFeature(key, value)) {
        const featureKey = `${key}:${value}`;
        if (!featureMap.has(featureKey)) {
          features.push({
            key: cleanFeatureKey(key),
            value: value,
            category: categorizeFeature(key)
          });
          featureMap.add(featureKey);
          console.log(`✅ Table özellik: ${key}: ${value}`);
        }
      }
    }
  });

  // 3. Extract from JSON-LD structured data (clean version)
  $('script[type="application/ld+json"]').each((i, script) => {
    try {
      const jsonText = $(script).html();
      if (jsonText) {
        const data = JSON.parse(jsonText);
        
        // Extract from additionalProperty array
        if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name && prop.value) {
              const key = String(prop.name).trim();
              const value = String(prop.value).trim();
              
              if (isValidFeature(key, value)) {
                const featureKey = `${key}:${value}`;
                if (!featureMap.has(featureKey)) {
                  features.push({
                    key: cleanFeatureKey(key),
                    value: value,
                    category: categorizeFeature(key)
                  });
                  featureMap.add(featureKey);
                  console.log(`✅ JSON-LD özellik: ${key}: ${value}`);
                }
              }
            }
          });
        }
      }
    } catch (e) {
      // JSON parse error, continue
    }
  });

  // 4. Extract from general product detail sections
  $('.product-detail-container, .product-info, .product-specs').find('div, li, p').each((i, item) => {
    const text = $(item).text().trim();
    
    // Look for key:value patterns
    if (text.includes(':') && text.length < 150 && text.length > 10) {
      const parts = text.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].trim();
        
        if (isValidFeature(key, value)) {
          const featureKey = `${key}:${value}`;
          if (!featureMap.has(featureKey)) {
            features.push({
              key: cleanFeatureKey(key),
              value: value,
              category: categorizeFeature(key)
            });
            featureMap.add(featureKey);
            console.log(`✅ Pattern özellik: ${key}: ${value}`);
          }
        }
      }
    }
  });

  console.log(`✅ ${features.length} temiz özellik çıkarıldı`);
  return features;
}

function isValidFeature(key: string, value: string): boolean {
  // Skip empty or very short values
  if (!key || !value || key.length < 2 || value.length < 2) return false;
  
  // Skip values that are too long (likely descriptions)
  if (value.length > 100) return false;
  
  // Skip garbled data patterns
  const invalidPatterns = [
    /^[a-z]$/, // Single lowercase letters
    /unluk/, /asi-/, /x-c/, /x-g/, /-seti-/, /cizmesi/i,
    /görselleri/, /açıcı/, /kalemi/, /malzemeler/i,
    /^["'}]+$/, // Only quotes/brackets
    /http/, /www\./, /\.com/, /\.jpg/, /\.png/,
    /^u"$/, /^a"$/, /^ler$/, /^"}$/, /^"$/, /^}$/
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(value)) return false;
  }
  
  // Only allow meaningful product attribute keys
  const validKeyPatterns = [
    /materyal/i, /kumaş/i, /renk/i, /kalıp/i, /kol/i, /yaka/i,
    /desen/i, /kapama/i, /yıkama/i, /marka/i, /beden/i, /boy/i,
    /astar/i, /koleksiyon/i, /cep/i, /ortam/i, /siluet/i,
    /kalınlık/i, /dokuma/i, /persona/i, /kemer/i, /kuşak/i,
    /sürdürülebilirlik/i, /detay/i, /tipi/i, /boyu/i, /durumu/i
  ];
  
  const hasValidKey = validKeyPatterns.some(pattern => pattern.test(key));
  if (!hasValidKey) return false;
  
  // Skip Boy attributes with invalid values
  if (key.toLowerCase().includes('boy') && value.length < 3) return false;
  
  return true;
}

function cleanFeatureKey(key: string): string {
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