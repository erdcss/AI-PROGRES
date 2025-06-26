/**
 * Manual Feature Extractor - El ile tüm özellikleri çıkarır
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ProductFeature {
  key: string;
  value: string;
  category?: string;
}

export async function extractAllFeatures(url: string): Promise<ProductFeature[]> {
  try {
    console.log(`🔍 Manuel özellik çıkarıcı başlatılıyor: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    let features: ProductFeature[] = [];

    console.log(`📄 HTML boyutu: ${Math.round(html.length / 1024)}KB`);

    // Method 1: Script tablarından JSON verilerini çıkar
    console.log(`🔍 Method 1: Script JSON verilerini analiz ediyorum...`);
    const scripts = $('script').toArray();
    
    for (const script of scripts) {
      const scriptContent = $(script).html() || '';
      
      // Ürün özelliklerini bul
      const attributePatterns = [
        /"attributes":\s*(\[.*?\])/gs,
        /"productAttributes":\s*(\[.*?\])/gs,
        /"specifications":\s*(\[.*?\])/gs,
        /"features":\s*(\[.*?\])/gs,
        /"properties":\s*(\[.*?\])/gs
      ];

      for (const pattern of attributePatterns) {
        const matches = scriptContent.match(pattern);
        if (matches && matches[1]) {
          try {
            const attributesArray = JSON.parse(matches[1]);
            console.log(`✅ ${attributesArray.length} özellik bulundu`);
            
            attributesArray.forEach((attr: any) => {
              if (attr && attr.key && attr.value) {
                let key = attr.key;
                let value = attr.value;
                
                // Nested objects için derin analiz
                if (typeof key === 'object' && key.name) {
                  key = key.name;
                }
                if (typeof value === 'object' && value.name) {
                  value = value.name;
                }
                
                if (typeof key === 'string' && typeof value === 'string' && 
                    key.trim() && value.trim() && 
                    key !== 'undefined' && value !== 'undefined') {
                  features.push({
                    key: key.trim(),
                    value: value.trim(),
                    category: 'Ürün Özellikleri'
                  });
                }
              }
            });
          } catch (e) {
            console.log(`⚠️ JSON parse hatası: ${e}`);
          }
        }
      }
    }

    // Method 2: HTML'den direkt özellik tablosu çıkar
    console.log(`🔍 Method 2: HTML özellik tablolarını analiz ediyorum...`);
    
    // Özellik tablosu selektörleri
    const featureSelectors = [
      '.product-detail-attributes tr',
      '.product-attributes tr',
      '.specifications tr',
      '.features tr',
      '.attribute-table tr',
      '.detail-attributes tr',
      '[class*="attribute"] tr',
      '[class*="specification"] tr',
      '[class*="feature"] tr'
    ];

    featureSelectors.forEach(selector => {
      $(selector).each((index, element) => {
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim().replace(':', '');
          const value = $(cells[1]).text().trim();
          
          if (key && value && key !== value) {
            features.push({
              key: key,
              value: value,
              category: 'Teknik Özellikler'
            });
          }
        }
      });
    });

    // Method 3: Description ve content alanlarından özellik çıkar
    console.log(`🔍 Method 3: Açıklama alanlarından özellik çıkarıyorum...`);
    
    const contentSelectors = [
      '.product-detail-description',
      '.product-description',
      '.description',
      '.detail-content',
      '.product-content',
      '[class*="description"]',
      '[class*="detail"]'
    ];

    contentSelectors.forEach(selector => {
      $(selector).each((index, element) => {
        const content = $(element).text();
        
        // Pattern matching ile özellik çıkar
        const patterns = [
          /(\w+(?:\s+\w+)*)\s*:\s*([^,\n.]+)/g,
          /(\w+(?:\s+\w+)*)\s*=\s*([^,\n.]+)/g,
          /(\w+(?:\s+\w+)*)\s*-\s*([^,\n.]+)/g
        ];

        patterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(content)) !== null) {
            const key = match[1].trim();
            const value = match[2].trim();
            
            if (key && value && key.length > 2 && value.length > 1) {
              features.push({
                key: key,
                value: value,
                category: 'Ürün Bilgileri'
              });
            }
          }
        });
      });
    });

    // Method 4: Material ve composition bilgilerini çıkar
    console.log(`🔍 Method 4: Materyal ve kompozisyon bilgilerini çıkarıyorum...`);
    
    const materialPatterns = [
      /materyal[:\s]*([^,\n.]+)/gi,
      /kumaş[:\s]*([^,\n.]+)/gi,
      /fabric[:\s]*([^,\n.]+)/gi,
      /composition[:\s]*([^,\n.]+)/gi,
      /bileşen[:\s]*([^,\n.]+)/gi,
      /malzeme[:\s]*([^,\n.]+)/gi,
      /(%\d+\s*\w+)/g
    ];

    materialPatterns.forEach((pattern, index) => {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const value = match.replace(/materyal|kumaş|fabric|composition|bileşen|malzeme/gi, '').replace(/[:=\-]/g, '').trim();
          if (value && value.length > 2) {
            features.push({
              key: index < 6 ? 'Materyal' : 'Bileşen',
              value: value,
              category: 'Malzeme Bilgileri'
            });
          }
        });
      }
    });

    // Method 5: Bakım talimatları ve özel bilgiler
    console.log(`🔍 Method 5: Bakım talimatları ve özel bilgileri çıkarıyorum...`);
    
    const carePatterns = [
      /yıkama[:\s]*([^,\n.]+)/gi,
      /bakım[:\s]*([^,\n.]+)/gi,
      /care[:\s]*([^,\n.]+)/gi,
      /washing[:\s]*([^,\n.]+)/gi,
      /ütüleme[:\s]*([^,\n.]+)/gi,
      /kurutma[:\s]*([^,\n.]+)/gi
    ];

    carePatterns.forEach(pattern => {
      const matches = html.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const value = match.replace(/yıkama|bakım|care|washing|ütüleme|kurutma/gi, '').replace(/[:=\-]/g, '').trim();
          if (value && value.length > 2) {
            features.push({
              key: 'Bakım Talimatı',
              value: value,
              category: 'Bakım Bilgileri'
            });
          }
        });
      }
    });

    // Duplicate removal ve filtering
    const uniqueFeatures = features.filter((feature, index, self) => {
      // Remove duplicates
      const isDuplicate = self.findIndex(f => 
        f.key.toLowerCase() === feature.key.toLowerCase() && 
        f.value.toLowerCase() === feature.value.toLowerCase()
      ) !== index;
      
      // Filter out invalid values
      const isValid = feature.key.length > 1 && 
                     feature.value.length > 1 && 
                     !feature.value.toLowerCase().includes('undefined') &&
                     !feature.value.toLowerCase().includes('null') &&
                     feature.value !== feature.key;
      
      return !isDuplicate && isValid;
    });

    console.log(`✅ Toplam ${uniqueFeatures.length} benzersiz özellik çıkarıldı`);
    
    return uniqueFeatures;

  } catch (error: any) {
    console.error(`❌ Manuel özellik çıkarma hatası: ${error.message}`);
    return [];
  }
}