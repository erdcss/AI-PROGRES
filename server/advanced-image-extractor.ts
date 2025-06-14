/**
 * Gelişmiş Görsel Çıkarıcı
 * Trendyol'un tüm görsel kaynaklarını derinlemesine analiz eder
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * URL'den ürün ID'sini ve boutiqueId'yi çıkarır
 */
function extractProductInfo(url: string): { productId: string | null; boutiqueId: string | null } {
  const productMatch = url.match(/p-(\d+)/);
  const boutiqueMatch = url.match(/\/([^\/]+)\/[^\/]*p-\d+/);
  
  return {
    productId: productMatch ? productMatch[1] : null,
    boutiqueId: boutiqueMatch ? boutiqueMatch[1] : null
  };
}

/**
 * Trendyol'un farklı CDN pattern'lerini kullanarak görsel URL'leri oluşturur
 */
function generateImageVariations(baseImageUrl: string): string[] {
  const variations: string[] = [];
  
  // Farklı boyutlar
  const sizes = [
    '1200/1800',
    '800/1200', 
    '600/900',
    '400/600',
    '1080/1620',
    '720/1080'
  ];
  
  // Farklı kalite seviyeleri
  const qualities = ['95', '90', '85', '80'];
  
  // Farklı format optimizasyonları
  const formats = ['org_zoom', 'mnresize/1200', 'mnresize/800', 'crop/1200'];
  
  sizes.forEach(size => {
    qualities.forEach(quality => {
      formats.forEach(format => {
        let variation = baseImageUrl;
        
        // Boyut değişimi
        variation = variation.replace(/\/\d+\/\d+\//, `/${size}/`);
        
        // Kalite değişimi
        if (variation.includes('quality/')) {
          variation = variation.replace(/quality\/\d+/, `quality/${quality}`);
        } else {
          variation = variation.includes('?') ? 
            `${variation}&quality=${quality}` : 
            `${variation}?quality=${quality}`;
        }
        
        // Format değişimi
        if (variation.includes('mnresize/')) {
          variation = variation.replace(/mnresize\/\d+/, format);
        } else if (!variation.includes('org_zoom')) {
          variation = variation.replace(/\/ty\d+/, `/${format}/ty`);
        }
        
        if (!variations.includes(variation)) {
          variations.push(variation);
        }
      });
    });
  });
  
  return variations;
}

/**
 * Görsel URL'lerini doğrular
 */
async function validateImageUrls(urls: string[]): Promise<string[]> {
  const validUrls: string[] = [];
  const maxConcurrent = 10;
  
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);
    
    const promises = batch.map(async (url) => {
      try {
        const response = await axios.head(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        if (response.status === 200 && 
            response.headers['content-type']?.startsWith('image/')) {
          return url;
        }
      } catch (error) {
        // URL geçersiz, null döndür
      }
      return null;
    });
    
    const results = await Promise.all(promises);
    validUrls.push(...results.filter(url => url !== null) as string[]);
  }
  
  return validUrls;
}

/**
 * Trendyol API'lerinden detaylı ürün bilgilerini çeker
 */
async function extractFromTrendyolAPIs(productId: string, boutiqueId: string | null): Promise<string[]> {
  const images: string[] = [];
  
  const apiEndpoints = [
    `https://public.trendyol.com/discovery-web-productgw-service/v1/product-detail/${productId}`,
    `https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll`,
    `https://apigw.trendyol.com/discovery/api/product/${productId}`,
    `https://public.trendyol.com/discovery-web-websfxgw-service/api/bestoffers`,
    `https://public.trendyol.com/discovery-web-socialgw-service/v1/suggestions/${productId}`
  ];
  
  // Boutique-specific API'ler
  if (boutiqueId) {
    apiEndpoints.push(
      `https://public.trendyol.com/discovery-web-searchgw-service/v2/api/infinite-scroll?q=${boutiqueId}`,
      `https://public.trendyol.com/discovery-web-productgw-service/v1/boutique/${boutiqueId}/products`
    );
  }
  
  for (const endpoint of apiEndpoints) {
    try {
      console.log(`API endpoint deneniyor: ${endpoint}`);
      
      const response = await axios.get(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.trendyol.com/',
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 10000
      });
      
      if (response.data) {
        const extractedImages = extractImageUrlsRecursive(response.data);
        extractedImages.forEach(img => {
          if (!images.includes(img)) {
            images.push(img);
          }
        });
      }
    } catch (error) {
      console.log(`API endpoint başarısız: ${endpoint}`);
      continue;
    }
  }
  
  return images;
}

/**
 * Mobil API'lerden görsel çeker
 */
async function extractFromMobileAPIs(productId: string): Promise<string[]> {
  const images: string[] = [];
  
  const mobileEndpoints = [
    `https://mapi.trendyol.com/discovery-sellerstore-productgw-service/v1/product-detail/${productId}`,
    `https://mapi.trendyol.com/discovery-web-productgw-service/v1/product/${productId}`,
    `https://mobile-gateway.trendyol.com/gateway/api/product/${productId}`
  ];
  
  for (const endpoint of mobileEndpoints) {
    try {
      const response = await axios.get(endpoint, {
        headers: {
          'User-Agent': 'Trendyol/1.0 (iPhone; iOS 15.0)',
          'Accept': 'application/json',
          'X-Platform': 'IOS'
        },
        timeout: 8000
      });
      
      if (response.data) {
        const extractedImages = extractImageUrlsRecursive(response.data);
        extractedImages.forEach(img => {
          if (!images.includes(img)) {
            images.push(img);
          }
        });
      }
    } catch (error) {
      continue;
    }
  }
  
  return images;
}

/**
 * JSON objesinden tüm görsel URL'lerini recursive olarak çıkarır
 */
function extractImageUrlsRecursive(obj: any, depth = 0): string[] {
  if (depth > 15) return [];
  
  const images: string[] = [];
  
  function extract(data: any, currentDepth: number) {
    if (currentDepth > 15) return;
    
    if (typeof data === 'string') {
      if ((data.includes('cdn.dsmcdn.com') || data.includes('cdn.trendyol.com')) &&
          (data.includes('.jpg') || data.includes('.jpeg') || data.includes('.png') || data.includes('.webp'))) {
        images.push(data);
      }
    } else if (Array.isArray(data)) {
      data.forEach(item => extract(item, currentDepth + 1));
    } else if (typeof data === 'object' && data !== null) {
      Object.values(data).forEach(value => extract(value, currentDepth + 1));
    }
  }
  
  extract(obj, depth);
  return images;
}

/**
 * Sayfa HTML'inden tüm görsel referanslarını çıkarır
 */
async function extractFromPageHTML(url: string): Promise<string[]> {
  const images: string[] = [];
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Tüm img elementlerini kontrol et
    $('img').each((_, element) => {
      const src = $(element).attr('src') || $(element).attr('data-src') || $(element).attr('data-lazy-src');
      if (src && (src.includes('cdn.dsmcdn.com') || src.includes('cdn.trendyol.com'))) {
        images.push(src);
      }
    });
    
    // Script taglarındaki JSON verilerini kontrol et
    $('script[type="application/ld+json"], script[type="application/json"]').each((_, element) => {
      try {
        const jsonText = $(element).html();
        if (jsonText) {
          const jsonData = JSON.parse(jsonText);
          const extractedImages = extractImageUrlsRecursive(jsonData);
          images.push(...extractedImages);
        }
      } catch (error) {
        // JSON parse hatası, devam et
      }
    });
    
    // Inline script'lerdeki window değişkenlerini kontrol et
    $('script').each((_, element) => {
      const scriptContent = $(element).html();
      if (scriptContent) {
        // window.__INITIAL_STATE__ ve benzeri değişkenleri ara
        const patterns = [
          /window\.__INITIAL_STATE__\s*=\s*({.+?});/,
          /window\.__PRODUCT_DATA__\s*=\s*({.+?});/,
          /window\.productDetail\s*=\s*({.+?});/
        ];
        
        patterns.forEach(pattern => {
          const match = scriptContent.match(pattern);
          if (match && match[1]) {
            try {
              const jsonData = JSON.parse(match[1]);
              const extractedImages = extractImageUrlsRecursive(jsonData);
              images.push(...extractedImages);
            } catch (error) {
              // Parse hatası, devam et
            }
          }
        });
      }
    });
    
  } catch (error) {
    console.error('HTML parsing hatası:', error);
  }
  
  return images;
}

/**
 * Master görsel çıkarma fonksiyonu - tüm yöntemleri birleştirir
 */
export async function extractAllImages(url: string): Promise<string[]> {
  console.log('Gelişmiş görsel çıkarma başlıyor...');
  
  const { productId, boutiqueId } = extractProductInfo(url);
  if (!productId) {
    console.log('Ürün ID bulunamadı');
    return [];
  }
  
  console.log(`Ürün ID: ${productId}, Boutique ID: ${boutiqueId}`);
  
  const allImages: string[] = [];
  
  try {
    // 1. HTML'den çıkar
    console.log('1. HTML parsing...');
    const htmlImages = await extractFromPageHTML(url);
    allImages.push(...htmlImages);
    console.log(`HTML'den ${htmlImages.length} görsel bulundu`);
    
    // 2. Trendyol API'lerinden çıkar
    console.log('2. Trendyol API\'leri...');
    const apiImages = await extractFromTrendyolAPIs(productId, boutiqueId);
    allImages.push(...apiImages);
    console.log(`API'lerden ${apiImages.length} görsel bulundu`);
    
    // 3. Mobil API'lerden çıkar
    console.log('3. Mobil API\'ler...');
    const mobileImages = await extractFromMobileAPIs(productId);
    allImages.push(...mobileImages);
    console.log(`Mobil API'lerden ${mobileImages.length} görsel bulundu`);
    
    // 4. Temel görselleri kullanarak varyasyonlar oluştur
    console.log('4. Görsel varyasyonları oluşturuluyor...');
    const baseImages = Array.from(new Set(allImages)).slice(0, 5); // İlk 5 görsel
    
    for (const baseImage of baseImages) {
      const variations = generateImageVariations(baseImage);
      allImages.push(...variations);
    }
    
    // 5. Tekrarları kaldır
    const uniqueImages = Array.from(new Set(allImages));
    console.log(`Toplam ${uniqueImages.length} benzersiz görsel oluşturuldu`);
    
    // 6. Görselleri doğrula (sadece ilk 50'yi kontrol et performans için)
    console.log('6. Görsel doğrulama...');
    const imagesToValidate = uniqueImages.slice(0, 50);
    const validImages = await validateImageUrls(imagesToValidate);
    
    // Doğrulanmamış görselleri de ekle (performans için)
    const finalImages = [...validImages, ...uniqueImages.slice(50)];
    
    // 7. Kalite skoruna göre sırala
    const sortedImages = finalImages.sort((a, b) => {
      return getImageQualityScore(b) - getImageQualityScore(a);
    });
    
    console.log(`Gelişmiş görsel çıkarma tamamlandı: ${sortedImages.length} görsel`);
    return sortedImages.slice(0, 30); // En fazla 30 görsel
    
  } catch (error) {
    console.error('Gelişmiş görsel çıkarma hatası:', error);
    return allImages;
  }
}

/**
 * Görsel kalite skorunu hesaplar
 */
function getImageQualityScore(url: string): number {
  let score = 0;
  
  // Boyut skorları
  if (url.includes('1200') || url.includes('1800')) score += 10;
  if (url.includes('org_zoom')) score += 15;
  if (url.includes('mnresize/1200')) score += 8;
  if (url.includes('quality/95')) score += 5;
  
  // Format skorları
  if (url.includes('.webp')) score += 3;
  if (url.includes('.jpg')) score += 2;
  
  return score;
}