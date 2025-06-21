/**
 * Trendyol Direct Parser - Basit ve etkili özellik çıkarma
 * HTML'den doğrudan anahtar kelimeler ile özellik arar
 */

export interface DirectAttribute {
  key: string;
  value: string;
}

export function extractDirectAttributes(htmlContent: string): DirectAttribute[] {
  const attributes: DirectAttribute[] = [];
  const processedKeys = new Set<string>();
  
  console.log('🎯 Direct HTML parsing başlatılıyor...');
  
  // 0. JavaScript state extraction with multiple patterns
  const statePatterns = [
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s,
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
    /"product":\s*({.+?"attributes":\s*\[.+?\])/s
  ];
  
  for (const pattern of statePatterns) {
    const stateMatch = htmlContent.match(pattern);
    if (stateMatch) {
      console.log('📱 JavaScript state bulundu, parse ediliyor...');
      try {
        const stateData = JSON.parse(stateMatch[1]);
        
        // Direct product attributes
        if (stateData.product && stateData.product.attributes && Array.isArray(stateData.product.attributes)) {
          console.log(`  📋 ${stateData.product.attributes.length} özellik bulundu`);
          
          stateData.product.attributes.forEach((attr: any) => {
            if (attr.key && attr.key.name && attr.value && attr.value.name) {
              const key = String(attr.key.name).trim();
              const value = String(attr.value.name).trim();
              
              if (key && value && !processedKeys.has(key.toLowerCase())) {
                attributes.push({ key, value });
                processedKeys.add(key.toLowerCase());
                console.log(`    ✅ ${key}: ${value}`);
              }
            }
          });
        }
        
        // Alternative: top-level attributes
        if (stateData.attributes && Array.isArray(stateData.attributes)) {
          console.log(`  📋 Top-level attributes: ${stateData.attributes.length}`);
          stateData.attributes.forEach((attr: any) => {
            if (attr.key && attr.value) {
              const key = String(attr.key.name || attr.key).trim();
              const value = String(attr.value.name || attr.value).trim();
              
              if (key && value && !processedKeys.has(key.toLowerCase())) {
                attributes.push({ key, value });
                processedKeys.add(key.toLowerCase());
                console.log(`    ✅ Alt: ${key}: ${value}`);
              }
            }
          });
        }
        
        console.log(`🎯 JavaScript state'den ${attributes.length} özellik çıkarıldı`);
        break; // Successful parse, exit loop
      } catch (e) {
        console.log(`⚠️ State parse hatası: ${e.message}`);
        // Continue to next pattern
      }
    }
  }
  
  if (attributes.length === 0) {
    console.log('❌ JavaScript state'den özellik çıkarılamadı');
  }
  
  // 1. Türkçe özellik isimleri ile direkt arama
  const turkishFeatures = {
    'Materyal': ['materyal', 'kumaş', 'fabric', 'material'],
    'Paça Tipi': ['paça tipi', 'paça', 'leg type', 'hem'],
    'Bel': ['bel', 'waist', 'bel tipi'],
    'Kalıp': ['kalıp', 'fit', 'kesim'],
    'Yaka Tipi': ['yaka tipi', 'yaka', 'collar', 'neckline'],
    'Kapama Şekli': ['kapama şekli', 'kapama', 'closure', 'fastening'],
    'Doku': ['doku', 'texture', 'weave'],
    'Kumaş Tipi': ['kumaş tipi', 'fabric type'],
    'Renk': ['renk', 'color', 'colour'],
    'Desen': ['desen', 'pattern', 'print'],
    'Koleksiyon': ['koleksiyon', 'collection'],
    'Menşei': ['menşei', 'origin', 'made in'],
    'Boy': ['boy', 'length'],
    'Cep': ['cep', 'pocket'],
    'Ortam': ['ortam', 'occasion'],
    'Persona': ['persona', 'target'],
    'Silüet': ['silüet', 'silhouette'],
    'Ek Özellik': ['ek özellik', 'extra feature']
  };
  
  // 2. Her özellik için HTML'de arama yap
  for (const [featureName, keywords] of Object.entries(turkishFeatures)) {
    if (processedKeys.has(featureName.toLowerCase())) continue;
    
    for (const keyword of keywords) {
      // Çoklu pattern ile arama
      const patterns = [
        // JSON format: "Materyal": "Pamuk"
        new RegExp(`"${keyword}"\\s*:\\s*"([^"]+)"`, 'gi'),
        // HTML format: >Materyal</span><span>Pamuk</span>
        new RegExp(`>${keyword}<[^>]*>\\s*<[^>]*>([^<]+)<`, 'gi'),
        // Colon format: Materyal: Pamuk
        new RegExp(`${keyword}\\s*:\\s*([A-ZÇĞıİÖŞÜçğıöşüa-z0-9\\s%]+)`, 'gi'),
        // Data attribute: data-materyal="Pamuk"
        new RegExp(`data-[^=]*${keyword}[^=]*="([^"]+)"`, 'gi'),
        // Title format: title="Materyal: Pamuk"
        new RegExp(`title="[^"]*${keyword}[^"]*:\\s*([^"]*)"`, 'gi')
      ];
      
      for (const pattern of patterns) {
        const match = pattern.exec(htmlContent);
        if (match && match[1]) {
          const value = match[1].trim();
          if (value.length > 0 && value.length < 100 && !value.includes('script')) {
            attributes.push({
              key: featureName,
              value: value
            });
            processedKeys.add(featureName.toLowerCase());
            console.log(`  ✅ ${featureName}: ${value} (${keyword})`);
            break; // Bu özellik için durdur
          }
        }
      }
      
      if (processedKeys.has(featureName.toLowerCase())) break; // Bu özellik bulundu
    }
  }
  
  // 3. Genel pattern arama - giyim terimleri
  console.log('  🔍 Genel giyim terimleri aranıyor...');
  const generalPatterns = [
    // %100 Pamuk gibi malzeme oranları
    /(%?\d+)\s*(pamuk|cotton|polyester|elastan|viskoz|lycra)/gi,
    // Slim fit, regular fit gibi kalıp bilgileri
    /(slim|regular|loose|tight|relaxed|comfort)\s*(fit|kalıp)/gi,
    // High waist, low waist gibi bel tipleri
    /(high|low|mid|yüksek|düşük|orta)\s*(waist|bel)/gi,
    // Straight, skinny gibi paça tipleri
    /(straight|skinny|wide|bol|dar|düz)\s*(leg|paça)/gi
  ];
  
  generalPatterns.forEach((pattern, index) => {
    const matches = htmlContent.match(pattern);
    if (matches) {
      matches.slice(0, 3).forEach(match => {
        const cleanMatch = match.trim();
        if (cleanMatch.length > 2 && cleanMatch.length < 50) {
          // Kategorize et
          let category = 'Genel Özellik';
          if (/pamuk|cotton|polyester/i.test(cleanMatch)) category = 'Materyal';
          else if (/fit|kalıp/i.test(cleanMatch)) category = 'Kalıp';
          else if (/waist|bel/i.test(cleanMatch)) category = 'Bel';
          else if (/leg|paça/i.test(cleanMatch)) category = 'Paça Tipi';
          
          if (!processedKeys.has(category.toLowerCase())) {
            attributes.push({
              key: category,
              value: cleanMatch
            });
            processedKeys.add(category.toLowerCase());
            console.log(`  ✅ ${category}: ${cleanMatch} (genel)`);
          }
        }
      });
    }
  });
  
  // 4. Basit anahtar-değer çiftleri
  console.log('  🔍 Basit anahtar-değer çiftleri aranıyor...');
  const simpleKeyValuePattern = /([A-ZÇĞıİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞıİÖŞÜa-z]+)*)\s*:\s*([A-ZÇĞıİÖŞÜa-z0-9\s%]+(?:\s+[A-ZÇĞıİÖŞÜa-z0-9%]+)*)/g;
  
  let simpleMatch;
  let simpleCount = 0;
  while ((simpleMatch = simpleKeyValuePattern.exec(htmlContent)) !== null && simpleCount < 10) {
    const key = simpleMatch[1].trim();
    const value = simpleMatch[2].trim();
    
    // Giyim ile ilgili anahtar kelimeler kontrol et
    const clothingKeywords = ['tip', 'şekil', 'materyal', 'kumaş', 'renk', 'desen', 'model', 'stil'];
    const hasClothingKeyword = clothingKeywords.some(keyword => 
      key.toLowerCase().includes(keyword) || value.toLowerCase().includes(keyword)
    );
    
    if (hasClothingKeyword && !processedKeys.has(key.toLowerCase()) && 
        key.length > 2 && key.length < 30 && 
        value.length > 0 && value.length < 50) {
      attributes.push({ key, value });
      processedKeys.add(key.toLowerCase());
      simpleCount++;
      console.log(`  ✅ ${key}: ${value} (basit)`);
    }
  }
  
  console.log(`🎯 Direct parsing: ${attributes.length} özellik bulundu`);
  return attributes;
}