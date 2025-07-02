// Simple Table Extractor - Direct Trendyol product specifications table extraction
import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractSimpleProductFeatures(html: string, brand: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];
  
  console.log('🔍 Simple Table Extractor: Looking for product specification tables...');
  
  // Add brand as first feature
  features.push({ key: 'Marka', value: brand });
  
  // Method 1: Find Trendyol product attributes table directly
  // Look for tables that contain product specification rows
  let foundSpecs = false;
  
  $('table').each((tableIndex, table) => {
    const $table = $(table);
    const tableText = $table.text().toLowerCase();
    
    // Check if this table contains product specifications
    if (tableText.includes('özellik') || tableText.includes('hacim') || 
        tableText.includes('saç tipi') || tableText.includes('menşei') ||
        tableText.includes('etki')) {
      
      console.log(`✅ Found product specification table ${tableIndex + 1}`);
      foundSpecs = true;
      
      // Extract all rows from this specifications table
      $table.find('tr').each((rowIndex, row) => {
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length === 2) {
          const key = cells.eq(0).text().trim();
          const value = cells.eq(1).text().trim();
          
          // Simple validation for clean data
          if (key && value && 
              key.length > 1 && key.length < 30 && 
              value.length > 0 && value.length < 100 &&
              !key.includes('<') && !value.includes('<') &&
              !key.includes('class=') && !value.includes('class=')) {
            
            features.push({ key, value });
            console.log(`✅ Spec: ${key} = ${value}`);
          }
        }
      });
    }
  });
  
  // Method 2: If no table found, try div-based extraction for backup
  if (!foundSpecs) {
    console.log('📝 No table found, trying div extraction...');
    
    // Look for divs that might contain specifications
    $('div').each((_, div) => {
      const $div = $(div);
      const divText = $div.text();
      
      // Check for key product attributes in text
      const patterns = [
        /Hacim[:\s]*(\d+\s*ml)/i,
        /Saç Tipi[:\s]*([^,\n]{3,30})/i,
        /Menşei[:\s]*([^,\n]{2,20})/i,
        /Özellik[:\s]*([^,\n]{3,40})/i,
        /Etki[:\s]*([^,\n]{3,40})/i
      ];
      
      patterns.forEach(pattern => {
        const match = pattern.exec(divText);
        if (match) {
          const key = pattern.source.split('[')[0]; // Extract key from pattern
          const value = match[1].trim();
          
          if (value && !value.includes('<') && !value.includes('>')) {
            features.push({ key, value });
            console.log(`✅ Div spec: ${key} = ${value}`);
          }
        }
      });
    });
  }
  
  // Remove duplicates
  const uniqueFeatures: ProductFeature[] = [];
  const seenKeys = new Set<string>();
  
  for (const feature of features) {
    const normalizedKey = feature.key.toLowerCase().trim();
    
    if (!seenKeys.has(normalizedKey)) {
      uniqueFeatures.push(feature);
      seenKeys.add(normalizedKey);
    }
  }
  
  console.log(`🎯 Simple extraction completed: ${uniqueFeatures.length} features found`);
  
  return uniqueFeatures.slice(0, 8); // Limit to 8 features max
}