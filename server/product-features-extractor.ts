/**
 * Trendyol Ürün Özellikleri Çıkarıcısı
 * Gelişmiş HTML parsing ile ürün özelliklerini detaylı çıkarır
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
  source?: string;
}

/**
 * Ana özellik çıkarma fonksiyonu - tüm kaynakları tarar
 */
export function extractDetailedFeatures(htmlContent: string, $?: cheerio.CheerioAPI): ProductFeature[] {
  if (!$) {
    $ = cheerio.load(htmlContent);
  }
  
  const features: ProductFeature[] = [];
  const processedKeys = new Set<string>();

  console.log('🔍 Detaylı özellik çıkarma başlatılıyor...');

  // 1. Trendyol "Ürün Özellikleri" tablosu - En yüksek öncelik
  const trendyolTableFeatures = extractTrendyolProductTable($, htmlContent);
  trendyolTableFeatures.forEach(feature => {
    const key = standardizeFeatureKey(feature.key);
    if (!processedKeys.has(key.toLowerCase())) {
      features.push({ ...feature, key, category: 'Ürün Özellikleri' });
      processedKeys.add(key.toLowerCase());
    }
  });

  // 2. JSON verilerinden özellik çıkarma
  const jsonFeatures = extractFromJSON(htmlContent);
  jsonFeatures.forEach(feature => {
    const key = standardizeFeatureKey(feature.key);
    if (!processedKeys.has(key.toLowerCase())) {
      features.push({ ...feature, key, category: 'Ürün Detayı' });
      processedKeys.add(key.toLowerCase());
    }
  });

  console.log(`✅ Toplam ${features.length} özellik çıkarıldı`);
  features.forEach(f => console.log(`  ${f.key}: ${f.value}`));

  return features;
}

/**
 * Trendyol "Ürün Özellikleri" tablosunu tam olarak çıkarma
 */
function extractTrendyolProductTable($: cheerio.CheerioAPI, htmlContent: string): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  console.log('📋 Trendyol Ürün Özellikleri tablosu taranıyor...');

  // Trendyol'daki "Ürün Özellikleri" bölümünü hedefle
  const productDetailSelectors = [
    // Ana ürün detay konteynerleri
    '.product-detail-tab-content',
    '.product-detail-attributes',
    '.product-attributes',
    '.product-detail-section',
    '[data-fragment-name="ProductDetailAttributes"]',
    
    // Tablo yapıları
    'table[class*="product-detail"]',
    'table[class*="attributes"]',
    'div[class*="product-detail"] table',
    
    // Tab içerikleri
    '.tab-content .tab-pane table',
    '.product-detail .tab-content table'
  ];

  // Her selector için kontrol et
  for (const selector of productDetailSelectors) {
    const container = $(selector);
    if (container.length > 0) {
      console.log(`  ✅ ${selector} ile konteyner bulundu`);
      
      // Tablolar içindeki satırları kontrol et
      container.find('table tr, .attribute-row, .detail-row').each((i, row) => {
        const $row = $(row);
        
        // Farklı hücre yapılarını kontrol et
        const cells = $row.find('td, th, .attribute-key, .attribute-value, .detail-key, .detail-value');
        
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim();
          
          if (key && value && key.length > 1 && value.length > 0) {
            features.push({
              key: key,
              value: value,
              source: 'trendyol-table'
            });
            console.log(`    ✅ ${key}: ${value}`);
          }
        }
      });
      
      if (features.length > 0) break;
    }
  }

  // HTML pattern matching ile Trendyol özellik tablosu arama
  if (features.length === 0) {
    console.log('  🔍 HTML pattern matching ile özellik arama...');
    
    // Trendyol'daki özellik tablosu HTML pattern'leri
    const patterns = [
      // Standard tablo pattern
      /<table[^>]*class="[^"]*product[^"]*"[^>]*>(.*?)<\/table>/gis,
      /<table[^>]*class="[^"]*detail[^"]*"[^>]*>(.*?)<\/table>/gis,
      /<table[^>]*class="[^"]*attribute[^"]*"[^>]*>(.*?)<\/table>/gis,
      
      // Div tablosu pattern
      /<div[^>]*class="[^"]*product-detail[^"]*"[^>]*>(.*?)<\/div>/gis,
      /<div[^>]*class="[^"]*attributes[^"]*"[^>]*>(.*?)<\/div>/gis,
      
      // Fragment pattern
      /data-fragment-name="ProductDetailAttributes"[^>]*>(.*?)<\/div>/gis
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const content = match[1];
        
        // İçerik Trendyol özellik anahtarları içeriyor mu kontrol et
        if (content.includes('Kalıp') || content.includes('Materyal') || 
            content.includes('Kumaş') || content.includes('Yaka')) {
          
          console.log(`    📍 Pattern ile özellik tablosu bulundu`);
          
          // Satır satır işle
          const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
          let rowMatch;
          
          while ((rowMatch = rowPattern.exec(content)) !== null) {
            const rowContent = rowMatch[1];
            
            // Hücreleri çıkar
            const cellPattern = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
            const cells: string[] = [];
            let cellMatch;
            
            while ((cellMatch = cellPattern.exec(rowContent)) !== null) {
              const cellText = cellMatch[1].replace(/<[^>]*>/g, '').trim();
              if (cellText) cells.push(cellText);
            }
            
            // 2 hücre varsa özellik olarak ekle
            if (cells.length >= 2) {
              features.push({
                key: cells[0],
                value: cells[1],
                source: 'pattern-match'
              });
              console.log(`    📝 Pattern: ${cells[0]}: ${cells[1]}`);
            }
          }
        }
      }
    }
  }

  return features;
}

/**
 * JSON verilerinden özellik çıkarma
 */
function extractFromJSON(htmlContent: string): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  console.log('📦 JSON verilerinden özellik çıkarma...');

  // Trendyol product state JSON'u
  const jsonPatterns = [
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s,
    /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
    /"productDetail":\s*({.*?})/s,
    /"attributes":\s*({.*?})/s
  ];

  for (const pattern of jsonPatterns) {
    const match = htmlContent.match(pattern);
    if (match) {
      try {
        const jsonData = JSON.parse(match[1]);
        
        // Attributes çıkarma
        if (jsonData.attributes) {
          Object.entries(jsonData.attributes).forEach(([key, value]) => {
            if (typeof value === 'string' && value.length > 0) {
              features.push({
                key: key,
                value: value,
                source: 'json-attributes'
              });
            }
          });
        }
        
        // Product detail attributes
        if (jsonData.productDetail?.attributes) {
          Object.entries(jsonData.productDetail.attributes).forEach(([key, value]) => {
            if (typeof value === 'string' && value.length > 0) {
              features.push({
                key: key,
                value: value,
                source: 'json-product-detail'
              });
            }
          });
        }
        
      } catch (error) {
        console.log('JSON parsing hatası:', error.message);
      }
    }
  }

  return features;
}

/**
 * Özellik anahtarlarını standartlaştırma
 */
export function standardizeFeatureKey(key: string): string {
  if (!key) return '';
  
  const keyMap: { [key: string]: string } = {
    'kalip': 'Kalıp',
    'materyal': 'Materyal',
    'kumaş tipi': 'Kumaş Tipi',
    'kumas tipi': 'Kumaş Tipi',
    'kol tipi': 'Kol Tipi',
    'yaka tipi': 'Yaka Tipi',
    'ürün tipi': 'Ürün Tipi',
    'urun tipi': 'Ürün Tipi',
    'siluet': 'Siluet',
    'boy': 'Boy',
    'desen': 'Desen',
    'renk': 'Renk',
    'cep': 'Cep',
    'kemer/kuşak durumu': 'Kemer/Kuşak Durumu',
    'kutu durumu': 'Kutu Durumu'
  };
  
  const normalizedKey = key.toLowerCase().trim();
  return keyMap[normalizedKey] || key.trim();
}