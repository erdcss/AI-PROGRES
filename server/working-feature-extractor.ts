/**
 * Working Feature Extractor - Direct approach for Trendyol product specifications
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
}

export function extractWorkingFeatures(html: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  const featureMap = new Set<string>();

  console.log('🔍 Working feature extraction başlatıldı...');

  // Method 1: Extract from window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ or similar
  const scriptContent = html;
  
  // Look for product data in script tags
  const productDataMatch = scriptContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
  if (productDataMatch) {
    try {
      const productData = JSON.parse(productDataMatch[1]);
      console.log('✅ Found PRODUCT_DETAIL_APP_INITIAL_STATE');
      
      // Extract attributes from the product data
      if (productData.product && productData.product.attributes) {
        productData.product.attributes.forEach((attr: any) => {
          if (attr.key && attr.value) {
            const key = cleanKey(attr.key);
            const value = String(attr.value).trim();
            
            if (isValidFeature(key, value)) {
              const featureKey = `${key}:${value}`;
              if (!featureMap.has(featureKey)) {
                features.push({
                  key: key,
                  value: value,
                  category: categorizeFeature(key)
                });
                featureMap.add(featureKey);
                console.log(`✅ App State: ${key} = ${value}`);
              }
            }
          }
        });
      }
    } catch (e) {
      console.log('❌ Error parsing PRODUCT_DETAIL_APP_INITIAL_STATE');
    }
  }

  // Method 2: Look for product attributes in any script tag containing "attributes"
  $('script').each((i, script) => {
    const content = $(script).html();
    if (content && content.includes('"attributes"') && content.includes('"key"') && content.includes('"value"')) {
      
      // Extract attributes using regex
      const attributeRegex = /"key"\s*:\s*"([^"]+)"[^}]*"value"\s*:\s*"([^"]+)"/g;
      let match;
      
      while ((match = attributeRegex.exec(content)) !== null) {
        const [, key, value] = match;
        const cleanedKey = cleanKey(key);
        const cleanedValue = String(value).trim();
        
        if (isValidFeature(cleanedKey, cleanedValue)) {
          const featureKey = `${cleanedKey}:${cleanedValue}`;
          if (!featureMap.has(featureKey)) {
            features.push({
              key: cleanedKey,
              value: cleanedValue,
              category: categorizeFeature(cleanedKey)
            });
            featureMap.add(featureKey);
            console.log(`✅ Script Attr: ${cleanedKey} = ${cleanedValue}`);
          }
        }
      }
    }
  });

  // Method 3: Extract from JSON-LD with Product schema
  $('script[type="application/ld+json"]').each((i, script) => {
    try {
      const jsonText = $(script).html();
      if (jsonText) {
        const data = JSON.parse(jsonText);
        
        if (data['@type'] === 'Product' || (Array.isArray(data) && data.some(item => item['@type'] === 'Product'))) {
          const productData = Array.isArray(data) ? data.find(item => item['@type'] === 'Product') : data;
          
          if (productData && productData.additionalProperty) {
            productData.additionalProperty.forEach((prop: any) => {
              if (prop.name && prop.value) {
                const key = cleanKey(String(prop.name));
                const value = String(prop.value).trim();
                
                if (isValidFeature(key, value)) {
                  const featureKey = `${key}:${value}`;
                  if (!featureMap.has(featureKey)) {
                    features.push({
                      key: key,
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

  // Method 4: Look for material and fabric info in product descriptions
  const descriptionText = $('body').text().toLowerCase();
  const materialPatterns = [
    /materyal[:\s]+([^\.,\n\r]{3,30})/gi,
    /kumaş[:\s]+([^\.,\n\r]{3,30})/gi,
    /fabric[:\s]+([^\.,\n\r]{3,30})/gi,
    /composition[:\s]+([^\.,\n\r]{3,30})/gi,
    /%\s*(\d+)\s*(pamuk|cotton|polyester|elastan|spandex|akrilik|viskon)/gi
  ];

  materialPatterns.forEach(pattern => {
    const matches = html.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const parts = match.split(/[:\s]+/);
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts.slice(1).join(' ').trim();
          
          if (isValidFeature(key, value)) {
            const featureKey = `${key}:${value}`;
            if (!featureMap.has(featureKey)) {
              features.push({
                key: cleanKey(key),
                value: value,
                category: 'Malzeme'
              });
              featureMap.add(featureKey);
              console.log(`✅ Pattern: ${key} = ${value}`);
            }
          }
        }
      });
    }
  });

  console.log(`🎯 Toplam ${features.length} çalışan özellik çıkarıldı`);
  return features;
}

function isValidFeature(key: string, value: string): boolean {
  if (!key || !value || key.length < 2 || value.length < 1) return false;
  if (value.length > 200) return false;
  
  // Skip invalid patterns
  const invalidPatterns = [
    /^[a-z]$/, /unluk/, /asi-/, /x-c/, /x-g/, /-seti-/,
    /görselleri/, /açıcı/, /kalemi/, /http/, /www\./,
    /\.com/, /\.jpg/, /\.png/, /^["'}]+$/, /^u"$/, /^a"$/,
    /^ler$/, /^"}$/, /^"$/, /^}$/, /^null$/, /^undefined$/
  ];
  
  for (const pattern of invalidPatterns) {
    if (pattern.test(value.toLowerCase())) return false;
  }
  
  // Only allow meaningful product attributes
  const validKeyPatterns = [
    /materyal/i, /kumaş/i, /renk/i, /kalıp/i, /kol/i, /yaka/i,
    /desen/i, /kapama/i, /yıkama/i, /marka/i, /beden/i, /boy/i,
    /astar/i, /koleksiyon/i, /cep/i, /ortam/i, /siluet/i,
    /kalınlık/i, /dokuma/i, /persona/i, /kemer/i, /kuşak/i,
    /sürdürülebilirlik/i, /detay/i, /tipi/i, /boyu/i, /durumu/i,
    /ürün/i, /ek/i, /özellik/i, /bileşen/i, /talimat/i,
    /fabric/i, /material/i, /cotton/i, /polyester/i, /composition/i
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
  
  if (keyLower.includes('materyal') || keyLower.includes('kumaş') || keyLower.includes('fabric') || keyLower.includes('composition')) return 'Malzeme';
  if (keyLower.includes('renk') || keyLower.includes('desen') || keyLower.includes('color')) return 'Görünüm';
  if (keyLower.includes('beden') || keyLower.includes('kalıp') || keyLower.includes('boy') || keyLower.includes('size')) return 'Ölçü';
  if (keyLower.includes('kol') || keyLower.includes('yaka') || keyLower.includes('cep')) return 'Tasarım';
  if (keyLower.includes('yıkama') || keyLower.includes('bakım') || keyLower.includes('care')) return 'Bakım';
  if (keyLower.includes('marka') || keyLower.includes('koleksiyon') || keyLower.includes('brand')) return 'Marka';
  
  return 'Genel';
}