/**
 * Dynamic Product Image Extractor
 * Extracts actual product images based on product-specific gallery count
 * No fixed limits - adapts to each product's image count
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

interface ProductImageData {
  mainImages: string[];
  thumbnails: string[];
  totalCount: number;
  galleryType: 'single' | 'multiple' | 'variant-based';
}

export async function extractDynamicProductImages(url: string): Promise<ProductImageData> {
  console.log('🎯 Dinamik görsel çıkarma sistemi başlatılıyor...');
  console.log(`📍 URL: ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      },
      timeout: 15000
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML boyutu: ${Math.round(html.length / 1024)}KB`);
    
    // Method 1: Product State'den dinamik görsel sayısını tespit et
    const productStateData = extractFromProductState(html);
    if (productStateData.mainImages.length > 0) {
      console.log(`✅ Product State'den ${productStateData.mainImages.length} görsel tespit edildi`);
      return productStateData;
    }
    
    // Method 2: Galeri elementlerinden dinamik tespit
    const galleryData = extractFromGalleryElements($);
    if (galleryData.mainImages.length > 0) {
      console.log(`✅ Galeri elementlerinden ${galleryData.mainImages.length} görsel tespit edildi`);
      return galleryData;
    }
    
    // Method 3: CDN pattern'lerinden kapsamlı arama
    const cdnData = extractFromCDNPatterns(html);
    console.log(`✅ CDN pattern'lerinden ${cdnData.mainImages.length} görsel tespit edildi`);
    return cdnData;
    
  } catch (error: any) {
    console.error(`❌ Dinamik görsel çıkarma hatası: ${error.message}`);
    return {
      mainImages: [],
      thumbnails: [],
      totalCount: 0,
      galleryType: 'single'
    };
  }
}

function extractFromProductState(html: string): ProductImageData {
  console.log('🔍 Product State analizi başlatılıyor...');
  
  try {
    // Trendyol'un product state yapısını ara
    const statePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
    const stateMatch = html.match(statePattern);
    
    if (stateMatch) {
      const state = JSON.parse(stateMatch[1]);
      const product = state?.product;
      
      if (product?.images && Array.isArray(product.images)) {
        const mainImages = product.images
          .map((img: any) => {
            const url = typeof img === 'string' ? img : img.url;
            return optimizeImageQuality(url);
          })
          .filter((url: string) => url && url.includes('dsmcdn.com'))
          .filter((url: string, index: number, array: string[]) => array.indexOf(url) === index); // Deduplication
        
        console.log(`📊 Product State: ${mainImages.length} benzersiz görsel`);
        
        return {
          mainImages,
          thumbnails: [],
          totalCount: mainImages.length,
          galleryType: mainImages.length > 1 ? 'multiple' : 'single'
        };
      }
      
      // Variant-based images kontrolü
      if (product?.allVariants && Array.isArray(product.allVariants)) {
        const variantImages = new Set<string>();
        
        product.allVariants.forEach((variant: any) => {
          if (variant.images && Array.isArray(variant.images)) {
            variant.images.forEach((img: any) => {
              const url = typeof img === 'string' ? img : img.url;
              if (url) {
                variantImages.add(optimizeImageQuality(url));
              }
            });
          }
        });
        
        const mainImages = Array.from(variantImages).filter(url => url.includes('dsmcdn.com'));
        
        if (mainImages.length > 0) {
          console.log(`📊 Variant Images: ${mainImages.length} benzersiz görsel`);
          return {
            mainImages,
            thumbnails: [],
            totalCount: mainImages.length,
            galleryType: 'variant-based'
          };
        }
      }
    }
    
  } catch (error) {
    console.log('⚠️ Product State parse hatası');
  }
  
  return { mainImages: [], thumbnails: [], totalCount: 0, galleryType: 'single' };
}

function extractFromGalleryElements($: cheerio.CheerioAPI): ProductImageData {
  console.log('🔍 Galeri elementleri analizi başlatılıyor...');
  
  const mainImages = new Set<string>();
  const thumbnails = new Set<string>();
  
  // Trendyol'a özgü galeri seçicileri
  const gallerySelectors = [
    '.product-detail-gallery img',
    '.gallery-wrapper img',
    '.image-gallery img',
    '.product-images img',
    '.slider-container img',
    '.carousel img',
    '[data-testid="product-gallery"] img',
    '.zoom-container img'
  ];
  
  gallerySelectors.forEach(selector => {
    $(selector).each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
      if (src && src.includes('dsmcdn.com')) {
        const optimizedUrl = optimizeImageQuality(src);
        
        // Thumbnail kontrolü (boyut veya URL'den)
        const isThumbnail = src.includes('thumb') || 
                           src.includes('_small') || 
                           $(img).width() < 200 ||
                           $(img).hasClass('thumb');
        
        if (isThumbnail) {
          thumbnails.add(optimizedUrl);
        } else {
          mainImages.add(optimizedUrl);
        }
      }
    });
  });
  
  console.log(`📊 Galeri: ${mainImages.size} ana görsel, ${thumbnails.size} thumbnail`);
  
  return {
    mainImages: Array.from(mainImages),
    thumbnails: Array.from(thumbnails),
    totalCount: mainImages.size + thumbnails.size,
    galleryType: mainImages.size > 1 ? 'multiple' : 'single'
  };
}

function extractFromCDNPatterns(html: string): ProductImageData {
  console.log('🔍 CDN pattern analizi başlatılıyor...');
  
  const mainImages = new Set<string>();
  
  // Trendyol CDN pattern'leri - ürün specific
  const patterns = [
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/[^"'\s]+\/\d+_org_zoom\.jpg/gi,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/[^"'\s]+\/\d+_large\.jpg/gi,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/[^"'\s]+\/[^"'\s]+\.jpg/gi
  ];
  
  patterns.forEach((pattern, index) => {
    const matches = html.match(pattern) || [];
    console.log(`📸 Pattern ${index + 1}: ${matches.length} eşleşme`);
    
    matches.forEach(url => {
      const optimizedUrl = optimizeImageQuality(url);
      if (optimizedUrl && 
          !url.includes('icon') && 
          !url.includes('logo') && 
          !url.includes('badge') &&
          !url.includes('thumb')) {
        mainImages.add(optimizedUrl);
      }
    });
  });
  
  console.log(`📊 CDN Patterns: ${mainImages.size} benzersiz görsel`);
  
  return {
    mainImages: Array.from(mainImages),
    thumbnails: [],
    totalCount: mainImages.size,
    galleryType: mainImages.size > 1 ? 'multiple' : 'single'
  };
}

function optimizeImageQuality(url: string): string {
  if (!url || !url.includes('dsmcdn.com')) return '';
  
  // En yüksek kaliteye dönüştür
  let optimized = url;
  
  // _org_zoom.jpg formatını tercih et (en yüksek kalite)
  if (!url.includes('_org_zoom.jpg')) {
    optimized = url.replace(/(_small|_medium|_large|_thumb)\.jpg/g, '_org_zoom.jpg');
  }
  
  // Protocol kontrolü
  if (!optimized.startsWith('http')) {
    optimized = 'https:' + optimized;
  }
  
  return optimized;
}

/**
 * Main export function - integrates with existing scraper
 */
export async function getProductImages(url: string): Promise<string[]> {
  const imageData = await extractDynamicProductImages(url);
  
  console.log(`🎯 Dinamik görsel çıkarma tamamlandı:`);
  console.log(`   📸 Ana görseller: ${imageData.mainImages.length}`);
  console.log(`   🔍 Thumbnails: ${imageData.thumbnails.length}`);
  console.log(`   📊 Toplam: ${imageData.totalCount}`);
  console.log(`   🎨 Galeri tipi: ${imageData.galleryType}`);
  
  // Sadece ana görselleri döndür (thumbnail'ları değil)
  return imageData.mainImages;
}