/**
 * Comprehensive Image Extraction System
 * Extracts ALL product images without limits
 */

export function extractAllProductImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  console.log('🖼️ Kapsamlı görsel çıkarma başlatılıyor...');
  console.log(`📄 HTML içerik uzunluğu: ${htmlContent.length} karakter`);
  
  // 1. Product state extraction
  try {
    const productStateMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productStateMatch) {
      const productState = JSON.parse(productStateMatch[1]);
      
      // Ana ürün görselleri
      if (productState.product?.images) {
        productState.product.images.forEach((img: any) => {
          const url = typeof img === 'string' ? img : img?.url || img?.src;
          if (url && url.includes('prod/QC')) {
            images.add(optimizeImageUrl(url));
          }
        });
      }
      
      // Galeri görselleri
      if (productState.product?.gallery) {
        productState.product.gallery.forEach((img: any) => {
          const url = typeof img === 'string' ? img : img?.url || img?.src;
          if (url && url.includes('prod/QC')) {
            images.add(optimizeImageUrl(url));
          }
        });
      }
      
      // Tüm varyant görselleri
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.images && Array.isArray(variant.images)) {
            variant.images.forEach((img: string) => {
              if (img && img.includes('prod/QC')) {
                images.add(optimizeImageUrl(img));
              }
            });
          }
        });
      }
      
      // Renk varyant görselleri
      if (productState.product?.colorImages) {
        Object.values(productState.product.colorImages).forEach((colorImgs: any) => {
          if (Array.isArray(colorImgs)) {
            colorImgs.forEach((img: string) => {
              if (img && img.includes('prod/QC')) {
                images.add(optimizeImageUrl(img));
              }
            });
          }
        });
      }
    }
  } catch (e) {
    console.log('Product state parsing error:', e.message);
  }
  
  // 2. Comprehensive regex patterns
  const patterns = [
    // Direct image URLs
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*prod\/QC[^"'\s]*\.(jpg|jpeg|png|webp)/gi,
    // Quoted URLs
    /"(https:\/\/cdn\.dsmcdn\.com[^"]*prod\/QC[^"]*\.(jpg|jpeg|png|webp))"/gi,
    // Single quoted URLs
    /'(https:\/\/cdn\.dsmcdn\.com[^']*prod\/QC[^']*\.(jpg|jpeg|png|webp))'/gi,
    // Image arrays in JSON
    /"images":\s*\[[^\]]*"(https:\/\/[^"]*prod\/QC[^"]*\.(jpg|jpeg|png|webp))"[^\]]*/gi,
    // Gallery arrays
    /"gallery":\s*\[[^\]]*"(https:\/\/[^"]*prod\/QC[^"]*\.(jpg|jpeg|png|webp))"[^\]]*/gi,
    // Variant images
    /"variantImages":\s*\{[^}]*"(https:\/\/[^"]*prod\/QC[^"]*\.(jpg|jpeg|png|webp))"[^}]*/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const url = match[1] || match[0];
      if (url && url.includes('prod/QC')) {
        images.add(optimizeImageUrl(url));
      }
    }
  });
  
  // 3. Extract from all script tags
  const scriptMatches = htmlContent.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  scriptMatches.forEach(script => {
    const imageUrls = script.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*prod\/QC[^"'\s]*\.(jpg|jpeg|png|webp)/gi) || [];
    imageUrls.forEach(url => {
      images.add(optimizeImageUrl(url));
    });
  });
  
  const finalImages = Array.from(images).filter(url => url && url.length > 0);
  console.log(`✅ TOPLAM ${finalImages.length} ürün görseli çıkarıldı`);
  console.log(`🔍 İlk 5 görsel: ${finalImages.slice(0, 5).join(', ')}`);
  
  // Debug: Show what was found in each step
  console.log(`📦 Product state görselleri bulundu mu: ${htmlContent.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')}`);
  console.log(`🔍 Regex pattern ile bulunan URL sayısı: ${htmlContent.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*prod\/QC[^"'\s]*\.(jpg|jpeg|png|webp)/gi)?.length || 0}`);
  
  return finalImages;
}

function optimizeImageUrl(url: string): string {
  if (!url) return '';
  
  // Clean URL
  let cleanUrl = url.trim();
  
  // Handle protocol-relative URLs
  if (cleanUrl.startsWith('//')) {
    cleanUrl = 'https:' + cleanUrl;
  }
  
  // Handle relative URLs
  if (cleanUrl.startsWith('/')) {
    cleanUrl = 'https://cdn.dsmcdn.com' + cleanUrl;
  }
  
  // Optimize to high resolution
  cleanUrl = cleanUrl.replace(/\/\d+\/\d+\//, '/1200/1800/');
  
  // Remove query parameters
  cleanUrl = cleanUrl.split('?')[0];
  
  return cleanUrl;
}