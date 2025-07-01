/**
 * Targeted Attribute Extractor - Directly extracts from identified script locations
 */

import * as cheerio from 'cheerio';

export interface TargetedAttribute {
  key: string;
  value: string;
  category?: string;
}

export function extractTargetedAttributes(html: string): TargetedAttribute[] {
  const $ = cheerio.load(html);
  const attributes: TargetedAttribute[] = [];
  const attributeMap = new Set<string>();

  console.log('🎯 Targeted attribute extraction başlatıldı...');

  // Target specific script indices that contain attributes (from analysis: 5, 13, 16, 17, 19, 21, 43, 56)
  const targetScriptIndices = [5, 13, 16, 17, 19, 21, 43, 56];
  
  $('script').each((scriptIndex, script) => {
    if (!targetScriptIndices.includes(scriptIndex)) return;
    
    const content = $(script).html();
    if (!content) return;

    console.log(`🔍 Examining script ${scriptIndex} for attributes...`);

    // Method 1: Look for JSON structures with attributes arrays
    try {
      // Find all possible JSON objects in the script
      const jsonObjectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
      const matches = content.match(jsonObjectRegex);
      
      if (matches) {
        matches.forEach((jsonStr, matchIndex) => {
          try {
            const data = JSON.parse(jsonStr);
            if (data && data.attributes && Array.isArray(data.attributes)) {
              console.log(`✅ Found attributes array in script ${scriptIndex}, match ${matchIndex}`);
              
              data.attributes.forEach((attr: any) => {
                if (attr && attr.key && attr.value) {
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
                      console.log(`🎯 Script ${scriptIndex}: ${key} = ${value}`);
                    }
                  }
                }
              });
            }
          } catch (e) {
            // Not valid JSON, continue
          }
        });
      }
    } catch (e) {
      // Continue with other methods
    }

    // Method 2: Extract complete attribute arrays with proper bracket matching
    const attributePatterns = [
      /"attributes"\s*:\s*(\[[\s\S]*?\])/g,
      /"productAttributes"\s*:\s*(\[[\s\S]*?\])/g,
      /"specifications"\s*:\s*(\[[\s\S]*?\])/g,
      /"features"\s*:\s*(\[[\s\S]*?\])/g
    ];

    attributePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        try {
          let attributesStr = match[1];
          console.log(`🔍 Found pattern match in script ${scriptIndex}: ${attributesStr.substring(0, 150)}...`);
          
          // Find the complete array by counting brackets
          let startPos = match.index + match[0].indexOf('[');
          let bracketCount = 0;
          let endPos = startPos;
          
          for (let i = startPos; i < content.length; i++) {
            if (content[i] === '[') bracketCount++;
            if (content[i] === ']') {
              bracketCount--;
              if (bracketCount === 0) {
                endPos = i + 1;
                break;
              }
            }
          }
          
          if (endPos > startPos) {
            attributesStr = content.substring(startPos, endPos);
            console.log(`🔧 Complete array extracted: ${attributesStr.substring(0, 200)}...`);
            
            const attributesData = JSON.parse(attributesStr);
            
            if (Array.isArray(attributesData)) {
              attributesData.forEach((attr: any) => {
                if (attr && typeof attr === 'object') {
                  let key = '';
                  let value = '';
                  
                  // Handle Trendyol's nested attribute structure
                  if (attr.key && attr.value) {
                    // Handle nested objects like {"key":{"id":33,"name":"Desen"},"value":{"id":1011,"name":"Desenli"}}
                    if (typeof attr.key === 'object' && attr.key.name) {
                      key = String(attr.key.name);
                    } else {
                      key = String(attr.key);
                    }
                    
                    if (typeof attr.value === 'object' && attr.value.name) {
                      value = String(attr.value.name);
                    } else {
                      value = String(attr.value);
                    }
                  } else if (attr.name && attr.value) {
                    key = String(attr.name);
                    value = String(attr.value);
                  } else if (attr.label && attr.text) {
                    key = String(attr.label);
                    value = String(attr.text);
                  } else if (attr.attributeName && attr.attributeValue) {
                    key = String(attr.attributeName);
                    value = String(attr.attributeValue);
                  }
                  
                  if (key && value) {
                    const cleanedKey = cleanAttributeKey(key);
                    const cleanedValue = cleanAttributeValue(value);
                    
                    if (isValidAttribute(cleanedKey, cleanedValue)) {
                      const attrKey = `${cleanedKey}:${cleanedValue}`;
                      if (!attributeMap.has(attrKey)) {
                        attributes.push({
                          key: cleanedKey,
                          value: cleanedValue,
                          category: categorizeAttribute(cleanedKey)
                        });
                        attributeMap.add(attrKey);
                        console.log(`🎯 Pattern Script ${scriptIndex}: ${cleanedKey} = ${cleanedValue}`);
                      }
                    }
                  }
                }
              });
            }
          }
        } catch (e) {
          console.log(`❌ JSON parse error in script ${scriptIndex}: ${e}`);
        }
      }
    });

    // Method 3: Look for Turkish attribute key-value pairs in script content
    const turkishAttributeRegex = /(materyal|kumaş|renk|beden|marka|model|tip|özellik|kalıp|yıkama|bakım|detay)\s*[":=]\s*["']([^"']+)["']/gi;
    let turkishMatch;
    
    while ((turkishMatch = turkishAttributeRegex.exec(content)) !== null) {
      const key = cleanAttributeKey(turkishMatch[1]);
      const value = cleanAttributeValue(turkishMatch[2]);
      
      if (isValidAttribute(key, value)) {
        const attrKey = `${key}:${value}`;
        if (!attributeMap.has(attrKey)) {
          attributes.push({
            key,
            value,
            category: categorizeAttribute(key)
          });
          attributeMap.add(attrKey);
          console.log(`🇹🇷 Turkish Script ${scriptIndex}: ${key} = ${value}`);
        }
      }
    }
  });

  console.log(`🎯 Targeted extraction completed: ${attributes.length} attributes found`);
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
    .replace(/^\s*[:=]\s*/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isValidAttribute(key: string, value: string): boolean {
  if (!key || !value || key.length < 2 || value.length < 1) return false;
  if (key.length > 100 || value.length > 500) return false;
  
  // Skip obviously invalid patterns
  const invalidPatterns = [
    /^[a-z]$/, /^\d+$/, /^[\W\s]+$/, /http/, /www\./, /\.com/,
    /script/, /function/, /return/, /var/, /const/, /let/,
    /undefined/, /null/, /true/, /false/, /NaN/, /console/,
    /window/, /document/, /element/, /array/, /object/
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(key.toLowerCase()) || pattern.test(value.toLowerCase())) {
      return false;
    }
  }
  
  // Look for meaningful Turkish and English attribute patterns
  const meaningfulPatterns = [
    // Turkish patterns
    /materyal|kumaş|renk|beden|model|marka|tip|özellik|detay|kalıp|stil/i,
    /yıkama|bakım|boyut|ölçü|ağırlık|kalınlık|uzunluk|genişlik|yükseklik/i,
    /koleksiyon|sezon|yaş|cinsiyet|kullanım|durum|ortam|aktivite|spor/i,
    /kol|yaka|cep|fermuar|düğme|kemer|kuşak|astar|desen|kapama/i,
    
    // English patterns
    /material|fabric|color|size|model|brand|type|feature|detail|fit|style/i,
    /wash|care|dimension|measure|weight|thickness|length|width|height/i,
    /collection|season|age|gender|usage|occasion|environment|activity|sport/i,
    /sleeve|collar|pocket|zipper|button|belt|lining|pattern|closure/i,
    
    // Composition patterns
    /cotton|polyester|elastane|spandex|wool|silk|linen|viscose|modal/i,
    /pamuk|polyester|elastan|yün|ipek|keten|viskon|modal/i
  ];
  
  return meaningfulPatterns.some(pattern => pattern.test(key));
}

function categorizeAttribute(key: string): string {
  const keyLower = key.toLowerCase();
  
  if (/materyal|kumaş|fabric|material|composition|cotton|polyester|elastane/i.test(keyLower)) {
    return 'Malzeme';
  }
  if (/renk|color|desen|pattern/i.test(keyLower)) {
    return 'Görünüm';
  }
  if (/beden|size|kalıp|fit|boyut|ölçü|uzunluk|genişlik|yükseklik/i.test(keyLower)) {
    return 'Ölçü';
  }
  if (/kol|yaka|cep|fermuar|düğme|sleeve|collar|pocket|zipper|button/i.test(keyLower)) {
    return 'Tasarım';
  }
  if (/yıkama|bakım|wash|care|temizlik|cleaning/i.test(keyLower)) {
    return 'Bakım';
  }
  if (/marka|brand|koleksiyon|collection|model/i.test(keyLower)) {
    return 'Marka';
  }
  
  return 'Genel';
}