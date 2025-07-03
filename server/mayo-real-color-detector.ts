import axios from 'axios';
import * as cheerio from 'cheerio';

interface MayoRealColor {
  color: string;
  colorCode: string;
  images: string[];
  available: boolean;
  price: number;
  originalPrice: number;
  sizes: string[];
}

export async function detectMayoRealColors(url: string): Promise<MayoRealColor[]> {
  console.log('🎨 GERÇEK mayo renk tespiti başlıyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  
  console.log(`📄 HTML analiz: ${Math.round(html.length / 1024)}KB`);
  
  // Method 1: Trendyol renk butonlarını tespit et
  const colorButtons = $('.pr-in-dt-cl, .color-variant, [data-testid="product-color"]');
  const realColors: MayoRealColor[] = [];
  
  if (colorButtons.length > 0) {
    console.log(`🔍 ${colorButtons.length} renk butonu bulundu`);
    
    colorButtons.each((i, button) => {
      const $btn = $(button);
      const colorName = $btn.attr('title') || $btn.attr('data-color') || $btn.text().trim();
      const isAvailable = !$btn.hasClass('disabled') && !$btn.hasClass('unavailable');
      
      if (colorName && colorName.length > 1) {
        realColors.push({
          color: colorName,
          colorCode: 'button-detected',
          images: [],
          available: isAvailable,
          price: 747, // Will be updated
          originalPrice: 650,
          sizes: isAvailable ? ['38', '40'] : []
        });
        console.log(`✅ Renk butonu: ${colorName} (${isAvailable ? 'Mevcut' : 'Tükendi'})`);
      }
    });
  }
  
  // Method 2: Script içinde gerçek varyantları ara
  if (realColors.length === 0) {
    console.log('🔍 Script içinde variants aranıyor...');
    
    const scriptTags = $('script').toArray();
    for (const script of scriptTags) {
      const scriptContent = $(script).html() || '';
      
      // "variants" array'ini bul
      const variantMatch = scriptContent.match(/"variants":\s*\[([\s\S]*?)\]/);
      if (variantMatch) {
        console.log('📊 Variants array bulundu');
        
        try {
          // Her variant objesini parse et
          const variantObjects = variantMatch[1].match(/\{[^}]*\}/g) || [];
          const uniqueColors = new Set<string>();
          
          variantObjects.forEach(variantStr => {
            try {
              const variant = JSON.parse(variantStr);
              if (variant.color && typeof variant.color === 'string') {
                uniqueColors.add(variant.color);
              }
            } catch (e) {
              // Parse error, skip
            }
          });
          
          Array.from(uniqueColors).forEach(color => {
            if (color.length > 1 && !color.includes('#') && !color.includes('rgb')) {
              realColors.push({
                color: color,
                colorCode: 'script-detected',
                images: [],
                available: true,
                price: 747,
                originalPrice: 650,
                sizes: ['38', '40']
              });
              console.log(`📊 Script color: ${color}`);
            }
          });
          
        } catch (error) {
          console.log('⚠️ Variants parsing error:', error);
        }
        
        break; // İlk variants array yeterli
      }
    }
  }
  
  // Method 3: JSON-LD structured data
  if (realColors.length === 0) {
    console.log('🔍 JSON-LD structured data kontrol...');
    
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((i, script) => {
      try {
        const jsonData = JSON.parse($(script).html() || '{}');
        
        if (jsonData.color) {
          const colors = Array.isArray(jsonData.color) ? jsonData.color : [jsonData.color];
          colors.forEach((color: string) => {
            if (typeof color === 'string' && color.length > 1) {
              realColors.push({
                color: color,
                colorCode: 'jsonld-detected',
                images: [],
                available: true,
                price: 747,
                originalPrice: 650,
                sizes: ['38', '40']
              });
              console.log(`📋 JSON-LD color: ${color}`);
            }
          });
        }
      } catch (error) {
        // JSON parse error, continue
      }
    });
  }
  
  // Fallback: Eğer hiç renk bulunamadıysa, URL'den rengi tespit et
  if (realColors.length === 0) {
    console.log('🔍 URL den renk tespit ediliyor...');
    
    const urlColorMatch = url.match(/(turuncu|sari|mavi|mor|siyah|beyaz|pembe|yesil|lacivert|bordo)/i);
    if (urlColorMatch) {
      const urlColor = urlColorMatch[1];
      realColors.push({
        color: urlColor.charAt(0).toUpperCase() + urlColor.slice(1),
        colorCode: 'url-detected',
        images: [],
        available: true,
        price: 747,
        originalPrice: 650,
        sizes: ['38', '40']
      });
      console.log(`🔗 URL den renk: ${urlColor}`);
    }
  }
  
  // Tekrar edenleri temizle
  const uniqueColors = realColors.reduce((acc: MayoRealColor[], current) => {
    const exists = acc.find(color => 
      color.color.toLowerCase() === current.color.toLowerCase()
    );
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);
  
  console.log(`🎯 GERÇEK tespit edilen renkler: ${uniqueColors.length}`);
  uniqueColors.forEach((color, index) => {
    console.log(`  ${index + 1}. ${color.color} (${color.available ? 'Mevcut' : 'Tükendi'})`);
  });
  
  return uniqueColors;
}

export async function assignColorsToImages(colors: MayoRealColor[], url: string): Promise<MayoRealColor[]> {
  console.log('🖼️ Renklere özel görseller atanıyor...');
  
  const response = await axios.get(url);
  const html = response.data;
  
  // Tüm CDN görsellerini bul
  const allImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  console.log(`📸 Toplam CDN görsel: ${allImages.length}`);
  
  // Görsel gruplarını oluştur (image ID'lerine göre)
  const imageGroups = new Map<string, string[]>();
  
  allImages.forEach((img: string) => {
    const match = img.match(/\/(\d{9})\/(\d{9})\//);
    if (match) {
      const imageId = `${match[1]}/${match[2]}`;
      if (!imageGroups.has(imageId)) {
        imageGroups.set(imageId, []);
      }
      if (img.includes('_org_zoom.jpg')) {
        imageGroups.get(imageId)?.push(img);
      }
    }
  });
  
  console.log(`🎨 Görsel grupları: ${imageGroups.size}`);
  
  // Her renk için görselleri dağıt
  const updatedColors = colors.map((color, index) => {
    const availableGroups = Array.from(imageGroups.keys());
    
    if (availableGroups.length > index) {
      const assignedGroupKey = availableGroups[index];
      const groupImages = imageGroups.get(assignedGroupKey) || [];
      
      console.log(`🎨 ${color.color}: ${groupImages.length} görsel atandı`);
      
      return {
        ...color,
        images: groupImages.slice(0, 3) // Max 3 görsel per renk
      };
    } else {
      // Kalan renkler için genel görsel havuzundan al
      const fallbackImages = Array.from(imageGroups.values()).flat().slice(0, 2);
      console.log(`🔄 ${color.color}: ${fallbackImages.length} fallback görsel`);
      
      return {
        ...color,
        images: fallbackImages
      };
    }
  });
  
  return updatedColors;
}