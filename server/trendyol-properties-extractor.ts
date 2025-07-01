import axios from 'axios';
import * as cheerio from 'cheerio';

interface TrendyolProperty {
  key: string;
  value: string;
  category: string;
}

interface PropertiesResult {
  success: boolean;
  properties: TrendyolProperty[];
  extractionTime: number;
  method: string;
  totalFound: number;
}

export class TrendyolPropertiesExtractor {
  private async fetchHTML(url: string): Promise<string> {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Cache-Control': 'max-age=0'
    };

    const response = await axios.get(url, { 
      headers, 
      timeout: 30000,
      maxRedirects: 5
    });
    
    return response.data;
  }

  private categorizeProperty(key: string): string {
    const categories = {
      'Boyut': ['kapasite', 'beden', 'ölçü', 'boyut', 'hacim', 'litre', 'model', 'çap', 'yükseklik', 'genişlik'],
      'Malzeme': ['materyal', 'malzeme', 'çelik', 'plastik', 'metal', 'cam', 'seramik', 'ahşap'],
      'Görünüm': ['renk', 'desen', 'stil', 'görünüm', 'yüzey', 'kaplama', 'finish'],
      'Fonksiyon': ['özellik', 'fonksiyon', 'kullanım', 'uygulama', 'teknoloji', 'sistem'],
      'Bakım': ['bakım', 'temizlik', 'yıkama', 'talimat', 'öneri'],
      'Üretim': ['menşei', 'marka', 'üretici', 'model', 'seri', 'koleksiyon'],
      'Güvenlik': ['güvenlik', 'sertifika', 'standart', 'onay', 'test'],
      'Diğer': ['genel', 'çeşitli', 'ek', 'not']
    };

    const keyLower = key.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => keyLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'Genel';
  }

  async extractTrendyolProperties(url: string): Promise<PropertiesResult> {
    const startTime = Date.now();
    console.log(`🔍 Trendyol özellik tablosu çıkarma başlatılıyor: ${url}`);
    
    try {
      const html = await this.fetchHTML(url);
      const $ = cheerio.load(html);
      
      console.log(`📄 HTML içerik alındı: ${html.length} karakter`);
      
      const properties: TrendyolProperty[] = [];
      
      // Method 1: Trendyol'un yeni ürün özellikleri yapısı
      console.log(`🎯 Method 1: Yeni ürün özellikleri yapısı aranıyor...`);
      
      // Modern Trendyol product properties selector'ları
      const modernSelectors = [
        '.detail-attr-container',
        '.product-attribute-list .detail-attr-item', 
        '.detail-attributes .detail-attr-item',
        '.attributes-wrapper .detail-attr-item',
        '.product-properties .property-item',
        '.specifications-container .spec-item'
      ];
      
      let foundProperties = false;
      
      for (const selector of modernSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`   ✅ ${selector}: ${elements.length} element bulundu`);
          
          elements.each((_, element) => {
            const $el = $(element);
            
            // İçeriği kontrol et
            const allText = $el.text().trim();
            if (allText.length < 3) return; // Çok kısa içerikleri atla
            
            // Method 1a: .detail-attr-text ile key-value çıkarımı
            const textElements = $el.find('.detail-attr-text');
            if (textElements.length >= 2) {
              const key = $(textElements[0]).text().trim();
              const value = $(textElements[1]).text().trim();
              
              if (key && value && key.length > 1 && value.length > 0) {
                const category = this.categorizeProperty(key);
                properties.push({ key, value, category });
                console.log(`      ➕ ${key}: ${value} (${category})`);
                foundProperties = true;
              }
            }
            // Method 1b: İki child element ile çıkarım
            else {
              const children = $el.children();
              if (children.length >= 2) {
                const key = $(children[0]).text().trim().replace(':', '');
                const value = $(children[1]).text().trim();
                
                if (key && value && key.length > 1 && value.length > 0) {
                  const category = this.categorizeProperty(key);
                  properties.push({ key, value, category });
                  console.log(`      ➕ ${key}: ${value} (${category})`);
                  foundProperties = true;
                }
              }
              // Method 1c: Tek element içinde "key: value" formatı
              else if (allText.includes(':')) {
                const colonIndex = allText.indexOf(':');
                const key = allText.substring(0, colonIndex).trim();
                const value = allText.substring(colonIndex + 1).trim();
                
                if (key && value && key.length > 1 && value.length > 0) {
                  const category = this.categorizeProperty(key);
                  properties.push({ key, value, category });
                  console.log(`      ➕ ${key}: ${value} (${category})`);
                  foundProperties = true;
                }
              }
            }
          });
          
          if (foundProperties) break; // İlk başarılı selector'ı kullan
        }
      }
      
      // Method 2: Script içindeki JSON product data
      if (!foundProperties) {
        console.log(`🎯 Method 2: JSON product data aranıyor...`);
        
        $('script').each((_, script) => {
          const scriptContent = $(script).html() || '';
          
          // Trendyol'un product JSON pattern'ları
          const productDataPatterns = [
            /"attributes"\s*:\s*(\[.*?\])/,
            /"properties"\s*:\s*(\{.*?\})/,
            /"productAttributes"\s*:\s*(\[.*?\])/,
            /"specifications"\s*:\s*(\[.*?\])/
          ];
          
          productDataPatterns.forEach(pattern => {
            const match = scriptContent.match(pattern);
            if (match) {
              try {
                const jsonData = JSON.parse(match[1]);
                
                if (Array.isArray(jsonData)) {
                  jsonData.forEach((item: any) => {
                    if (item.name && item.value) {
                      const category = this.categorizeProperty(item.name);
                      properties.push({
                        key: item.name,
                        value: String(item.value),
                        category
                      });
                      console.log(`      ➕ ${item.name}: ${item.value} (${category})`);
                      foundProperties = true;
                    } else if (item.key && item.value) {
                      const category = this.categorizeProperty(item.key);
                      properties.push({
                        key: item.key,
                        value: String(item.value),
                        category
                      });
                      console.log(`      ➕ ${item.key}: ${item.value} (${category})`);
                      foundProperties = true;
                    }
                  });
                } else if (typeof jsonData === 'object') {
                  Object.entries(jsonData).forEach(([key, value]) => {
                    if (typeof value === 'string' || typeof value === 'number') {
                      const category = this.categorizeProperty(key);
                      properties.push({
                        key,
                        value: String(value),
                        category
                      });
                      console.log(`      ➕ ${key}: ${value} (${category})`);
                      foundProperties = true;
                    }
                  });
                }
              } catch (e) {
                // JSON parse hatası, devam et
              }
            }
          });
        });
      }
      
      // Method 3: Table-based property extraction
      if (!foundProperties) {
        console.log(`🎯 Method 3: Tablo yapısı aranıyor...`);
        
        const tableSelectors = [
          'table.product-attributes tr',
          'table.specifications tr', 
          '.product-table tr',
          '.attr-table tr',
          '.properties-table tr'
        ];
        
        tableSelectors.forEach(selector => {
          const rows = $(selector);
          if (rows.length > 0) {
            console.log(`   ✅ ${selector}: ${rows.length} satır bulundu`);
            
            rows.each((_, row) => {
              const cells = $(row).find('td, th');
              if (cells.length >= 2) {
                const key = $(cells[0]).text().trim().replace(':', '');
                const value = $(cells[1]).text().trim();
                
                if (key && value && key.length > 1 && value.length > 0) {
                  const category = this.categorizeProperty(key);
                  properties.push({ key, value, category });
                  console.log(`      ➕ ${key}: ${value} (${category})`);
                  foundProperties = true;
                }
              }
            });
          }
        });
      }
      
      // Duplicate removal
      const uniqueProperties = properties.filter((prop, index, self) => 
        index === self.findIndex(p => p.key === prop.key && p.value === prop.value)
      );
      
      const extractionTime = Date.now() - startTime;
      
      console.log(`📊 Trendyol özellik çıkarma tamamlandı: ${uniqueProperties.length} benzersiz özellik (${extractionTime}ms)`);
      
      return {
        success: true,
        properties: uniqueProperties,
        extractionTime,
        method: foundProperties ? 'trendyol-properties-found' : 'trendyol-properties-not-found',
        totalFound: uniqueProperties.length
      };
      
    } catch (error) {
      const extractionTime = Date.now() - startTime;
      console.error(`❌ Trendyol özellik çıkarma hatası:`, error);
      
      return {
        success: false,
        properties: [],
        extractionTime,
        method: 'trendyol-properties-error',
        totalFound: 0
      };
    }
  }
}

export const trendyolPropertiesExtractor = new TrendyolPropertiesExtractor();