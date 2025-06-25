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

export function detectProductVariants(html: string): VariantResult {
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
  
  // 3. Tekrarları kaldır
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