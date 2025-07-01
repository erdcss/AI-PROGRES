/**
 * Manual Feature Extraction Test
 * Tests product feature extraction manually from a Trendyol product
 */

import * as cheerio from 'cheerio';

interface ProductFeature {
  key: string;
  value: string;
  confidence: number;
}

interface TestResult {
  success: boolean;
  url: string;
  features: ProductFeature[];
  extractionMethod: string;
  processingTime: number;
  htmlSize: number;
  error?: string;
}

export async function manualFeatureExtraction(url: string): Promise<TestResult> {
  const startTime = Date.now();
  console.log(`🔍 Manuel özellik çıkarma başlatılıyor: ${url}`);
  
  try {
    // Direct HTTP request with proper headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log('📄 Sayfa içeriği alındı...');
    const htmlContent = await response.text();
    console.log(`📊 HTML içerik boyutu: ${htmlContent.length} bytes`);
    
    // Cheerio ile HTML'i parse et
    const $ = cheerio.load(htmlContent);
    const features: ProductFeature[] = [];
    
    console.log('\n🎯 Özellik çıkarma yöntemleri test ediliyor...\n');
    
    // Yöntem 1: Script içindeki JSON verilerini ara
    console.log('1️⃣ Script JSON verileri aranıyor...');
    let scriptFeatureCount = 0;
    
    $('script').each((i, element) => {
      const scriptContent = $(element).html() || '';
      
      // Ürün özellikleri için farklı pattern'ler
      const patterns = [
        /"attributes":\s*\{([^}]+)\}/g,
        /"productDetail":\s*\{([^}]+)\}/g,
        /"features":\s*\[([^\]]+)\]/g,
        /"specifications":\s*\{([^}]+)\}/g
      ];
      
      patterns.forEach((pattern, idx) => {
        const matches = scriptContent.match(pattern);
        if (matches) {
          console.log(`   ✅ Pattern ${idx + 1} bulundu: ${matches.length} eşleşme`);
          scriptFeatureCount += matches.length;
        }
      });
    });
    
    // Yöntem 2: Özellik tabloları ara
    console.log('\n2️⃣ Özellik tabloları aranıyor...');
    let tableFeatureCount = 0;
    
    // Trendyol'un kullandığı farklı tablo selektörleri
    const tableSelectors = [
      '.product-detail-attributes',
      '.product-features',
      '.specifications-table',
      '.product-specs',
      '.detail-attr',
      'table.attributes',
      '.pr-in-dt-pr-attr-table'
    ];
    
    tableSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`   ✅ ${selector}: ${elements.length} tablo bulundu`);
        tableFeatureCount += elements.length;
        
        // Tablo içeriklerini incele
        elements.each((i, table) => {
          const rows = $(table).find('tr, .row, .attr-item');
          console.log(`      📋 Tablo ${i + 1}: ${rows.length} satır`);
          
          rows.each((j, row) => {
            const cells = $(row).find('td, th, .attr-key, .attr-value, .label, .value');
            if (cells.length >= 2) {
              const key = $(cells[0]).text().trim();
              const value = $(cells[1]).text().trim();
              
              if (key && value && key.length < 50 && value.length < 100) {
                features.push({
                  key: key,
                  value: value,
                  confidence: 0.9
                });
                console.log(`      ➕ ${key}: ${value}`);
              }
            }
          });
        });
      }
    });
    
    // Yöntem 3: Metin içinde özellik pattern'leri ara
    console.log('\n3️⃣ Metin pattern arama...');
    const bodyText = $('body').text();
    
    // Türkçe özellik pattern'leri
    const featurePatterns = [
      /Materyal[:\s]+([^,\n]+)/gi,
      /Kumaş[:\s]+([^,\n]+)/gi,
      /Renk[:\s]+([^,\n]+)/gi,
      /Beden[:\s]+([^,\n]+)/gi,
      /Kalıp[:\s]+([^,\n]+)/gi,
      /Kol Tipi[:\s]+([^,\n]+)/gi,
      /Yaka Tipi[:\s]+([^,\n]+)/gi,
      /Desen[:\s]+([^,\n]+)/gi,
      /Boy[:\s]+([^,\n]+)/gi,
      /Ürün Detayı[:\s]+([^,\n]+)/gi
    ];
    
    featurePatterns.forEach((pattern, idx) => {
      const matches = bodyText.match(pattern);
      if (matches) {
        console.log(`   ✅ Pattern ${idx + 1}: ${matches.length} eşleşme`);
        matches.forEach(match => {
          const parts = match.split(/[:\s]+/);
          if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join(' ').trim();
            
            if (value.length > 0 && value.length < 50) {
              features.push({
                key: key,
                value: value,
                confidence: 0.7
              });
              console.log(`      ➕ ${key}: ${value}`);
            }
          }
        });
      }
    });
    
    // Yöntem 4: Specific Trendyol selektörleri
    console.log('\n4️⃣ Trendyol specific selectors...');
    const trendyolSelectors = [
      '.pr-in-dt-pr-attr-table tr',
      '.product-detail-info .attr',
      '.detail-attr-item',
      '.pr-in-at-tx',
      '.product-attribute'
    ];
    
    trendyolSelectors.forEach(selector => {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`   ✅ ${selector}: ${elements.length} element`);
        
        elements.each((i, element) => {
          const text = $(element).text().trim();
          if (text.includes(':') && text.length < 100) {
            const [key, value] = text.split(':').map(s => s.trim());
            if (key && value) {
              features.push({
                key: key,
                value: value,
                confidence: 0.8
              });
              console.log(`      ➕ ${key}: ${value}`);
            }
          }
        });
      }
    });
    
    const processingTime = Date.now() - startTime;
    console.log(`\n📊 Çıkarma tamamlandı: ${features.length} özellik bulundu (${processingTime}ms)`);
    
    return {
      success: true,
      url: url,
      features: features,
      extractionMethod: 'manual-multi-method',
      processingTime: processingTime,
      htmlSize: htmlContent.length
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Manuel özellik çıkarma hatası:', error);
    
    return {
      success: false,
      url: url,
      features: [],
      extractionMethod: 'manual-multi-method',
      processingTime: processingTime,
      htmlSize: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Test fonksiyonu - Stanley ürünü ile test
export async function testStanleyProduct(): Promise<TestResult> {
  const stanleyUrl = 'https://www.trendyol.com/stanley/the-legendary-classic-bottle-1-9l-2-0qt-p-810644298';
  console.log('\n🧪 Stanley ürünü ile manuel test başlatılıyor...\n');
  return await manualFeatureExtraction(stanleyUrl);
}