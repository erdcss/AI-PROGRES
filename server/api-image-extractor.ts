/**
 * API Tabanlı Görsel Çıkarıcı
 * Trendyol'un internal API'lerini doğrudan çağırarak görselleri alır
 */

import axios from 'axios';

/**
 * URL'den ürün ID'sini çıkarır
 * @param url Trendyol ürün URL'si
 * @returns Ürün ID'si
 */
function extractProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : null;
}

/**
 * Trendyol API'sinden ürün detaylarını çeker
 * @param url Ürün URL'si
 * @returns API'den gelen tüm görseller
 */
export async function extractImagesFromAPI(url: string): Promise<string[]> {
  const productId = extractProductId(url);
  if (!productId) {
    console.log('Ürün ID\'si bulunamadı, API çağrısı yapılamıyor');
    return [];
  }

  const images: string[] = [];
  
  try {
    console.log(`API tabanlı görsel çıkarma başlıyor: Product ID ${productId}`);
    
    // Trendyol'un farklı API endpoint'lerini dene
    const apiEndpoints = [
      `https://public.trendyol.com/discovery-web-productgw-service/v1/product-detail/${productId}`,
      `https://public.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
      `https://api.trendyol.com/webgateway/api/product/${productId}`,
      `https://apigw.trendyol.com/discovery/api/product/${productId}`
    ];

    // Her endpoint'i sırayla dene
    for (const endpoint of apiEndpoints) {
      try {
        console.log(`API endpoint deneniyor: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Referer': 'https://www.trendyol.com/',
            'Origin': 'https://www.trendyol.com'
          },
          timeout: 10000
        });

        if (response.data && response.status === 200) {
          console.log(`API response başarılı: ${endpoint}`);
          
          // Response'tan görsel URL'lerini çıkar
          const extractedImages = extractImageUrlsFromApiResponse(response.data);
          extractedImages.forEach(img => {
            if (!images.includes(img)) {
              images.push(img);
            }
          });
          
          // Başarılı response aldıysak diğer endpoint'leri denemeye gerek yok
          if (images.length > 0) {
            break;
          }
        }
      } catch (error: any) {
        console.log(`API endpoint başarısız: ${endpoint} - ${error.message}`);
        continue;
      }
    }

    // Alternatif olarak sayfa kaynak kodundan API call'ları yakala
    if (images.length === 0) {
      console.log('Direkt API çağrıları başarısız, sayfa kaynak kodundan API verisi aranıyor...');
      const pageImages = await extractApiDataFromPage(url);
      pageImages.forEach(img => {
        if (!images.includes(img)) {
          images.push(img);
        }
      });
    }

    // Görselleri optimize et
    const optimizedImages = images.map(img => optimizeImageUrl(img));
    const uniqueImages = Array.from(new Set(optimizedImages));
    
    console.log(`API tabanlı çıkarma tamamlandı: ${uniqueImages.length} görsel`);
    return uniqueImages;

  } catch (error) {
    console.error('API tabanlı görsel çıkarma genel hatası:', error);
    return images;
  }
}

/**
 * API response'undan görsel URL'lerini çıkarır
 * @param data API response verisi
 * @returns Bulunan görsel URL'leri
 */
function extractImageUrlsFromApiResponse(data: any): string[] {
  const images: string[] = [];
  
  function recursiveSearch(obj: any, depth = 0) {
    if (depth > 10) return; // Sonsuz loop'u önle
    
    if (typeof obj === 'string') {
      // String bir görsel URL'si mi?
      if ((obj.includes('cdn.dsmcdn.com') || obj.includes('cdn.trendyol.com')) &&
          (obj.includes('.jpg') || obj.includes('.jpeg') || obj.includes('.png') || obj.includes('.webp'))) {
        images.push(obj);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(item => recursiveSearch(item, depth + 1));
    } else if (typeof obj === 'object' && obj !== null) {
      // Özel alanları kontrol et
      const imageFields = ['images', 'imageUrl', 'imageUrls', 'picture', 'pictures', 'photos', 'gallery', 'thumbnails', 'media'];
      
      imageFields.forEach(field => {
        if (obj[field]) {
          recursiveSearch(obj[field], depth + 1);
        }
      });
      
      // Diğer tüm alanları da kontrol et
      Object.values(obj).forEach(value => recursiveSearch(value, depth + 1));
    }
  }
  
  recursiveSearch(data);
  return images;
}

/**
 * Sayfa kaynak kodundan API verilerini çıkarır
 * @param url Ürün URL'si
 * @returns Bulunan görsel URL'leri
 */
async function extractApiDataFromPage(url: string): Promise<string[]> {
  const images: string[] = [];
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });

    const html = response.data;
    
    // JavaScript değişkenlerinden API verilerini çıkar
    const patterns = [
      /window\.__INITIAL_STATE__\s*=\s*({.+?});/,
      /window\.__PRODUCT_DETAIL__\s*=\s*({.+?});/,
      /window\.__PRODUCT_DATA__\s*=\s*({.+?});/,
      /<script[^>]*>.*?window\.productDetail\s*=\s*({.+?});.*?<\/script>/,
      /<script[^>]*>.*?window\.product\s*=\s*({.+?});.*?<\/script>/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        try {
          const jsonData = JSON.parse(match[1]);
          const extractedImages = extractImageUrlsFromApiResponse(jsonData);
          extractedImages.forEach(img => {
            if (!images.includes(img)) {
              images.push(img);
            }
          });
          
          if (images.length > 0) {
            console.log(`Sayfa kaynak kodundan ${images.length} görsel bulundu`);
            break;
          }
        } catch (parseError) {
          console.log('JSON parse hatası, diğer pattern deneniyor...');
          continue;
        }
      }
    }

  } catch (error) {
    console.error('Sayfa kaynak kodu analizi hatası:', error);
  }
  
  return images;
}

/**
 * Görsel URL'sini optimize eder
 * @param url Orijinal görsel URL'si
 * @returns Optimize edilmiş URL
 */
function optimizeImageUrl(url: string): string {
  return url
    .replace(/\/\d+\/\d+\//, '/1200/1800/') // Boyut optimizasyonu
    .replace(/mnresize\/\d+/, 'mnresize/1200') // mnresize optimizasyonu
    .replace(/resize\/\d+/, 'resize/1200') // resize optimizasyonu
    .replace(/crop\/\d+/, 'crop/1200') // crop optimizasyonu
    .replace(/quality\/\d+/, 'quality/95'); // Kalite optimizasyonu
}

/**
 * Tüm görsel çıkarma yöntemlerini birleştiren hibrit fonksiyon
 * @param url Ürün URL'si
 * @returns Tüm yöntemlerden toplanan görseller
 */
export async function superHybridImageExtraction(url: string): Promise<string[]> {
  console.log('Süper hibrit görsel çıkarma başlıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. API tabanlı çıkarma
    console.log('1. API tabanlı çıkarma...');
    const apiImages = await extractImagesFromAPI(url);
    allImages.push(...apiImages);
    
    // 2. Network tabanlı çıkarma
    console.log('2. Network tabanlı çıkarma...');
    const { hybridImageExtraction } = await import('./network-image-extractor');
    const networkImages = await hybridImageExtraction(url);
    allImages.push(...networkImages);
    
    // 3. JSON-LD tabanlı çıkarma (fallback)
    console.log('3. JSON-LD tabanlı çıkarma...');
    const { getAllProductImages } = await import('./image-extractor');
    const jsonLdImages = await getAllProductImages(url);
    allImages.push(...jsonLdImages);
    
    // Tekrarları kaldır ve sırala
    const uniqueImages = Array.from(new Set(allImages));
    
    // En kaliteli görselleri öne al
    const sortedImages = uniqueImages.sort((a, b) => {
      const aScore = getImageQualityScore(a);
      const bScore = getImageQualityScore(b);
      return bScore - aScore;
    });
    
    console.log(`Süper hibrit çıkarma tamamlandı: ${sortedImages.length} görsel`);
    return sortedImages.slice(0, 20); // En fazla 20 görsel
    
  } catch (error) {
    console.error('Süper hibrit görsel çıkarma hatası:', error);
    return allImages;
  }
}

/**
 * Görsel kalite skorunu hesaplar
 * @param url Görsel URL'si
 * @returns Kalite skoru (yüksek değer = daha kaliteli)
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
  if (url.includes('.jpg') || url.includes('.jpeg')) score += 2;
  if (url.includes('.png')) score += 1;
  
  // CDN skorları
  if (url.includes('cdn.dsmcdn.com')) score += 2;
  
  return score;
}