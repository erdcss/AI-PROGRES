/**
 * Simple Variant Detector - Detects Real Product Variants Only
 * Only creates variants if product has actual selectable options
 */

import * as cheerio from 'cheerio';

export interface VariantResult {
  hasVariants: boolean;
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

export function detectProductVariants(html: string, features?: FeatureItem[]): VariantResult {
  const $ = cheerio.load(html);
  
  console.log('🔍 Gerçek varyant seçenekleri aranıyor...');
  
  // 1. Trendyol'da gerçek renk seçici butonları arayın
  let realColors: string[] = [];
  let realSizes: string[] = [];
  
  // Renk seçici butonları için spesifik selectors
  const colorSelectors = [
    '.pr-in-dt-sz-wr .pr-in-dt-cl', // Trendyol renk seçici
    '.variant-list .color-variant',
    '.color-picker button',
    '[data-variant-type="color"]'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const colorText = $(el).attr('title') || $(el).attr('data-color') || $(el).text().trim();
      if (colorText && colorText.length > 0 && colorText.length < 20) {
        realColors.push(colorText);
      }
    });
  });
  
  // Beden seçici butonları için spesifik selectors
  const sizeSelectors = [
    '.pr-in-dt-sz-wr .pr-in-dt-sz', // Trendyol beden seçici
    '.variant-list .size-variant', 
    '.size-picker button',
    '[data-variant-type="size"]'
  ];
  
  sizeSelectors.forEach(selector => {
    $(selector).each((i, el) => {
      const sizeText = $(el).attr('title') || $(el).attr('data-size') || $(el).text().trim();
      if (sizeText && sizeText.length > 0 && sizeText.length < 10) {
        realSizes.push(sizeText);
      }
    });
  });
  
  // 2. Script içindeki variant verilerini kontrol et
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    
    // variants array'i varsa ve birden fazla seçenek içeriyorsa
    const variantMatch = scriptContent.match(/"variants":\s*\[([^\]]+)\]/);
    if (variantMatch) {
      const variantContent = variantMatch[1];
      // Gerçek renk seçenekleri varsa
      const colorMatches = variantContent.match(/"color":\s*"([^"]+)"/g);
      if (colorMatches && colorMatches.length > 1) {
        colorMatches.forEach(match => {
          const color = match.match(/"color":\s*"([^"]+)"/)?.[1];
          if (color && !realColors.includes(color)) {
            realColors.push(color);
          }
        });
      }
      
      // Gerçek beden seçenekleri varsa
      const sizeMatches = variantContent.match(/"size":\s*"([^"]+)"/g);
      if (sizeMatches && sizeMatches.length > 1) {
        sizeMatches.forEach(match => {
          const size = match.match(/"size":\s*"([^"]+)"/)?.[1];
          if (size && !realSizes.includes(size)) {
            realSizes.push(size);
          }
        });
      }
    }
  });
  
  // 3. Feature-based extraction (NEW)
  if (features && features.length > 0) {
    console.log('🔍 Özelliklerden varyant çıkarımı yapılıyor...');
    console.log('🔧 DEBUG - Features:', features.map(f => `${f.key}: ${f.value}`));
    
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
            if (!realSizes.includes(size)) {
              realSizes.push(size);
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
            if (!realColors.includes(color)) {
              realColors.push(color);
              console.log(`✅ Renk eklendi: ${color}`);
            }
          });
        }
      }
    });
    
    console.log(`🎯 Özelliklerden çıkarılan: ${realColors.length} renk, ${realSizes.length} beden`);
  }
  
  // 4. Tekrarları kaldır
  realColors = [...new Set(realColors)];
  realSizes = [...new Set(realSizes)];
  
  console.log(`🎨 Bulunan renkler: ${realColors.length} -> ${realColors.join(', ')}`);
  console.log(`📏 Bulunan bedenler: ${realSizes.length} -> ${realSizes.join(', ')}`);
  
  // 4. Eğer gerçek seçenekler yoksa, variant üretme
  if (realColors.length === 0 && realSizes.length === 0) {
    console.log('🚫 Gerçek varyant seçenekleri bulunamadı - varyant oluşturulmayacak');
    return {
      hasVariants: false,
      variants: []
    };
  }
  
  // 5. Gerçek varyantlar varsa kombinasyon oluştur
  const variants: Array<{color: string, size: string, inStock: boolean}> = [];
  
  if (realColors.length > 0 && realSizes.length > 0) {
    // Hem renk hem beden var
    realColors.forEach(color => {
      realSizes.forEach(size => {
        variants.push({
          color,
          size,
          inStock: true
        });
      });
    });
  } else if (realColors.length > 0) {
    // Sadece renk var
    realColors.forEach(color => {
      variants.push({
        color,
        size: 'Tek Beden',
        inStock: true
      });
    });
  } else if (realSizes.length > 0) {
    // Sadece beden var
    realSizes.forEach(size => {
      variants.push({
        color: 'Standart',
        size,
        inStock: true
      });
    });
  }
  
  console.log(`✅ ${variants.length} gerçek varyant kombinasyonu oluşturuldu`);
  
  return {
    hasVariants: true,
    variants
  };
}