/**
 * Final Trendyol Attribute Extractor
 * Uses the exact JSON structure found in real Trendyol pages
 */

export interface TrendyolFinalAttribute {
  key: string;
  value: string;
}

export function extractTrendyolFinalAttributes(htmlContent: string): TrendyolFinalAttribute[] {
  const attributes: TrendyolFinalAttribute[] = [];
  const processedKeys = new Set<string>();
  
  console.log('🎯 Final Trendyol extraction starting...');
  
  // Extract state with more robust pattern matching
  const stateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*(\{.*?\});/s);
  
  if (stateMatch) {
    console.log('📱 Found PRODUCT_DETAIL_APP_INITIAL_STATE');
    try {
      const stateStr = stateMatch[1];
      console.log(`  📄 State size: ${stateStr.length} characters`);
      
      const stateData = JSON.parse(stateStr);
      
      if (stateData.product && stateData.product.attributes && Array.isArray(stateData.product.attributes)) {
        const attrs = stateData.product.attributes;
        console.log(`  📋 Found ${attrs.length} attributes in product`);
        
        attrs.forEach((attr: any, index: number) => {
          if (attr && typeof attr === 'object' && attr.key && attr.value) {
            const keyName = attr.key.name;
            const valueName = attr.value.name;
            
            if (keyName && valueName) {
              const key = String(keyName).trim();
              const value = String(valueName).trim();
              
              if (key && value && !processedKeys.has(key.toLowerCase())) {
                attributes.push({ key, value });
                processedKeys.add(key.toLowerCase());
                console.log(`    ✅ ${key}: ${value}`);
              }
            }
          }
        });
      }
      
      // Check variants for additional attributes
      if (stateData.product && stateData.product.variants && Array.isArray(stateData.product.variants)) {
        console.log(`  🎨 Checking ${stateData.product.variants.length} variants`);
        stateData.product.variants.forEach((variant: any) => {
          if (variant && variant.attributes && Array.isArray(variant.attributes)) {
            variant.attributes.forEach((attr: any) => {
              if (attr && attr.key && attr.value && attr.key.name && attr.value.name) {
                const key = String(attr.key.name).trim();
                const value = String(attr.value.name).trim();
                
                if (key && value && !processedKeys.has(key.toLowerCase())) {
                  attributes.push({ key, value });
                  processedKeys.add(key.toLowerCase());
                  console.log(`    ✅ Variant ${key}: ${value}`);
                }
              }
            });
          }
        });
      }
      
    } catch (e) {
      console.log(`⚠️ JSON parse error: ${e.message}`);
      
      // Fallback: extract individual attributes using regex
      console.log('  🔧 Trying regex fallback...');
      const attrPatterns = [
        /"key":\s*\{"name":"([^"]+)","id":\d+\},"value":\s*\{"name":"([^"]+)"/g,
        /"name":"([^"]+)","id":\d+\},"value":\s*\{"name":"([^"]+)"/g,
        /\{"name":"([^"]+)","id":\d+\}[^}]*\{"name":"([^"]+)"/g
      ];
      
      for (const pattern of attrPatterns) {
        let match;
        while ((match = pattern.exec(stateStr)) !== null) {
          const key = match[1].trim();
          const value = match[2].trim();
          
          if (key && value && !processedKeys.has(key.toLowerCase()) && 
              key.length > 2 && value.length > 0) {
            attributes.push({ key, value });
            processedKeys.add(key.toLowerCase());
            console.log(`    ✅ Regex: ${key}: ${value}`);
          }
        }
      }
    }
  } else {
    console.log('❌ PRODUCT_DETAIL_APP_INITIAL_STATE not found');
  }
  
  // Enhanced fallback patterns for common attributes
  console.log('🔧 Using enhanced fallback patterns...');
  
  const commonAttributes = [
    'Materyal', 'Kalıp', 'Yaka Tipi', 'Kapama Şekli', 'Paça Tipi', 'Bel', 
    'Doku', 'Kumaş Tipi', 'Renk', 'Desen', 'Koleksiyon', 'Menşei',
    'Boy', 'Cep', 'Ortam', 'Persona', 'Silüet', 'Ek Özellik'
  ];
  
  for (const attrName of commonAttributes) {
    if (processedKeys.has(attrName.toLowerCase())) continue;
    
    const patterns = [
      new RegExp(`"${attrName}"[^}]*"name":"([^"]+)"`, 'g'),
      new RegExp(`"name":"${attrName}"[^}]*"name":"([^"]+)"`, 'g'),
      new RegExp(`${attrName}[^"]*"([^"]+)"`, 'g')
    ];
    
    for (const pattern of patterns) {
      const match = pattern.exec(htmlContent);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value.length > 0 && value.length < 100) {
          attributes.push({ key: attrName, value });
          processedKeys.add(attrName.toLowerCase());
          console.log(`  ✅ Enhanced fallback ${attrName}: ${value}`);
          break;
        }
      }
    }
  }
  
  // Direct string search for attribute patterns
  if (attributes.length < 5) {
    console.log('🔧 Direct string search...');
    const directPatterns = [
      /(\w+)\s*:\s*([A-ZÇĞıİÖŞÜçğıöşüa-z0-9\s%]+)/g,
      /"([A-ZÇĞıİÖŞÜçğıöşü][a-zçğıöşü\s]+)":\s*"([^"]+)"/g
    ];
    
    for (const pattern of directPatterns) {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null && attributes.length < 15) {
        const key = match[1].trim();
        const value = match[2].trim();
        
        if (key && value && key.length > 2 && value.length > 0 && 
            !processedKeys.has(key.toLowerCase()) &&
            /^[A-ZÇĞıİÖŞÜçğıöşü]/.test(key)) {
          attributes.push({ key, value });
          processedKeys.add(key.toLowerCase());
          console.log(`  ✅ Direct: ${key}: ${value}`);
        }
      }
    }
  }
  
  console.log(`🎯 Final extraction completed: ${attributes.length} attributes found`);
  return attributes;
}