/**
 * Geliştirilmiş Ürün Özellikleri Çıkarıcı
 * Trendyol ürünlerinden tüm özellikleri daha kapsamlı bir şekilde çıkarır
 */

import * as cheerio from 'cheerio';

/**
 * HTML içeriğinden tüm ürün özelliklerini çıkarır
 * @param $ Cheerio HTML içeriği
 * @returns Ürün özelliklerini içeren nesne
 */
export function extractAttributes($: cheerio.CheerioAPI): Record<string, string> {
  // Ürün özelliklerini tutacak nesne
  const attributes: Record<string, string> = {};

  try {
    // 1. Trendyol standart özellik listesi (en yaygın format)
    console.log("Trendyol özelliklerini ayrıştırma başlıyor...");
    
    // Yöntem 1: Detail attr container (en yaygın)
    $("div.detail-attr-container li.detail-attr-item").each((_, el) => {
      const key = $(el).find(".attr-key").text().trim();
      const value = $(el).find(".attr-value").text().trim();
      
      if (key && value && !attributes[key]) {
        attributes[key] = value;
      }
    });
    
    // Yöntem 2: Farklı class yapısı
    $("div.product-feature-item").each((_, el) => {
      const key = $(el).find(".feature-name").text().trim();
      const value = $(el).find(".feature-value").text().trim();
      
      if (key && value && !attributes[key]) {
        attributes[key] = value;
      }
    });
    
    // Yöntem 3: Table formatında özellikler
    $("table.product-features tr").each((_, el) => {
      const key = $(el).find("th").text().trim();
      const value = $(el).find("td").text().trim();
      
      if (key && value && !attributes[key]) {
        attributes[key] = value;
      }
    });
    
    // 2. HTML içindeki meta etiketleri ve yapılandırılmış veri
    // Ürün için ekstra meta bilgileri
    $('meta[property^="product:"]').each((_, el) => {
      const property = $(el).attr('property');
      const content = $(el).attr('content');
      
      if (property && content) {
        const propName = property.replace('product:', '');
        if (propName && !attributes[propName]) {
          attributes[propName] = content;
        }
      }
    });
    
    // 3. JSON-LD'den özellik çekme (en zengin kaynak)
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const jsonContent = $(script).html();
        if (!jsonContent) return;
        
        const data = JSON.parse(jsonContent);
        
        // Tip 1: additionalProperty (ürün özellikleri dizisi)
        if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
          data.additionalProperty.forEach((prop: any) => {
            if (prop.name && prop.value && !attributes[prop.name]) {
              attributes[prop.name] = prop.value.toString();
            }
          });
        }
        
        // Tip 2: Doğrudan özellikler
        const directProps = [
          "brand", "category", "color", "material", "size", "weight", 
          "manufacturer", "model", "sku", "mpn", "gtin", "gtin13", "productID"
        ];
        
        directProps.forEach(prop => {
          if (data[prop] && !attributes[prop]) {
            if (typeof data[prop] === 'object' && data[prop].name) {
              attributes[prop] = data[prop].name;
            } else if (typeof data[prop] !== 'object') {
              attributes[prop] = data[prop].toString();
            }
          }
        });
        
        // Değişik renk/beden bilgileri
        if (data.color && !attributes['Renk']) {
          attributes['Renk'] = data.color;
        }
        
        if (data.size && !attributes['Beden']) {
          attributes['Beden'] = data.size;
        }
      } catch (e) {
        // JSON parse hataları sessizce geçilir
      }
    });
    
    // 4. Ürün açıklamasından özellikleri çıkar
    // Bazen açıklama alanında key:value formatında bilgiler olabilir
    const descriptionText = $("div.detail-desc-content").text();
    if (descriptionText) {
      // Key: Value formatındaki bilgileri bul
      const matches = descriptionText.match(/([A-Za-zÇçĞğİıÖöŞşÜü]+)\s*:\s*([^\n,]+)/g);
      if (matches) {
        matches.forEach(match => {
          const parts = match.split(':');
          if (parts.length === 2) {
            const key = parts[0].trim();
            const value = parts[1].trim();
            if (key && value && !attributes[key]) {
              attributes[key] = value;
            }
          }
        });
      }
    }
    
    // 5. Ürün başlığından kategori bilgisi çıkarma
    const title = $("h1.pr-new-br").text().trim() || $("h1.detail-name").text().trim();
    if (title && !attributes['Ürün Tipi']) {
      // Kategori tahmini (cinsiyet, ürün tipi vb.)
      const categoryPatterns = [
        { regex: /\b(kadın|erkek|unisex|çocuk|bebek|kız|erkek çocuk)\b/i, key: 'Cinsiyet' },
        { regex: /\b(ayakkabı|sneaker|bot|çizme|sandalet|terlik|espadril)\b/i, key: 'Ürün Tipi' },
        { regex: /\b(ceket|mont|palto|gömlek|pantolon|şort|sweatshirt|tişört|elbise|bluz)\b/i, key: 'Ürün Tipi' },
        { regex: /\b(çanta|cüzdan|bavul|valiz|sırt çantası|omuz çantası|el çantası)\b/i, key: 'Ürün Tipi' }
      ];
      
      categoryPatterns.forEach(pattern => {
        const match = title.match(pattern.regex);
        if (match && match[1] && !attributes[pattern.key]) {
          attributes[pattern.key] = match[1];
        }
      });
    }
    
    // 6. Breadcrumb'dan kategori bilgisi alma
    let categories: string[] = [];
    $("ul.breadcrumb li:not(:first-child) a").each((_, el) => {
      categories.push($(el).text().trim());
    });
    
    if (categories.length > 0 && !attributes['Kategori']) {
      attributes['Kategori'] = categories.join(' > ');
    }
    
    console.log(`Toplam ${Object.keys(attributes).length} ürün özelliği başarıyla çıkarıldı`);
    return attributes;
  } catch (error) {
    console.error('Ürün özellikleri çıkarma hatası:', error);
    return attributes;
  }
}