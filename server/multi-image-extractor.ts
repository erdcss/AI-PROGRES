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
  
  // 2. Önce product filtreleme yap
  const productOnlyImages = Array.from(images).filter(url => {
    return url && url.includes('/product/');
  });
  
  // 3. Product görsellerinden varyantlar üret
  if (productOnlyImages.length > 0) {
    const firstImage = productOnlyImages[0];
    const hashMatch = firstImage.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    if (hashMatch) {
      const hash = hashMatch[1];
      const basePath = firstImage.replace(/\/\d+(_org_zoom)?\.jpg.*$/, '');
      
      // Sadece product yolunda varyantlar üret
      if (basePath.includes('/product/')) {
        for (let i = 1; i <= 10; i++) {
          images.add(`${basePath}/${i}_org_zoom.jpg`);
          images.add(`${basePath}/${i}.jpg`);
        }
      }
    }
  }
  
  // 4. Final filtreleme - sadece "product" içeren görseller
  const productImages = Array.from(images).filter(url => {
    if (!url || url.length === 0) return false;
    
    const lowerUrl = url.toLowerCase();
    
    // Hariç tutulacaklar
    const exclude = ['footer', 'header', 'logo', 'icon', 'banner', 'badge', 'energy', 'certificate', 'payment', 'social', 'static', 'ui', 'sprite', 'button', 'arrow', 'star', 'web/production'];
    if (exclude.some(pattern => lowerUrl.includes(pattern))) return false;
    
    // Sadece "product" içeren yollar
    return url.includes('/product/');
  });
  
  console.log(`🖼️ ${productImages.length} ürün görseli çıkarıldı`);
  return productImages;
}