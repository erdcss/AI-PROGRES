/**
 * Ana Ürün Görselleri Çıkarıcı - Sadece temel ürün görsellerini alır, varyant görsellerini görmezden gelir
 */
import * as cheerio from 'cheerio';

export async function extractMainProductImages(url: string): Promise<string[]> {
  try {
    console.log(`🎯 Ana ürün görselleri çıkarılıyor: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 HTML boyutu: ${html.length} bytes`);

    const $ = cheerio.load(html);
    const mainImages: string[] = [];
    
    // Ana ürün galeri görsellerini bul - küçük thumbnail görselleri
    const galleryImages = $('img[data-testid="image-gallery-item"]');
    console.log(`🖼️ Ana galeri görselleri bulundu: ${galleryImages.length}`);
    
    galleryImages.each((index, element) => {
      const src = $(element).attr('src');
      if (src && src.includes('cdn.dsmcdn.com')) {
        // Küçük resmi büyük resme dönüştür
        const largeImageUrl = src.replace(/\/\d+_\d+\./, '/1_org_zoom.');
        mainImages.push(largeImageUrl);
        console.log(`📸 Ana görsel ${index + 1}: ${largeImageUrl}`);
      }
    });

    // Eğer galeri görsellerinde bulamazsak, ana görsel alanına bak
    if (mainImages.length === 0) {
      console.log('🔍 Ana galeri bulunamadı, alternatif yöntemlerle arıyor...');
      
      // Ana ürün görseli için farklı selector'lar dene
      const selectors = [
        'img[data-testid="product-image"]',
        '.product-detail-image img',
        '.product-gallery img',
        '.image-gallery img'
      ];

      for (const selector of selectors) {
        const images = $(selector);
        if (images.length > 0) {
          console.log(`✅ ${selector} ile ${images.length} görsel bulundu`);
          images.each((index, element) => {
            const src = $(element).attr('src');
            if (src && src.includes('cdn.dsmcdn.com') && !mainImages.includes(src)) {
              const largeImageUrl = src.replace(/\/\d+_\d+\./, '/1_org_zoom.');
              mainImages.push(largeImageUrl);
            }
          });
          break;
        }
      }
    }

    // Benzersiz görselleri filtrele
    const uniqueImages = Array.from(new Set(mainImages));
    
    console.log(`✅ Toplam ${uniqueImages.length} benzersiz ana ürün görseli bulundu`);
    uniqueImages.forEach((img, i) => {
      console.log(`   ${i + 1}. ${img}`);
    });

    return uniqueImages;

  } catch (error) {
    console.error('❌ Ana ürün görseli çıkarım hatası:', error);
    return [];
  }
}

export async function testMainImageExtraction(testUrl: string) {
  console.log(`🧪 Ana görsel çıkarım testi başlatılıyor: ${testUrl}`);
  const images = await extractMainProductImages(testUrl);
  console.log(`📊 Test sonucu: ${images.length} ana ürün görseli`);
  return images;
}