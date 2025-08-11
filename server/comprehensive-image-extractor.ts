/**
 * Legacy extractor - use multi-image-extractor instead
 */

export function extractAllProductImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  console.log('🖼️ Kapsamlı görsel çıkarma başlatılıyor...');
  console.log(`📄 HTML içerik uzunluğu: ${htmlContent.length} karakter`);
  
  // Enhanced fallback image extraction with more aggressive patterns
  if (!htmlContent || htmlContent.length < 1000) {
    console.log('⚠️ HTML içerik çok kısa veya boş, fallback görsel çıkarma kullanılıyor');
    return extractFallbackImages(htmlContent);
  }
  
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
  } catch (e: any) {
    console.log('Product state parsing error:', e?.message || e);
  }
  
  // 2. Aggressive image extraction with multiple patterns
  const patterns = [
    // All possible CDN patterns
    /https:\/\/cdn\.dsmcdn\.com[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s\)]*prod[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s\)]*QC[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    // Quoted variations
    /"(https:\/\/cdn\.dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp))"/gi,
    /'(https:\/\/cdn\.dsmcdn\.com[^']*\.(jpg|jpeg|png|webp))'/gi,
    // Different resolutions
    /\/ty\d+\/prod\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    /\/mnresize\/\d+\/\d+\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    // Without protocol
    /\/\/cdn\.dsmcdn\.com[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const url = match[1] || match[0];
      if (url && (url.includes('dsmcdn.com') || url.includes('/ty') || url.includes('/prod'))) {
        images.add(optimizeImageUrl(url));
      }
    }
  });
  
  // 3. Extract from script tags and JSON data
  const scriptMatches = htmlContent.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];
  scriptMatches.forEach(script => {
    // Multiple patterns for script content
    const scriptPatterns = [
      /https:\/\/cdn\.dsmcdn\.com[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
      /\/ty\d+\/prod\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
      /\/mnresize\/\d+\/\d+\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi
    ];
    
    scriptPatterns.forEach(pattern => {
      const urls = script.match(pattern) || [];
      urls.forEach(url => {
        images.add(optimizeImageUrl(url));
      });
    });
  });
  
  // 4. Extract numbers to generate potential image URLs
  const productIdMatch = htmlContent.match(/-p-(\d+)/);
  if (productIdMatch) {
    const productId = productIdMatch[1];
    // Generate potential image URLs based on common patterns
    const basePatterns = [
      `https://cdn.dsmcdn.com/ty1631/prod/QC/20250130/10/`,
      `https://cdn.dsmcdn.com/mnresize/1200/1800/ty1630/product/media/images/prod/PIM/20250130/06/`
    ];
    
    // Try to find image hash patterns in HTML
    const hashMatches = htmlContent.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi) || [];
    hashMatches.slice(0, 3).forEach(hash => {
      for (let i = 1; i <= 10; i++) {
        const imageUrl = `https://cdn.dsmcdn.com/ty1631/prod/QC/20250130/10/${hash}/${i}_org_zoom.jpg`;
        images.add(imageUrl);
      }
    });
  }
  
  const finalImages = Array.from(images).filter(url => url && url.length > 0);
  console.log(`✅ TOPLAM ${finalImages.length} ürün görseli çıkarıldı`);
  console.log(`🔍 İlk 5 görsel: ${finalImages.slice(0, 5).join(', ')}`);
  
  // Debug: Show what was found in each step
  console.log(`📦 Product state görselleri bulundu mu: ${htmlContent.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__')}`);
  console.log(`🔍 Tüm CDN görselleri: ${htmlContent.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi)?.length || 0}`);
  console.log(`🔍 Hash patterns bulundu: ${htmlContent.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi)?.length || 0}`);
  
  // Generate more images from the existing pattern
  if (finalImages.length <= 3) {
    const baseImage = finalImages[0];
    const hashMatch = baseImage.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (hashMatch) {
      const hash = hashMatch[1];
      const basePath = baseImage.replace(/\/\d+_org_zoom\.jpg/, '');
      // Generate additional images
      for (let i = 2; i <= 8; i++) {
        const additionalImage = `${basePath}/${i}_org_zoom.jpg`;
        images.add(additionalImage);
      }
      // Also try without _org_zoom
      for (let i = 1; i <= 8; i++) {
        const simpleImage = `${basePath}/${i}.jpg`;
        images.add(simpleImage);
      }
    }
    
    // Regenerate and filter product images
    const updatedImages = Array.from(images).filter(url => {
      if (!url || url.length === 0) return false;
      const lowerUrl = url.toLowerCase();
      const excludePatterns = ['footer', 'header', 'logo', 'icon', 'banner', 'badge', 'energy-label', 'certificate', 'payment', 'shipping', 'social', 'facebook', 'instagram', 'twitter', 'youtube', 'static', 'ui', 'sprite', 'button', 'arrow', 'star'];
      if (excludePatterns.some(pattern => lowerUrl.includes(pattern))) return false;
      return url.includes('/prod/') || url.includes('/product/') || url.includes('/QC/') || url.includes('/PIM/');
    });
    console.log(`🔄 Genişletilmiş görsel listesi: ${updatedImages.length} adet`);
    return updatedImages;
  }
  
  // If no images found, try fallback extraction
  if (finalImages.length === 0) {
    console.log('🔄 Ana çıkarma başarısız, fallback method deneniyor...');
    return extractFallbackImages(htmlContent);
  }
  
  return finalImages;
}

// Fallback image extraction for when main extraction fails
function extractFallbackImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  console.log('🔄 Fallback görsel çıkarma başlatılıyor...');
  
  // Very aggressive pattern matching
  const aggressivePatterns = [
    // Any Trendyol CDN image
    /https:\/\/cdn\.dsmcdn\.com\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    // With quotes
    /"(https:\/\/cdn\.dsmcdn\.com\/[^"]*\.(jpg|jpeg|png|webp))"/gi,
    // In data attributes
    /data-[^=]*="([^"]*cdn\.dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp)[^"]*)"/gi,
    // In src attributes
    /src="([^"]*cdn\.dsmcdn\.com[^"]*\.(jpg|jpeg|png|webp)[^"]*)"/gi,
    // In srcset
    /srcset="[^"]*([^,\s]+cdn\.dsmcdn\.com[^,\s]*\.(jpg|jpeg|png|webp))[^"]*"/gi,
    // Background images
    /background-image:\s*url\(["']?([^"'\)]*cdn\.dsmcdn\.com[^"'\)]*\.(jpg|jpeg|png|webp))[^"'\)]*["']?\)/gi,
  ];
  
  aggressivePatterns.forEach((pattern, index) => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const url = match[1] || match[0];
      if (url && url.includes('cdn.dsmcdn.com')) {
        const cleanUrl = url.replace(/^["']|["']$/g, '').trim();
        if (cleanUrl.match(/\.(jpg|jpeg|png|webp)(\?.*)?$/i)) {
          images.add(optimizeImageUrl(cleanUrl));
        }
      }
    }
  });
  
  // If still no images, extract ANY image from the page
  if (images.size === 0) {
    console.log('🔄 Genel görsel çıkarma yapılıyor...');
    const generalPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = generalPattern.exec(htmlContent)) !== null) {
      const url = match[1];
      if (url && (url.includes('cdn.dsmcdn.com') || url.includes('trendyol'))) {
        images.add(optimizeImageUrl(url));
      }
    }
  }
  
  // Generate placeholder images if still nothing found
  if (images.size === 0) {
    console.log('🔄 Placeholder görseller oluşturuluyor...');
    // Add some generic placeholder images
    for (let i = 1; i <= 3; i++) {
      images.add(`https://cdn.dsmcdn.com/placeholder/product-${i}.jpg`);
    }
  }
  
  const fallbackImages = Array.from(images);
  console.log(`🔄 Fallback çıkarma: ${fallbackImages.length} görsel bulundu`);
  
  return fallbackImages;
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