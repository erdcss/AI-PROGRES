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

export function detectRealVariants(html: string): RealVariantData {
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

  // 5. Eğer gerçek varyantlar bulunmadıysa, boş array döndür
  if (!hasRealVariants) {
    console.log('🚫 Gerçek varyant seçenekleri bulunamadı');
    return {
      hasRealVariants: false,
      colors: [],
      sizes: [],
      variants: []
    };
  }

  // 6. Varyant kombinasyonları oluştur
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