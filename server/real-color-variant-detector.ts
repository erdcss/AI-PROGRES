import axios from 'axios';
import * as cheerio from 'cheerio';

interface RealColorVariant {
  color: string;
  colorCode: string;
  images: string[];
  available: boolean;
  priceModifier?: number;
}

export async function detectRealColorVariants(url: string): Promise<RealColorVariant[]> {
  console.log('🎨 Gerçek renk varyantları tespit ediliyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  
  console.log(`📄 HTML analiz ediliyor: ${Math.round(html.length / 1024)}KB`);
  
  // Method 1: Trendyol renk seçici butonlarını ara
  const colorSelectors = [
    '.pr-in-dt-cl', // Ana renk seçici
    '.slicing-attributes .color', // Seçenekler
    '[data-testid="product-color"]', // Test ID
    '.product-detail-color', // Ürün detay rengi
    '.color-variant', // Renk varyant
    '.variant-option.color' // Varyant seçenek
  ];
  
  const realColors: RealColorVariant[] = [];
  
  // HTML'de aktif renk seçicilerini ara
  for (const selector of colorSelectors) {
    const colorElements = $(selector);
    if (colorElements.length > 0) {
      console.log(`✅ ${selector} seçicisinde ${colorElements.length} renk elementi bulundu`);
      
      colorElements.each((index, element) => {
        const $element = $(element);
        const colorName = $element.attr('title') || $element.attr('data-color') || $element.text().trim();
        const colorCode = $element.attr('data-color-code') || $element.attr('data-value');
        
        if (colorName && colorName.length > 1) {
          realColors.push({
            color: colorName,
            colorCode: colorCode || 'unknown',
            images: [],
            available: !$element.hasClass('disabled')
          });
          console.log(`🎨 Gerçek renk bulundu: ${colorName} (${colorCode})`);
        }
      });
      
      if (realColors.length > 0) break; // İlk başarılı metod yeterli
    }
  }
  
  // Method 2: Script içindeki variants array'ini ara
  if (realColors.length === 0) {
    console.log('🔍 Script içinde variant datası aranıyor...');
    
    const scriptMatches = html.match(/"variants":\s*\[(.*?)\]/s);
    if (scriptMatches) {
      try {
        const variantsStr = scriptMatches[0];
        console.log(`📊 Variants script bulundu: ${variantsStr.length} karakter`);
        
        // Renk bilgilerini çıkar
        const colorMatches = variantsStr.match(/"color":\s*"([^"]+)"/g);
        if (colorMatches) {
          const uniqueColors = [...new Set(colorMatches.map(match => {
            const color = match.match(/"color":\s*"([^"]+)"/);
            return color ? color[1] : null;
          }).filter(Boolean))];
          
          uniqueColors.forEach(color => {
            if (color && color.length > 1 && !color.includes('#')) {
              realColors.push({
                color: color,
                colorCode: 'script-detected',
                images: [],
                available: true
              });
              console.log(`📊 Script'ten renk: ${color}`);
            }
          });
        }
      } catch (error) {
        console.log('⚠️ Script parsing hatası:', error);
      }
    }
  }
  
  // Method 3: JSON-LD structured data kontrolü
  if (realColors.length === 0) {
    console.log('🔍 JSON-LD structured data kontrol ediliyor...');
    
    const jsonLdScripts = $('script[type="application/ld+json"]');
    jsonLdScripts.each((index, script) => {
      try {
        const jsonData = JSON.parse($(script).html() || '{}');
        
        // Varyant renklerini ara
        if (jsonData.hasVariant || jsonData['@graph']) {
          const variants = jsonData.hasVariant || jsonData['@graph'];
          if (Array.isArray(variants)) {
            variants.forEach((variant: any) => {
              if (variant.color || variant.name) {
                const colorName = variant.color || variant.name;
                if (typeof colorName === 'string' && colorName.length > 1 && !colorName.includes('#')) {
                  realColors.push({
                    color: colorName,
                    colorCode: 'jsonld-detected',
                    images: [],
                    available: true
                  });
                  console.log(`📋 JSON-LD'den renk: ${colorName}`);
                }
              }
            });
          }
        }
      } catch (error) {
        // JSON parse hatası - devam et
      }
    });
  }
  
  // Method 4: HTML title ve alt text analizi
  if (realColors.length === 0) {
    console.log('🔍 IMG title/alt analizi yapılıyor...');
    
    const images = $('img[title*="renk"], img[alt*="renk"], img[title*="color"], img[alt*="color"]');
    images.each((index, img) => {
      const title = $(img).attr('title') || $(img).attr('alt') || '';
      const colorMatch = title.match(/(\w+)\s*(renk|color)/i);
      if (colorMatch && colorMatch[1]) {
        const colorName = colorMatch[1];
        if (colorName.length > 2) {
          realColors.push({
            color: colorName,
            colorCode: 'img-detected',
            images: [$(img).attr('src') || ''],
            available: true
          });
          console.log(`🖼️ IMG'den renk: ${colorName}`);
        }
      }
    });
  }
  
  // Renkleri temizle ve doğrula
  const validColors = realColors.filter(color => {
    // Sahte renkleri filtrele
    const invalid = [
      '#', 'rgb', 'hex', 'color', 'renk', 'variant', 'option',
      'undefined', 'null', 'empty', 'default', 'main'
    ];
    
    return !invalid.some(invalid => 
      color.color.toLowerCase().includes(invalid.toLowerCase())
    ) && color.color.length > 1;
  });
  
  // Tekrar edenleri temizle
  const uniqueColors = validColors.reduce((acc: RealColorVariant[], current) => {
    const exists = acc.find(color => 
      color.color.toLowerCase() === current.color.toLowerCase()
    );
    if (!exists) {
      acc.push(current);
    }
    return acc;
  }, []);
  
  console.log(`🎯 Gerçek renk varyantı tespit edildi: ${uniqueColors.length}`);
  uniqueColors.forEach((color, index) => {
    console.log(`  ${index + 1}. ${color.color} (${color.available ? 'Mevcut' : 'Tükendi'})`);
  });
  
  return uniqueColors;
}

export async function getColorSpecificImages(url: string, colorVariants: RealColorVariant[]): Promise<RealColorVariant[]> {
  console.log('🖼️ Renk-spesifik görseller aranıyor...');
  
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  
  const html = response.data;
  const allImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  
  console.log(`📸 Toplam CDN görsel: ${allImages.length}`);
  
  // Her renk için image pattern analizi
  const updatedVariants = colorVariants.map(variant => {
    // Renk adına göre görsel ara
    const colorKeywords = [
      variant.color.toLowerCase(),
      variant.color.toLowerCase().replace(/ı/g, 'i'),
      variant.color.toLowerCase().replace(/ş/g, 's'),
      variant.color.toLowerCase().replace(/ğ/g, 'g'),
      variant.color.toLowerCase().replace(/ü/g, 'u'),
      variant.color.toLowerCase().replace(/ö/g, 'o'),
      variant.color.toLowerCase().replace(/ç/g, 'c')
    ];
    
    // Bu renk için uygun görselleri filtrele
    const colorImages = allImages.filter(img => {
      // Image ID pattern'lerini kontrol et
      const imageId = img.match(/\/(\d{9})\/(\d{9})\//);
      if (imageId) {
        // Bu ID'nin hangi renge ait olduğunu kontrol et
        const idStr = `${imageId[1]}/${imageId[2]}`;
        
        // HTML'de bu ID'nin hangi renk ile ilişkili olduğunu ara
        const idContext = html.indexOf(idStr);
        if (idContext > -1) {
          const contextText = html.substring(idContext - 200, idContext + 200);
          return colorKeywords.some(keyword => 
            contextText.toLowerCase().includes(keyword)
          );
        }
      }
      
      return false;
    });
    
    // Yüksek kaliteli görseleri seç
    const highQualityImages = colorImages
      .filter(img => img.includes('_org_zoom.jpg'))
      .slice(0, 3);
    
    console.log(`🎨 ${variant.color}: ${highQualityImages.length} görsel bulundu`);
    
    return {
      ...variant,
      images: highQualityImages
    };
  });
  
  return updatedVariants;
}