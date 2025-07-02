// JSON-LD Features Extractor - Extracts clean product specifications from structured data
import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractJSONLDFeatures(html: string, brand: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  console.log('🔍 JSON-LD Features Extractor: Looking for structured product data...');
  
  // Add brand as first feature
  features.push({ key: 'Marka', value: brand });
  
  // Extract from JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonContent = $(script).html();
      if (jsonContent) {
        const data = JSON.parse(jsonContent);
        
        // Look for additionalProperty array with product specifications
        if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
          console.log(`✅ Found ${data.additionalProperty.length} product properties in JSON-LD`);
          
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name && prop.unitText && 
                typeof prop.name === 'string' && 
                typeof prop.unitText === 'string') {
              
              const key = cleanKey(prop.name);
              const value = cleanValue(prop.unitText);
              
              // Only include valid product specifications
              if (isValidProductSpec(key, value)) {
                features.push({ key, value });
                console.log(`✅ JSON-LD spec: ${key} = ${value}`);
              }
            }
          });
        }
        
        // Also check for other product properties
        const directProperties = [
          'brand', 'model', 'color', 'material', 'size', 'weight'
        ];
        
        directProperties.forEach(prop => {
          if (data[prop] && typeof data[prop] === 'string') {
            const key = capitalizeFirst(prop);
            const value = cleanValue(data[prop]);
            
            if (value && value.length > 0) {
              features.push({ key, value });
              console.log(`✅ Direct property: ${key} = ${value}`);
            }
          }
        });
      }
    } catch (e) {
      // Skip invalid JSON
      console.log('⚠️ Skipping invalid JSON-LD content');
    }
  });
  
  // If no JSON-LD found, try backup extraction
  if (features.length <= 1) {
    console.log('🔄 No JSON-LD found, trying backup extraction...');
    extractBackupFeatures(html, features);
  }
  
  // Remove duplicates and return
  const uniqueFeatures = removeDuplicates(features);
  
  console.log(`✅ JSON-LD extraction completed: ${uniqueFeatures.length} valid features`);
  
  return uniqueFeatures.slice(0, 10); // Limit to 10 best features
}

function extractBackupFeatures(html: string, features: ProductFeature[]): void {
  console.log('🔄 Using backup patterns for key product features...');
  
  // Simple, targeted patterns for essential product info
  const essentialPatterns = [
    {
      pattern: /(?:Hacim|Volume)[:\s"]*(\d+\s*ml)/gi,
      key: 'Hacim'
    },
    {
      pattern: /(?:Saç\s*Tipi|Hair\s*Type)[:\s"]*([^">{,\n]{3,30})/gi,
      key: 'Saç Tipi'
    },
    {
      pattern: /(?:Menşei|Origin)[:\s"]*([A-Z]{2,3})/gi,
      key: 'Menşei'
    },
    {
      pattern: /Sülfatsız/gi,
      key: 'Özellik',
      fixedValue: 'Sülfatsız'
    },
    {
      pattern: /Dökülme\s*Karşıtı/gi,
      key: 'Etki',
      fixedValue: 'Dökülme Karşıtı'
    }
  ];
  
  essentialPatterns.forEach(({ pattern, key, fixedValue }) => {
    if (fixedValue) {
      if (pattern.test(html)) {
        features.push({ key, value: fixedValue });
        console.log(`✅ Backup pattern: ${key} = ${fixedValue}`);
      }
    } else {
      const match = pattern.exec(html);
      if (match && match[1]) {
        const value = cleanValue(match[1]);
        if (value && value.length > 1) {
          features.push({ key, value });
          console.log(`✅ Backup pattern: ${key} = ${value}`);
        }
      }
    }
  });
}

function cleanKey(key: string): string {
  // Clean and standardize feature keys
  return key.trim()
    .replace(/[^A-Za-zÇçĞğİıÖöŞşÜü\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanValue(value: string): string {
  // Clean and standardize feature values
  return value.trim()
    .replace(/[<>{}[\]"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isValidProductSpec(key: string, value: string): boolean {
  if (!key || !value || key.length === 0 || value.length === 0) return false;
  
  // Filter out technical/system properties
  const invalidKeys = [
    'İthalatçı',
    'Yetkili Temsilci',
    'İfa Hizmet Sağlayıcı',
    'Üretici Bilgisi',
    'Ürün Güvenliği Bilgisi'
  ];
  
  const isInvalidKey = invalidKeys.some(invalid => 
    key.toLowerCase().includes(invalid.toLowerCase())
  );
  
  if (isInvalidKey) return false;
  
  // Filter out too long values (usually descriptions)
  if (value.length > 100) return false;
  
  // Filter out values with technical data
  if (value.includes('http') || value.includes('@') || 
      value.includes('\\') || value.includes('undefined')) return false;
  
  return true;
}

function removeDuplicates(features: ProductFeature[]): ProductFeature[] {
  const unique: ProductFeature[] = [];
  const seen = new Set<string>();
  
  for (const feature of features) {
    const key = `${feature.key.toLowerCase()}:${feature.value.toLowerCase()}`;
    if (!seen.has(key)) {
      unique.push(feature);
      seen.add(key);
    }
  }
  
  return unique;
}