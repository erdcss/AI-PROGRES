// Clean Features Extractor - Quality-focused product specifications
import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractCleanTrendyolFeatures(html: string, brand: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  console.log('🧹 Clean Features Extractor: Starting quality extraction...');
  
  // Add brand as first feature
  features.push({ key: 'Marka', value: brand });
  
  // Method 1: Direct table cell extraction - most reliable for Trendyol
  console.log('📊 Extracting from product specification tables...');
  
  $('table tr').each((_, row) => {
    const $row = $(row);
    const cells = $row.find('td');
    
    if (cells.length >= 2) {
      const key = cells.eq(0).text().trim();
      const value = cells.eq(1).text().trim();
      
      // Filter for valid product specifications
      if (isValidProductFeature(key, value)) {
        features.push({ key, value });
        console.log(`✅ Table spec: ${key} = ${value}`);
      }
    }
  });
  
  // Method 2: Search for specific product attributes in a more targeted way
  const productAttributes = extractSpecificAttributes(html);
  productAttributes.forEach(attr => {
    if (isValidProductFeature(attr.key, attr.value)) {
      features.push(attr);
      console.log(`✅ Specific attr: ${attr.key} = ${attr.value}`);
    }
  });
  
  // Method 3: Clean JSON extraction for structured data
  const jsonFeatures = extractJSONFeatures($);
  jsonFeatures.forEach(feature => {
    if (isValidProductFeature(feature.key, feature.value)) {
      features.push(feature);
      console.log(`✅ JSON spec: ${feature.key} = ${feature.value}`);
    }
  });
  
  // Remove duplicates and return clean list
  const cleanFeatures = removeDuplicatesAndClean(features);
  
  console.log(`🎯 Clean extraction completed: ${cleanFeatures.length} quality features`);
  
  return cleanFeatures.slice(0, 10); // Limit to 10 best features
}

function isValidProductFeature(key: string, value: string): boolean {
  // Must have valid key and value
  if (!key || !value || key.length === 0 || value.length === 0) return false;
  
  // Filter out system/technical data
  if (key.includes('class=') || value.includes('class=') || 
      key.includes('attribute-') || value.includes('attribute-') ||
      key.includes('href=') || value.includes('href=') ||
      key.includes('{') || value.includes('{') ||
      key.includes('\\') || value.includes('\\')) return false;
  
  // Filter out too short or too long values
  if (key.length < 2 || key.length > 30 || value.length < 1 || value.length > 50) return false;
  
  // Must be actual product specifications
  const validKeys = [
    'hacim', 'volume', 'saç tipi', 'hair type', 'menşei', 'origin', 
    'özellik', 'feature', 'etki', 'effect', 'içerik', 'content',
    'kullanım', 'usage', 'renk', 'color', 'boyut', 'size',
    'materyal', 'material', 'marka', 'brand', 'model', 'tip', 'type'
  ];
  
  const keyLower = key.toLowerCase();
  return validKeys.some(validKey => keyLower.includes(validKey));
}

function extractSpecificAttributes(html: string): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  // Look for specific cosmetic/shampoo attributes with clean regex
  const patterns = [
    { regex: /Hacim[:\s]*(\d+\s*ml)/gi, key: 'Hacim' },
    { regex: /Saç Tipi[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,30})/gi, key: 'Saç Tipi' },
    { regex: /Menşei[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü]{2,15})/gi, key: 'Menşei' },
    { regex: /Özellik[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,40})/gi, key: 'Özellik' },
    { regex: /Etki[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,40})/gi, key: 'Etki' }
  ];
  
  for (const { regex, key } of patterns) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const value = match[1].trim();
      if (value && !value.includes('<') && !value.includes('>')) {
        features.push({ key, value });
      }
    }
  }
  
  return features;
}

function extractJSONFeatures($: cheerio.CheerioAPI): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  // Look for clean JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonContent = $(script).html();
      if (jsonContent) {
        const data = JSON.parse(jsonContent);
        
        // Extract clean product properties
        if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name && prop.value && 
                typeof prop.name === 'string' && typeof prop.value === 'string') {
              features.push({ key: prop.name, value: prop.value });
            }
          });
        }
        
        // Extract other clean properties
        const propertyMappings = [
          { json: 'material', key: 'Materyal' },
          { json: 'color', key: 'Renk' },
          { json: 'size', key: 'Boyut' },
          { json: 'weight', key: 'Ağırlık' }
        ];
        
        propertyMappings.forEach(({ json, key }) => {
          if (data[json] && typeof data[json] === 'string') {
            features.push({ key, value: data[json] });
          }
        });
      }
    } catch (e) {
      // Skip invalid JSON
    }
  });
  
  return features;
}

function removeDuplicatesAndClean(features: ProductFeature[]): ProductFeature[] {
  const uniqueFeatures: ProductFeature[] = [];
  const seenPairs = new Set<string>();
  
  for (const feature of features) {
    const normalizedKey = feature.key.toLowerCase().trim();
    const normalizedValue = feature.value.toLowerCase().trim();
    const pairKey = `${normalizedKey}:${normalizedValue}`;
    
    // Skip if already seen or invalid
    if (seenPairs.has(pairKey)) continue;
    
    // Final quality check
    if (feature.key.length > 1 && 
        feature.value.length > 0 && 
        feature.value.length < 50 &&
        !feature.value.includes('undefined') &&
        !feature.value.includes('null') &&
        !feature.value.includes('class=') &&
        !feature.value.includes('"')) {
      
      uniqueFeatures.push({
        key: feature.key,
        value: feature.value
      });
      seenPairs.add(pairKey);
    }
  }
  
  return uniqueFeatures;
}