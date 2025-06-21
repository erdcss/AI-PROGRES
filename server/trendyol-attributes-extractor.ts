/**
 * Trendyol Ürün Özellikleri Tablosu Çıkarıcı
 * HTML'den "Ürün Özellikleri" bölümündeki tüm anahtar-değer çiftlerini çıkarır
 */

export interface TrendyolAttribute {
  key: string;
  value: string;
}

export async function extractTrendyolAttributes(htmlContent: string): Promise<TrendyolAttribute[]> {
  const attributes: TrendyolAttribute[] = [];
  const processedKeys = new Set<string>();
  
  console.log('🎯 Trendyol Ürün Özellikleri tablosu analizi başlatılıyor...');
  
  // Önce HTML içeriğinde arama yapalım
  console.log(`📄 HTML içerik boyutu: ${htmlContent.length} karakter`);
  
  // Ürün Özellikleri bölümü arama
  const featuresSectionMatches = [
    /Ürün\s*Özellikleri/gi,
    /Product\s*Details/gi,
    /Özellikler/gi,
    /Features/gi,
    /Specifications/gi
  ];
  
  let featuresFound = false;
  featuresSectionMatches.forEach((pattern, index) => {
    const matches = htmlContent.match(pattern);
    if (matches) {
      console.log(`  📋 "${matches[0]}" bölümü bulundu`);
      featuresFound = true;
    }
  });
  
  // 1. Trendyol spesifik HTML yapıları
  const trendyolTablePatterns = [
    // Ürün Özellikleri tablosu - genel yapı
    /<div[^>]*class="[^"]*product-detail[^"]*"[^>]*>.*?<table[^>]*>(.*?)<\/table>/gis,
    /<div[^>]*class="[^"]*attributes[^"]*"[^>]*>.*?<table[^>]*>(.*?)<\/table>/gis,
    /<div[^>]*class="[^"]*specification[^"]*"[^>]*>.*?<table[^>]*>(.*?)<\/table>/gis,
    
    // Ürün bilgileri div'leri
    /<div[^>]*class="[^"]*product-feature[^"]*"[^>]*>(.*?)<\/div>/gis,
    /<div[^>]*class="[^"]*feature-list[^"]*"[^>]*>(.*?)<\/div>/gis,
    
    // Accordion yapısı
    /<div[^>]*class="[^"]*accordion[^"]*"[^>]*>.*?Ürün Özellikleri.*?<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/gis,
    
    // Tab içeriği
    /<div[^>]*id="[^"]*attributes[^"]*"[^>]*>(.*?)<\/div>/gis,
    /<div[^>]*id="[^"]*features[^"]*"[^>]*>(.*?)<\/div>/gis
  ];
  
  for (const [index, pattern] of trendyolTablePatterns.entries()) {
    console.log(`  📋 Trendyol pattern ${index + 1} kontrol ediliyor...`);
    let match;
    
    while ((match = pattern.exec(htmlContent)) !== null) {
      const tableContent = match[1];
      console.log(`    🎯 Tablo içeriği bulundu (${tableContent.length} karakter)`);
      
      // Tablo satırlarını çıkar
      const extractedAttrs = extractTableRows(tableContent);
      extractedAttrs.forEach(attr => {
        if (!processedKeys.has(attr.key.toLowerCase())) {
          attributes.push(attr);
          processedKeys.add(attr.key.toLowerCase());
          console.log(`      ✅ ${attr.key}: ${attr.value}`);
        }
      });
    }
  }
  
  // 2. Agresif string pattern arama - Trendyol spesifik
  console.log('  🔍 Agresif string pattern arama...');
  const aggressivePatterns = [
    // Temel anahtar-değer formatları
    /([A-ZÇĞıİÖŞÜçğıöşü][a-zçğıöşü\s]+):\s*([A-ZÇĞıİÖŞÜçğıöşüa-z0-9\s%]+)/g,
    
    // JSON formatında string değerler
    /"([A-ZÇĞıİÖŞÜçğıöşü][a-zçğıöşü\s]+)":\s*"([^"]+)"/g,
    
    // HTML attribute formatı
    /data-[a-z-]*="([^"]*)"[^>]*>([^<]+)</g,
    
    // Noktalı virgüllü format
    /([A-ZÇĞıİÖŞÜçğıöşü][a-zçğıöşü\s]+);\s*([A-ZÇĞıİÖŞÜçğıöşüa-z0-9\s%]+)/g
  ];
  
  aggressivePatterns.forEach((pattern, index) => {
    console.log(`    🎯 Agresif pattern ${index + 1} çalıştırılıyor...`);
    let match;
    let count = 0;
    
    while ((match = pattern.exec(htmlContent)) !== null && count < 15) {
      const key = match[1]?.trim();
      const value = match[2]?.trim();
      
      if (key && value && isValidTrendyolAttribute(key, value) && !processedKeys.has(key.toLowerCase())) {
        attributes.push({ key, value });
        processedKeys.add(key.toLowerCase());
        count++;
        console.log(`      ✅ ${key}: ${value}`);
      }
    }
    console.log(`    📊 Pattern ${index + 1}: ${count} özellik bulundu`);
  });
  
  // 3. Direkt tablo satırları arama - daha geniş kapsam
  console.log('  🔍 Direkt tablo satırları aranıyor...');
  const directTablePatterns = [
    // Basit tr-td yapısı
    /<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<\/tr>/gi,
    
    // Class'lı td yapısı
    /<tr[^>]*>\s*<td[^>]*class="[^"]*key[^"]*"[^>]*>([^<]+)<\/td>\s*<td[^>]*class="[^"]*value[^"]*"[^>]*>([^<]+)<\/td>\s*<\/tr>/gi,
    
    // Span içindeki veriler
    /<tr[^>]*>\s*<td[^>]*><span[^>]*>([^<]+)<\/span><\/td>\s*<td[^>]*><span[^>]*>([^<]+)<\/span><\/td>\s*<\/tr>/gi,
    
    // Div tabanlı satırlar
    /<div[^>]*class="[^"]*row[^"]*"[^>]*>\s*<div[^>]*class="[^"]*label[^"]*"[^>]*>([^<]+)<\/div>\s*<div[^>]*class="[^"]*value[^"]*"[^>]*>([^<]+)<\/div>/gi
  ];
  
  directTablePatterns.forEach((pattern, index) => {
    console.log(`    📝 Direkt pattern ${index + 1} kontrol ediliyor...`);
    let match;
    let count = 0;
    
    while ((match = pattern.exec(htmlContent)) !== null && count < 20) {
      const key = match[1]?.trim();
      const value = match[2]?.trim();
      
      if (key && value && isValidAttribute(key, value) && !processedKeys.has(key.toLowerCase())) {
        attributes.push({ key, value });
        processedKeys.add(key.toLowerCase());
        count++;
        console.log(`      ✅ Direkt: ${key}: ${value}`);
      }
    }
    console.log(`    📊 Pattern ${index + 1}: ${count} özellik bulundu`);
  });
  
  // 3. JSON state'den attributes arama
  console.log('  💾 JSON state'den özellik arama...');
  const jsonAttributesFound = extractFromJsonState(htmlContent);
  jsonAttributesFound.forEach(attr => {
    if (!processedKeys.has(attr.key.toLowerCase())) {
      attributes.push(attr);
      processedKeys.add(attr.key.toLowerCase());
      console.log(`    ✅ JSON: ${attr.key}: ${attr.value}`);
    }
  });
  
  console.log(`🎯 Toplam ${attributes.length} Trendyol özelliği çıkarıldı`);
  return attributes;
}

function extractTableRows(tableContent: string): TrendyolAttribute[] {
  const attributes: TrendyolAttribute[] = [];
  
  // Tablo satırlarını parse et
  const rowPatterns = [
    /<tr[^>]*>(.*?)<\/tr>/gis,
    /<div[^>]*class="[^"]*row[^"]*"[^>]*>(.*?)<\/div>/gis
  ];
  
  rowPatterns.forEach(rowPattern => {
    let rowMatch;
    while ((rowMatch = rowPattern.exec(tableContent)) !== null) {
      const rowContent = rowMatch[1];
      
      // Satır içindeki hücreleri çıkar
      const cellPatterns = [
        /<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([^<]+)<\/td>/gi,
        /<span[^>]*>([^<]+)<\/span>\s*<span[^>]*>([^<]+)<\/span>/gi,
        /<div[^>]*class="[^"]*label[^"]*"[^>]*>([^<]+)<\/div>\s*<div[^>]*class="[^"]*value[^"]*"[^>]*>([^<]+)<\/div>/gi
      ];
      
      cellPatterns.forEach(cellPattern => {
        let cellMatch;
        while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
          const key = cellMatch[1]?.trim();
          const value = cellMatch[2]?.trim();
          
          if (key && value && isValidAttribute(key, value)) {
            attributes.push({ key, value });
          }
        }
      });
    }
  });
  
  return attributes;
}

function extractFromJsonState(htmlContent: string): TrendyolAttribute[] {
  const attributes: TrendyolAttribute[] = [];
  
  // JavaScript state'lerden özellik arama
  const jsonPatterns = [
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s,
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
    /"productDetail"\s*:\s*({.+?})/s,
    /"attributes"\s*:\s*({.+?})/s
  ];
  
  jsonPatterns.forEach(pattern => {
    const match = htmlContent.match(pattern);
    if (match) {
      try {
        const jsonData = JSON.parse(match[1]);
        
        // Recursive search for attributes
        const searchAttributes = (obj: any, path = '') => {
          if (!obj || typeof obj !== 'object') return;
          
          for (const [key, value] of Object.entries(obj)) {
            if (key === 'attributes' && value && typeof value === 'object') {
              Object.entries(value).forEach(([attrKey, attrValue]) => {
                if (typeof attrValue === 'string' && isValidAttribute(attrKey, attrValue)) {
                  attributes.push({ key: attrKey, value: attrValue });
                }
              });
            } else if (typeof value === 'object' && value !== null) {
              searchAttributes(value, path + '.' + key);
            }
          }
        };
        
        searchAttributes(jsonData);
      } catch (e) {
        console.log(`JSON parse hatası: ${e.message}`);
      }
    }
  });
  
  return attributes;
}

function isValidAttribute(key: string, value: string): boolean {
  // Özellik validasyonu
  return (
    key && value &&
    key.length > 1 && key.length < 100 &&
    value.length > 0 && value.length < 200 &&
    !key.toLowerCase().includes('script') &&
    !value.toLowerCase().includes('script') &&
    !key.toLowerCase().includes('function') &&
    !value.toLowerCase().includes('function') &&
    !/^[0-9\s\-\+\(\)]*$/.test(key) &&
    !/^[\W\d]*$/.test(key)
  );
}

function isValidTrendyolAttribute(key: string, value: string): boolean {
  // Trendyol spesifik validasyon - daha gevşek
  const turkishFeatureKeys = [
    'materyal', 'paça', 'bel', 'kalıp', 'yaka', 'kapama', 'doku', 'kumaş', 
    'renk', 'desen', 'koleksiyon', 'menşei', 'ürün', 'boy', 'cep', 'ortam',
    'persona', 'sürdürülebilirlik', 'silüet', 'ek özellik', 'kemer'
  ];
  
  return (
    key && value &&
    key.length > 2 && key.length < 80 &&
    value.length > 0 && value.length < 150 &&
    !key.toLowerCase().includes('script') &&
    !value.toLowerCase().includes('script') &&
    !key.toLowerCase().includes('http') &&
    !value.toLowerCase().includes('http') &&
    !/^[0-9\s\-\+\(\)]*$/.test(key) &&
    (
      // Türkçe anahtar kelimeler içeriyorsa
      turkishFeatureKeys.some(keyword => key.toLowerCase().includes(keyword)) ||
      // Ya da genel giyim terimleri
      /tipi|şekli|durumu|detayı|özellik/i.test(key) ||
      // Ya da basit kelime yapısı
      /^[A-ZÇĞıİÖŞÜçğıöşü][a-zçğıöşü\s]+$/.test(key)
    )
  );
}