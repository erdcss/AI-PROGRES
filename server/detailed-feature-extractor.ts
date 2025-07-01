import axios from 'axios';
import * as cheerio from 'cheerio';

interface ProductFeature {
  key: string;
  value: string;
  category: string;
}

interface DetailedFeatureResult {
  success: boolean;
  features: ProductFeature[];
  extractionTime: number;
  source: string;
  totalFound: number;
}

export class DetailedFeatureExtractor {
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

  private categorizeFeature(key: string): string {
    const categories = {
      'Boyut': ['kapasite', 'beden', 'ölçü', 'boyut', 'hacim', 'litre', 'model'],
      'Malzeme': ['materyal', 'malzeme', 'kumaş', 'çelik', 'plastik', 'metal'],
      'Görünüm': ['renk', 'desen', 'stil', 'görünüm', 'temas', 'yüzey'],
      'Özellik': ['özellik', 'fonksiyon', 'kullanım', 'bakım', 'talimat'],
      'Üretim': ['menşei', 'marka', 'üretici', 'model', 'seri'],
      'Diğer': ['diğer', 'genel', 'çeşitli']
    };

    const keyLower = key.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => keyLower.includes(keyword))) {
        return category;
      }
    }
    
    return 'Genel';
  }

  async extractDetailedFeatures(url: string): Promise<DetailedFeatureResult> {
    const startTime = Date.now();
    console.log(`🔍 Detaylı özellik çıkarma başlatılıyor: ${url}`);
    
    try {
      const html = await this.fetchHTML(url);
      const $ = cheerio.load(html);
      
      console.log(`📄 HTML içerik alındı: ${html.length} karakter`);
      
      const features: ProductFeature[] = [];
      
      // Method 1: Ürün Özellikleri Tablosu (Görüntüdeki alan)
      console.log(`🎯 Method 1: Ürün Özellikleri tablosu aranıyor...`);
      
      // Trendyol'un ürün özellikleri tablosu için çeşitli selector'lar
      const propertySelectors = [
        '.product-detail-attributes .detail-attr-item',
        '.detail-attr-item',
        '.product-attributes .attribute-item',
        '.product-spec-table tr',
        '.specifications-table tr',
        '[data-testid="product-attribute"]',
        '.product-feature-list .feature-item',
        '.attribute-list .attribute',
        '.spec-list .spec-item'
      ];
      
      for (const selector of propertySelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          console.log(`   ✅ ${selector}: ${elements.length} element bulundu`);
          
          elements.each((_, element) => {
            const $el = $(element);
            
            // Farklı yapılar için key-value çıkarımı
            let key = '';
            let value = '';
            
            // Yapı 1: İki span/div içinde key-value
            const keyEl = $el.find('.detail-attr-container .detail-attr-text:first-child, .attr-key, .spec-key, .attribute-key').first();
            const valueEl = $el.find('.detail-attr-container .detail-attr-text:last-child, .attr-value, .spec-value, .attribute-value').first();
            
            if (keyEl.length && valueEl.length) {
              key = keyEl.text().trim().replace(':', '');
              value = valueEl.text().trim();
            } else {
              // Yapı 2: Tek element içinde key: value
              const fullText = $el.text().trim();
              const colonIndex = fullText.indexOf(':');
              if (colonIndex > 0) {
                key = fullText.substring(0, colonIndex).trim();
                value = fullText.substring(colonIndex + 1).trim();
              } else {
                // Yapı 3: İki ayrı child element
                const children = $el.children();
                if (children.length >= 2) {
                  key = $(children[0]).text().trim().replace(':', '');
                  value = $(children[1]).text().trim();
                }
              }
            }
            
            if (key && value && key.length > 1 && value.length > 0) {
              const category = this.categorizeFeature(key);
              features.push({ key, value, category });
              console.log(`      ➕ ${key}: ${value} (${category})`);
            }
          });
          
          if (features.length > 0) break; // İlk başarılı selector'ı kullan
        }
      }
      
      // Method 2: JSON-LD structured data
      console.log(`🎯 Method 2: JSON-LD structured data aranıyor...`);
      $('script[type="application/ld+json"]').each((_, script) => {
        try {
          const jsonData = JSON.parse($(script).html() || '');
          if (jsonData.additionalProperty && Array.isArray(jsonData.additionalProperty)) {
            jsonData.additionalProperty.forEach((prop: any) => {
              if (prop.name && prop.value) {
                const category = this.categorizeFeature(prop.name);
                features.push({
                  key: prop.name,
                  value: String(prop.value),
                  category
                });
                console.log(`      ➕ ${prop.name}: ${prop.value} (${category})`);
              }
            });
          }
        } catch (e) {
          // JSON parse error, devam et
        }
      });
      
      // Method 3: Script içindeki product data
      console.log(`🎯 Method 3: Script variables aranıyor...`);
      $('script').each((_, script) => {
        const scriptContent = $(script).html() || '';
        
        // Trendyol'un product data pattern'ları
        const patterns = [
          /attributes['"]\s*:\s*\[(.*?)\]/g,
          /properties['"]\s*:\s*\[(.*?)\]/g,
          /specifications['"]\s*:\s*\{(.*?)\}/g
        ];
        
        patterns.forEach(pattern => {
          const matches = scriptContent.match(pattern);
          if (matches) {
            matches.forEach(match => {
              try {
                const cleaned = match.replace(/^[^:]*:/, '').trim();
                const parsed = JSON.parse(cleaned);
                
                if (Array.isArray(parsed)) {
                  parsed.forEach((item: any) => {
                    if (item.name && item.value) {
                      const category = this.categorizeFeature(item.name);
                      features.push({
                        key: item.name,
                        value: String(item.value),
                        category
                      });
                      console.log(`      ➕ ${item.name}: ${item.value} (${category})`);
                    }
                  });
                }
              } catch (e) {
                // Parse error, devam et
              }
            });
          }
        });
      });
      
      // Duplicate removal
      const uniqueFeatures = features.filter((feature, index, self) => 
        index === self.findIndex(f => f.key === feature.key && f.value === feature.value)
      );
      
      const extractionTime = Date.now() - startTime;
      
      console.log(`📊 Detaylı çıkarma tamamlandı: ${uniqueFeatures.length} benzersiz özellik (${extractionTime}ms)`);
      
      return {
        success: true,
        features: uniqueFeatures,
        extractionTime,
        source: 'detailed-extractor',
        totalFound: uniqueFeatures.length
      };
      
    } catch (error) {
      const extractionTime = Date.now() - startTime;
      console.error(`❌ Detaylı özellik çıkarma hatası:`, error);
      
      return {
        success: false,
        features: [],
        extractionTime,
        source: 'detailed-extractor-error',
        totalFound: 0
      };
    }
  }
}

export const detailedFeatureExtractor = new DetailedFeatureExtractor();