/**
 * Trendyol API Enhanced Görsel Çıkarıcı
 * Internal API'leri kullanarak maksimum görsel çıkarımı
 */

import axios from 'axios';

export async function extractImagesFromTrendyolAPIs(url: string): Promise<string[]> {
  console.log('🔥 API Enhanced Extractor başlatılıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. URL'den ürün ID'sini çıkar
    const productIdMatch = url.match(/p-(\d+)/);
    if (!productIdMatch) {
      console.log('❌ Ürün ID bulunamadı');
      return allImages;
    }
    
    const productId = productIdMatch[1];
    console.log(`📦 Ürün ID: ${productId}`);

    // 2. Boutique ID'yi çıkar
    const boutiqueMatch = url.match(/\/([^\/]+)\/[^\/]+-p-\d+/);
    const boutiqueName = boutiqueMatch ? boutiqueMatch[1] : null;
    console.log(`🏪 Boutique: ${boutiqueName}`);

    // 3. Farklı API endpoint'lerini dene
    const apiEndpoints = [
      `https://public-mdc.trendyol.com/discovery-web-productdetailservice/v1/products/${productId}`,
      `https://apigw.trendyol.com/discovery-web-productdetailservice/v1/products/${productId}`,
      `https://api.trendyol.com/webapi/product/getbyid?productId=${productId}`,
      `https://discovery.trendyol.com/api/v1/product/${productId}`,
      `https://public.trendyol.com/discovery-web-productdetailservice/v1/products/${productId}/details`,
      `https://catalog.trendyol.com/api/v1/products/${productId}/images`
    ];

    for (const endpoint of apiEndpoints) {
      try {
        console.log(`🔍 API endpoint test ediliyor: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Referer': 'https://www.trendyol.com/',
            'Origin': 'https://www.trendyol.com',
            'X-Requested-With': 'XMLHttpRequest'
          },
          timeout: 10000
        });

        if (response.status === 200 && response.data) {
          console.log(`✅ API endpoint başarılı: ${endpoint}`);
          const apiImages = extractImagesFromAPIResponse(response.data);
          apiImages.forEach(img => {
            if (!allImages.includes(img)) {
              allImages.push(img);
            }
          });
          console.log(`📸 ${apiImages.length} görsel bu endpoint'ten alındı`);
        }
      } catch (error) {
        console.log(`❌ API endpoint başarısız: ${endpoint}`);
      }
    }

    // 4. Mobile API'leri dene (genellikle daha fazla görsel içerir)
    const mobileAPIs = [
      `https://mobile.trendyol.com/api/product/${productId}`,
      `https://m.trendyol.com/api/v1/product/${productId}/details`,
      `https://app.trendyol.com/api/product/${productId}/gallery`
    ];

    for (const mobileApi of mobileAPIs) {
      try {
        console.log(`📱 Mobile API test ediliyor: ${mobileApi}`);
        
        const response = await axios.get(mobileApi, {
          headers: {
            'User-Agent': 'TrendyolMobile/1.0 (iPhone; iOS 15.0; Scale/2.0)',
            'Accept': 'application/json',
            'X-Platform': 'mobile',
            'X-App-Version': '2.0.0'
          },
          timeout: 8000
        });

        if (response.status === 200 && response.data) {
          console.log(`📱 Mobile API başarılı: ${mobileApi}`);
          const mobileImages = extractImagesFromAPIResponse(response.data);
          mobileImages.forEach(img => {
            if (!allImages.includes(img)) {
              allImages.push(img);
            }
          });
          console.log(`📱 ${mobileImages.length} görsel mobile API'den alındı`);
        }
      } catch (error) {
        console.log(`❌ Mobile API başarısız: ${mobileApi}`);
      }
    }

    // 5. GraphQL API'sini dene
    try {
      const graphqlQuery = {
        query: `
          query GetProduct($productId: ID!) {
            product(id: $productId) {
              id
              name
              images {
                url
                alt
                position
              }
              variants {
                images {
                  url
                  alt
                }
              }
              gallery {
                images {
                  url
                  thumbnailUrl
                  largeUrl
                }
              }
            }
          }
        `,
        variables: {
          productId: productId
        }
      };

      const graphqlResponse = await axios.post('https://api.trendyol.com/graphql', graphqlQuery, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.trendyol.com/'
        },
        timeout: 10000
      });

      if (graphqlResponse.status === 200 && graphqlResponse.data?.data?.product) {
        console.log('🚀 GraphQL API başarılı');
        const graphqlImages = extractImagesFromAPIResponse(graphqlResponse.data.data.product);
        graphqlImages.forEach(img => {
          if (!allImages.includes(img)) {
            allImages.push(img);
          }
        });
        console.log(`🚀 ${graphqlImages.length} görsel GraphQL API'den alındı`);
      }
    } catch (error) {
      console.log('❌ GraphQL API başarısız');
    }

  } catch (error) {
    console.error('❌ API Enhanced Extractor genel hatası:', error);
  }

  console.log(`🎯 API Enhanced Extractor sonuç: ${allImages.length} toplam görsel`);
  return allImages;
}

/**
 * API response'undan görselleri çıkarır
 */
function extractImagesFromAPIResponse(data: any): string[] {
  const images: string[] = [];
  
  // Recursive olarak tüm object'i tara
  function searchImages(obj: any, depth = 0) {
    if (depth > 10) return; // Sonsuz döngü koruması
    
    if (typeof obj === 'string') {
      // String ise görsel URL'si olabilir
      if (isImageUrl(obj)) {
        images.push(obj);
      }
    } else if (Array.isArray(obj)) {
      // Array ise her element'i kontrol et
      obj.forEach(item => searchImages(item, depth + 1));
    } else if (obj && typeof obj === 'object') {
      // Object ise her property'yi kontrol et
      Object.keys(obj).forEach(key => {
        // Görsel ile ilgili key'leri özellikle kontrol et
        if (isImageRelatedKey(key)) {
          searchImages(obj[key], depth + 1);
        } else {
          searchImages(obj[key], depth + 1);
        }
      });
    }
  }
  
  searchImages(data);
  
  // Duplicate'leri kaldır
  return Array.from(new Set(images));
}

/**
 * String'in görsel URL'si olup olmadığını kontrol eder
 */
function isImageUrl(str: string): boolean {
  if (typeof str !== 'string') return false;
  
  return (
    str.includes('cdn.dsmcdn.com') ||
    str.includes('trendyol.com') ||
    str.includes('cloudinary.com')
  ) && (
    str.includes('.jpg') ||
    str.includes('.jpeg') ||
    str.includes('.png') ||
    str.includes('.webp')
  ) && (
    str.startsWith('http://') ||
    str.startsWith('https://') ||
    str.startsWith('//')
  );
}

/**
 * Key'in görsel ile ilgili olup olmadığını kontrol eder
 */
function isImageRelatedKey(key: string): boolean {
  const imageKeys = [
    'image', 'images', 'img', 'photo', 'photos', 'picture', 'pictures',
    'gallery', 'thumbnail', 'thumbnails', 'url', 'src', 'href',
    'contentUrl', 'imageUrl', 'photoUrl', 'pictureUrl',
    'largeImage', 'smallImage', 'mediumImage', 'originalImage',
    'variants', 'options', 'colors', 'media', 'assets'
  ];
  
  const keyLower = key.toLowerCase();
  return imageKeys.some(imageKey => keyLower.includes(imageKey));
}