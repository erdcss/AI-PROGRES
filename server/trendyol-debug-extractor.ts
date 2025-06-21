/**
 * Trendyol Debug Extractor - HTML içeriğini detaylı analiz eder
 */

export async function debugTrendyolHTML(url: string): Promise<void> {
  console.log('🔍 Trendyol HTML Debug Analizi Başlatılıyor...');
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  const htmlContent = await response.text();
  console.log(`📄 HTML boyutu: ${htmlContent.length} karakter`);
  
  // 1. Ürün Özellikleri bölümü arama
  console.log('\n🎯 Ürün Özellikleri bölümü arama:');
  const featuresPatterns = [
    /Ürün\s*Özellikleri.*?<\/div>/gis,
    /Özellikler.*?<\/div>/gis,
    /Product\s*Details.*?<\/div>/gis,
    /Specifications.*?<\/div>/gis
  ];
  
  featuresPatterns.forEach((pattern, index) => {
    const matches = htmlContent.match(pattern);
    if (matches) {
      console.log(`  ✅ Pattern ${index + 1}: ${matches.length} eşleşme`);
      matches.slice(0, 2).forEach((match, i) => {
        console.log(`    📝 Eşleşme ${i + 1}: ${match.substring(0, 200)}...`);
      });
    } else {
      console.log(`  ❌ Pattern ${index + 1}: Eşleşme yok`);
    }
  });
  
  // 2. JSON State analizi
  console.log('\n💾 JavaScript State Analizi:');
  const jsonPatterns = [
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s,
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
    /"productDetail"\s*:\s*({.+?})/s,
    /"attributes"\s*:\s*({.+?})/s
  ];
  
  jsonPatterns.forEach((pattern, index) => {
    const match = htmlContent.match(pattern);
    if (match) {
      console.log(`  ✅ JSON Pattern ${index + 1}: Bulundu`);
      try {
        const jsonData = JSON.parse(match[1]);
        console.log(`    📊 JSON keys: ${Object.keys(jsonData).slice(0, 10).join(', ')}`);
        
        // Attributes arama
        const findAttributes = (obj: any, path = '') => {
          if (!obj || typeof obj !== 'object') return;
          
          for (const [key, value] of Object.entries(obj)) {
            if (key.toLowerCase().includes('attribute') || key.toLowerCase().includes('feature')) {
              console.log(`    🎯 Attributes burada: ${path}.${key}`);
              if (typeof value === 'object') {
                console.log(`      📋 İçerik: ${JSON.stringify(value).substring(0, 200)}...`);
              }
            }
            if (typeof value === 'object' && value !== null && path.split('.').length < 3) {
              findAttributes(value, path + '.' + key);
            }
          }
        };
        
        findAttributes(jsonData);
      } catch (e) {
        console.log(`    ❌ JSON parse hatası: ${e.message}`);
      }
    } else {
      console.log(`  ❌ JSON Pattern ${index + 1}: Bulunamadı`);
    }
  });
  
  // 3. Tablo yapısı analizi
  console.log('\n📊 Tablo Yapısı Analizi:');
  const tableMatches = htmlContent.match(/<table[^>]*>.*?<\/table>/gis);
  if (tableMatches) {
    console.log(`  ✅ ${tableMatches.length} tablo bulundu`);
    tableMatches.slice(0, 3).forEach((table, index) => {
      const rows = table.match(/<tr[^>]*>.*?<\/tr>/gis);
      console.log(`    📊 Tablo ${index + 1}: ${rows?.length || 0} satır`);
      if (rows) {
        rows.slice(0, 2).forEach((row, i) => {
          const cells = row.match(/<td[^>]*>([^<]+)<\/td>/gis);
          if (cells && cells.length >= 2) {
            console.log(`      🔸 Satır ${i + 1}: ${cells.slice(0, 2).join(' | ')}`);
          }
        });
      }
    });
  } else {
    console.log('  ❌ Tablo bulunamadı');
  }
  
  // 4. Spesifik Türkçe anahtar kelimeler
  console.log('\n🔤 Türkçe Anahtar Kelime Analizi:');
  const turkishKeywords = ['Materyal', 'Paça Tipi', 'Bel', 'Kalıp', 'Yaka Tipi', 'Kapama Şekli', 'Doku', 'Kumaş Tipi'];
  
  turkishKeywords.forEach(keyword => {
    const regex = new RegExp(keyword + '.*?([A-ZÇĞıİÖŞÜçğıöşüa-z0-9\\s%]+)', 'gi');
    const matches = htmlContent.match(regex);
    if (matches) {
      console.log(`  ✅ "${keyword}": ${matches.length} eşleşme`);
      matches.slice(0, 2).forEach(match => {
        console.log(`    📝 ${match.substring(0, 80)}...`);
      });
    } else {
      console.log(`  ❌ "${keyword}": Bulunamadı`);
    }
  });
}