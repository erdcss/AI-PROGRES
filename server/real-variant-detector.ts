/**
 * Gerçek Varyant Algılama Sistemi
 * Sadece ürünün gerçek renk/beden seçenekleri varsa varyant üretir
 */

import * as cheerio from 'cheerio';

export interface RealVariantData {
  hasRealVariants: boolean;
  colors: string[];
  sizes: string[];
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
}

export interface FeatureItem {
  key: string;
  value: string;
  category?: string;
}

export function detectRealVariants(html: string, features?: FeatureItem[]): RealVariantData {
  const $ = cheerio.load(html);
  
  let hasRealVariants = false;
  let colors: string[] = [];
  let sizes: string[] = [];
  let variants: Array<{color: string, size: string, inStock: boolean}> = [];

  // 1. Renk seçici butonları arıyoruz
  const colorSelectors = [
    '.variant-list .color-variant',
    '.product-variants .color-option',
    '.variant-color-list .variant-item',
    '[data-variant-type="color"]',
    '.color-picker .color-item',
    '.pr-in-dt-sz-wr .pr-in-dt-cl',
    '.variant-attribute[data-attribute-type="renk"]'
  ];

  colorSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const colorName = $(el).attr('data-color') || 
                       $(el).attr('title') || 
                       $(el).text().trim();
      
      if (colorName && colorName.length > 0 && colorName.length < 20) {
        colors.push(colorName);
        hasRealVariants = true;
      }
    });
  });

  // 2. Beden seçici butonları arıyoruz
  const sizeSelectors = [
    '.variant-list .size-variant',
    '.product-variants .size-option', 
    '.variant-size-list .variant-item',
    '[data-variant-type="size"]',
    '.size-picker .size-item',
    '.pr-in-dt-sz-wr .pr-in-dt-sz',
    '.variant-attribute[data-attribute-type="beden"]'
  ];

  sizeSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const sizeName = $(el).attr('data-size') || 
                      $(el).attr('title') || 
                      $(el).text().trim();
      
      if (sizeName && sizeName.length > 0 && sizeName.length < 10) {
        sizes.push(sizeName);
        hasRealVariants = true;
      }
    });
  });

  // 3. Trendyol özel yapıları kontrol et
  try {
    // Script içindeki varyant verilerini ara
    $('script').each((i, el) => {
      const scriptContent = $(el).html() || '';
      
      // Renk varyantları
      const colorMatches = scriptContent.match(/"color":\s*"([^"]+)"/g);
      if (colorMatches && colorMatches.length > 1) {
        colorMatches.forEach(match => {
          const color = match.match(/"color":\s*"([^"]+)"/)?.[1];
          if (color && !colors.includes(color)) {
            colors.push(color);
            hasRealVariants = true;
          }
        });
      }

      // Beden varyantları
      const sizeMatches = scriptContent.match(/"size":\s*"([^"]+)"/g);
      if (sizeMatches && sizeMatches.length > 1) {
        sizeMatches.forEach(match => {
          const size = match.match(/"size":\s*"([^"]+)"/)?.[1];
          if (size && !sizes.includes(size)) {
            sizes.push(size);
            hasRealVariants = true;
          }
        });
      }

      // Variants array kontrolü
      const variantArrayMatch = scriptContent.match(/"variants":\s*\[([^\]]+)\]/);
      if (variantArrayMatch) {
        const variantContent = variantArrayMatch[1];
        if (variantContent.includes('"color"') || variantContent.includes('"size"')) {
          hasRealVariants = true;
        }
      }
    });
  } catch (error) {
    console.log('Script parsing error:', error);
  }

  // 4. Data attributes kontrol et
  $('[data-color], [data-size], [data-variant]').each((i, el) => {
    const color = $(el).attr('data-color');
    const size = $(el).attr('data-size');
    
    if (color && !colors.includes(color)) {
      colors.push(color);
      hasRealVariants = true;
    }
    
    if (size && !sizes.includes(size)) {
      sizes.push(size);
      hasRealVariants = true;
    }
  });

  // 5. Feature-based variant extraction (NEW)
  if (features && features.length > 0) {
    console.log('🔍 Özelliklerden varyant çıkarımı yapılıyor...');
    
    features.forEach(feature => {
      const key = feature.key.toLowerCase();
      const value = feature.value.toLowerCase().trim();
      
      // Size/Beden processing
      if (key.includes('beden') || key.includes('size') || key.includes('boyut')) {
        console.log(`📏 Beden özelliği bulundu: ${feature.key} = ${feature.value}`);
        
        // Parse multiple sizes from value
        const sizeValue = feature.value;
        let extractedSizes: string[] = [];
        
        // Split by common separators
        const sizeParts = sizeValue.split(/[,;\|\s]+/).filter(s => s.length > 0);
        
        sizeParts.forEach(sizePart => {
          const cleanSize = sizePart.trim().toUpperCase();
          // Standard size patterns
          if (/^(XXS|XS|S|M|L|XL|XXL|XXXL)$/i.test(cleanSize)) {
            extractedSizes.push(cleanSize);
          }
          // Numeric sizes
          else if (/^\d+$/.test(cleanSize) && parseInt(cleanSize) < 100) {
            extractedSizes.push(cleanSize);
          }
          // European shoe sizes
          else if (/^(3[6-9]|4[0-7])$/.test(cleanSize)) {
            extractedSizes.push(cleanSize);
          }
        });
        
        if (extractedSizes.length > 0) {
          extractedSizes.forEach(size => {
            if (!sizes.includes(size)) {
              sizes.push(size);
              hasRealVariants = true;
              console.log(`✅ Beden eklendi: ${size}`);
            }
          });
        }
      }
      
      // Color/Renk processing
      if (key.includes('renk') || key.includes('color') || key.includes('colour')) {
        console.log(`🎨 Renk özelliği bulundu: ${feature.key} = ${feature.value}`);
        
        const colorValue = feature.value;
        let extractedColors: string[] = [];
        
        // Split by common separators
        const colorParts = colorValue.split(/[,;\|\s]+/).filter(c => c.length > 0);
        
        colorParts.forEach(colorPart => {
          const cleanColor = colorPart.trim();
          // Basic color names
          if (/^(siyah|beyaz|kırmızı|mavi|yeşil|sarı|pembe|mor|turuncu|gri|kahverengi|lacivert|bordo)$/i.test(cleanColor)) {
            extractedColors.push(cleanColor.charAt(0).toUpperCase() + cleanColor.slice(1).toLowerCase());
          }
          // English color names
          else if (/^(black|white|red|blue|green|yellow|pink|purple|orange|gray|grey|brown|navy|burgundy)$/i.test(cleanColor)) {
            extractedColors.push(cleanColor.charAt(0).toUpperCase() + cleanColor.slice(1).toLowerCase());
          }
          // Any other reasonable length color name
          else if (cleanColor.length >= 3 && cleanColor.length <= 15) {
            extractedColors.push(cleanColor.charAt(0).toUpperCase() + cleanColor.slice(1).toLowerCase());
          }
        });
        
        if (extractedColors.length > 0) {
          extractedColors.forEach(color => {
            if (!colors.includes(color)) {
              colors.push(color);
              hasRealVariants = true;
              console.log(`✅ Renk eklendi: ${color}`);
            }
          });
        }
      }
    });
    
    console.log(`🎯 Özelliklerden çıkarılan: ${colors.length} renk, ${sizes.length} beden`);
  }
  
  // 6. Eğer hala gerçek varyantlar bulunmadıysa, boş array döndür
  if (!hasRealVariants) {
    console.log('🚫 Gerçek varyant seçenekleri bulunamadı - varyant oluşturulmayacak');
    return {
      hasRealVariants: false,
      colors: [],
      sizes: [],
      variants: []
    };
  }

  // 7. Varyant kombinasyonları oluştur
  if (colors.length > 0 && sizes.length > 0) {
    // Hem renk hem beden varyantları var
    colors.forEach(color => {
      sizes.forEach(size => {
        variants.push({
          color,
          size,
          inStock: true
        });
      });
    });
  } else if (colors.length > 0) {
    // Sadece renk varyantları
    colors.forEach(color => {
      variants.push({
        color,
        size: 'Tek Beden',
        inStock: true
      });
    });
  } else if (sizes.length > 0) {
    // Sadece beden varyantları
    sizes.forEach(size => {
      variants.push({
        color: 'Standart',
        size,
        inStock: true
      });
    });
  }

  console.log(`🎨 Bulunan renkler: ${colors.length} -> ${colors.join(', ')}`);
  console.log(`📏 Bulunan bedenler: ${sizes.length} -> ${sizes.join(', ')}`);
  console.log(`✅ Gerçek varyantlar bulundu: ${colors.length} renk, ${sizes.length} beden`);
  console.log(`📊 Toplam ${variants.length} varyant kombinasyonu oluşturuldu`);

  return {
    hasRealVariants: true,
    colors: [...new Set(colors)], // Tekrarları kaldır
    sizes: [...new Set(sizes)],   // Tekrarları kaldır
    variants
  };
}

export function shouldCreateVariants(html: string): boolean {
  const result = detectRealVariants(html);
  return result.hasRealVariants;
}