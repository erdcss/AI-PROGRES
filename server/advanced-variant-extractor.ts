import * as cheerio from 'cheerio';

interface ExtractedVariants {
  colors: string[];
  sizes: string[];
  variantImages: Record<string, string[]>;
  colorImageMap: Record<string, string[]>;
  variantPricing: Record<string, number>;
  variantSpecificPricing: Record<string, number>;
}

export function extractAdvancedVariants(htmlContent: string, productId: string): ExtractedVariants {
  const $ = cheerio.load(htmlContent);
  
  const colors: string[] = [];
  const sizes: string[] = [];
  const variantImages: Record<string, string[]> = {};
  const colorImageMap: Record<string, string[]> = {};
  const variantPricing: Record<string, number> = {};
  const variantSpecificPricing: Record<string, number> = {};

  console.log('🔍 Gelişmiş varyant çıkarma başlatılıyor...');

  // 1. JSON verilerinden çıkarma
  try {
    const scriptMatches = htmlContent.match(/<script[^>]*>(.*?)<\/script>/gs) || [];
    
    scriptMatches.forEach(scriptTag => {
      const scriptContent = scriptTag.replace(/<\/?script[^>]*>/g, '');
      
      // Çeşitli varyant pattern'ları
      const patterns = [
        /"variants":\s*\[(.*?)\]/g,
        /"allVariants":\s*\[(.*?)\]/g,
        /"productColors":\s*\[(.*?)\]/g,
        /"productSizes":\s*\[(.*?)\]/g,
        /"colorVariants":\s*\[(.*?)\]/g,
        /"sizeVariants":\s*\[(.*?)\]/g
      ];

      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(scriptContent)) !== null) {
          try {
            const variantStr = match[1];
            const variantObjs = variantStr.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
            
            variantObjs.forEach(objStr => {
              try {
                const variant = JSON.parse(objStr);
                
                // Renk çıkarma - strict kontrollerle
                if (variant.attributeType === 'color' || variant.attributeType === 'renk' || 
                    variant.colorName || variant.color) {
                  const colorValue = variant.attributeValue || variant.colorName || variant.color || variant.name;
                  
                  if (colorValue && 
                      typeof colorValue === 'string' && 
                      colorValue.length > 1 &&
                      colorValue !== 'Beden' &&
                      colorValue !== 'Size' &&
                      !/^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(colorValue) &&
                      !colors.includes(colorValue)) {
                    
                    colors.push(colorValue);
                    console.log(`🎨 Renk bulundu: ${colorValue}`);
                    
                    // Renk için fiyat
                    if (variant.price) {
                      const price = parseFloat(variant.price);
                      if (!isNaN(price)) {
                        variantPricing[colorValue] = price;
                        variantSpecificPricing[colorValue] = price * 1.10;
                      }
                    }
                    
                    // Renk için görseller
                    if (variant.images && Array.isArray(variant.images)) {
                      const optimizedImages = variant.images
                        .map(img => optimizeImageUrl(img))
                        .filter(Boolean);
                      if (optimizedImages.length > 0) {
                        colorImageMap[colorValue] = optimizedImages;
                        variantImages[colorValue] = optimizedImages;
                      }
                    }
                  }
                }
                
                // Beden çıkarma - strict kontrollerle
                if (variant.attributeType === 'size' || variant.attributeType === 'productSize' || 
                    variant.sizeName || variant.size) {
                  const sizeValue = variant.attributeValue || variant.sizeName || variant.size || variant.name;
                  
                  if (sizeValue && 
                      typeof sizeValue === 'string' && 
                      /^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(sizeValue) &&
                      !sizes.includes(sizeValue)) {
                    
                    sizes.push(sizeValue);
                    console.log(`📏 Beden bulundu: ${sizeValue}`);
                    
                    // Beden için fiyat
                    if (variant.price) {
                      const price = parseFloat(variant.price);
                      if (!isNaN(price)) {
                        variantPricing[sizeValue] = price;
                      }
                    }
                  }
                }
                
              } catch (e) {
                // Geçersiz JSON objesi, atla
              }
            });
          } catch (e) {
            // Pattern eşleşmesi hatası, atla
          }
        }
      });
    });
    
  } catch (error) {
    console.log("JSON varyant çıkarma hatası:", error);
  }

  // 2. HTML attribute'larından çıkarma
  try {
    $('[data-color], [data-variant-color], .color-option, .variant-color').each((_, elem) => {
      const colorAttrs = ['data-color', 'data-variant-color', 'title', 'alt'];
      
      colorAttrs.forEach(attr => {
        const colorValue = $(elem).attr(attr);
        if (colorValue && 
            typeof colorValue === 'string' && 
            colorValue.length > 1 &&
            colorValue !== 'Beden' &&
            !/^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(colorValue) &&
            !colors.includes(colorValue)) {
          
          colors.push(colorValue);
          console.log(`🎨 HTML attribute'tan renk: ${colorValue}`);
        }
      });
    });

    $('[data-size], [data-variant-size], .size-option, .variant-size').each((_, elem) => {
      const sizeAttrs = ['data-size', 'data-variant-size', 'title', 'alt'];
      
      sizeAttrs.forEach(attr => {
        const sizeValue = $(elem).attr(attr);
        if (sizeValue && 
            /^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(sizeValue) &&
            !sizes.includes(sizeValue)) {
          
          sizes.push(sizeValue);
          console.log(`📏 HTML attribute'tan beden: ${sizeValue}`);
        }
      });
    });
    
  } catch (error) {
    console.log("HTML attribute çıkarma hatası:", error);
  }

  // 3. Select/option elementlerinden çıkarma
  try {
    $('select option').each((_, option) => {
      const value = $(option).attr('value') || $(option).text().trim();
      
      if (value && value.length > 0) {
        // Beden kontrolü
        if (/^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(value) && !sizes.includes(value)) {
          sizes.push(value);
          console.log(`📏 Select option'dan beden: ${value}`);
        }
        // Renk kontrolü (beden değilse ve uygun uzunluktaysa)
        else if (value.length > 1 && 
                 value.length < 20 && 
                 value !== 'Beden' &&
                 !/^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(value) &&
                 !colors.includes(value)) {
          colors.push(value);
          console.log(`🎨 Select option'dan renk: ${value}`);
        }
      }
    });
    
  } catch (error) {
    console.log("Select option çıkarma hatası:", error);
  }

  console.log(`✅ Gelişmiş çıkarım tamamlandı: ${colors.length} renk, ${sizes.length} beden`);
  
  return {
    colors,
    sizes,
    variantImages,
    colorImageMap,
    variantPricing,
    variantSpecificPricing
  };
}

function optimizeImageUrl(imageUrl: any): string | null {
  try {
    let url = typeof imageUrl === 'string' ? imageUrl : (imageUrl?.url || imageUrl);
    
    if (!url || typeof url !== 'string') return null;
    
    // Sadece Trendyol CDN URL'lerini kabul et
    if (!url.includes('cdn.dsmcdn.com')) return null;
    
    // Ürün görseli kontrolü
    if (!(url.includes('/prod/QC/') || url.includes('/prod/PIM/') || url.includes('/product/'))) {
      return null;
    }
    
    // URL optimizasyonu
    if (!url.includes('_org_zoom.jpg')) {
      url = url.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.jpg');
    }
    
    if (!url.startsWith('https:')) {
      url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
    }
    
    return url;
  } catch (error) {
    return null;
  }
}