/**
 * HTML'den gerçek ürün özelliklerini çıkaran modül
 * Trendyol'daki "Materyal: Bambu", "Özellik: Su Geçirmez" formatını hedefler
 */

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractRealFeaturesFromHTML(htmlContent: string): ProductFeature[] {
  const features: ProductFeature[] = [];
  const processedKeys = new Set<string>();

  console.log('🔍 HTML gerçek özellik çıkarımı başlıyor...');

  // 1. Ürün özellikleri tablosu arama - çok spesifik
  const featureTablePatterns = [
    // Trendyol'un özellik tablosu
    /<div[^>]*class="[^"]*(?:product-feature|feature-list|detail-list|spec-table)[^"]*"[^>]*>(.*?)<\/div>/gs,
    // Genel tablo yapısı
    /<table[^>]*>(.*?)<\/table>/gs,
    // Liste formatı
    /<ul[^>]*class="[^"]*(?:feature|spec|detail)[^"]*"[^>]*>(.*?)<\/ul>/gs
  ];

  featureTablePatterns.forEach((pattern, index) => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const content = match[1];
      
      // İçerideki özellik çiftlerini bul
      extractKeyValuePairs(content, features, processedKeys, `Pattern ${index + 1}`);
    }
  });

  // 2. Doğrudan metin içinde özellik arama
  const directFeaturePatterns = [
    // "Materyal: Bambu" formatı
    /(?:^|\n|\r|\s)(Materyal|Material)[\s:]+([^\n\r<]{1,50})(?=\n|\r|<|$)/gim,
    // "Özellik: Su Geçirmez" formatı
    /(?:^|\n|\r|\s)(Özellik|Feature)[\s:]+([^\n\r<]{1,50})(?=\n|\r|<|$)/gim,
    // "Renk: Beyaz" formatı
    /(?:^|\n|\r|\s)(Renk|Color)[\s:]+([^\n\r<]{1,50})(?=\n|\r|<|$)/gim,
    // "Paket İçeriği: 1'li" formatı
    /(?:^|\n|\r|\s)(Paket İçeriği|Package Content)[\s:]+([^\n\r<]{1,50})(?=\n|\r|<|$)/gim,
    // "Yıkama Talimatları" formatı
    /(?:^|\n|\r|\s)(Yıkama Talimatları|Washing Instructions)[\s:]+([^\n\r<]{1,50})(?=\n|\r|<|$)/gim,
    // Genel Türkçe özellik formatı
    /(?:^|\n|\r|\s)([A-ZÇĞİÖŞÜ][a-zçğıöşü\s]{2,25})[\s:]+([^\n\r<]{1,50})(?=\n|\r|<|$)/gm
  ];

  directFeaturePatterns.forEach((pattern, index) => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      if (isValidFeature(key, value) && !processedKeys.has(key.toLowerCase())) {
        features.push({ key, value });
        processedKeys.add(key.toLowerCase());
        console.log(`  ✓ Direct ${index + 1}: "${key}" = "${value}"`);
      }
    }
  });

  // 3. HTML temizleyip düz metin olarak özellik arama
  const cleanText = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');

  const textLines = cleanText.split(/[.\n\r]+/);
  textLines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.includes(':') && trimmed.length < 200) {
      const parts = trimmed.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].trim();
        
        if (isValidFeature(key, value) && !processedKeys.has(key.toLowerCase())) {
          features.push({ key, value });
          processedKeys.add(key.toLowerCase());
          console.log(`  ✓ Clean Text: "${key}" = "${value}"`);
        }
      }
    }
  });

  console.log(`✅ Toplam ${features.length} gerçek özellik çıkarıldı`);
  return features;
}

function extractKeyValuePairs(content: string, features: ProductFeature[], processedKeys: Set<string>, source: string) {
  // Tablo satırları
  const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gs;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(content)) !== null) {
    const rowContent = rowMatch[1];
    const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gs;
    const cells = [];
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]*>/g, '').trim());
    }
    
    if (cells.length >= 2) {
      const key = cells[0];
      const value = cells[1];
      if (isValidFeature(key, value) && !processedKeys.has(key.toLowerCase())) {
        features.push({ key, value });
        processedKeys.add(key.toLowerCase());
        console.log(`  ✓ ${source} Table: "${key}" = "${value}"`);
      }
    }
  }

  // Liste elemanları
  const listItemRegex = /<li[^>]*>(.*?)<\/li>/gs;
  let listMatch;
  while ((listMatch = listItemRegex.exec(content)) !== null) {
    const itemContent = listMatch[1].replace(/<[^>]*>/g, '').trim();
    if (itemContent.includes(':')) {
      const parts = itemContent.split(':');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].trim();
        if (isValidFeature(key, value) && !processedKeys.has(key.toLowerCase())) {
          features.push({ key, value });
          processedKeys.add(key.toLowerCase());
          console.log(`  ✓ ${source} List: "${key}" = "${value}"`);
        }
      }
    }
  }
}

function isValidFeature(key: string, value: string): boolean {
  if (!key || !value) return false;
  if (key.length < 2 || key.length > 50) return false;
  if (value.length < 1 || value.length > 100) return false;
  
  // Geçersiz değerler
  const invalidValues = ['', '-', 'n/a', 'null', 'undefined', 'yok', 'belirsiz'];
  if (invalidValues.includes(value.toLowerCase())) return false;
  
  return true;
}