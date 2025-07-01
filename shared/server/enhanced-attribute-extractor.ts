/**
 * Enhanced Attribute Extractor - Targets specific Trendyol product attribute structures
 */

import * as cheerio from 'cheerio';

export interface EnhancedProductAttribute {
  key: string;
  value: string;
  category?: string;
}

export function extractEnhancedAttributes(html: string): EnhancedProductAttribute[] {
  const $ = cheerio.load(html);
  const attributes: EnhancedProductAttribute[] = [];
  const attributeMap = new Set<string>();

  console.log('🔍 Enhanced attribute extraction başlatıldı...');

  // Method 1: Look for structured product attributes in JSON data
  const scriptTags = $('script').toArray();
  
  for (const script of scriptTags) {
    const content = $(script).html();
    if (!content) continue;

    // Look for product detail app state with attributes
    if (content.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')) {
      try {
        const stateMatch = content.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s);
        if (stateMatch) {
          const state = JSON.parse(stateMatch[1]);
          
          // Extract from product.attributes
          if (state.product?.attributes) {
            state.product.attributes.forEach((attr: any) => {
              if (attr.key && attr.value && typeof attr.key === 'string' && typeof attr.value === 'string') {
                const key = cleanAttributeKey(attr.key);
                const value = cleanAttributeValue(attr.value);
                
                if (isValidAttribute(key, value)) {
                  const attrKey = `${key}:${value}`;
                  if (!attributeMap.has(attrKey)) {
                    attributes.push({
                      key,
                      value,
                      category: categorizeAttribute(key)
                    });
                    attributeMap.add(attrKey);
                    console.log(`✅ Product Attribute: ${key} = ${value}`);
                  }
                }
              }
            });
          }

          // Extract from productInfo if available
          if (state.productInfo?.attributes) {
            state.productInfo.attributes.forEach((attr: any) => {
              if (attr.key && attr.value) {
                const key = cleanAttributeKey(attr.key);
                const value = cleanAttributeValue(attr.value);
                
                if (isValidAttribute(key, value)) {
                  const attrKey = `${key}:${value}`;
                  if (!attributeMap.has(attrKey)) {
                    attributes.push({
                      key,
                      value,
                      category: categorizeAttribute(key)
                    });
                    attributeMap.add(attrKey);
                    console.log(`✅ ProductInfo Attribute: ${key} = ${value}`);
                  }
                }
              }
            });
          }
        }
      } catch (e) {
        console.log('❌ Error parsing PRODUCT_DETAIL_APP_INITIAL_STATE');
      }
    }

    // Method 2: Look for attribute arrays in any script content
    if (content.includes('"attributes"') && content.includes('[') && content.includes('{')) {
      // Find attribute arrays with key-value structure
      const attributeArrayRegex = /"attributes"\s*:\s*(\[[\s\S]*?\])/g;
      let match;
      
      while ((match = attributeArrayRegex.exec(content)) !== null) {
        try {
          const attributesStr = match[1];
          // Clean up the JSON string for parsing
          const cleanedStr = attributesStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          const attributesArray = JSON.parse(cleanedStr);
          
          if (Array.isArray(attributesArray)) {
            attributesArray.forEach((attr: any) => {
              if (attr && typeof attr === 'object' && attr.key && attr.value) {
                const key = cleanAttributeKey(String(attr.key));
                const value = cleanAttributeValue(String(attr.value));
                
                if (isValidAttribute(key, value)) {
                  const attrKey = `${key}:${value}`;
                  if (!attributeMap.has(attrKey)) {
                    attributes.push({
                      key,
                      value,
                      category: categorizeAttribute(key)
                    });
                    attributeMap.add(attrKey);
                    console.log(`✅ Array Attribute: ${key} = ${value}`);
                  }
                }
              }
            });
          }
        } catch (e) {
          // Continue with other patterns
        }
      }
    }
  }

  // Method 3: Look for structured data in HTML elements
  const attributeElements = $('[data-testid*="attribute"], [class*="attribute"], [class*="feature"], [class*="spec"]');
  attributeElements.each((i, element) => {
    const $element = $(element);
    const text = $element.text().trim();
    
    // Look for key-value patterns in text
    if (text.includes(':')) {
      const parts = text.split(':');
      if (parts.length >= 2) {
        const key = cleanAttributeKey(parts[0]);
        const value = cleanAttributeValue(parts.slice(1).join(':'));
        
        if (isValidAttribute(key, value)) {
          const attrKey = `${key}:${value}`;
          if (!attributeMap.has(attrKey)) {
            attributes.push({
              key,
              value,
              category: categorizeAttribute(key)
            });
            attributeMap.add(attrKey);
            console.log(`✅ HTML Element: ${key} = ${value}`);
          }
        }
      }
    }
  });

  console.log(`🎯 Enhanced extraction completed: ${attributes.length} attributes found`);
  return attributes;
}

function cleanAttributeKey(key: string): string {
  return key
    .replace(/['"]/g, '')
    .replace(/[:\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanAttributeValue(value: string): string {
  return value
    .replace(/['"]/g, '')
    .replace(/^\s*[:]\s*/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isValidAttribute(key: string, value: string): boolean {
  if (!key || !value || key.length < 2 || value.length < 1) return false;
  if (key.length > 100 || value.length > 500) return false;
  
  // Skip invalid patterns
  const invalidPatterns = [
    /^[a-z]$/, /^[\d\s\-_]+$/, /http/, /www\./, /\.com/, /\.jpg/, /\.png/,
    /^["'\s\-_]+$/, /^null$/, /^undefined$/, /^true$/, /^false$/,
    /^\d+$/, /^[\W\s]+$/, /script/, /function/, /return/
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(key.toLowerCase()) || pattern.test(value.toLowerCase())) {
      return false;
    }
  }
  
  // Valid attribute patterns
  const validPatterns = [
    // Turkish attribute names
    /materyal|kumaş|renk|beden|model|marka|tip|tür|özellik|detay|kalıp|stil/i,
    /yıkama|bakım|boyut|ölçü|ağırlık|kalınlık|uzunluk|genişlik|yükseklik/i,
    /koleksiyon|sezon|yaş|cinsiyet|kullanım|durum|ortam|aktivite|spor/i,
    /kol|yaka|cep|fermuar|düğme|kemer|kuşak|astar|desen|kapama/i,
    
    // English attribute names
    /material|fabric|color|size|model|brand|type|feature|detail|fit|style/i,
    /wash|care|dimension|measure|weight|thickness|length|width|height/i,
    /collection|season|age|gender|usage|occasion|environment|activity|sport/i,
    /sleeve|collar|pocket|zipper|button|belt|lining|pattern|closure/i
  ];
  
  return validPatterns.some(pattern => pattern.test(key));
}

function categorizeAttribute(key: string): string {
  const keyLower = key.toLowerCase();
  
  if (/materyal|kumaş|fabric|material|composition|cotton|polyester/.test(keyLower)) {
    return 'Malzeme';
  }
  if (/renk|color|desen|pattern/.test(keyLower)) {
    return 'Görünüm';
  }
  if (/beden|size|kalıp|fit|boyut|ölçü|uzunluk|genişlik/.test(keyLower)) {
    return 'Ölçü';
  }
  if (/kol|yaka|cep|fermuar|düğme|sleeve|collar|pocket|zipper/.test(keyLower)) {
    return 'Tasarım';
  }
  if (/yıkama|bakım|wash|care|temizlik/.test(keyLower)) {
    return 'Bakım';
  }
  if (/marka|brand|koleksiyon|collection|model/.test(keyLower)) {
    return 'Marka';
  }
  
  return 'Genel';
}