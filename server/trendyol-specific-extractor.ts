/**
 * Trendyol Spesifik Özellik Çıkarıcı
 * Görselde gösterilen "Ürün Özellikleri" tablosuna odaklanır
 */

export interface TrendyolSpecificFeature {
  key: string;
  value: string;
  confidence: number;
  method: string;
}

/**
 * Trendyol'un spesifik HTML yapısından özellik çıkarır
 */
export async function extractTrendyolSpecificFeatures(htmlContent: string): Promise<TrendyolSpecificFeature[]> {
  const features: TrendyolSpecificFeature[] = [];
  const processedKeys = new Set<string>();
  
  console.log('🎯 Trendyol spesifik özellik çıkarma başlatıyor...');

  // Method 1: Direct table extraction
  await extractFromProductDetailsTable(htmlContent, features, processedKeys);
  
  // Method 2: JSON state extraction
  await extractFromProductState(htmlContent, features, processedKeys);
  
  // Method 3: Attribute section extraction
  await extractFromAttributeSection(htmlContent, features, processedKeys);

  console.log(`✅ Trendyol spesifik analiz: ${features.length} özellik bulundu`);
  
  return features;
}

/**
 * Ürün detay tablosundan özellik çıkarma
 */
async function extractFromProductDetailsTable(
  htmlContent: string,
  features: TrendyolSpecificFeature[],
  processedKeys: Set<string>
): Promise<void> {
  console.log('📊 Ürün detay tablosu analizi...');

  // Trendyol'un kullandığı tablo class'ları
  const tableSelectors = [
    'product-detail-attributes',
    'product-attributes',
    'detail-table',
    'attributes-table',
    'product-properties'
  ];

  for (const selector of tableSelectors) {
    const tableRegex = new RegExp(`<table[^>]*class="[^"]*${selector}[^"]*"[^>]*>([\\s\\S]*?)<\\/table>`, 'gi');
    const tableMatch = tableRegex.exec(htmlContent);
    
    if (tableMatch) {
      console.log(`  📋 Tablo bulundu: ${selector}`);
      const tableContent = tableMatch[1];
      
      // Satırları çıkar
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
        const rowContent = rowMatch[1];
        
        // Hücreleri çıkar
        const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        const cells: string[] = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          const cellText = cellMatch[1]
            .replace(/<[^>]*>/g, '')
            .trim()
            .replace(/\s+/g, ' ');
          cells.push(cellText);
        }
        
        if (cells.length === 2) {
          const key = cells[0];
          const value = cells[1];
          
          if (isValidTrendyolFeature(key, value, processedKeys)) {
            features.push({
              key,
              value,
              confidence: 0.9,
              method: `table-${selector}`
            });
            processedKeys.add(key.toLowerCase());
            console.log(`    ✅ ${key}: ${value}`);
          }
        }
      }
    }
  }
}

/**
 * Product state'den özellik çıkarma
 */
async function extractFromProductState(
  htmlContent: string,
  features: TrendyolSpecificFeature[],
  processedKeys: Set<string>
): Promise<void> {
  console.log('⚡ Product state analizi...');

  // Trendyol state pattern'leri
  const statePatterns = [
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s,
    /window\.__NUXT__\s*=\s*({.+?});/s,
    /"productDetail"\s*:\s*({.+?})/s
  ];

  for (const [index, pattern] of statePatterns.entries()) {
    const match = htmlContent.match(pattern);
    if (match) {
      console.log(`  💾 State pattern ${index + 1} bulundu`);
      try {
        const stateData = JSON.parse(match[1]);
        await extractAttributesFromState(stateData, features, processedKeys, `state-${index + 1}`);
      } catch (error) {
        console.log(`  ⚠️ State ${index + 1} parse hatası`);
      }
    }
  }

  // Direkt attribute patterns
  const attributePatterns = [
    /"attributes"\s*:\s*\{\s*([^}]+)\s*\}/g,
    /"productAttributes"\s*:\s*\{\s*([^}]+)\s*\}/g
  ];

  for (const pattern of attributePatterns) {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const attributeText = match[1];
      console.log(`  📋 Attribute pattern bulundu`);
      
      // Key-value pairs çıkar
      const kvRegex = /"([^"]+)"\s*:\s*"([^"]+)"/g;
      let kvMatch;
      
      while ((kvMatch = kvRegex.exec(attributeText)) !== null) {
        const key = kvMatch[1];
        const value = kvMatch[2];
        
        if (isValidTrendyolFeature(key, value, processedKeys)) {
          features.push({
            key,
            value,
            confidence: 0.8,
            method: 'direct-attribute'
          });
          processedKeys.add(key.toLowerCase());
          console.log(`    ✅ ${key}: ${value}`);
        }
      }
    }
  }
}

/**
 * Attribute section'dan özellik çıkarma
 */
async function extractFromAttributeSection(
  htmlContent: string,
  features: TrendyolSpecificFeature[],
  processedKeys: Set<string>
): Promise<void> {
  console.log('🏷️ Attribute section analizi...');

  // Bilinen Trendyol özellik isimleri
  const knownFeatures = [
    'Paça Tipi', 'Materyal', 'Bel', 'Renk', 'Koleksiyon', 'Kumaş Tipi',
    'Ortam', 'Desen', 'Kapama Şekli', 'Dokuma Tipi', 'Boy', 'Cep', 'Kalıp',
    'Ürün Tipi', 'Persona', 'Menşei', 'Silüet', 'Model', 'Yaş Grubu',
    'Kemer/Kuşak Durumu', 'Sürdürülebilirlik Detayı', 'Stil', 'Tema',
    'Astar', 'Yaka Tipi', 'Kol Tipi', 'Fit', 'Tarz'
  ];

  for (const featureName of knownFeatures) {
    // Multiple pattern search for each feature
    const patterns = [
      // JSON format
      new RegExp(`"${featureName}"\\s*:\\s*"([^"]+)"`, 'gi'),
      // HTML format
      new RegExp(`<[^>]*>${featureName}<[^>]*>\\s*<[^>]*>([^<]+)<`, 'gi'),
      // Attribute format
      new RegExp(`${featureName}[^>]*>([^<]+)`, 'gi'),
      // Data attribute format
      new RegExp(`data-${featureName.toLowerCase().replace(/\s/g, '-')}="([^"]+)"`, 'gi')
    ];

    for (const [patternIndex, pattern] of patterns.entries()) {
      const match = pattern.exec(htmlContent);
      if (match && !processedKeys.has(featureName.toLowerCase())) {
        features.push({
          key: featureName,
          value: match[1].trim(),
          confidence: 0.7,
          method: `pattern-${patternIndex + 1}`
        });
        processedKeys.add(featureName.toLowerCase());
        console.log(`    ✅ ${featureName}: ${match[1]}`);
        break;
      }
    }
  }
}

/**
 * State nesnesinden özellik çıkarma (recursive)
 */
async function extractAttributesFromState(
  obj: any,
  features: TrendyolSpecificFeature[],
  processedKeys: Set<string>,
  method: string
): Promise<void> {
  if (!obj || typeof obj !== 'object') return;

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'attributes' && value && typeof value === 'object') {
      for (const [attrKey, attrValue] of Object.entries(value)) {
        if (typeof attrValue === 'string' && 
            isValidTrendyolFeature(attrKey, attrValue, processedKeys)) {
          features.push({
            key: attrKey,
            value: attrValue,
            confidence: 0.8,
            method
          });
          processedKeys.add(attrKey.toLowerCase());
          console.log(`    ✅ ${attrKey}: ${attrValue}`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      await extractAttributesFromState(value, features, processedKeys, method);
    }
  }
}

/**
 * Trendyol özellik validasyonu
 */
function isValidTrendyolFeature(key: string, value: string, processedKeys: Set<string>): boolean {
  return !!(
    key && value &&
    key.length > 1 && key.length < 50 &&
    value.length > 0 && value.length < 100 &&
    !processedKeys.has(key.toLowerCase()) &&
    !/^[0-9\s\-\+\(\)]*$/.test(key) &&
    !/^\s*$/.test(value) &&
    !key.toLowerCase().includes('script') &&
    !value.toLowerCase().includes('script') &&
    !key.toLowerCase().includes('fiyat') &&
    !key.toLowerCase().includes('price') &&
    !key.toLowerCase().includes('url') &&
    !value.toLowerCase().includes('http')
  );
}