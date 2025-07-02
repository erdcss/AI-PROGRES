// Targeted Features Extractor - Focuses on actual Trendyol product specifications
import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractTargetedFeatures(html: string, brand: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  console.log('🎯 Targeted Features Extractor: Focusing on real product specs...');
  
  // Add brand as first feature
  features.push({ key: 'Marka', value: brand });
  
  // Method 1: Extract from actual product specification table
  extractFromSpecificationTable($, features);
  
  // Method 2: Extract from structured product data
  extractFromProductData($, features);
  
  // Method 3: Extract specific cosmetic/product attributes
  extractSpecificProductAttributes(html, features);
  
  // Clean and return only valid features
  const validFeatures = features.filter(f => isValidProductFeature(f.key, f.value));
  const uniqueFeatures = removeDuplicates(validFeatures);
  
  console.log(`✅ Targeted extraction completed: ${uniqueFeatures.length} valid features`);
  
  return uniqueFeatures.slice(0, 12); // Limit to 12 best features
}

function extractFromSpecificationTable($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  console.log('📋 Looking for product specification tables...');
  
  // Look for tables with product specifications
  $('table').each((_, table) => {
    const $table = $(table);
    const tableText = $table.text().toLowerCase();
    
    // Check if this is a product specification table
    if (tableText.includes('özellik') || tableText.includes('hacim') || 
        tableText.includes('menşei') || tableText.includes('içerik')) {
      
      console.log('✅ Found product specification table');
      
      $table.find('tr').each((_, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length === 2) {
          const key = cleanText(cells.eq(0).text());
          const value = cleanText(cells.eq(1).text());
          
          if (key && value && key.length < 30 && value.length < 100) {
            features.push({ key, value });
            console.log(`✅ Table spec: ${key} = ${value}`);
          }
        }
      });
    }
  });
}

function extractFromProductData($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  console.log('🔍 Looking for structured product data...');
  
  // Look for script tags with product data
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // Look for product attributes in script content
    const attributeMatches = scriptContent.match(/"attributes":\s*\[(.*?)\]/g);
    if (attributeMatches) {
      attributeMatches.forEach(match => {
        try {
          // Try to extract clean attribute data
          const attributeData = match.match(/"name":\s*"([^"]+)"[^}]*"value":\s*"([^"]+)"/g);
          if (attributeData) {
            attributeData.forEach(attr => {
              const nameMatch = attr.match(/"name":\s*"([^"]+)"/);
              const valueMatch = attr.match(/"value":\s*"([^"]+)"/);
              
              if (nameMatch && valueMatch) {
                const key = cleanText(nameMatch[1]);
                const value = cleanText(valueMatch[1]);
                
                if (key && value) {
                  features.push({ key, value });
                  console.log(`✅ Script data: ${key} = ${value}`);
                }
              }
            });
          }
        } catch (e) {
          // Skip invalid data
        }
      });
    }
  });
}

function extractSpecificProductAttributes(html: string, features: ProductFeature[]): void {
  console.log('🎨 Extracting specific product attributes...');
  
  // More precise patterns for Turkish product specifications
  const specificPatterns = [
    { 
      pattern: /(?:Hacim|Volume)[:\s]*(\d+\s*ml)/gi, 
      key: 'Hacim',
      validator: (v: string) => /^\d+\s*ml$/i.test(v.trim())
    },
    { 
      pattern: /(?:Saç\s*Tipi|Hair\s*Type)[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü\s]{3,40})/gi, 
      key: 'Saç Tipi',
      validator: (v: string) => v.length > 2 && v.length < 40 && !v.includes('>')
    },
    { 
      pattern: /(?:Menşei|Origin)[:\s]*([A-Za-zÇçĞğİıÖöŞşÜü]{2,15})/gi, 
      key: 'Menşei',
      validator: (v: string) => v.length >= 2 && v.length <= 15 && /^[A-Za-zÇçĞğİıÖöŞşÜü]+$/.test(v)
    },
    { 
      pattern: /Sülfatsız/gi, 
      key: 'Özellik',
      validator: () => true,
      fixedValue: 'Sülfatsız'
    },
    { 
      pattern: /Dökülme\s*Karşıtı/gi, 
      key: 'Etki',
      validator: () => true,
      fixedValue: 'Dökülme Karşıtı'
    },
    { 
      pattern: /Keratin/gi, 
      key: 'İçerik',
      validator: () => true,
      fixedValue: 'Keratin'
    },
    { 
      pattern: /Kolajen/gi, 
      key: 'İçerik',
      validator: () => true,
      fixedValue: 'Kolajen'
    }
  ];
  
  specificPatterns.forEach(({ pattern, key, validator, fixedValue }) => {
    if (fixedValue) {
      // For fixed value patterns, just check if pattern exists
      if (pattern.test(html)) {
        features.push({ key, value: fixedValue });
        console.log(`✅ Fixed pattern: ${key} = ${fixedValue}`);
      }
    } else {
      // For variable patterns, extract the value
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const value = match[1]?.trim();
        if (value && validator(value)) {
          features.push({ key, value });
          console.log(`✅ Pattern: ${key} = ${value}`);
          break; // Only take first valid match
        }
      }
    }
  });
}

function cleanText(text: string): string {
  return text.trim()
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[<>{}[\]]/g, '')
    .trim();
}

function isValidProductFeature(key: string, value: string): boolean {
  if (!key || !value || key.length === 0 || value.length === 0) return false;
  
  // Filter out technical/system data
  if (key.includes('class=') || value.includes('class=') ||
      key.includes('href=') || value.includes('href=') ||
      key.includes('http') || value.includes('http') ||
      key.includes('{') || value.includes('}') ||
      key.includes('[') || value.includes(']')) return false;
  
  // Filter out too short or too long
  if (key.length < 2 || key.length > 30 || value.length > 100) return false;
  
  // Filter out obviously invalid values
  if (value.toLowerCase().includes('undefined') ||
      value.toLowerCase().includes('null') ||
      value.toLowerCase().includes('object') ||
      value.includes('\\')) return false;
  
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