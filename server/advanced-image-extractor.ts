import * as cheerio from 'cheerio';

export function extractAdvancedImages(htmlContent: string): string[] {
  const $ = cheerio.load(htmlContent);
  const images: string[] = [];
  
  console.log('🖼️ Gelişmiş görsel çıkarma sistemi başlatılıyor...');

  // 1. Script içindeki JSON'dan görsel çıkarma
  try {
    $('script').each((_, script) => {
      const scriptContent = $(script).html() || '';
      
      // Çeşitli görsel pattern'ları
      const imagePatterns = [
        /"images":\s*\[(.*?)\]/g,
        /"galleryImages":\s*\[(.*?)\]/g,
        /"productImages":\s*\[(.*?)\]/g,
        /"imageUrls":\s*\[(.*?)\]/g,
        /"photos":\s*\[(.*?)\]/g,
        /https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\.(?:jpg|jpeg|png|webp)/gi
      ];
      
      imagePatterns.forEach(pattern => {
        const matches = scriptContent.match(pattern);
        if (matches) {
          matches.forEach(match => {
            if (pattern.source.includes('https://')) {
              // Direct URL match
              const optimizedUrl = optimizeImageUrl(match);
              if (optimizedUrl && !images.includes(optimizedUrl)) {
                images.push(optimizedUrl);
              }
            } else {
              // JSON array match
              const urlMatches = match.match(/https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\.(?:jpg|jpeg|png|webp)/gi) || [];
              urlMatches.forEach(url => {
                const optimizedUrl = optimizeImageUrl(url);
                if (optimizedUrl && !images.includes(optimizedUrl)) {
                  images.push(optimizedUrl);
                }
              });
            }
          });
        }
      });
    });
  } catch (error) {
    console.log("Script görsel çıkarma hatası:", error);
  }

  // 2. HTML img tag'lerinden görsel çıkarma
  try {
    $('img').each((_, img) => {
      const sources = [
        $(img).attr('src'),
        $(img).attr('data-src'),
        $(img).attr('data-original'),
        $(img).attr('data-lazy'),
        $(img).attr('data-srcset')?.split(',')[0]?.trim()
      ];
      
      sources.forEach(src => {
        if (src && src.includes('cdn.dsmcdn.com')) {
          const optimizedUrl = optimizeImageUrl(src);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        }
      });
    });
  } catch (error) {
    console.log("IMG tag çıkarma hatası:", error);
  }

  // 3. CSS background-image'lardan görsel çıkarma
  try {
    $('div, span, section, article').each((_, elem) => {
      const style = $(elem).attr('style') || '';
      const backgroundMatch = style.match(/background-image:\s*url\(['"]?(.*?)['"]?\)/);
      if (backgroundMatch && backgroundMatch[1]) {
        const bgUrl = backgroundMatch[1];
        if (bgUrl.includes('cdn.dsmcdn.com')) {
          const optimizedUrl = optimizeImageUrl(bgUrl);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        }
      }
    });
  } catch (error) {
    console.log("CSS background çıkarma hatası:", error);
  }

  // 4. Data attribute'lardan görsel çıkarma
  try {
    $('[data-image], [data-img], [data-photo], [data-picture]').each((_, elem) => {
      const dataAttrs = ['data-image', 'data-img', 'data-photo', 'data-picture'];
      dataAttrs.forEach(attr => {
        const dataUrl = $(elem).attr(attr);
        if (dataUrl && dataUrl.includes('cdn.dsmcdn.com')) {
          const optimizedUrl = optimizeImageUrl(dataUrl);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        }
      });
    });
  } catch (error) {
    console.log("Data attribute çıkarma hatası:", error);
  }

  // 5. Picture ve source elementlerinden çıkarma
  try {
    $('picture source, source').each((_, source) => {
      const srcset = $(source).attr('srcset') || $(source).attr('src');
      if (srcset && srcset.includes('cdn.dsmcdn.com')) {
        const urls = srcset.split(',');
        urls.forEach(urlWithSize => {
          const url = urlWithSize.trim().split(' ')[0];
          const optimizedUrl = optimizeImageUrl(url);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        });
      }
    });
  } catch (error) {
    console.log("Picture/source çıkarma hatası:", error);
  }

  // Sadece authentic ürün görsellerini filtrele ve sırala
  const authenticImages = images
    .filter(url => {
      // Sadece ürün görselleri kabul et
      return url.includes('/prod/QC/') || url.includes('/prod/PIM/') || url.includes('/product/');
    })
    .sort((a, b) => {
      // QC görsellerini öncelikle sırala
      const aScore = a.includes('/prod/QC/') ? 1 : 0;
      const bScore = b.includes('/prod/QC/') ? 1 : 0;
      return bScore - aScore;
    })
    .slice(0, 15); // Maximum 15 görsel

  console.log(`🖼️ Toplam ${authenticImages.length} authentic görsel çıkarıldı`);
  
  return authenticImages;
}

function optimizeImageUrl(imageUrl: any): string | null {
  try {
    let url = typeof imageUrl === 'string' ? imageUrl : (imageUrl?.url || imageUrl);
    
    if (!url || typeof url !== 'string') return null;
    
    // Sadece Trendyol CDN URL'lerini kabul et
    if (!url.includes('cdn.dsmcdn.com')) return null;
    
    // Ürün görseli kontrolü
    if (!(url.includes('/prod/QC/') || url.includes('/prod/PIM/') || url.includes('/product/'))) {
      return null;
    }
    
    // URL temizleme
    url = url.replace(/[{}]/g, ''); // Süslü parantezleri kaldır
    
    // En yüksek kalite için _org_zoom.jpg kullan
    if (!url.includes('_org_zoom.jpg')) {
      url = url.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
    }
    
    // HTTPS protokolü ekle
    if (!url.startsWith('https:')) {
      url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
    }
    
    return url;
  } catch (error) {
    return null;
  }
}