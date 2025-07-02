// Comprehensive Features Extractor - Captures ALL Trendyol product specifications
import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractComprehensiveFeatures(html: string, brand: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  console.log('🔥 Comprehensive Features Extractor: Capturing ALL product specifications...');
  
  // Add brand as first feature
  features.push({ key: 'Marka', value: brand });
  
  // Method 1: Extract from product specification tables with better selectors
  extractFromTables($, features);
  
  // Method 2: Extract from attribute divs and lists
  extractFromAttributeElements($, features);
  
  // Method 3: Extract from JSON-LD structured data
  extractFromStructuredData($, features);
  
  // Method 4: Extract using specific Trendyol patterns
  extractFromTrendyolPatterns(html, features);
  
  // Method 5: Extract from product detail sections
  extractFromDetailSections($, features);
  
  // Clean and deduplicate
  const cleanFeatures = cleanAndDeduplicate(features);
  
  console.log(`🎯 Comprehensive extraction completed: ${cleanFeatures.length} total features found`);
  
  return cleanFeatures;
}

function extractFromTables($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  console.log('📊 Method 1: Extracting from tables...');
  
  // Look for all tables, especially product specification tables
  $('table').each((_, table) => {
    const $table = $(table);
    
    $table.find('tr').each((_, row) => {
      const $row = $(row);
      const cells = $row.find('td, th');
      
      if (cells.length >= 2) {
        const key = cells.eq(0).text().trim();
        const value = cells.eq(1).text().trim();
        
        if (isValidFeature(key, value)) {
          features.push({ key: cleanKey(key), value: cleanValue(value) });
          console.log(`✅ Table: ${key} = ${value}`);
        }
      }
    });
  });
}

function extractFromAttributeElements($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  console.log('📋 Method 2: Extracting from attribute elements...');
  
  // Look for various attribute containers
  const selectors = [
    '.product-attributes tr',
    '.product-specs tr', 
    '.product-details tr',
    '.attribute-row',
    '.spec-row',
    'dl dt, dl dd',
    '.product-feature'
  ];
  
  selectors.forEach(selector => {
    $(selector).each((_, element) => {
      const $elem = $(element);
      const text = $elem.text().trim();
      
      // Try to extract key-value pairs from text
      const colonMatch = text.match(/^([^:]+):\s*(.+)$/);
      if (colonMatch && colonMatch[1] && colonMatch[2]) {
        const key = colonMatch[1].trim();
        const value = colonMatch[2].trim();
        
        if (isValidFeature(key, value)) {
          features.push({ key: cleanKey(key), value: cleanValue(value) });
          console.log(`✅ Attribute: ${key} = ${value}`);
        }
      }
    });
  });
}

function extractFromStructuredData($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  console.log('🔍 Method 3: Extracting from structured data...');
  
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonContent = $(script).html();
      if (jsonContent) {
        const data = JSON.parse(jsonContent);
        
        // Extract product properties
        if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name && prop.value) {
              features.push({ 
                key: cleanKey(String(prop.name)), 
                value: cleanValue(String(prop.value)) 
              });
              console.log(`✅ JSON-LD: ${prop.name} = ${prop.value}`);
            }
          });
        }
        
        // Extract other properties
        const propertyMaps = {
          'material': 'Materyal',
          'color': 'Renk',
          'size': 'Boyut',
          'weight': 'Ağırlık',
          'brand': 'Marka',
          'model': 'Model'
        };
        
        Object.entries(propertyMaps).forEach(([jsonKey, displayKey]) => {
          if (data[jsonKey]) {
            features.push({ 
              key: displayKey, 
              value: cleanValue(String(data[jsonKey])) 
            });
            console.log(`✅ JSON property: ${displayKey} = ${data[jsonKey]}`);
          }
        });
      }
    } catch (e) {
      // Skip invalid JSON
    }
  });
}

function extractFromTrendyolPatterns(html: string, features: ProductFeature[]): void {
  console.log('🎯 Method 4: Using Trendyol-specific patterns...');
  
  // Comprehensive Turkish product attribute patterns
  const patterns = [
    { regex: /Hacim[:\s]*(\d+\s*ml)/gi, key: 'Hacim' },
    { regex: /Ağırlık[:\s]*(\d+\s*gr?)/gi, key: 'Ağırlık' },
    { regex: /Saç Tipi[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,50})/gi, key: 'Saç Tipi' },
    { regex: /Menşei[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü]{2,20})/gi, key: 'Menşei' },
    { regex: /Özellik[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,50})/gi, key: 'Özellik' },
    { regex: /Etki[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,50})/gi, key: 'Etki' },
    { regex: /İçerik[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s%\d,]{3,80})/gi, key: 'İçerik' },
    { regex: /Kullanım[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{5,60})/gi, key: 'Kullanım' },
    { regex: /Renk[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{2,25})/gi, key: 'Renk' },
    { regex: /Beden[:\s]*([A-Za-z0-9\s-]{1,15})/gi, key: 'Beden' },
    { regex: /Materyal[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s%\d,]{3,60})/gi, key: 'Materyal' },
    { regex: /Kumaş[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s%\d,]{3,50})/gi, key: 'Kumaş' },
    { regex: /Koku[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,40})/gi, key: 'Koku' },
    { regex: /Tip[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{2,30})/gi, key: 'Tip' }
  ];
  
  patterns.forEach(({ regex, key }) => {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const value = match[1].trim();
      if (value && isValidFeature(key, value)) {
        features.push({ key, value: cleanValue(value) });
        console.log(`✅ Pattern: ${key} = ${value}`);
      }
    }
  });
}

function extractFromDetailSections($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  console.log('📝 Method 5: Extracting from detail sections...');
  
  // Look for product detail sections
  const detailSelectors = [
    '.product-detail-info',
    '.product-description', 
    '.product-attributes',
    '.product-specs',
    '[class*="attribute"]',
    '[class*="spec"]',
    '[class*="detail"]'
  ];
  
  detailSelectors.forEach(selector => {
    $(selector).each((_, element) => {
      const $elem = $(element);
      const text = $elem.text();
      
      // Look for colon-separated values
      const lines = text.split('\n');
      lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.includes(':')) {
          const [key, ...valueParts] = trimmed.split(':');
          const value = valueParts.join(':').trim();
          
          if (isValidFeature(key.trim(), value)) {
            features.push({ 
              key: cleanKey(key.trim()), 
              value: cleanValue(value) 
            });
            console.log(`✅ Detail: ${key.trim()} = ${value}`);
          }
        }
      });
    });
  });
}

function isValidFeature(key: string, value: string): boolean {
  if (!key || !value || key.length === 0 || value.length === 0) return false;
  if (key.length < 2 || key.length > 50 || value.length > 200) return false;
  
  // Filter out HTML and technical data
  if (key.includes('<') || value.includes('<') || 
      key.includes('class=') || value.includes('class=') ||
      key.includes('http') || value.includes('http')) return false;
  
  // Filter out meaningless values
  if (value.toLowerCase().includes('undefined') || 
      value.toLowerCase().includes('null') ||
      value.includes('{}') || value.includes('[]')) return false;
  
  return true;
}

function cleanKey(key: string): string {
  return key.replace(/[^A-Za-zÇçĞğİıÖöŞşÜü\s]/g, '').trim();
}

function cleanValue(value: string): string {
  return value.replace(/[<>{}[\]]/g, '').trim().substring(0, 100);
}

function cleanAndDeduplicate(features: ProductFeature[]): ProductFeature[] {
  const uniqueFeatures: ProductFeature[] = [];
  const seenPairs = new Set<string>();
  
  for (const feature of features) {
    const normalizedKey = feature.key.toLowerCase().trim();
    const normalizedValue = feature.value.toLowerCase().trim();
    const pairKey = `${normalizedKey}:${normalizedValue}`;
    
    if (!seenPairs.has(pairKey) && 
        feature.key.length > 1 && 
        feature.value.length > 0) {
      
      uniqueFeatures.push({
        key: feature.key,
        value: feature.value
      });
      seenPairs.add(pairKey);
    }
  }
  
  return uniqueFeatures.slice(0, 15); // Limit to 15 best features
}