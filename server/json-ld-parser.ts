/**
 * JSON-LD Parser for Trendyol Product Data
 * Extracts comprehensive product information from structured data
 */

import * as cheerio from "cheerio";

export interface JsonLdProductData {
  name: string;
  description: string;
  price: string;
  brand: string;
  images: string[];
  sku: string;
  color?: string;
  pattern?: string;
  availability: string;
  rating?: {
    value: number;
    count: number;
    reviewCount: number;
  };
  reviews?: Array<{
    author: string;
    date: string;
    body: string;
    rating: number;
  }>;
  attributes: Record<string, string>;
  variants?: Array<{
    name: string;
    sku: string;
    color: string;
    price: string;
    image: string;
    availability: string;
  }>;
}

/**
 * JSON-LD yapısından kapsamlı ürün bilgilerini çıkarır
 * @param $ Cheerio HTML içeriği
 * @returns Detaylı ürün verisi
 */
export function parseJsonLdProductData($: cheerio.CheerioAPI): JsonLdProductData | null {
  try {
    // JSON-LD script taglarını bul
    const jsonLdScripts = $('script[type="application/ld+json"]');
    console.log(`[JSON-LD] ${jsonLdScripts.length} adet JSON-LD script tagı bulundu`);
    
    for (let i = 0; i < jsonLdScripts.length; i++) {
      const script = jsonLdScripts.eq(i);
      const jsonContent = script.html();
      
      if (!jsonContent) {
        console.log(`[JSON-LD] Script ${i}: İçerik boş`);
        continue;
      }
      
      console.log(`[JSON-LD] Script ${i}: ${jsonContent.substring(0, 200)}...`);
      
      try {
        const data = JSON.parse(jsonContent);
        console.log(`[JSON-LD] Script ${i} @type: ${data['@type']}`);
        
        // ProductGroup veya Product tipini kontrol et
        if (data['@type'] === 'ProductGroup' || data['@type'] === 'Product') {
          console.log(`JSON-LD ürün verisi bulundu: ${data.name}`);
          
          // Ana ürün bilgileri
          const productData: JsonLdProductData = {
            name: data.name || '',
            description: data.description || '',
            price: data.offers?.price || '0',
            brand: data.brand?.name || data.manufacturer || '',
            images: [],
            sku: data.sku || data.productGroupID || '',
            color: data.color || '',
            pattern: data.pattern || '',
            availability: data.offers?.availability || '',
            attributes: {}
          };
          
          // Görselleri JSON-LD'den çıkar ve filtrele
          const allImages: string[] = [];
          
          // Ana ürün görselleri
          if (data.image && data.image.contentUrl) {
            if (Array.isArray(data.image.contentUrl)) {
              allImages.push(...data.image.contentUrl);
            } else if (typeof data.image.contentUrl === 'string') {
              allImages.push(data.image.contentUrl);
            }
          }
          
          // Varyant görselleri
          if (data.hasVariant && Array.isArray(data.hasVariant)) {
            data.hasVariant.forEach((variant: any) => {
              if (variant.image) {
                if (typeof variant.image === 'string') {
                  allImages.push(variant.image);
                } else if (variant.image.contentUrl) {
                  allImages.push(variant.image.contentUrl);
                }
              }
            });
          }
          
          // Duplicate'leri kaldır
          const uniqueImages = Array.from(new Set(allImages));
          
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
            
            return !isLogo;
          });
          
          // Aynı görselin farklı boyutlarını tek görsele indir
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
          
          console.log(`🔧 Görsel filtreleme: ${allImages.length} ham -> ${filteredImages.length} filtreli -> ${deduplicatedImages.length} final`);
          productData.images = deduplicatedImages;
          
          // Derecelendirme bilgisi
          if (data.aggregateRating) {
            productData.rating = {
              value: parseFloat(data.aggregateRating.ratingValue) || 0,
              count: parseInt(data.aggregateRating.ratingCount) || 0,
              reviewCount: parseInt(data.aggregateRating.reviewCount) || 0
            };
          }
          
          // Yorum bilgileri
          if (data.review && Array.isArray(data.review)) {
            productData.reviews = data.review.map((review: any) => ({
              author: review.author?.name || 'Anonim',
              date: review.datePublished || '',
              body: review.reviewBody || '',
              rating: review.reviewRating?.ratingValue || 0
            }));
          }
          
          // Ürün özellikleri (additionalProperty)
          if (data.additionalProperty && Array.isArray(data.additionalProperty)) {
            data.additionalProperty.forEach((prop: any) => {
              if (prop.name && prop.unitText) {
                productData.attributes[prop.name] = prop.unitText;
              }
            });
          }
          
          // Varyant bilgileri
          if (data.hasVariant && Array.isArray(data.hasVariant)) {
            productData.variants = data.hasVariant.map((variant: any) => ({
              name: variant.name || '',
              sku: variant.sku || '',
              color: variant.color || '',
              price: variant.offers?.price || '0',
              image: variant.image || '',
              availability: variant.offers?.availability || ''
            }));
          }
          
          console.log(`JSON-LD parsing tamamlandı:
            - Ürün: ${productData.name}
            - Fiyat: ${productData.price} TL
            - Marka: ${productData.brand}
            - Görseller: ${productData.images.length} adet
            - Özellikler: ${Object.keys(productData.attributes).length} adet
            - Varyantlar: ${productData.variants?.length || 0} adet
            - Derecelendirme: ${productData.rating?.value || 'Yok'}/5
            - Yorumlar: ${productData.reviews?.length || 0} adet`);
          
          return productData;
        }
      } catch (parseError) {
        console.log(`JSON-LD parsing hatası: ${parseError}`);
        continue;
      }
    }
    
    console.log('JSON-LD ürün verisi bulunamadı');
    return null;
    
  } catch (error) {
    console.error('JSON-LD parser genel hatası:', error);
    return null;
  }
}

/**
 * JSON-LD verisinden Shopify uyumlu etiketler oluşturur
 * @param data JSON-LD ürün verisi
 * @returns Etiket dizisi
 */
export function generateTagsFromJsonLd(data: JsonLdProductData): string[] {
  const tags: string[] = [];
  
  // Marka etiketi
  if (data.brand) {
    tags.push(data.brand);
  }
  
  // Renk etiketi
  if (data.color) {
    tags.push(data.color);
  }
  
  // Desen etiketi
  if (data.pattern) {
    tags.push(data.pattern);
  }
  
  // Özelliklerden etiketler
  Object.entries(data.attributes).forEach(([key, value]) => {
    if (value && value !== 'Hayır' && value !== 'N/A') {
      tags.push(`${key}: ${value}`);
    }
  });
  
  // Derecelendirme etiketi
  if (data.rating && data.rating.value >= 4) {
    tags.push('Yüksek Puanlı');
  }
  
  return tags.filter((tag, index, self) => self.indexOf(tag) === index).slice(0, 15);
}