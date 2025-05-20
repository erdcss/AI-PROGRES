/**
 * Trendyol Görsel Çıkarıcı
 * Tüm görselleri filtreleme olmadan alır
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Verilen ürün URL'sinden tüm görselleri çeker
 * @param url Ürün URL'si
 * @returns Bulunan tüm görsellerin listesi
 */
export async function getAllProductImages(url: string): Promise<string[]> {
  try {
    // HTML içeriğini al
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTML içeriği alınamadı: ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Tüm görselleri tutacak dizi
    const allImages: string[] = [];
    
    // 1. JSON-LD'den görselleri çıkar
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const scriptContent = $(el).text();
        if (!scriptContent) return;
        
        const data = JSON.parse(scriptContent);
        
        // ProductGroup yapısı (Trendyol'da yaygın)
        if (data["@type"] === "ProductGroup" && data.image && data.image.contentUrl) {
          if (Array.isArray(data.image.contentUrl)) {
            data.image.contentUrl.forEach((imgUrl: string) => {
              if (imgUrl && !allImages.includes(imgUrl)) {
                allImages.push(imgUrl);
              }
            });
          } else if (typeof data.image.contentUrl === 'string') {
            allImages.push(data.image.contentUrl);
          }
        }
        
        // Varyantlardaki görseller
        if (data.hasVariant && Array.isArray(data.hasVariant)) {
          data.hasVariant.forEach((variant: any) => {
            if (variant.image) {
              if (typeof variant.image === 'string' && !allImages.includes(variant.image)) {
                allImages.push(variant.image);
              } else if (variant.image.contentUrl) {
                if (typeof variant.image.contentUrl === 'string' && !allImages.includes(variant.image.contentUrl)) {
                  allImages.push(variant.image.contentUrl);
                }
              }
            }
          });
        }
      } catch (error) {
        console.error('JSON-LD ayrıştırma hatası:', error);
      }
    });
    
    // 2. HTML'deki tüm görselleri çıkar
    // Ürün görsellerini seçicilerle bul
    $('img[data-src], img[src]').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && isValidProductImage(src) && !allImages.includes(src)) {
        allImages.push(src);
      }
    });
    
    // Görsel boyutlarını düzelt (küçük görseller yerine büyük olanları al)
    const optimizedImages = allImages.map(url => {
      return url.replace('/128/192/', '/1200/1800/')
                .replace('/thumbnail/', '/original/')
                .replace('/mnresize/400/', '/mnresize/1200/');
    });
    
    // Tekrarlayan görselleri kaldır
    const uniqueImages = Array.from(new Set(optimizedImages));
    
    // Sadece badge, icon gibi görselleri filtrele, geri kalanını al
    const filteredImages = uniqueImages.filter(url => {
      // Badge, logo vb. gibi ürün görseli olmayanları filtrele
      return !url.toLowerCase().includes('badge') &&
            !url.toLowerCase().includes('icon-') && 
            !url.toLowerCase().includes('sticker') &&
            !url.toLowerCase().includes('logo');
    });
    
    console.log(`Toplam ${uniqueImages.length} görsel bulundu, filtreleme sonrası ${filteredImages.length} görsel kaldı`);
    return filteredImages;
  } catch (error) {
    console.error('Görsel çekme hatası:', error);
    return [];
  }
}

/**
 * Bir URL'nin ürün görseli olup olmadığını kontrol eder
 * @param url İncelenecek URL
 * @returns Ürün görseli ise true, değilse false
 */
function isValidProductImage(url: string): boolean {
  if (!url) return false;
  
  // Temel filtreler
  if (!/\.(jpe?g|png|webp)($|\?)/.test(url.toLowerCase())) {
    return false;
  }
  
  // CDN kontrolü - sadece Trendyol/DSM CDN'lerini kabul et
  const isTrendyolCDN = url.includes('cdn.trendyol.com') || 
                        url.includes('cdn.dsmcdn.com') || 
                        url.includes('images.trendyol.com');
  
  // Ürün görseli olma ihtimali olan kriterleri kontrol et
  const isLikelyProductImage = url.includes('product/media') || 
                              url.includes('/products/') || 
                              url.includes('/images/') || 
                              url.includes('/ty');
  
  return isTrendyolCDN && isLikelyProductImage;
}