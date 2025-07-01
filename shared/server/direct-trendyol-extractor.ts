/**
 * Direct Trendyol Extractor - Captures specific product attribute data structures
 */

import * as cheerio from 'cheerio';

export interface DirectTrendyolAttribute {
  key: string;
  value: string;
  category?: string;
}

export function extractDirectTrendyolAttributes(html: string): DirectTrendyolAttribute[] {
  const $ = cheerio.load(html);
  const attributes: DirectTrendyolAttribute[] = [];
  const attributeMap = new Set<string>();

  console.log('🔍 Direct Trendyol attribute extraction başlatıldı...');

  // Method 1: Extract from product detail container divs
  const productInfoContainers = $('[data-fragment="ProductInfo"], [class*="product-info"], [class*="product-detail"]');
  productInfoContainers.each((i, container) => {
    const $container = $(container);
    
    // Look for attribute rows or key-value pairs
    $container.find('[class*="attribute"], [class*="feature"], [class*="spec"], [class*="detail"]').each((j, element) => {
      const $element = $(element);
      const text = $element.text().trim();
      
      // Parse key-value patterns
      if (text.includes(':')) {
        const parts = text.split(':');
        if (parts.length >= 2) {
          const key = cleanKey(parts[0]);
          const value = cleanValue(parts.slice(1).join(':'));
          
          if (isValidAttributePair(key, value)) {
            const attrKey = `${key}:${value}`;
            if (!attributeMap.has(attrKey)) {
              attributes.push({
                key,
                value,
                category: categorizeAttribute(key)
              });
              attributeMap.add(attrKey);
              console.log(`✅ Container Attribute: ${key} = ${value}`);
            }
          }
        }
      }
    });
  });

  // Method 2: Look for script content with product data
  $('script').each((i, script) => {
    const content = $(script).html();
    if (!content) return;

    // Search for product detail data patterns
    if (content.includes('productDetailPageData') || content.includes('productData') || content.includes('productInfo')) {
      
      // Extract product detail attributes from various JSON structures
      const attributePatterns = [
        /"attributes"\s*:\s*\[([^\]]+)\]/g,
        /"productAttributes"\s*:\s*\[([^\]]+)\]/g,
        /"specifications"\s*:\s*\[([^\]]+)\]/g,
        /"features"\s*:\s*\[([^\]]+)\]/g
      ];

      attributePatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          try {
            const attributesStr = `[${match[1]}]`;
            const attributesData = JSON.parse(attributesStr);
            
            if (Array.isArray(attributesData)) {
              attributesData.forEach((attr: any) => {
                if (attr && typeof attr === 'object') {
                  let key = '';
                  let value = '';
                  
                  // Handle different attribute object structures
                  if (attr.key && attr.value) {
                    key = String(attr.key);
                    value = String(attr.value);
                  } else if (attr.name && attr.value) {
                    key = String(attr.name);
                    value = String(attr.value);
                  } else if (attr.label && attr.text) {
                    key = String(attr.label);
                    value = String(attr.text);
                  }
                  
                  if (key && value) {
                    const cleanedKey = cleanKey(key);
                    const cleanedValue = cleanValue(value);
                    
                    if (isValidAttributePair(cleanedKey, cleanedValue)) {
                      const attrKey = `${cleanedKey}:${cleanedValue}`;
                      if (!attributeMap.has(attrKey)) {
                        attributes.push({
                          key: cleanedKey,
                          value: cleanedValue,
                          category: categorizeAttribute(cleanedKey)
                        });
                        attributeMap.add(attrKey);
                        console.log(`✅ Script JSON: ${cleanedKey} = ${cleanedValue}`);
                      }
                    }
                  }
                }
              });
            }
          } catch (e) {
            // Continue with other patterns
          }
        }
      });
    }

    // Method 3: Extract from window state objects
    if (content.includes('window.__INITIAL_STATE__') || content.includes('window.__PRODUCT_DETAIL__')) {
      const statePatterns = [
        /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
        /window\.__PRODUCT_DETAIL__\s*=\s*({.+?});/s,
        /window\.__PRODUCT_DATA__\s*=\s*({.+?});/s
      ];

      statePatterns.forEach(pattern => {
        const match = content.match(pattern);
        if (match) {
          try {
            const stateData = JSON.parse(match[1]);
            
            // Navigate through possible data structures
            const possiblePaths = [
              stateData.product?.attributes,
              stateData.productInfo?.attributes,
              stateData.data?.product?.attributes,
              stateData.data?.attributes,
              stateData.attributes
            ];

            possiblePaths.forEach(attrArray => {
              if (Array.isArray(attrArray)) {
                attrArray.forEach((attr: any) => {
                  if (attr && attr.key && attr.value) {
                    const key = cleanKey(String(attr.key));
                    const value = cleanValue(String(attr.value));
                    
                    if (isValidAttributePair(key, value)) {
                      const attrKey = `${key}:${value}`;
                      if (!attributeMap.has(attrKey)) {
                        attributes.push({
                          key,
                          value,
                          category: categorizeAttribute(key)
                        });
                        attributeMap.add(attrKey);
                        console.log(`✅ Window State: ${key} = ${value}`);
                      }
                    }
                  }
                });
              }
            });
          } catch (e) {
            // Continue with other methods
          }
        }
      });
    }
  });

  // Method 4: Look for structured data in specific Trendyol elements
  const trendyolSelectors = [
    '[data-testid*="product"], [data-testid*="attribute"]',
    '[class*="product-detail"], [class*="product-info"]',
    '[class*="specification"], [class*="feature"]'
  ];

  trendyolSelectors.forEach(selector => {
    $(selector).each((i, element) => {
      const $element = $(element);
      
      // Look for nested attribute elements
      $element.find('*').each((j, child) => {
        const $child = $(child);
        const text = $child.text().trim();
        
        // Check for attribute-like patterns
        if (text.length > 3 && text.length < 200 && text.includes(':')) {
          const colonIndex = text.indexOf(':');
          const key = text.substring(0, colonIndex).trim();
          const value = text.substring(colonIndex + 1).trim();
          
          if (key.length > 2 && value.length > 0) {
            const cleanedKey = cleanKey(key);
            const cleanedValue = cleanValue(value);
            
            if (isValidAttributePair(cleanedKey, cleanedValue)) {
              const attrKey = `${cleanedKey}:${cleanedValue}`;
              if (!attributeMap.has(attrKey)) {
                attributes.push({
                  key: cleanedKey,
                  value: cleanedValue,
                  category: categorizeAttribute(cleanedKey)
                });
                attributeMap.add(attrKey);
                console.log(`✅ Element Text: ${cleanedKey} = ${cleanedValue}`);
              }
            }
          }
        }
      });
    });
  });

  console.log(`🎯 Direct extraction completed: ${attributes.length} attributes found`);
  return attributes;
}

function cleanKey(key: string): string {
  return key
    .replace(/['"]/g, '')
    .replace(/[:\s]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function cleanValue(value: string): string {
  return value
    .replace(/['"]/g, '')
    .replace(/^\s*[:]\s*/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isValidAttributePair(key: string, value: string): boolean {
  if (!key || !value || key.length < 2 || value.length < 1) return false;
  if (key.length > 100 || value.length > 500) return false;
  
  // Skip obviously invalid patterns
  const invalidPatterns = [
    /^[a-z]$/, /^\d+$/, /^[\W\s]+$/, /http/, /www\./, /\.com/,
    /script/, /function/, /return/, /var/, /const/, /let/,
    /undefined/, /null/, /true/, /false/, /NaN/
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(key.toLowerCase()) || pattern.test(value.toLowerCase())) {
      return false;
    }
  }
  
  // Look for meaningful attribute patterns
  const meaningfulPatterns = [
    /materyal|kumaş|renk|beden|model|marka|tip|özellik|detay|kalıp|stil/i,
    /material|fabric|color|size|brand|type|feature|detail|fit|style/i,
    /yıkama|bakım|boyut|ölçü|ağırlık|kalınlık|uzunluk|genişlik/i,
    /wash|care|dimension|weight|thickness|length|width|height/i,
    /koleksiyon|sezon|yaş|cinsiyet|kullanım|durum|ortam/i,
    /collection|season|age|gender|usage|occasion|environment/i
  ];
  
  return meaningfulPatterns.some(pattern => pattern.test(key));
}

function categorizeAttribute(key: string): string {
  const keyLower = key.toLowerCase();
  
  if (/materyal|kumaş|fabric|material|composition/.test(keyLower)) return 'Malzeme';
  if (/renk|color|desen|pattern/.test(keyLower)) return 'Görünüm';
  if (/beden|size|kalıp|fit|boyut|ölçü/.test(keyLower)) return 'Ölçü';
  if (/kol|yaka|cep|fermuar|düğme|sleeve|collar|pocket/.test(keyLower)) return 'Tasarım';
  if (/yıkama|bakım|wash|care|temizlik/.test(keyLower)) return 'Bakım';
  if (/marka|brand|koleksiyon|collection|model/.test(keyLower)) return 'Marka';
  
  return 'Genel';
}