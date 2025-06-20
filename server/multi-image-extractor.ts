/**
 * Çoklu Görsel Çıkarıcı - Tüm ürün görsellerini yakalama
 */

export function extractAllImages(htmlContent: string): string[] {
  const images = new Set<string>();
  
  // 1. HTML'den tüm CDN görsellerini çıkar
  const patterns = [
    /https:\/\/cdn\.dsmcdn\.com[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    /\/ty\d+\/prod\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi,
    /\/mnresize\/\d+\/\d+\/[^"'\s\)]*\.(jpg|jpeg|png|webp)/gi
  ];
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      let url = match[0];
      if (url.startsWith('/')) {
        url = 'https://cdn.dsmcdn.com' + url;
      }
      images.add(url);
    }
  });
  
  // 2. Tek görselden varyantlar üret
  const firstImage = Array.from(images)[0];
  if (firstImage) {
    const hashMatch = firstImage.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (hashMatch) {
      const hash = hashMatch[1];
      const basePath = firstImage.replace(/\/\d+(_org_zoom)?\.jpg.*$/, '');
      
      // 1-15 arası tüm varyantlar
      for (let i = 1; i <= 15; i++) {
        images.add(`${basePath}/${i}_org_zoom.jpg`);
        images.add(`${basePath}/${i}.jpg`);
      }
    }
  }
  
  // 3. Ürün görselleri filtrele
  const productImages = Array.from(images).filter(url => {
    if (!url || url.length === 0) return false;
    
    const lowerUrl = url.toLowerCase();
    
    // Hariç tutulacaklar
    const exclude = ['footer', 'header', 'logo', 'icon', 'banner', 'badge', 'energy', 'certificate', 'payment', 'social', 'static', 'ui', 'sprite', 'button', 'arrow', 'star', 'web/production'];
    if (exclude.some(pattern => lowerUrl.includes(pattern))) return false;
    
    // Dahil edilecekler
    return url.includes('/prod/') || url.includes('/product/') || url.includes('/QC/') || url.includes('/PIM/') || url.includes('/ty');
  });
  
  console.log(`🖼️ ${productImages.length} ürün görseli çıkarıldı`);
  return productImages;
}