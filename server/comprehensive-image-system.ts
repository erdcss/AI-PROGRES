import axios from 'axios';
import * as cheerio from 'cheerio';

interface ComprehensiveImage {
  url: string;
  position: number;
  imageId: string;
  groupId: string;
  type: 'main' | 'color_variant' | 'detail' | 'angle';
  quality: 'high' | 'medium' | 'low';
  colorVariant?: string;
  description?: string;
  isUnique: boolean;
}

interface ImageGroup {
  groupId: string;
  colorName?: string;
  imageCount: number;
  images: ComprehensiveImage[];
}

export async function extractComprehensiveImages(url: string): Promise<{
  allImages: ComprehensiveImage[];
  imageGroups: ImageGroup[];
  statistics: any;
}> {
  console.log('🎯 KOMPREHANSİF görsel çıkarma sistemi başlıyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  
  console.log(`📄 HTML analizi: ${Math.round(html.length / 1024)}KB`);
  
  // Tüm CDN görsellerini çıkar
  const cdnImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  console.log(`🔍 Toplam CDN görsel bulundu: ${cdnImages.length}`);
  
  const allImages: ComprehensiveImage[] = [];
  const imageGroups = new Map<string, ImageGroup>();
  
  // Her görseli analiz et ve kategorize et
  cdnImages.forEach((imageUrl, index) => {
    // Görsel ID'sini çıkar
    const match = imageUrl.match(/\/(\d{9})\/(\d{9})\/(\d+)/);
    if (!match) return;
    
    const [, productId, variantId, imageNumber] = match;
    const imageId = `${productId}/${variantId}/${imageNumber}`;
    const groupId = `${productId}/${variantId}`;
    
    // Görsel kalitesini belirle
    let quality: 'high' | 'medium' | 'low' = 'medium';
    if (imageUrl.includes('_org_zoom.jpg')) {
      quality = 'high';
    } else if (imageUrl.includes('_thumb.jpg') || imageUrl.includes('/thumb/')) {
      quality = 'low';
    }
    
    // Görsel türünü belirle
    let type: 'main' | 'color_variant' | 'detail' | 'angle' = 'main';
    const imageNum = parseInt(imageNumber);
    if (imageNum === 1) {
      type = 'main';
    } else if (imageNum <= 3) {
      type = 'color_variant';
    } else {
      type = 'detail';
    }
    
    const image: ComprehensiveImage = {
      url: imageUrl,
      position: index + 1,
      imageId,
      groupId,
      type,
      quality,
      description: `Görsel ${imageNumber}`,
      isUnique: true
    };
    
    allImages.push(image);
    
    // Grup oluştur veya güncelle
    if (!imageGroups.has(groupId)) {
      imageGroups.set(groupId, {
        groupId,
        imageCount: 0,
        images: []
      });
    }
    
    const group = imageGroups.get(groupId)!;
    group.images.push(image);
    group.imageCount = group.images.length;
  });
  
  console.log(`🎨 ${imageGroups.size} görsel grubu oluşturuldu`);
  
  // Renk varyantlarını tespit et
  await detectColorVariants(imageGroups, url);
  
  // Tekrar edenleri temizle ve sırala
  const uniqueImages = removeDuplicatesAndSort(allImages);
  
  // İstatistikler
  const statistics = {
    totalImages: uniqueImages.length,
    totalGroups: imageGroups.size,
    qualityDistribution: {
      high: uniqueImages.filter(img => img.quality === 'high').length,
      medium: uniqueImages.filter(img => img.quality === 'medium').length,
      low: uniqueImages.filter(img => img.quality === 'low').length
    },
    typeDistribution: {
      main: uniqueImages.filter(img => img.type === 'main').length,
      colorVariant: uniqueImages.filter(img => img.type === 'color_variant').length,
      detail: uniqueImages.filter(img => img.type === 'detail').length,
      angle: uniqueImages.filter(img => img.type === 'angle').length
    }
  };
  
  console.log(`✅ Komprehansif görsel çıkarma tamamlandı:`);
  console.log(`  📸 Toplam görsel: ${statistics.totalImages}`);
  console.log(`  🎨 Görsel grupları: ${statistics.totalGroups}`);
  console.log(`  🔍 Yüksek kalite: ${statistics.qualityDistribution.high}`);
  
  return {
    allImages: uniqueImages,
    imageGroups: Array.from(imageGroups.values()),
    statistics
  };
}

async function detectColorVariants(imageGroups: Map<string, ImageGroup>, url: string) {
  console.log('🎨 Renk varyantları tespit ediliyor...');
  
  // URL'den renk bilgisi çıkar
  const urlColorMatch = url.match(/(turuncu|sari|mavi|mor|siyah|beyaz|pembe|yesil|lacivert|bordo)/i);
  if (urlColorMatch) {
    const mainColor = urlColorMatch[1].charAt(0).toUpperCase() + urlColorMatch[1].slice(1);
    console.log(`🔗 URL'den tespit edilen ana renk: ${mainColor}`);
    
    // İlk grubu ana renk olarak ata
    const firstGroup = Array.from(imageGroups.values())[0];
    if (firstGroup) {
      firstGroup.colorName = mainColor;
      firstGroup.images.forEach(img => {
        img.colorVariant = mainColor;
      });
    }
  }
  
  // Diğer grupları "Varyant" olarak ata
  let variantIndex = 1;
  imageGroups.forEach(group => {
    if (!group.colorName) {
      group.colorName = `Varyant ${variantIndex}`;
      group.images.forEach(img => {
        img.colorVariant = group.colorName;
      });
      variantIndex++;
    }
  });
}

function removeDuplicatesAndSort(images: ComprehensiveImage[]): ComprehensiveImage[] {
  const seen = new Set<string>();
  const uniqueImages: ComprehensiveImage[] = [];
  
  // Önce kaliteye göre sırala
  const sortedImages = images.sort((a, b) => {
    const qualityOrder = { high: 3, medium: 2, low: 1 };
    if (qualityOrder[a.quality] !== qualityOrder[b.quality]) {
      return qualityOrder[b.quality] - qualityOrder[a.quality];
    }
    
    const typeOrder = { main: 4, color_variant: 3, detail: 2, angle: 1 };
    return typeOrder[b.type] - typeOrder[a.type];
  });
  
  // Tekrar edenleri temizle
  sortedImages.forEach((image, index) => {
    if (!seen.has(image.url)) {
      seen.add(image.url);
      image.position = uniqueImages.length + 1;
      uniqueImages.push(image);
    }
  });
  
  return uniqueImages;
}

export function generateComprehensiveImageCSV(
  allImages: ComprehensiveImage[],
  imageGroups: ImageGroup[],
  productTitle: string
): string {
  console.log(`📄 ${allImages.length} görsel için komprehansif CSV oluşturuluyor...`);
  
  const headers = [
    'Position',
    'Image URL',
    'Group ID',
    'Image ID',
    'Type',
    'Quality',
    'Color Variant',
    'Description',
    'Alt Text',
    'Group Size',
    'Is Main Image'
  ];
  
  const rows = allImages.map(img => {
    const group = imageGroups.find(g => g.groupId === img.groupId);
    
    return [
      img.position.toString(),
      img.url,
      img.groupId,
      img.imageId,
      img.type,
      img.quality,
      img.colorVariant || '',
      img.description || '',
      `${productTitle} - ${img.colorVariant || 'Varyant'} - ${img.description}`,
      group ? group.imageCount.toString() : '1',
      img.type === 'main' ? 'YES' : 'NO'
    ];
  });
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
  
  console.log(`✅ Komprehansif CSV oluşturuldu: ${rows.length} satır`);
  return csvContent;
}

export function generateImageGroupSummary(imageGroups: ImageGroup[]): string {
  console.log('📊 Görsel grup özeti oluşturuluyor...');
  
  let summary = `GÖRSEL GRUP ÖZETİ\n`;
  summary += `=================\n\n`;
  
  imageGroups.forEach((group, index) => {
    summary += `Grup ${index + 1}: ${group.colorName || group.groupId}\n`;
    summary += `  - Görsel sayısı: ${group.imageCount}\n`;
    summary += `  - Grup ID: ${group.groupId}\n`;
    
    group.images.forEach((img, imgIndex) => {
      summary += `    ${imgIndex + 1}. ${img.type} (${img.quality}) - ${img.description}\n`;
    });
    
    summary += `\n`;
  });
  
  return summary;
}