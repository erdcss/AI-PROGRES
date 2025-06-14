/**
 * Nihai Görsel Çıkarıcı
 * Tüm mevcut yöntemleri birleştirerek maksimum görsel sayısını elde eder
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * URL'den ürün ID'sini çıkarır
 */
function extractProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : null;
}

/**
 * Temel görsel URL'den tüm varyasyonları oluşturur
 */
function generateAllImageVariations(baseUrl: string): string[] {
  const variations = [baseUrl];
  
  // Boyut kombinasyonları
  const sizePatterns = [
    '1200/1800', '800/1200', '600/900', '400/600',
    '1080/1620', '720/1080', '500/750', '300/450',
    '240/360', '200/300', '150/225', '100/150'
  ];
  
  // Resize/crop parametreleri
  const processTypes = [
    'org_zoom', 'mnresize/1200', 'mnresize/800', 'mnresize/600',
    'crop/1200', 'crop/800', 'crop/600', 'ty/1200', 'ty/800'
  ];
  
  // Kalite seviyeleri
  const qualities = ['95', '90', '85', '80', '75'];
  
  sizePatterns.forEach(size => {
    let sizeVariant = baseUrl.replace(/\/\d+\/\d+\//, `/${size}/`);
    if (!variations.includes(sizeVariant)) {
      variations.push(sizeVariant);
    }
    
    // Her boyut için farklı işlem türleri
    processTypes.forEach(processType => {
      let processedVariant = sizeVariant;
      
      if (processedVariant.includes('mnresize/')) {
        processedVariant = processedVariant.replace(/mnresize\/\d+/, processType);
      } else if (processedVariant.includes('crop/')) {
        processedVariant = processedVariant.replace(/crop\/\d+/, processType);
      } else if (processedVariant.includes('org_zoom')) {
        processedVariant = processedVariant.replace('org_zoom', processType);
      } else {
        // Yeni işlem parametresi ekle
        const parts = processedVariant.split('/');
        if (parts.length >= 6) {
          parts.splice(5, 0, processType);
          processedVariant = parts.join('/');
        }
      }
      
      if (!variations.includes(processedVariant)) {
        variations.push(processedVariant);
      }
      
      // Her varyant için kalite seviyeleri
      qualities.forEach(quality => {
        let qualityVariant = processedVariant;
        if (qualityVariant.includes('quality/')) {
          qualityVariant = qualityVariant.replace(/quality\/\d+/, `quality/${quality}`);
        } else {
          qualityVariant += qualityVariant.includes('?') ? `&quality=${quality}` : `?quality=${quality}`;
        }
        
        if (!variations.includes(qualityVariant)) {
          variations.push(qualityVariant);
        }
      });
    });
  });
  
  return variations;
}

/**
 * Trendyol'un CDN pattern'lerini kullanarak olası görsel URL'leri tahmin eder
 */
function predictImageUrls(productId: string): string[] {
  const predictedUrls: string[] = [];
  const baseUrls = [
    `https://cdn.dsmcdn.com/ty`,
    `https://cdn.dsmcdn.com/mnresize/1200`,
    `https://cdn.dsmcdn.com/org_zoom/ty`
  ];
  
  // Farklı görsel indeksleri (0-20 arası)
  for (let i = 0; i <= 20; i++) {
    baseUrls.forEach(baseUrl => {
      // Farklı dosya formatları
      ['jpg', 'jpeg', 'webp', 'png'].forEach(ext => {
        // Farklı naming pattern'leri
        const patterns = [
          `${baseUrl}${i}/${productId}_${i}.${ext}`,
          `${baseUrl}/${productId}_${i}.${ext}`,
          `${baseUrl}${i}/${productId}.${ext}`,
          `${baseUrl}/${productId}-${i}.${ext}`,
          `${baseUrl}/1200/1800/ty${i}/${productId}_${i}.${ext}`,
          `${baseUrl}/800/1200/ty${i}/${productId}_${i}.${ext}`
        ];
        
        predictedUrls.push(...patterns);
      });
    });
  }
  
  return predictedUrls;
}

/**
 * Sayfa HTML'inden tüm olası görsel URL'lerini agresif şekilde çıkarır
 */
async function aggressiveHtmlScrape(url: string): Promise<string[]> {
  const images: string[] = [];
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 20000
    });

    const html = response.data;
    const $ = cheerio.load(html);

    // 1. Tüm img tag'leri
    $('img').each((_, element) => {
      const src = $(element).attr('src') || $(element).attr('data-src') || 
                  $(element).attr('data-lazy-src') || $(element).attr('data-original');
      if (src && isValidTrendyolImage(src)) {
        images.push(src);
      }
    });

    // 2. Style attribute'larında background-image
    $('[style*="background-image"]').each((_, element) => {
      const style = $(element).attr('style');
      if (style) {
        const matches = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/gi);
        if (matches) {
          matches.forEach(match => {
            const urlMatch = match.match(/url\(['"]?([^'")]+)['"]?\)/);
            if (urlMatch && urlMatch[1] && isValidTrendyolImage(urlMatch[1])) {
              images.push(urlMatch[1]);
            }
          });
        }
      }
    });

    // 3. Script tag'lerindeki tüm URL'ler
    $('script').each((_, element) => {
      const scriptContent = $(element).html();
      if (scriptContent) {
        // Trendyol CDN URL'lerini yakala
        const urlMatches = scriptContent.match(/https:\/\/(cdn\.dsmcdn\.com|cdn\.trendyol\.com)[^"'\s]+\.(jpg|jpeg|png|webp)/gi);
        if (urlMatches) {
          urlMatches.forEach(match => {
            if (isValidTrendyolImage(match)) {
              images.push(match);
            }
          });
        }
        
        // JSON string'leri içindeki görselleri yakala
        const jsonMatches = scriptContent.match(/"[^"]*(?:cdn\.dsmcdn\.com|cdn\.trendyol\.com)[^"]*\.(jpg|jpeg|png|webp)[^"]*"/gi);
        if (jsonMatches) {
          jsonMatches.forEach(match => {
            const cleanUrl = match.replace(/^"|"$/g, '').replace(/\\"/g, '"');
            if (isValidTrendyolImage(cleanUrl)) {
              images.push(cleanUrl);
            }
          });
        }
      }
    });

    // 4. Data attribute'ları
    $('[data-src], [data-original], [data-lazy], [data-img]').each((_, element) => {
      const attrs = ['data-src', 'data-original', 'data-lazy', 'data-img'];
      attrs.forEach(attr => {
        const value = $(element).attr(attr);
        if (value && isValidTrendyolImage(value)) {
          images.push(value);
        }
      });
    });

    // 5. CSS class'larından görsel URL'leri çıkar (Trendyol'un lazy loading sistemi)
    $('[class*="image"], [class*="photo"], [class*="picture"]').each((_, element) => {
      const className = $(element).attr('class');
      if (className) {
        // Class name'lerde encoded URL'ler olabilir
        const urlMatches = className.match(/https?%3A%2F%2F[^%\s]+%2F[^%\s]+\.(jpg|jpeg|png|webp)/gi);
        if (urlMatches) {
          urlMatches.forEach(match => {
            const decodedUrl = decodeURIComponent(match);
            if (isValidTrendyolImage(decodedUrl)) {
              images.push(decodedUrl);
            }
          });
        }
      }
    });

  } catch (error) {
    console.error('Agresif HTML scraping hatası:', error);
  }

  return images;
}

/**
 * URL'nin geçerli bir Trendyol görseli olup olmadığını kontrol eder
 */
function isValidTrendyolImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  return (url.includes('cdn.dsmcdn.com') || url.includes('cdn.trendyol.com')) &&
         /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url) &&
         !url.includes('favicon') &&
         !url.includes('logo') &&
         !url.includes('icon');
}

/**
 * Görsel URL'lerini kalite skoruna göre sıralar
 */
function rankImagesByQuality(images: string[]): string[] {
  return images.sort((a, b) => {
    let scoreA = 0, scoreB = 0;
    
    // Boyut skorları
    if (a.includes('1200') || a.includes('1800')) scoreA += 20;
    if (b.includes('1200') || b.includes('1800')) scoreB += 20;
    
    // Özel parametreler
    if (a.includes('org_zoom')) scoreA += 25;
    if (b.includes('org_zoom')) scoreB += 25;
    
    if (a.includes('mnresize/1200')) scoreA += 15;
    if (b.includes('mnresize/1200')) scoreB += 15;
    
    // Kalite parametresi
    if (a.includes('quality/95')) scoreA += 10;
    if (b.includes('quality/95')) scoreB += 10;
    
    return scoreB - scoreA;
  });
}

/**
 * Nihai görsel çıkarma fonksiyonu - tüm yöntemleri birleştirir
 */
export async function extractMaximumImages(url: string): Promise<string[]> {
  console.log('Maksimum görsel çıkarma başlıyor...');
  
  const productId = extractProductId(url);
  if (!productId) {
    console.log('Ürün ID bulunamadı');
    return [];
  }
  
  const allImages: string[] = [];
  
  try {
    // 1. Mevcut image-extractor'ı kullan
    const { getAllProductImages } = await import('./image-extractor');
    const baseImages = await getAllProductImages(url);
    allImages.push(...baseImages);
    console.log(`Temel çıkarıcıdan ${baseImages.length} görsel`);
    
    // 2. Agresif HTML scraping
    const htmlImages = await aggressiveHtmlScrape(url);
    allImages.push(...htmlImages);
    console.log(`Agresif HTML'den ${htmlImages.length} görsel`);
    
    // 3. Tahmin edilen URL'ler
    const predictedImages = predictImageUrls(productId);
    allImages.push(...predictedImages);
    console.log(`Tahmin edilen ${predictedImages.length} URL`);
    
    // 4. Her temel görsel için tüm varyasyonları oluştur
    const uniqueBaseImages = Array.from(new Set([...baseImages, ...htmlImages.slice(0, 10)]));
    uniqueBaseImages.forEach(baseImage => {
      const variations = generateAllImageVariations(baseImage);
      allImages.push(...variations);
    });
    console.log(`Varyasyon üretimi tamamlandı`);
    
    // 5. Tekrarları kaldır ve sırala
    const uniqueImages = Array.from(new Set(allImages));
    const rankedImages = rankImagesByQuality(uniqueImages);
    
    console.log(`Maksimum görsel çıkarma tamamlandı: ${rankedImages.length} görsel`);
    return rankedImages.slice(0, 50); // En fazla 50 görsel döndür
    
  } catch (error) {
    console.error('Maksimum görsel çıkarma hatası:', error);
    return allImages;
  }
}