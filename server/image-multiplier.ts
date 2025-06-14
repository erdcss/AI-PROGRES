/**
 * Görsel Çoğaltıcı
 * Mevcut görselleri kullanarak farklı boyut ve kalite varyasyonları oluşturur
 */

/**
 * Tek bir görsel URL'sinden birden fazla varyasyon oluşturur
 */
function createImageVariations(baseUrl: string): string[] {
  const variations: string[] = [baseUrl]; // Orijinal URL'yi de dahil et
  
  // Farklı boyut kombinasyonları
  const sizeCombinations = [
    { width: 1200, height: 1800 },
    { width: 800, height: 1200 },
    { width: 600, height: 900 },
    { width: 400, height: 600 },
    { width: 1080, height: 1620 },
    { width: 720, height: 1080 },
    { width: 500, height: 750 },
    { width: 300, height: 450 }
  ];
  
  // Farklı resize parametreleri
  const resizeParams = [
    'mnresize/1200',
    'mnresize/800',
    'mnresize/600',
    'mnresize/400',
    'crop/1200',
    'crop/800',
    'org_zoom'
  ];
  
  // Kalite parametreleri
  const qualityParams = ['95', '90', '85', '80'];
  
  try {
    // Boyut varyasyonları
    sizeCombinations.forEach(size => {
      let sizeVariation = baseUrl.replace(/\/\d+\/\d+\//, `/${size.width}/${size.height}/`);
      if (!variations.includes(sizeVariation)) {
        variations.push(sizeVariation);
      }
    });
    
    // Resize parametreli varyasyonlar
    resizeParams.forEach(param => {
      let resizeVariation = baseUrl;
      
      // Mevcut resize parametresini değiştir veya ekle
      if (resizeVariation.includes('mnresize/')) {
        resizeVariation = resizeVariation.replace(/mnresize\/\d+/, param);
      } else if (resizeVariation.includes('crop/')) {
        resizeVariation = resizeVariation.replace(/crop\/\d+/, param);
      } else if (resizeVariation.includes('org_zoom')) {
        resizeVariation = resizeVariation.replace('org_zoom', param);
      } else {
        // Yeni parametre ekle
        const urlParts = resizeVariation.split('/');
        if (urlParts.length >= 6) {
          urlParts.splice(5, 0, param);
          resizeVariation = urlParts.join('/');
        }
      }
      
      if (!variations.includes(resizeVariation)) {
        variations.push(resizeVariation);
      }
    });
    
    // Kalite parametreli varyasyonlar
    qualityParams.forEach(quality => {
      variations.slice().forEach(variation => {
        let qualityVariation = variation;
        
        if (qualityVariation.includes('quality/')) {
          qualityVariation = qualityVariation.replace(/quality\/\d+/, `quality/${quality}`);
        } else {
          // Quality parametresi ekle
          if (qualityVariation.includes('?')) {
            qualityVariation += `&quality=${quality}`;
          } else {
            qualityVariation += `?quality=${quality}`;
          }
        }
        
        if (!variations.includes(qualityVariation)) {
          variations.push(qualityVariation);
        }
      });
    });
    
    // WebP format varyasyonları
    variations.slice().forEach(variation => {
      if (variation.includes('.jpg') || variation.includes('.jpeg')) {
        const webpVariation = variation.replace(/\.(jpg|jpeg)/, '.webp');
        if (!variations.includes(webpVariation)) {
          variations.push(webpVariation);
        }
      }
    });
    
  } catch (error) {
    console.error('Görsel varyasyon oluşturma hatası:', error);
  }
  
  return variations;
}

/**
 * Görsel URL'lerini çoğaltır ve optimize eder
 */
export function multiplyImages(originalImages: string[]): string[] {
  const allImages: string[] = [];
  
  console.log(`${originalImages.length} orijinal görsel için varyasyonlar oluşturuluyor...`);
  
  originalImages.forEach((imageUrl, index) => {
    console.log(`Görsel ${index + 1} için varyasyonlar oluşturuluyor: ${imageUrl}`);
    
    const variations = createImageVariations(imageUrl);
    allImages.push(...variations);
    
    console.log(`Görsel ${index + 1} için ${variations.length} varyasyon oluşturuldu`);
  });
  
  // Tekrarları kaldır
  const uniqueImages = Array.from(new Set(allImages));
  
  // Kalite skoruna göre sırala
  const sortedImages = uniqueImages.sort((a, b) => {
    return getImageQualityScore(b) - getImageQualityScore(a);
  });
  
  console.log(`Toplam ${sortedImages.length} benzersiz görsel varyasyonu oluşturuldu`);
  
  return sortedImages;
}

/**
 * Görsel kalite skorunu hesaplar
 */
function getImageQualityScore(url: string): number {
  let score = 0;
  
  // Boyut skorları (büyük boyutlar daha yüksek skor)
  if (url.includes('1200') && url.includes('1800')) score += 20;
  else if (url.includes('1200')) score += 15;
  else if (url.includes('1080')) score += 12;
  else if (url.includes('800')) score += 10;
  else if (url.includes('600')) score += 8;
  else if (url.includes('400')) score += 5;
  
  // Özel parametreler
  if (url.includes('org_zoom')) score += 25;
  if (url.includes('mnresize/1200')) score += 15;
  if (url.includes('mnresize/800')) score += 10;
  if (url.includes('crop/1200')) score += 12;
  
  // Kalite parametreleri
  if (url.includes('quality/95')) score += 10;
  else if (url.includes('quality/90')) score += 8;
  else if (url.includes('quality/85')) score += 6;
  else if (url.includes('quality/80')) score += 4;
  
  // Format skorları
  if (url.includes('.webp')) score += 5;
  else if (url.includes('.jpg') || url.includes('.jpeg')) score += 3;
  else if (url.includes('.png')) score += 2;
  
  // CDN skorları
  if (url.includes('cdn.dsmcdn.com')) score += 3;
  else if (url.includes('cdn.trendyol.com')) score += 2;
  
  return score;
}

/**
 * Görselleri kategorilere ayırır (ana görsel, thumbnail vs.)
 */
export function categorizeImages(images: string[]): {
  main: string[];
  thumbnails: string[];
  highQuality: string[];
  variations: string[];
} {
  const main: string[] = [];
  const thumbnails: string[] = [];
  const highQuality: string[] = [];
  const variations: string[] = [];
  
  images.forEach(img => {
    const score = getImageQualityScore(img);
    
    if (score >= 30) {
      highQuality.push(img);
    } else if (score >= 20) {
      main.push(img);
    } else if (score >= 10) {
      variations.push(img);
    } else {
      thumbnails.push(img);
    }
  });
  
  return { main, thumbnails, highQuality, variations };
}

/**
 * En iyi görselleri seçer
 */
export function selectBestImages(images: string[], maxCount: number = 25): string[] {
  const categorized = categorizeImages(images);
  const selectedImages: string[] = [];
  
  // Önce yüksek kaliteli görselleri ekle
  selectedImages.push(...categorized.highQuality.slice(0, Math.min(10, maxCount)));
  
  // Sonra ana görselleri ekle
  const remaining = maxCount - selectedImages.length;
  if (remaining > 0) {
    selectedImages.push(...categorized.main.slice(0, Math.min(10, remaining)));
  }
  
  // Kalan yerleri varyasyonlarla doldur
  const stillRemaining = maxCount - selectedImages.length;
  if (stillRemaining > 0) {
    selectedImages.push(...categorized.variations.slice(0, stillRemaining));
  }
  
  console.log(`En iyi ${selectedImages.length} görsel seçildi:`);
  console.log(`- Yüksek kalite: ${categorized.highQuality.length}`);
  console.log(`- Ana görseller: ${categorized.main.length}`);
  console.log(`- Varyasyonlar: ${categorized.variations.length}`);
  console.log(`- Thumbnails: ${categorized.thumbnails.length}`);
  
  return selectedImages;
}