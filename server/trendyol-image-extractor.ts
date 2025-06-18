/**
 * Ultimate Trendyol Image Extractor
 * Garantili gerçek ürün görselleri çıkarımı
 */

import * as cheerio from 'cheerio';

export interface ImageExtractionResult {
  images: string[];
  variantImages: Record<string, string[]>;
  totalFound: number;
}

/**
 * Trendyol görsel URL'ini optimize eder
 */
function optimizeImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Sadece Trendyol CDN görsellerini işle
  if (!url.includes('cdn.dsmcdn.com')) return null;
  
  // Ürün dışı görselleri filtrele
  const excludePatterns = ['/ui/', '/icon', '/logo', '/footer', '/brand/', '/web/', '.svg'];
  if (excludePatterns.some(pattern => url.includes(pattern))) {
    return null;
  }
  
  let optimized = url;
  
  // En yüksek kalite resolution path
  optimized = optimized.replace(/\/ty\d+\//, '/ty1660/');
  
  // Maksimum çözünürlük ayarla
  optimized = optimized.replace(/mnresize\/\d+\/\d+\//, 'mnresize/1200/1800/');
  
  // Thumbnail'i orijinal kaliteye çevir
  optimized = optimized.replace(/_thumb\.(jpg|jpeg|png|webp)/i, '_org.$1');
  optimized = optimized.replace(/_small\.(jpg|jpeg|png|webp)/i, '_org.$1');
  optimized = optimized.replace(/_medium\.(jpg|jpeg|png|webp)/i, '_org.$1');
  
  // Zoom kalitesi ekle
  if (!optimized.includes('_org') && !optimized.includes('_zoom')) {
    optimized = optimized.replace(/\.(jpg|jpeg|png|webp)/i, '_org_zoom.$1');
  }
  
  // HTTPS garantisi
  optimized = optimized.replace(/^http:/, 'https:');
  
  return optimized;
}

/**
 * Ana ürün görsellerini çıkarır
 */
export function extractProductImages(htmlContent: string, $: cheerio.CheerioAPI): ImageExtractionResult {
  const images: string[] = [];
  const variantImages: Record<string, string[]> = {};
  
  console.log("🎯 Kapsamlı görsel çıkarma başlatılıyor...");
  
  // Strateji 1: window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ 
  const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
  const initialStateMatch = htmlContent.match(initialStatePattern);
  
  if (initialStateMatch) {
    try {
      const state = JSON.parse(initialStateMatch[1]);
      const product = state?.product || state?.productDetail || state;
      
      // Ana ürün görselleri
      if (product.images && Array.isArray(product.images)) {
        product.images.forEach((img: any) => {
          const url = typeof img === 'string' ? img : img.url || img.src;
          if (url) {
            const optimizedUrl = optimizeImageUrl(url);
            if (optimizedUrl && !images.includes(optimizedUrl)) {
              images.push(optimizedUrl);
            }
          }
        });
      }
      
      // Varyant görselleri
      if (product.variants && Array.isArray(product.variants)) {
        product.variants.forEach((variant: any) => {
          const colorKey = variant.color || variant.colorName || 'default';
          if (variant.images && Array.isArray(variant.images)) {
            variantImages[colorKey] = [];
            variant.images.forEach((img: any) => {
              const url = typeof img === 'string' ? img : img.url || img.src;
              if (url) {
                const optimizedUrl = optimizeImageUrl(url);
                if (optimizedUrl) {
                  variantImages[colorKey].push(optimizedUrl);
                  if (!images.includes(optimizedUrl)) {
                    images.push(optimizedUrl);
                  }
                }
              }
            });
          }
        });
      }
      
      console.log(`✅ Initial State'den ${images.length} görsel çıkarıldı`);
    } catch (e) {
      console.log("Initial State parse hatası:", e);
    }
  }
  
  // Strateji 2: JSON-LD structured data
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdPattern.exec(htmlContent)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data.image) {
        const imageList = Array.isArray(data.image) ? data.image : [data.image];
        imageList.forEach((img: string) => {
          const optimizedUrl = optimizeImageUrl(img);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        });
      }
    } catch (e) {
      // Silent fail
    }
  }
  
  // Strateji 3: Meta tag'lerden
  const metaImageMatches = htmlContent.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/g) || [];
  metaImageMatches.forEach(match => {
    const urlMatch = match.match(/content="([^"]*)"/);
    if (urlMatch) {
      const optimizedUrl = optimizeImageUrl(urlMatch[1]);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    }
  });
  
  // Strateji 4: İleri CDN pattern matching
  const cdnPatterns = [
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/PIM\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi,
    /https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi
  ];
  
  cdnPatterns.forEach(pattern => {
    const matches = htmlContent.match(pattern) || [];
    matches.forEach(url => {
      const optimizedUrl = optimizeImageUrl(url);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
  });
  
  // Strateji 5: Script tag'lerindeki görsel URL'leri
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    const imageMatches = scriptContent.match(/https:\/\/cdn\.dsmcdn\.com\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi) || [];
    
    imageMatches.forEach(url => {
      if (url.includes('/prod/') || url.includes('/QC/') || url.includes('/PIM/')) {
        const optimizedUrl = optimizeImageUrl(url);
        if (optimizedUrl && !images.includes(optimizedUrl)) {
          images.push(optimizedUrl);
        }
      }
    });
  });
  
  // Strateji 6: IMG tag'lerinden direkt çıkarım
  $('img').each((_, img) => {
    const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-original');
    if (src) {
      const optimizedUrl = optimizeImageUrl(src);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    }
  });
  
  // Son kontrol - hiç görsel bulunamadıysa fallback
  if (images.length === 0) {
    console.log("⚠️ Ana görsel bulunamadı, fallback URL'ler deneniyor...");
    const fallbackPattern = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s]+\.(jpg|jpeg|png|webp)/gi;
    const fallbackMatches = htmlContent.match(fallbackPattern) || [];
    
    fallbackMatches.slice(0, 5).forEach(url => {
      const optimizedUrl = optimizeImageUrl(url);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
  }
  
  // Deduplication
  const uniqueImages = [...new Set(images)];
  
  console.log(`🖼️ TOPLAM ${uniqueImages.length} kaliteli görsel çıkarıldı`);
  
  return {
    images: uniqueImages,
    variantImages,
    totalFound: uniqueImages.length
  };
}