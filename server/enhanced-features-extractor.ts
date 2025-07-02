// Enhanced Features Extractor for Trendyol Products
// Specifically designed to extract product specification tables

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractTrendyolFeatures(html: string, brand: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  console.log('🎯 Enhanced Features Extractor: Starting extraction...');
  
  // Add brand first
  features.push({ key: 'Marka', value: brand });
  
  // Method 1: Direct table extraction - Trendyol specification tables
  console.log('📊 Method 1: Table extraction...');
  
  // Look for all table structures
  $('table, tbody').each((tableIndex, table) => {
    const $table = $(table);
    const tableText = $table.text();
    
    // Check if this table contains product specifications
    if (tableText.includes('Özellik') || tableText.includes('Hacim') || 
        tableText.includes('Saç Tipi') || tableText.includes('Menşei')) {
      
      console.log(`✅ Found specification table ${tableIndex + 1}`);
      
      // Extract rows from this table
      $table.find('tr').each((rowIndex, row) => {
        const $row = $(row);
        const cells = $row.find('td, th');
        
        if (cells.length >= 2) {
          const key = cells.eq(0).text().trim();
          const value = cells.eq(1).text().trim();
          
          if (key && value && key.length > 0 && value.length > 0 && 
              key.length < 50 && value.length < 100) {
            features.push({ key, value });
            console.log(`✅ Table feature: ${key} = ${value}`);
          }
        }
        
        // Handle multi-column tables (3+ columns)
        if (cells.length >= 3) {
          for (let i = 0; i < cells.length - 1; i += 2) {
            const key = cells.eq(i).text().trim();
            const value = cells.eq(i + 1).text().trim();
            
            if (key && value && key.length > 0 && value.length > 0 && 
                key.length < 50 && value.length < 100) {
              features.push({ key, value });
              console.log(`✅ Multi-column feature: ${key} = ${value}`);
            }
          }
        }
      });
    }
  });
  
  // Method 2: Div-based specification extraction
  console.log('📊 Method 2: Div-based extraction...');
  
  // Look for specification divs/sections
  const specSelectors = [
    '[class*="specification"]',
    '[class*="spec"]',
    '[class*="attribute"]',
    '[class*="detail"]',
    '[class*="property"]',
    '[class*="feature"]'
  ];
  
  for (const selector of specSelectors) {
    $(selector).each((_, element) => {
      const $element = $(element);
      const elementText = $element.text();
      
      // Check if this contains specification-like content
      if (elementText.includes(':') && 
          (elementText.includes('Hacim') || elementText.includes('Saç') || 
           elementText.includes('Özellik') || elementText.includes('Menşei'))) {
        
        // Extract key-value pairs from text
        const lines = elementText.split(/\n|\r\n|\r/);
        for (const line of lines) {
          if (line.includes(':')) {
            const [key, value] = line.split(':').map(s => s.trim());
            if (key && value && key.length > 0 && value.length > 0 && 
                key.length < 50 && value.length < 100) {
              features.push({ key, value });
              console.log(`✅ Div feature: ${key} = ${value}`);
            }
          }
        }
      }
    });
  }
  
  // Method 3: Text pattern matching for specific Trendyol features
  console.log('📊 Method 3: Pattern matching...');
  
  const specificPatterns = [
    { pattern: /Hacim[:\s]*(\d+\s*ml)/gi, key: 'Hacim' },
    { pattern: /Saç Tipi[:\s]*([^<\n\r,]{5,50})/gi, key: 'Saç Tipi' },
    { pattern: /Menşei[:\s]*([^<\n\r,]{1,20})/gi, key: 'Menşei' },
    { pattern: /Özellik[:\s]*([^<\n\r,]{5,50})/gi, key: 'Özellik' },
    { pattern: /Etki[:\s]*([^<\n\r,]{5,50})/gi, key: 'Etki' },
    { pattern: /İçerik[:\s]*([^<\n\r,]{5,100})/gi, key: 'İçerik' },
    { pattern: /Kullanım[:\s]*([^<\n\r,]{5,100})/gi, key: 'Kullanım' },
    { pattern: /Güvenlik[:\s]*([^<\n\r,]{5,50})/gi, key: 'Güvenlik' }
  ];
  
  for (const { pattern, key } of specificPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const value = match[1].trim().replace(/[<>]/g, '');
      if (value && value.length > 0) {
        features.push({ key, value });
        console.log(`✅ Pattern feature: ${key} = ${value}`);
      }
    }
  }
  
  // Method 4: JSON data extraction from scripts
  console.log('📊 Method 4: JSON data extraction...');
  
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // Look for product data structures
    const jsonPatterns = [
      /"attributes":\s*(\[[^}]*\])/g,
      /"properties":\s*(\[[^}]*\])/g,
      /"features":\s*(\[[^}]*\])/g,
      /"specifications":\s*(\[[^}]*\])/g
    ];
    
    for (const pattern of jsonPatterns) {
      const match = pattern.exec(scriptContent);
      if (match) {
        try {
          const data = JSON.parse(match[1]);
          if (Array.isArray(data)) {
            data.forEach((item: any) => {
              if (item.name && item.value) {
                features.push({ key: item.name, value: item.value });
                console.log(`✅ JSON feature: ${item.name} = ${item.value}`);
              } else if (item.key && item.val) {
                features.push({ key: item.key, value: item.val });
                console.log(`✅ JSON feature: ${item.key} = ${item.val}`);
              }
            });
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  });
  
  // Method 5: Search for common cosmetic/shampoo attributes
  console.log('📊 Method 5: Cosmetic-specific extraction...');
  
  const cosmeticTerms = [
    'sülfatsız', 'sulfate', 'paraben', 'doğal', 'organic', 'keratin', 'kolajen',
    'vitamin', 'mineral', 'yağ', 'oil', 'extract', 'özü', 'nem', 'moisture'
  ];
  
  for (const term of cosmeticTerms) {
    const regex = new RegExp(`(${term}[^<\\n\\r,]{0,30})`, 'gi');
    const matches = html.match(regex);
    if (matches) {
      matches.forEach(match => {
        const cleanMatch = match.trim().replace(/[<>]/g, '');
        if (cleanMatch.length > 3 && cleanMatch.length < 50) {
          features.push({ key: 'İçerik', value: cleanMatch });
          console.log(`✅ Cosmetic feature: İçerik = ${cleanMatch}`);
        }
      });
    }
  }
  
  // Remove duplicates and clean up
  const uniqueFeatures: ProductFeature[] = [];
  const seenPairs = new Set<string>();
  
  for (const feature of features) {
    const normalizedKey = feature.key.toLowerCase().trim();
    const normalizedValue = feature.value.toLowerCase().trim();
    const pairKey = `${normalizedKey}:${normalizedValue}`;
    
    if (!seenPairs.has(pairKey) && 
        feature.key.length > 0 && 
        feature.value.length > 0 &&
        feature.value.length < 100 &&
        !feature.value.includes('undefined') &&
        !feature.value.includes('null') &&
        !feature.key.includes('undefined')) {
      
      uniqueFeatures.push({
        key: feature.key,
        value: feature.value
      });
      seenPairs.add(pairKey);
    }
  }
  
  console.log(`🎯 Enhanced extraction completed: ${uniqueFeatures.length} unique features found`);
  
  return uniqueFeatures.slice(0, 15); // Limit to 15 features
}