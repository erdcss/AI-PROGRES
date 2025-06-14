/**
 * JSON-LD Görsel Çıkarıcı
 * 
 * Bu araç JSON-LD içindeki tüm görselleri filtreleme olmadan çıkarmak için tasarlanmıştır.
 * Filtreleme olmadan tüm görselleri almak istiyorsanız bu kodu kullanın.
 */
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Verilen URL'den JSON-LD verilerini çıkarır ve içindeki tüm görselleri döndürür
 * @param url Veri çıkarmak için ürün URL'si
 * @returns Bulunan tüm görsel URL'lerinin dizisi
 */
export async function extractAllImagesFromJsonLD(url: string): Promise<string[]> {
  try {
    console.log(`JSON-LD görsel çıkarıcı başlatılıyor: ${url}`);
    
    // URL'den HTML içeriğini al
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTML alımı başarısız: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    
    // HTML'i parse et
    const $ = cheerio.load(html);
    
    // Tüm görsel URL'lerini saklamak için dizi
    const allImages: string[] = [];
    
    // Tüm JSON-LD script etiketlerini bul
    const jsonLdScripts = $('script[type="application/ld+json"]');
    console.log(`Sayfada ${jsonLdScripts.length} adet JSON-LD script bulundu`);
    
    jsonLdScripts.each((_, el) => {
      try {
        const scriptContent = $(el).text();
        if (!scriptContent || scriptContent.trim() === '') return;
        
        const schemaData = JSON.parse(scriptContent);
        
        // 1. ProductGroup yapısı (Trendyol'un yaygın yapısı)
        if (schemaData["@type"] === "ProductGroup") {
          // 1.1. Tekil görsel içeren yapı
          if (schemaData.image && typeof schemaData.image === 'string') {
            allImages.push(schemaData.image);
          }
          
          // 1.2. ImageObject içinde contentUrl dizisi
          if (schemaData.image && schemaData.image.contentUrl) {
            if (Array.isArray(schemaData.image.contentUrl)) {
              console.log(`JSON-LD: ProductGroup yapısında ${schemaData.image.contentUrl.length} adet görsel bulundu`);
              schemaData.image.contentUrl.forEach((url: string) => {
                if (url && !allImages.includes(url)) {
                  allImages.push(url);
                }
              });
            } else if (typeof schemaData.image.contentUrl === 'string') {
              allImages.push(schemaData.image.contentUrl);
            }
          }
          
          // 1.3. Varyant görselleri
          if (schemaData.hasVariant && Array.isArray(schemaData.hasVariant)) {
            schemaData.hasVariant.forEach((variant: any) => {
              if (variant.image) {
                if (typeof variant.image === 'string') {
                  allImages.push(variant.image);
                } else if (variant.image.contentUrl) {
                  if (typeof variant.image.contentUrl === 'string') {
                    allImages.push(variant.image.contentUrl);
                  } else if (Array.isArray(variant.image.contentUrl)) {
                    variant.image.contentUrl.forEach((url: string) => {
                      if (url && !allImages.includes(url)) {
                        allImages.push(url);
                      }
                    });
                  }
                }
              }
            });
          }
        }
        
        // 2. Product yapısı
        if (schemaData["@type"] === "Product") {
          // 2.1. Tekil görsel
          if (schemaData.image && typeof schemaData.image === 'string') {
            allImages.push(schemaData.image);
          }
          
          // 2.2. Görsel dizisi
          if (schemaData.image && Array.isArray(schemaData.image)) {
            schemaData.image.forEach((img: any) => {
              if (typeof img === 'string') {
                allImages.push(img);
              } else if (img && img.contentUrl) {
                if (typeof img.contentUrl === 'string') {
                  allImages.push(img.contentUrl);
                } else if (Array.isArray(img.contentUrl)) {
                  img.contentUrl.forEach((url: string) => {
                    if (url && !allImages.includes(url)) {
                      allImages.push(url);
                    }
                  });
                }
              } else if (img && img.url) {
                if (typeof img.url === 'string') {
                  allImages.push(img.url);
                }
              }
            });
          }
          
          // 2.3. ImageObject yapısı
          if (schemaData.image && typeof schemaData.image === 'object' && !Array.isArray(schemaData.image)) {
            if (schemaData.image.contentUrl) {
              if (typeof schemaData.image.contentUrl === 'string') {
                allImages.push(schemaData.image.contentUrl);
              } else if (Array.isArray(schemaData.image.contentUrl)) {
                schemaData.image.contentUrl.forEach((url: string) => {
                  if (url && !allImages.includes(url)) {
                    allImages.push(url);
                  }
                });
              }
            } else if (schemaData.image.url) {
              if (typeof schemaData.image.url === 'string') {
                allImages.push(schemaData.image.url);
              }
            }
          }
        }
      } catch (parseError) {
        console.error("JSON-LD ayrıştırma hatası:", parseError);
      }
    });
    
    // Tekrarlayan görselleri kaldır
    const uniqueImages = Array.from(new Set(allImages));
    
    console.log(`🔧 Ham görseller: ${JSON.stringify(uniqueImages)}`);
    console.log(`🔧 Toplam ${uniqueImages.length} ham görsel bulundu`);
    
    // Logo ve gereksiz görselleri filtrele
    const filteredImages = uniqueImages.filter(url => {
      if (!url) return false;
      
      // Logo filtreleme
      const isLogo = url.includes('logo') || 
                    url.includes('ty-web.svg') || 
                    url.includes('brand') ||
                    url.includes('icon') ||
                    url.includes('badge') ||
                    url.includes('spacer');
      
      if (isLogo) {
        console.log(`🔧 Logo filtrelendi: ${url}`);
        return false;
      }
      
      return true;
    });
    
    // Duplicate'leri kaldır (aynı görsel farklı boyutlarda olabilir)
    const deduplicatedImages = [];
    const seenImages = new Set();
    
    for (const image of filteredImages) {
      // Görsel ID'sini çıkar (dosya adından)
      const imageId = image.split('/').pop()?.split('_')[0] || image;
      
      if (!seenImages.has(imageId)) {
        seenImages.add(imageId);
        deduplicatedImages.push(image);
      }
    }
    
    console.log(`🔧 Duplicate'ler kaldırıldı: ${filteredImages.length} -> ${deduplicatedImages.length}`);
    console.log(`🔧 Final temiz görseller (${deduplicatedImages.length}): ${JSON.stringify(deduplicatedImages)}`);
    
    return deduplicatedImages;
  } catch (error) {
    console.error('Görsel çıkarma hatası:', error);
    return [];
  }
}