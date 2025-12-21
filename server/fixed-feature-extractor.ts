/**
 * Fixed Feature Extractor - Ürün özelliklerini doğru çıkarır
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
}

export async function extractProductFeatures(html: string, productTitle?: string): Promise<ProductFeature[]> {
  console.log('🔍 Fixed feature extraction starting...');
  
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  try {
    // Method 1: Trendyol specific attribute tables
    console.log('🔍 Method 1: Attribute tables...');
    
    const attributeSelectors = [
      '.product-attribute-list .product-attribute',
      '.product-spec .spec-item',
      '.detail-attr-item',
      '.product-features .feature-item',
      '.attributes-list .attribute',
      '[data-testid="product-attribute"]'
    ];
    
    for (const selector of attributeSelectors) {
      const attrElements = $(selector);
      console.log(`Checking selector: ${selector} - found ${attrElements.length} elements`);
      
      attrElements.each((index, element) => {
        const $el = $(element);
        
        // Try different patterns for key-value extraction
        const key = $el.find('.attr-key, .attribute-key, .spec-key, .feature-key').text().trim() ||
                   $el.find('dt, .label, strong').first().text().trim();
        
        const value = $el.find('.attr-value, .attribute-value, .spec-value, .feature-value').text().trim() ||
                     $el.find('dd, .value, span').last().text().trim();
        
        if (key && value && key.length > 0 && value.length > 0) {
          // Clean and validate the key-value pair
          const cleanKey = key.replace(/[:\-\s]+$/, '').trim();
          const cleanValue = value.replace(/^[:\-\s]+/, '').trim();
          
          if (isValidFeature(cleanKey, cleanValue)) {
            features.push({
              key: cleanKey,
              value: cleanValue,
              category: categorizeFeature(cleanKey)
            });
          }
        }
      });
      
      if (features.length > 0) break;
    }
    
    // Method 2: JSON-LD structured data
    if (features.length === 0) {
      console.log('🔍 Method 2: JSON-LD structured data...');
      
      const jsonLdScripts = $('script[type="application/ld+json"]');
      
      jsonLdScripts.each((index, script) => {
        try {
          const jsonData = JSON.parse($(script).html() || '{}');
          
          if (jsonData.additionalProperty) {
            jsonData.additionalProperty.forEach((prop: any) => {
              if (prop.name && prop.value && isValidFeature(prop.name, prop.value)) {
                features.push({
                  key: prop.name,
                  value: String(prop.value),
                  category: categorizeFeature(prop.name)
                });
              }
            });
          }
          
          // Check for product attributes
          if (jsonData.attributes) {
            Object.entries(jsonData.attributes).forEach(([key, value]) => {
              if (key && value && isValidFeature(key, String(value))) {
                features.push({
                  key: key,
                  value: String(value),
                  category: categorizeFeature(key)
                });
              }
            });
          }
          
        } catch (e) {
          console.log('JSON-LD parsing error:', e);
        }
      });
    }
    
    // Method 3: Script variable analysis
    if (features.length === 0) {
      console.log('🔍 Method 3: Script variables...');
      
      const scriptTags = $('script:not([src])').toArray();
      
      for (const script of scriptTags) {
        const scriptContent = $(script).html() || '';
        
        // Look for Trendyol product attributes
        const patterns = [
          /"attributes"?\s*[=:]\s*\{([^}]+)\}/g,
          /"productAttributes"?\s*[=:]\s*\{([^}]+)\}/g,
          /"specs"?\s*[=:]\s*\{([^}]+)\}/g
        ];
        
        patterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(scriptContent)) !== null) {
            try {
              const attrData = `{${match[1]}}`;
              const attrObj = JSON.parse(attrData);
              
              Object.entries(attrObj).forEach(([key, value]) => {
                if (key && value && isValidFeature(key, String(value))) {
                  features.push({
                    key: key,
                    value: String(value),
                    category: categorizeFeature(key)
                  });
                }
              });
            } catch (e) {
              // Silent fail for malformed JSON
            }
          }
        });
        
        if (features.length > 0) break;
      }
    }
    
    // Method 4: Meta tags and microdata
    if (features.length === 0) {
      console.log('🔍 Method 4: Meta tags and microdata...');
      
      // Extract from meta tags
      const metaTags = $('meta[property], meta[name]');
      metaTags.each((index, meta) => {
        const $meta = $(meta);
        const property = $meta.attr('property') || $meta.attr('name') || '';
        const content = $meta.attr('content') || '';
        
        if (property.includes('product:') && content) {
          const key = property.replace('product:', '').replace(/[_-]/g, ' ');
          if (isValidFeature(key, content)) {
            features.push({
              key: capitalizeFirst(key),
              value: content,
              category: categorizeFeature(key)
            });
          }
        }
      });
      
      // Extract from microdata
      const microdataItems = $('[itemprop]');
      microdataItems.each((index, item) => {
        const $item = $(item);
        const prop = $item.attr('itemprop') || '';
        const content = $item.attr('content') || $item.text().trim();
        
        if (prop && content && isValidFeature(prop, content)) {
          features.push({
            key: capitalizeFirst(prop),
            value: content,
            category: categorizeFeature(prop)
          });
        }
      });
    }
    
    // Method 5: Extract basic features from title if nothing found
    if (features.length === 0 && productTitle) {
      console.log('🔍 Method 5: Basic features from title...');
      
      // ❌ DISABLED - Size extraction from title was too aggressive
      // It extracted single letters like "S" or "M" as sizes from product titles
      // that don't actually have size variants (e.g., cosmetic products)
      // Only structured DOM elements should be used for size detection
      
      // Extract color information
      const colors = ['Siyah', 'Beyaz', 'Gri', 'Mavi', 'Kırmızı', 'Yeşil', 'Sarı', 'Pembe', 'Mor', 'Kahverengi'];
      colors.forEach(color => {
        if (productTitle.toLowerCase().includes(color.toLowerCase())) {
          features.push({
            key: 'Renk',
            value: color,
            category: 'Görünüm'
          });
        }
      });
      
      // Extract material information
      const materials = ['Pamuk', 'Polyester', 'Denim', 'Kot', 'Kumaş', 'Deri', 'Süet'];
      materials.forEach(material => {
        if (productTitle.toLowerCase().includes(material.toLowerCase())) {
          features.push({
            key: 'Materyal',
            value: material,
            category: 'Malzeme'
          });
        }
      });
    }
    
    // Remove duplicates and invalid entries
    const uniqueFeatures = features.filter((feature, index, self) => 
      index === self.findIndex(f => f.key === feature.key && f.value === feature.value)
    );
    
    console.log(`🔍 Fixed feature extraction completed: ${uniqueFeatures.length} features found`);
    uniqueFeatures.forEach(feature => 
      console.log(`  - ${feature.key}: ${feature.value} (${feature.category || 'Genel'})`)
    );
    
    return uniqueFeatures.slice(0, 50); // Limit to reasonable number
    
  } catch (error) {
    console.error('🔍 Fixed feature extraction error:', error);
    return [];
  }
}

function isValidFeature(key: string, value: string): boolean {
  // Filter out invalid or meaningless features
  if (!key || !value || key.length < 2 || value.length < 1) return false;
  
  // Filter out common invalid patterns
  const invalidPatterns = [
    /^(lerixc|undefined|null|NaN|\d+$)/i,
    /^(true|false)$/i,
    /^[\d\-_\.]+$/,
    /^[{}[\](),;:]+$/,
    /script|function|var |let |const /i
  ];
  
  if (invalidPatterns.some(pattern => pattern.test(key) || pattern.test(value))) {
    return false;
  }
  
  // Ensure reasonable length
  if (key.length > 100 || value.length > 500) return false;
  
  return true;
}

function categorizeFeature(key: string): string {
  const categories: { [pattern: string]: string } = {
    'renk|color': 'Görünüm',
    'beden|size|boyut': 'Boyut',
    'materyal|material|kumaş|fabric': 'Malzeme',
    'marka|brand': 'Marka',
    'model|tip|type': 'Model',
    'ağırlık|weight|kilo': 'Ölçü',
    'boy|height|uzunluk|length': 'Ölçü',
    'en|width|genişlik': 'Ölçü',
    'yıkama|wash|bakım|care': 'Bakım',
    'üretici|manufacturer|yapımcı': 'Üretim',
    'menşei|origin|köken': 'Üretim'
  };
  
  const lowerKey = key.toLowerCase();
  
  for (const [pattern, category] of Object.entries(categories)) {
    if (new RegExp(pattern, 'i').test(lowerKey)) {
      return category;
    }
  }
  
  return 'Genel';
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export default { extractProductFeatures };