/**
 * Ürün Özellikleri Çıkarıcı - Detaylı özellik bilgilerini DOM'dan çıkarır
 */

import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
}

export function extractDetailedFeatures(html: string): ProductFeature[] {
  const $ = cheerio.load(html);
  const features: ProductFeature[] = [];

  // Trendyol ürün özellikleri tablosu için farklı selector'lar
  const selectors = [
    // Ana özellikler tablosu
    '.product-detail-attributes table tr',
    '.product-attributes table tr',
    '.attributes-table tr',
    '.product-detail table tr',
    '.detail-attributes table tr',
    // Alternatif yapılar
    '.product-detail-section .product-attribute',
    '.product-attributes-container .attribute-row',
    '.attributes-list .attribute-item',
    // JSON-LD yapısından çıkarma
    '[data-testid="product-attributes"] tr',
    '.pdp-product-attributes tr',
    // Trendyol specific
    '.pr-in-at tr',
    '.pr-in-dt table tr'
  ];

  // Her selector'ı dene
  for (const selector of selectors) {
    $(selector).each((index, element) => {
      const $row = $(element);
      
      // Satırdaki key-value çiftlerini bul
      const cells = $row.find('td');
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        
        if (key && value && key !== value) {
          features.push({ key, value });
        }
      }
      
      // Alternatif yapı: th ve td
      const header = $row.find('th').text().trim();
      const data = $row.find('td').text().trim();
      if (header && data) {
        features.push({ key: header, value: data });
      }
    });
    
    // Eğer özellik bulunduysa diğer selector'ları deneme
    if (features.length > 0) break;
  }

  // Eğer tablo bulunamadıysa JSON-LD'den dene
  if (features.length === 0) {
    features.push(...extractFeaturesFromJsonLd(html));
  }

  // Eğer hala bulunamadıysa alternatif yöntemler
  if (features.length === 0) {
    features.push(...extractFeaturesFromText(html));
  }

  return features;
}

function extractFeaturesFromJsonLd(html: string): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  // JSON-LD script taglarını bul
  const jsonLdRegex = /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;
  let match;
  
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const jsonData = JSON.parse(match[1]);
      
      // Farklı JSON-LD yapılarını kontrol et
      if (jsonData.additionalProperty && Array.isArray(jsonData.additionalProperty)) {
        jsonData.additionalProperty.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({
              key: prop.name,
              value: prop.value.toString()
            });
          }
        });
      }
      
      // Product özellikleri
      if (jsonData.productAttribute) {
        Object.entries(jsonData.productAttribute).forEach(([key, value]) => {
          features.push({
            key: key,
            value: String(value)
          });
        });
      }
      
    } catch (e) {
      // JSON parse hatası - devam et
    }
  }
  
  return features;
}

function extractFeaturesFromText(html: string): ProductFeature[] {
  const features: ProductFeature[] = [];
  
  // Daha güçlü metin bazlı özellik çıkarma
  const patterns = [
    // "Materyal: Polyester" formatı
    /([A-ZÇĞIİÖŞÜa-zçğıiöşü\s\/]+):\s*([A-ZÇĞIİÖŞÜa-zçğıiöşü0-9\s\/\-\.\,\(\)]+)/g,
    // HTML attribute pattern for data-attributes
    /data-attribute-name="([^"]+)"[^>]*data-attribute-value="([^"]+)"/g,
    // JSON içindeki attribute pattern
    /"([A-ZÇĞIİÖŞÜa-zçğıiöşü\s\/]+)"\s*:\s*"([A-ZÇĞIİÖŞÜa-zçğıiöşü0-9\s\/\-\.\,\(\)]+)"/g
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      // Gelişmiş filtreleme kuralları
      if (key.length > 2 && value.length > 1 && 
          !key.includes('http') && !value.includes('http') &&
          !key.includes('class') && !value.includes('class') &&
          !key.includes('script') && !value.includes('script') &&
          key !== value) {
        features.push({ key, value });
      }
    }
  });
  
  // Özel Trendyol pattern arama
  const trendyolSpecificPatterns = [
    /Materyal[:\s]*([A-ZÇĞIİÖŞÜa-zçğıiöşü\s]+)/gi,
    /Paça Tipi[:\s]*([A-ZÇĞIİÖŞÜa-zçğıiöşü\s]+)/gi,
    /Bel[:\s]*([A-ZÇĞIİÖŞÜa-zçğıiöşü\s]+)/gi,
    /Kalıp[:\s]*([A-ZÇĞIİÖŞÜa-zçğıiöşü\s]+)/gi,
    /Kumaş Tipi[:\s]*([A-ZÇĞIİÖŞÜa-zçğıiöşü\s]+)/gi,
    /Desen[:\s]*([A-ZÇĞIİÖŞÜa-zçğıiöşü\s]+)/gi
  ];
  
  trendyolSpecificPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const key = match[0].split(/[:\s]/)[0].trim();
      const value = match[1].trim();
      if (value && value.length > 1) {
        features.push({ key, value });
      }
    }
  });
  
  return features;
}

// Türkçe özellik isimlerini standart hale getir
export function standardizeFeatureKey(key: string): string {
  const standardNames: { [key: string]: string } = {
    'Materyal': 'Materyal',
    'Material': 'Materyal',
    'Paça Tipi': 'Paça Tipi',
    'Bel': 'Bel',
    'Kalıp': 'Kalıp',
    'Kumaş Tipi': 'Kumaş Tipi',
    'Desen': 'Desen',
    'Pattern': 'Desen',
    'Renk': 'Renk',
    'Color': 'Renk',
    'Cep': 'Cep',
    'Ürün Detayı': 'Ürün Detayı',
    'Koleksiyon': 'Koleksiyon',
    'Collection': 'Koleksiyon',
    'Kalınlık': 'Kalınlık',
    'Astar Durumu': 'Astar Durumu',
    'Boy': 'Boy',
    'Siluet': 'Siluet',
    'Ortam': 'Ortam',
    'Ek Özellik': 'Ek Özellik',
    'Dokuma Tipi': 'Dokuma Tipi',
    'Persona': 'Persona',
    'Baskı/Nakış Tekniği': 'Baskı/Nakış Tekniği',
    'Kemer/Kuşak Durumu': 'Kemer/Kuşak Durumu'
  };
  
  return standardNames[key] || key;
}