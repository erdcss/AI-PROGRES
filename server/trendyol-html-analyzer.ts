/**
 * Trendyol HTML Yapısı Analiz Sistemi
 * Ürün özelliklerini çıkarmak için gelişmiş HTML parsing
 */

export interface TrendyolProductFeature {
  key: string;
  value: string;
  source: 'table' | 'json' | 'attribute' | 'meta';
}

export interface TrendyolAnalysisResult {
  features: TrendyolProductFeature[];
  totalFound: number;
  sources: {
    table: number;
    json: number;
    attribute: number;
    meta: number;
  };
}

/**
 * Trendyol HTML içeriğini analiz eder ve ürün özelliklerini çıkarır
 */
export async function analyzeTrendyolHTML(htmlContent: string): Promise<TrendyolAnalysisResult> {
  const features: TrendyolProductFeature[] = [];
  const processedKeys = new Set<string>();
  const sources = { table: 0, json: 0, attribute: 0, meta: 0 };

  console.log('🔍 Trendyol HTML analizi başlatılıyor...');

  // 1. HTML Tablo Analizi - Ürün Özellikleri Tablosu
  await extractFromTables(htmlContent, features, processedKeys, sources);

  // 2. JavaScript State Analizi
  await extractFromJavaScript(htmlContent, features, processedKeys, sources);

  // 3. Meta Tag Analizi
  await extractFromMetaTags(htmlContent, features, processedKeys, sources);

  // 4. Structured Data Analizi
  await extractFromStructuredData(htmlContent, features, processedKeys, sources);

  console.log(`✅ Trendyol analizi tamamlandı: ${features.length} özellik bulundu`);
  console.log(`📊 Kaynak dağılımı: Tablo:${sources.table} JS:${sources.json} Meta:${sources.meta} Attr:${sources.attribute}`);

  return {
    features,
    totalFound: features.length,
    sources
  };
}

/**
 * HTML tablolarından özellik çıkarma
 */
async function extractFromTables(
  htmlContent: string, 
  features: TrendyolProductFeature[], 
  processedKeys: Set<string>,
  sources: any
): Promise<void> {
  console.log('📊 Tablo analizi başlatılıyor...');

  // Trendyol'un kullandığı tablo yapıları
  const tablePatterns = [
    // Standart HTML tablosu
    /<table[^>]*class="[^"]*"[^>]*>([\s\S]*?)<\/table>/gi,
    // Div tabanlı tablo
    /<div[^>]*class="[^"]*table[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Özellik listesi divleri
    /<div[^>]*class="[^"]*feature[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Product detail sections
    /<section[^>]*class="[^"]*detail[^"]*"[^>]*>([\s\S]*?)<\/section>/gi
  ];

  for (const pattern of tablePatterns) {
    let tableMatch;
    while ((tableMatch = pattern.exec(htmlContent)) !== null) {
      const tableContent = tableMatch[1];
      
      // Satır bazlı analiz
      const rowPatterns = [
        /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
        /<div[^>]*class="[^"]*row[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
        /<li[^>]*>([\s\S]*?)<\/li>/gi
      ];

      for (const rowPattern of rowPatterns) {
        let rowMatch;
        while ((rowMatch = rowPattern.exec(tableContent)) !== null) {
          const rowContent = rowMatch[1];
          
          // Hücre çıkarma
          const cells = extractCellsFromRow(rowContent);
          
          if (cells.length === 2) {
            const key = cleanText(cells[0]);
            const value = cleanText(cells[1]);
            
            if (isValidFeature(key, value, processedKeys)) {
              features.push({ key, value, source: 'table' });
              processedKeys.add(key.toLowerCase());
              sources.table++;
              console.log(`  ✅ Tablo: ${key}: ${value}`);
            }
          }
        }
      }
    }
  }
}

/**
 * JavaScript state'den özellik çıkarma
 */
async function extractFromJavaScript(
  htmlContent: string, 
  features: TrendyolProductFeature[], 
  processedKeys: Set<string>,
  sources: any
): Promise<void> {
  console.log('⚡ JavaScript analizi başlatılıyor...');

  const jsPatterns = [
    // Trendyol ana state
    /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s,
    // Alternatif state
    /window\.__INITIAL_STATE__\s*=\s*({.+?});/s,
    // Product JSON
    /"product"\s*:\s*({[^}]+?})/s,
    // Attributes direkt
    /"attributes"\s*:\s*({[^}]+?})/g
  ];

  for (const pattern of jsPatterns) {
    const matches = htmlContent.matchAll(new RegExp(pattern.source, pattern.flags));
    
    for (const match of matches) {
      try {
        const jsonData = JSON.parse(match[1]);
        await extractAttributesFromObject(jsonData, features, processedKeys, sources, '');
      } catch (error) {
        console.log(`  ⚠️ JS parse hatası: ${error.message.substring(0, 50)}`);
      }
    }
  }

  // String-based JSON özellik arama
  const featureNames = [
    'Paça Tipi', 'Materyal', 'Bel', 'Renk', 'Koleksiyon', 'Kumaş Tipi', 
    'Ortam', 'Desen', 'Kapama Şekli', 'Dokuma Tipi', 'Boy', 'Cep', 'Kalıp', 
    'Ürün Tipi', 'Persona', 'Menşei', 'Silüet', 'Model', 'Yaş Grubu'
  ];

  for (const featureName of featureNames) {
    const pattern = new RegExp(`"${featureName}"\\s*:\\s*"([^"]+)"`, 'gi');
    const match = pattern.exec(htmlContent);
    
    if (match && !processedKeys.has(featureName.toLowerCase())) {
      features.push({ 
        key: featureName, 
        value: match[1].trim(), 
        source: 'json' 
      });
      processedKeys.add(featureName.toLowerCase());
      sources.json++;
      console.log(`  ✅ JS: ${featureName}: ${match[1]}`);
    }
  }
}

/**
 * Meta taglardan özellik çıkarma
 */
async function extractFromMetaTags(
  htmlContent: string, 
  features: TrendyolProductFeature[], 
  processedKeys: Set<string>,
  sources: any
): Promise<void> {
  console.log('🏷️ Meta tag analizi başlatılıyor...');

  const metaPatterns = [
    /<meta[^>]+property="product:([^"]+)"[^>]+content="([^"]+)"/gi,
    /<meta[^>]+name="([^"]+)"[^>]+content="([^"]+)"/gi,
    /<meta[^>]+itemprop="([^"]+)"[^>]+content="([^"]+)"/gi
  ];

  for (const pattern of metaPatterns) {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const key = cleanText(match[1]);
      const value = cleanText(match[2]);
      
      if (isValidFeature(key, value, processedKeys)) {
        features.push({ key, value, source: 'meta' });
        processedKeys.add(key.toLowerCase());
        sources.meta++;
        console.log(`  ✅ Meta: ${key}: ${value}`);
      }
    }
  }
}

/**
 * Structured data'dan özellik çıkarma
 */
async function extractFromStructuredData(
  htmlContent: string, 
  features: TrendyolProductFeature[], 
  processedKeys: Set<string>,
  sources: any
): Promise<void> {
  console.log('📐 Structured data analizi başlatılıyor...');

  const structuredDataPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  
  while ((match = structuredDataPattern.exec(htmlContent)) !== null) {
    try {
      const jsonData = JSON.parse(match[1]);
      await extractAttributesFromObject(jsonData, features, processedKeys, sources, 'structured');
    } catch (error) {
      console.log(`  ⚠️ Structured data parse hatası`);
    }
  }
}

/**
 * Nesne içinden özellik çıkarma (recursive)
 */
async function extractAttributesFromObject(
  obj: any, 
  features: TrendyolProductFeature[], 
  processedKeys: Set<string>,
  sources: any,
  path: string
): Promise<void> {
  if (!obj || typeof obj !== 'object') return;

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'attributes' && value && typeof value === 'object') {
      for (const [attrKey, attrValue] of Object.entries(value)) {
        if (typeof attrValue === 'string' && 
            isValidFeature(attrKey, attrValue, processedKeys)) {
          features.push({ 
            key: attrKey, 
            value: attrValue, 
            source: path === 'structured' ? 'attribute' : 'json' 
          });
          processedKeys.add(attrKey.toLowerCase());
          if (path === 'structured') sources.attribute++;
          else sources.json++;
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      await extractAttributesFromObject(value, features, processedKeys, sources, path);
    }
  }
}

/**
 * Satırdan hücreleri çıkaran yardımcı fonksiyon
 */
function extractCellsFromRow(rowContent: string): string[] {
  const cells: string[] = [];
  
  // TD tabanlı hücreler
  const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let tdMatch;
  while ((tdMatch = tdPattern.exec(rowContent)) !== null) {
    cells.push(tdMatch[1]);
  }
  
  // Div tabanlı hücreler
  if (cells.length === 0) {
    const divPattern = /<div[^>]*class="[^"]*cell[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let divMatch;
    while ((divMatch = divPattern.exec(rowContent)) !== null) {
      cells.push(divMatch[1]);
    }
  }
  
  // Span tabanlı hücreler
  if (cells.length === 0) {
    const spanPattern = /<span[^>]*>([\s\S]*?)<\/span>/gi;
    let spanMatch;
    while ((spanMatch = spanPattern.exec(rowContent)) !== null) {
      cells.push(spanMatch[1]);
    }
  }
  
  return cells;
}

/**
 * Metni temizleyen yardımcı fonksiyon
 */
function cleanText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Özellik validasyonu
 */
function isValidFeature(key: string, value: string, processedKeys: Set<string>): boolean {
  return !!(
    key && value &&
    key.length > 1 && key.length < 50 &&
    value.length > 0 && value.length < 100 &&
    !processedKeys.has(key.toLowerCase()) &&
    !/^[0-9\s\-\+\(\)]*$/.test(key) &&
    !/^[\W\d]*$/.test(key) &&
    !key.toLowerCase().includes('script') &&
    !value.toLowerCase().includes('script') &&
    !key.toLowerCase().includes('fiyat') &&
    !key.toLowerCase().includes('price')
  );
}