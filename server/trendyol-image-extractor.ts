import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface ImageExtractionResult {
  images: string[];
  totalFound: number;
  validImages: string[];
}

export function extractTrendyolImages(html: string): ImageExtractionResult {
  try {
    // Görsel dizisini yakala - Python regex'ini JavaScript'e çevir
    const imageMatch = html.match(/"images":\s*\[(.*?)\]/);
    if (!imageMatch) {
      console.log('⚠️ HTML içinde görsel dizisi bulunamadı');
      return { images: [], totalFound: 0, validImages: [] };
    }

    // Tüm görsel yollarını listele
    const rawImages = imageMatch[1];
    const imagePathMatches = rawImages.match(/"(.*?)"/g);
    
    if (!imagePathMatches) {
      return { images: [], totalFound: 0, validImages: [] };
    }

    // Tam URL oluştur
    const imagePaths = imagePathMatches.map(match => match.replace(/"/g, ''));
    const fullUrls = imagePaths
      .filter(path => path.startsWith('/'))
      .map(path => `https://cdn.dsmcdn.com${path}`);

    // Geçerli görsel URL'lerini filtrele
    const validImages = fullUrls.filter(url => {
      return url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp');
    });

    console.log(`📸 Trendyol görsel çıkarma: ${validImages.length}/${fullUrls.length} geçerli görsel`);
    
    return {
      images: fullUrls,
      totalFound: fullUrls.length,
      validImages
    };

  } catch (error) {
    console.error('❌ Trendyol görsel çıkarma hatası:', error);
    return { images: [], totalFound: 0, validImages: [] };
  }
}

export async function downloadTrendyolImages(imageUrls: string[], productId: string): Promise<string[]> {
  const downloadFolder = path.join(process.cwd(), 'downloads', productId);
  
  try {
    // Klasör oluştur
    fs.mkdirSync(downloadFolder, { recursive: true });
    
    const downloadedFiles: string[] = [];
    
    for (let i = 0; i < Math.min(imageUrls.length, 10); i++) {
      const url = imageUrls[i];
      
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        const extension = url.includes('.webp') ? '.webp' : 
                         url.includes('.png') ? '.png' : '.jpg';
        const filename = path.join(downloadFolder, `image_${i + 1}${extension}`);
        
        fs.writeFileSync(filename, response.data);
        downloadedFiles.push(filename);
        
        console.log(`💾 Görsel kaydedildi: image_${i + 1}${extension}`);
        
      } catch (downloadError) {
        console.error(`❌ Görsel indirme hatası: ${url}`, downloadError);
      }
    }
    
    return downloadedFiles;
    
  } catch (error) {
    console.error('❌ Görsel indirme klasörü hatası:', error);
    return [];
  }
}

export async function extractAndProcessTrendyolImages(html: string, productId: string): Promise<{
  extractedImages: string[];
  downloadedFiles: string[];
  processingSummary: string;
}> {
  // Görselleri çıkar
  const extraction = extractTrendyolImages(html);
  
  // En kaliteli görselleri seç (büyük boyutlu)
  const highQualityImages = extraction.validImages.filter(url => {
    return !url.includes('_xs.') && !url.includes('_s.') && !url.includes('_thumb.');
  });
  
  // Görselleri indir
  const downloadedFiles = await downloadTrendyolImages(
    highQualityImages.slice(0, 8), // İlk 8 yüksek kalite görsel
    productId
  );
  
  const processingSummary = `Toplam ${extraction.totalFound} görsel tespit edildi, ${highQualityImages.length} yüksek kalite, ${downloadedFiles.length} başarıyla indirildi`;
  
  console.log(`📊 ${processingSummary}`);
  
  return {
    extractedImages: highQualityImages,
    downloadedFiles,
    processingSummary
  };
}

export function cleanupImageDownloads(productId: string): void {
  const downloadFolder = path.join(process.cwd(), 'downloads', productId);
  
  try {
    if (fs.existsSync(downloadFolder)) {
      fs.rmSync(downloadFolder, { recursive: true });
      console.log(`🗑️ Görsel klasörü temizlendi: ${productId}`);
    }
  } catch (error) {
    console.error('❌ Görsel klasörü temizleme hatası:', error);
  }
}