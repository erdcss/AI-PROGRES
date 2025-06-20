export function extractAllImages(htmlContent: string): string[] {
  const allImages = new Set<string>();
  
  // 1. Temel görsel çıkarma
  const imgMatches = htmlContent.match(/<img[^>]+src="([^"]+)"/g);
  imgMatches?.forEach(match => {
    const srcMatch = match.match(/src="([^"]+)"/);
    if (srcMatch) {
      allImages.add(srcMatch[1]);
    }
  });
  
  // 2. İlk filtreleme - sadece orijinal ürün görselleri
  const originalProductImages = Array.from(allImages).filter(url => {
    if (!url) return false;
    
    // Sadece orijinal ty yolları, resize yok  
    const isOriginal = /^https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/prod\/(PIM|QC)\/\d{8}\/\d{2}\/[a-f0-9-]+\/\d+(_org_zoom)?\.jpg$/.test(url);
    
    return isOriginal;
  });
  
  // 3. Orijinal görsellerden varyantlar üret
  const finalImages = new Set<string>();
  
  if (originalProductImages.length > 0) {
    const firstImage = originalProductImages[0];
    const hashMatch = firstImage.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/);
    
    if (hashMatch) {
      const basePath = firstImage.replace(/\/\d+(_org_zoom)?\.jpg$/, '');
      
      // Sadece orijinal yolda varyantlar üret
      for (let i = 1; i <= 8; i++) {
        finalImages.add(`${basePath}/${i}_org_zoom.jpg`);
        finalImages.add(`${basePath}/${i}.jpg`);
      }
    }
  }
  
  // 4. Mevcut orijinal görselleri de ekle
  originalProductImages.forEach(img => finalImages.add(img));
  
  // 5. Son filtreleme - sadece orijinal ürün görselleri
  const cleanedImages = Array.from(finalImages).filter(url => {
    // Kesin orijinal ürün görseli kontrolü - resize yok
    return /^https:\/\/cdn\.dsmcdn\.com\/ty\d+\/product\/media\/images\/prod\/(PIM|QC)\/\d{8}\/\d{2}\/[a-f0-9-]+\/\d+(_org_zoom)?\.jpg$/.test(url);
  });
  
  console.log(`🖼️ ${cleanedImages.length} ürün görseli çıkarıldı`);
  return cleanedImages;
}