import axios from 'axios';
import * as cheerio from 'cheerio';

interface ProductImage {
  url: string;
  position: number;
  type: 'main' | 'variant' | 'color' | 'detail';
  colorVariant?: string;
  sizeVariant?: string;
  quality: 'high' | 'medium' | 'low';
}

export async function extractAllProductImages(url: string): Promise<ProductImage[]> {
  console.log('🖼️ TÜM ürün görsellerini çıkarma başlıyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  const allImages: ProductImage[] = [];
  
  console.log(`📄 HTML analizi: ${Math.round(html.length / 1024)}KB`);
  
  // Method 1: CDN görsellerini regex ile toplu çıkar
  const cdnImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  console.log(`🔍 CDN'den bulunan toplam görsel: ${cdnImages.length}`);
  
  // CDN görsellerini kategorize et
  const categorizedImages = new Map<string, ProductImage[]>();
  
  cdnImages.forEach((imageUrl, index) => {
    const image: ProductImage = {
      url: imageUrl,
      position: index + 1,
      type: 'main',
      quality: 'high'
    };
    
    // Görsel türünü belirle
    if (imageUrl.includes('_org_zoom.jpg')) {
      image.quality = 'high';
      image.type = 'main';
    } else if (imageUrl.includes('_thumb.jpg')) {
      image.quality = 'low';
      image.type = 'variant';
    } else if (imageUrl.includes('_medium.jpg')) {
      image.quality = 'medium';
      image.type = 'detail';
    }
    
    // Renk varyantını URL'den tespit et
    const colorMatch = imageUrl.match(/\/(\d{9})\/(\d{9})\//);
    if (colorMatch) {
      const imageId = `${colorMatch[1]}/${colorMatch[2]}`;
      if (!categorizedImages.has(imageId)) {
        categorizedImages.set(imageId, []);
      }
      categorizedImages.get(imageId)?.push(image);
    } else {
      allImages.push(image);
    }
  });
  
  // Method 2: Renk seçici görsellerini DOM'dan çıkar
  const colorVariantImages = $('.pr-in-dt-cl img, .color-variant img, [data-testid="product-color"] img');
  console.log(`🎨 Renk varyant görselleri: ${colorVariantImages.length}`);
  
  colorVariantImages.each((index, img) => {
    const $img = $(img);
    const src = $img.attr('src') || $img.attr('data-src') || '';
    const alt = $img.attr('alt') || '';
    
    if (src && src.includes('cdn.dsmcdn.com')) {
      // Yüksek kalite versiyonunu oluştur
      const highQualityUrl = src.replace(/\/(small|medium|thumb)\//, '/').replace(/\.(jpg|jpeg)$/, '_org_zoom.jpg');
      
      allImages.push({
        url: highQualityUrl,
        position: allImages.length + 1,
        type: 'color',
        colorVariant: alt || `Renk ${index + 1}`,
        quality: 'high'
      });
    }
  });
  
  // Method 3: Ana görsel galerisinden çıkar
  const galleryImages = $('.product-gallery img, .gallery-item img, .slider-item img, [data-testid="product-image"] img');
  console.log(`🖼️ Galeri görselleri: ${galleryImages.length}`);
  
  galleryImages.each((index, img) => {
    const $img = $(img);
    const src = $img.attr('src') || $img.attr('data-src') || '';
    
    if (src && src.includes('cdn.dsmcdn.com')) {
      const highQualityUrl = src.replace(/\/(small|medium|thumb)\//, '/').replace(/\.(jpg|jpeg)$/, '_org_zoom.jpg');
      
      // Tekrar kontrol et
      const exists = allImages.find(img => img.url === highQualityUrl);
      if (!exists) {
        allImages.push({
          url: highQualityUrl,
          position: allImages.length + 1,
          type: 'main',
          quality: 'high'
        });
      }
    }
  });
  
  // Kategorize edilmiş görselleri ana listeye ekle
  categorizedImages.forEach((images, imageId) => {
    images.forEach(img => {
      const exists = allImages.find(existing => existing.url === img.url);
      if (!exists) {
        allImages.push(img);
      }
    });
  });
  
  // Method 4: Script içinde gömülü görsel URL'lerini ara
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // Görsel array'lerini ara
    const imageArrayMatches = scriptContent.match(/"images":\s*\[([\s\S]*?)\]/g);
    if (imageArrayMatches) {
      imageArrayMatches.forEach(match => {
        const urls = match.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
        urls.forEach(url => {
          const exists = allImages.find(img => img.url === url);
          if (!exists) {
            allImages.push({
              url: url,
              position: allImages.length + 1,
              type: 'detail',
              quality: url.includes('_org_zoom.jpg') ? 'high' : 'medium'
            });
          }
        });
      });
    }
  });
  
  // Görselleri kaliteye göre sırala ve pozisyon numaralarını güncelle
  const sortedImages = allImages
    .filter(img => img.url && img.url.includes('cdn.dsmcdn.com'))
    .sort((a, b) => {
      // Önce kaliteye göre sırala (high > medium > low)
      const qualityOrder = { high: 3, medium: 2, low: 1 };
      if (qualityOrder[a.quality] !== qualityOrder[b.quality]) {
        return qualityOrder[b.quality] - qualityOrder[a.quality];
      }
      // Sonra türe göre sırala (main > color > detail > variant)
      const typeOrder = { main: 4, color: 3, detail: 2, variant: 1 };
      return typeOrder[b.type] - typeOrder[a.type];
    })
    .map((img, index) => ({
      ...img,
      position: index + 1
    }));
  
  // Tekrar edenleri temizle
  const uniqueImages = [];
  const seen = new Set();
  
  for (const img of sortedImages) {
    if (!seen.has(img.url)) {
      seen.add(img.url);
      uniqueImages.push(img);
    }
  }
  
  console.log(`✅ Toplam benzersiz görsel çıkarıldı: ${uniqueImages.length}`);
  console.log(`📊 Görsel dağılımı:`);
  console.log(`  - Yüksek kalite: ${uniqueImages.filter(img => img.quality === 'high').length}`);
  console.log(`  - Orta kalite: ${uniqueImages.filter(img => img.quality === 'medium').length}`);
  console.log(`  - Düşük kalite: ${uniqueImages.filter(img => img.quality === 'low').length}`);
  
  console.log(`📊 Görsel türleri:`);
  console.log(`  - Ana görsel: ${uniqueImages.filter(img => img.type === 'main').length}`);
  console.log(`  - Renk varyantı: ${uniqueImages.filter(img => img.type === 'color').length}`);
  console.log(`  - Detay görseli: ${uniqueImages.filter(img => img.type === 'detail').length}`);
  console.log(`  - Varyant görseli: ${uniqueImages.filter(img => img.type === 'variant').length}`);
  
  return uniqueImages;
}

export function generateImageCSV(images: ProductImage[], productTitle: string): string {
  console.log(`📄 ${images.length} görsel için CSV oluşturuluyor...`);
  
  const headers = [
    'Position',
    'Image URL',
    'Type',
    'Quality',
    'Color Variant',
    'Alt Text',
    'File Size Estimate'
  ];
  
  const rows = images.map(img => [
    img.position.toString(),
    img.url,
    img.type,
    img.quality,
    img.colorVariant || '',
    `${productTitle} - ${img.type} ${img.position}`,
    img.quality === 'high' ? 'Large (>500KB)' : img.quality === 'medium' ? 'Medium (200-500KB)' : 'Small (<200KB)'
  ]);
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
  
  console.log(`✅ Görsel CSV oluşturuldu: ${rows.length} satır`);
  return csvContent;
}