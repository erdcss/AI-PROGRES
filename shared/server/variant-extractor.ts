/**
 * Trendyol Varyant Görsel Çıkarıcı
 * Ürünün farklı renk/beden varyantlarından ek görseller çıkarır
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export async function extractImagesFromVariants(baseUrl: string): Promise<string[]> {
  console.log('🎨 Varyant Görsel Çıkarıcı başlatılıyor...');
  
  const allImages: string[] = [];
  
  try {
    // 1. Ana sayfadan varyant bilgilerini çıkar
    const response = await axios.get(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    
    // 2. JSON-LD'den varyant bilgilerini çıkar
    const variants = extractVariantsFromJSONLD($);
    console.log(`🔍 ${variants.length} varyant bulundu`);

    // 3. Her varyant için görsel çıkar
    for (const variant of variants) {
      try {
        if (variant.url && variant.url !== baseUrl) {
          console.log(`🎨 Varyant işleniyor: ${variant.color || variant.size || 'Bilinmeyen'}`);
          
          const variantImages = await extractImagesFromVariantPage(variant.url);
          variantImages.forEach(img => {
            if (!allImages.includes(img)) {
              allImages.push(img);
            }
          });
          
          console.log(`✅ ${variantImages.length} görsel bu varyanttan alındı`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.log(`❌ Varyant işleme hatası: ${variant.url}`);
      }
    }

    // 4. Benzer ürünlerden de görsel çıkar (isRelatedTo)
    const relatedProducts = extractRelatedProducts($);
    console.log(`🔗 ${relatedProducts.length} benzer ürün bulundu`);
    
    for (let i = 0; i < Math.min(relatedProducts.length, 3); i++) {
      try {
        const relatedUrl = relatedProducts[i];
        console.log(`🔗 Benzer ürün işleniyor: ${relatedUrl}`);
        
        const relatedImages = await extractImagesFromVariantPage(relatedUrl);
        relatedImages.forEach(img => {
          if (!allImages.includes(img)) {
            allImages.push(img);
          }
        });
        
        console.log(`🔗 ${relatedImages.length} görsel benzer üründen alındı`);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.log(`❌ Benzer ürün işleme hatası`);
      }
    }

  } catch (error) {
    console.error('❌ Varyant Extractor genel hatası:', error);
  }

  console.log(`🎯 Varyant Extractor sonuç: ${allImages.length} ek görsel`);
  return allImages;
}

/**
 * JSON-LD'den varyant bilgilerini çıkarır
 */
function extractVariantsFromJSONLD($: cheerio.CheerioAPI): Array<{url: string, color?: string, size?: string}> {
  const variants: Array<{url: string, color?: string, size?: string}> = [];
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const scriptContent = $(el).text();
      if (!scriptContent) return;
      
      const data = JSON.parse(scriptContent);
      
      if (data["@type"] === "ProductGroup" && data.hasVariant) {
        data.hasVariant.forEach((variant: any) => {
          if (variant.offers && variant.offers.url) {
            variants.push({
              url: variant.offers.url,
              color: variant.color,
              size: variant.size
            });
          }
        });
      }
    } catch (error) {
      // Sessizce geç
    }
  });
  
  return variants;
}

/**
 * İlişkili ürünleri çıkarır
 */
function extractRelatedProducts($: cheerio.CheerioAPI): string[] {
  const relatedUrls: string[] = [];
  
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const scriptContent = $(el).text();
      if (!scriptContent) return;
      
      const data = JSON.parse(scriptContent);
      
      if (data["@type"] === "ProductGroup" && data.isRelatedTo) {
        data.isRelatedTo.forEach((url: string) => {
          if (typeof url === 'string' && url.includes('trendyol.com')) {
            relatedUrls.push(url);
          }
        });
      }
    } catch (error) {
      // Sessizce geç
    }
  });
  
  return relatedUrls;
}

/**
 * Varyant sayfasından görselleri çıkarır
 */
async function extractImagesFromVariantPage(url: string): Promise<string[]> {
  const images: string[] = [];
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer': 'https://www.trendyol.com/'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    
    // JSON-LD'den görselleri çıkar
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const scriptContent = $(el).text();
        if (!scriptContent) return;
        
        const data = JSON.parse(scriptContent);
        
        if (data["@type"] === "ProductGroup" && data.image && data.image.contentUrl) {
          if (Array.isArray(data.image.contentUrl)) {
            data.image.contentUrl.forEach((imgUrl: string) => {
              if (imgUrl && !images.includes(imgUrl)) {
                images.push(imgUrl);
              }
            });
          } else if (typeof data.image.contentUrl === 'string') {
            images.push(data.image.contentUrl);
          }
        }
        
        // Varyantlardan da görseller al
        if (data.hasVariant && Array.isArray(data.hasVariant)) {
          data.hasVariant.forEach((variant: any) => {
            if (variant.image && typeof variant.image === 'string') {
              if (!images.includes(variant.image)) {
                images.push(variant.image);
              }
            }
          });
        }
      } catch (error) {
        // Sessizce geç
      }
    });
    
    // HTML'den de ek görseller çıkar
    $('img[data-src], img[src]').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && isValidProductImage(src) && !images.includes(src)) {
        images.push(src);
      }
    });

  } catch (error) {
    console.log(`Varyant sayfa yükleme hatası: ${url}`);
  }

  return images;
}

/**
 * Geçerli ürün görseli kontrolü
 */
function isValidProductImage(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  return (
    url.includes('cdn.dsmcdn.com') && (
      url.includes('.jpg') || 
      url.includes('.jpeg') || 
      url.includes('.png') || 
      url.includes('.webp')
    ) && (
      url.includes('/prod/') || 
      url.includes('/product/') || 
      url.includes('/media/')
    ) && !url.includes('badge') && 
    !url.includes('icon') && 
    !url.includes('logo')
  );
}