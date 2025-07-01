/**
 * Comprehensive Feature Extractor - Manual extraction for all product features
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
}

export async function extractComprehensiveFeatures(html: string): Promise<ProductFeature[]> {
  const features: ProductFeature[] = [];
  
  console.log(`🔍 Comprehensive feature extraction starting...`);
  
  try {
    // Method 1: Extract from JSON-LD structured data
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
    if (jsonLdMatches) {
      console.log(`📋 Found ${jsonLdMatches.length} JSON-LD scripts`);
      
      jsonLdMatches.forEach((script, index) => {
        try {
          const jsonContent = script.replace(/<script[^>]*>|<\/script>/gi, '').trim();
          const data = JSON.parse(jsonContent);
          
          if (data && typeof data === 'object') {
            // Extract product properties
            extractFromObject(data, features, 'JSON-LD');
          }
        } catch (e) {
          console.log(`⚠️ JSON-LD parsing error for script ${index}: ${e}`);
        }
      });
    }
    
    // Method 2: Extract from Trendyol script data
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
    if (scriptMatches) {
      console.log(`📜 Found ${scriptMatches.length} script tags`);
      
      scriptMatches.forEach((script, index) => {
        try {
          // Look for product data structures
          const productDataPattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
          const productMatch = script.match(productDataPattern);
          
          if (productMatch) {
            const productData = JSON.parse(productMatch[1]);
            if (productData?.product?.attributes) {
              productData.product.attributes.forEach((attr: any) => {
                if (attr.key?.name && attr.value?.name) {
                  features.push({
                    key: attr.key.name.trim(),
                    value: attr.value.name.trim(),
                    category: 'Trendyol Script'
                  });
                }
              });
            }
          }
          
          // Look for variant data
          const variantPattern = /"attributes":\s*\[(.*?)\]/s;
          const variantMatch = script.match(variantPattern);
          
          if (variantMatch) {
            try {
              const attributesText = variantMatch[1];
              const attributeMatches = attributesText.match(/"name":\s*"([^"]+)"/g);
              
              if (attributeMatches) {
                attributeMatches.forEach(match => {
                  const name = match.match(/"name":\s*"([^"]+)"/)?.[1];
                  if (name && name.length > 0 && name.length < 50) {
                    features.push({
                      key: 'Attribute',
                      value: name,
                      category: 'Variant Data'
                    });
                  }
                });
              }
            } catch (e) {
              // Continue with other methods
            }
          }
        } catch (e) {
          // Continue with other scripts
        }
      });
    }
    
    // Method 3: DOM-based extraction
    const $ = cheerio.load(html);
    
    // Extract from detail attributes
    $('.detail-attr').each((i, el) => {
      const key = $(el).find('.detail-attr-item-key').text().trim();
      const value = $(el).find('.detail-attr-item-value').text().trim();
      
      if (key && value && key.length > 0 && value.length > 0) {
        features.push({
          key: key,
          value: value,
          category: 'Detail Attributes'
        });
      }
    });
    
    // Extract from product specifications
    $('.product-spec').each((i, el) => {
      const key = $(el).find('.spec-key, .spec-name').text().trim();
      const value = $(el).find('.spec-value, .spec-content').text().trim();
      
      if (key && value) {
        features.push({
          key: key,
          value: value,
          category: 'Product Specifications'
        });
      }
    });
    
    // Extract from list items with colon patterns
    $('li, p, div').each((i, el) => {
      const text = $(el).text().trim();
      
      if (text.includes(':') && text.length > 5 && text.length < 150) {
        const [key, ...valueParts] = text.split(':');
        const value = valueParts.join(':').trim();
        
        if (key && value && key.length > 1 && value.length > 1) {
          features.push({
            key: key.trim(),
            value: value,
            category: 'Text Content'
          });
        }
      }
    });
    
    // Method 4: Pattern-based extraction for specific attributes
    const patterns = [
      { key: 'Materyal', regex: /(?:Materyal|Material)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü0-9%\s,]+?)(?:[,\.\n]|$)/i },
      { key: 'Kumaş', regex: /(?:Kumaş|Fabric)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.\n]|$)/i },
      { key: 'Renk', regex: /(?:Renk|Color)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.\n]|$)/i },
      { key: 'Beden', regex: /(?:Beden|Size)[:\s]*([A-Za-z0-9\s\-]+?)(?:[,\.\n]|$)/i },
      { key: 'Marka', regex: /(?:Marka|Brand)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s&]+?)(?:[,\.\n]|$)/i },
      { key: 'Model', regex: /(?:Model)[:\s]*([A-Za-z0-9\s\-]+?)(?:[,\.\n]|$)/i },
      { key: 'Ürün Tipi', regex: /(?:Ürün Tipi|Product Type)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.\n]|$)/i },
      { key: 'Kol Tipi', regex: /(?:Kol Tipi|Sleeve Type)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.\n]|$)/i },
      { key: 'Yaka Tipi', regex: /(?:Yaka Tipi|Collar Type)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.\n]|$)/i },
      { key: 'Kalıp', regex: /(?:Kalıp|Fit)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s\-]+?)(?:[,\.\n]|$)/i }
    ];
    
    patterns.forEach(pattern => {
      const matches = html.match(pattern.regex);
      if (matches && matches[1]) {
        const value = matches[1].trim();
        if (value.length > 0 && value.length < 100) {
          features.push({
            key: pattern.key,
            value: value,
            category: 'Pattern Extraction'
          });
        }
      }
    });
    
    // Method 5: Extract from meta tags
    $('meta').each((i, el) => {
      const property = $(el).attr('property') || $(el).attr('name');
      const content = $(el).attr('content');
      
      if (property && content && 
          (property.includes('product') || property.includes('item') || 
           property.includes('brand') || property.includes('color'))) {
        features.push({
          key: property,
          value: content,
          category: 'Meta Tags'
        });
      }
    });
    
    console.log(`✅ Comprehensive extraction completed: ${features.length} features found`);
    
    // Filter and deduplicate
    const uniqueFeatures = deduplicateFeatures(features);
    const validFeatures = filterValidFeatures(uniqueFeatures);
    
    console.log(`🎯 After filtering: ${validFeatures.length} valid features`);
    
    return validFeatures;
    
  } catch (error) {
    console.log(`⚠️ Comprehensive extraction error: ${error}`);
    return [];
  }
}

function extractFromObject(obj: any, features: ProductFeature[], category: string, prefix = '') {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length > 0 && value.length < 200) {
      if (isValidFeatureKey(key)) {
        features.push({
          key: formatKey(key),
          value: value.trim(),
          category: category
        });
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      extractFromObject(value, features, category, `${prefix}${key}.`);
    } else if (Array.isArray(value) && value.length > 0) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          extractFromObject(item, features, category, `${prefix}${key}[${index}].`);
        }
      });
    }
  }
}

function isValidFeatureKey(key: string): boolean {
  const validKeys = [
    'material', 'fabric', 'color', 'size', 'brand', 'model', 'type',
    'sleeve', 'collar', 'fit', 'pattern', 'style', 'season', 'gender',
    'materyal', 'kumaş', 'renk', 'beden', 'marka', 'model', 'tip',
    'kol', 'yaka', 'kalıp', 'desen', 'stil', 'sezon', 'cinsiyet',
    'care', 'washing', 'maintenance', 'composition', 'weight'
  ];
  
  const lowerKey = key.toLowerCase();
  return validKeys.some(validKey => lowerKey.includes(validKey));
}

function formatKey(key: string): string {
  // Convert camelCase to readable format
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

function deduplicateFeatures(features: ProductFeature[]): ProductFeature[] {
  const seen = new Set<string>();
  const unique: ProductFeature[] = [];
  
  features.forEach(feature => {
    const key = `${feature.key.toLowerCase()}-${feature.value.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(feature);
    }
  });
  
  return unique;
}

function filterValidFeatures(features: ProductFeature[]): ProductFeature[] {
  return features.filter(feature => {
    // Filter out invalid or empty values
    if (!feature.key || !feature.value) return false;
    if (feature.key.length < 2 || feature.value.length < 1) return false;
    if (feature.value.length > 200) return false;
    
    // Filter out common invalid patterns
    const invalidPatterns = [
      /^(null|undefined|none|n\/a)$/i,
      /^[\d\s]+$/,  // Only numbers and spaces
      /^[^\w\s]+$/,  // Only special characters
      /script|function|var |const |let /i  // Code patterns
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(feature.value));
  });
}