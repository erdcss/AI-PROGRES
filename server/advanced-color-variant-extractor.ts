import * as cheerio from 'cheerio';

interface ColorVariant {
  name: string;
  price?: number;
  images: string[];
  colorCode?: string;
  isAvailable: boolean;
}

interface VariantExtractionResult {
  colors: string[];
  colorVariants: ColorVariant[];
  variantPricing: Record<string, number>;
  colorImageMap: Record<string, string[]>;
}

/**
 * Advanced color variant extraction from Trendyol product pages
 */
export function extractColorVariants(htmlContent: string, $: cheerio.CheerioAPI): VariantExtractionResult {
  const result: VariantExtractionResult = {
    colors: [],
    colorVariants: [],
    variantPricing: {},
    colorImageMap: {}
  };

  console.log('🎨 Starting advanced color variant extraction...');
  
  // Method 0: Extract from HTML data attributes in color picker
  const colorPickerElements = $('[class*="color"], [data-testid*="color"], [class*="variant"]');
  console.log(`Found ${colorPickerElements.length} potential color picker elements`);
  
  colorPickerElements.each((_, elem) => {
    const $elem = $(elem);
    const style = $elem.attr('style') || '';
    const className = $elem.attr('class') || '';
    const dataAttrs = $elem.get()[0]?.attribs || {};
    
    // Extract background color from style
    const bgColorMatch = style.match(/background-color:\s*([^;]+)/);
    const bgImageMatch = style.match(/background-image:\s*url\(['"]?([^'"]+)['"]?\)/);
    
    if (bgColorMatch || bgImageMatch) {
      let colorName = bgColorMatch?.[1] || 'Unknown';
      
      // Try to get a better name from title, alt, or data attributes
      const betterName = $elem.attr('title') || 
                        $elem.attr('alt') || 
                        $elem.attr('data-color-name') ||
                        $elem.attr('aria-label');
      
      if (betterName) {
        colorName = betterName;
      }
      
      if (!result.colors.includes(colorName)) {
        result.colors.push(colorName);
        
        const variant: ColorVariant = {
          name: colorName,
          images: [],
          colorCode: bgColorMatch?.[1],
          isAvailable: !$elem.hasClass('disabled') && !$elem.hasClass('unavailable')
        };
        
        // Try to extract price from nearby elements
        const priceElement = $elem.closest('.variant-item').find('[data-price]').first() ||
                           $elem.siblings('[data-price]').first() ||
                           $elem.parent().find('[data-price]').first();
        
        if (priceElement.length) {
          const priceValue = priceElement.attr('data-price');
          if (priceValue) {
            variant.price = parseFloat(priceValue);
            result.variantPricing[colorName] = variant.price;
          }
        }
        
        // If background image, add it as variant image
        if (bgImageMatch) {
          let imageUrl = bgImageMatch[1];
          if (imageUrl.includes('cdn.dsmcdn.com')) {
            imageUrl = imageUrl.replace(/\/ty\d+\//, '/ty1660/');
            if (!imageUrl.includes('_org_zoom.jpg')) {
              imageUrl = imageUrl.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.jpg');
            }
            if (!imageUrl.startsWith('https:')) {
              imageUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : 'https://' + imageUrl;
            }
            variant.images.push(imageUrl);
            result.colorImageMap[colorName] = [imageUrl];
          }
        }
        
        result.colorVariants.push(variant);
      }
    }
  });

  // Method 1: Extract from product-colors JavaScript data
  const productColorsPattern = /"productColors":\s*\[(.*?)\]/;
  const productColorsMatch = htmlContent.match(productColorsPattern);
  
  if (productColorsMatch) {
    try {
      const colorsData = JSON.parse(`[${productColorsMatch[1]}]`);
      console.log(`🔍 Found ${colorsData.length} color variants in productColors`);
      
      colorsData.forEach((colorData: any, index: number) => {
        const variant: ColorVariant = {
          name: colorData.colorName || colorData.name || `Color ${index + 1}`,
          price: colorData.price ? parseFloat(colorData.price) : undefined,
          images: [],
          colorCode: colorData.colorCode || colorData.hex || colorData.color,
          isAvailable: colorData.isAvailable !== false
        };

        // Extract color-specific images
        if (colorData.images && Array.isArray(colorData.images)) {
          variant.images = colorData.images.map((img: any) => {
            let url = typeof img === 'string' ? img : (img.url || img.href || img.src);
            if (url && url.includes('cdn.dsmcdn.com')) {
              // Normalize to working format
              url = url.replace(/\/ty\d+\//, '/ty1660/');
              if (!url.includes('_org_zoom.jpg')) {
                url = url.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.jpg');
              }
              if (!url.startsWith('https:')) {
                url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
              }
              return url;
            }
            return url;
          }).filter(Boolean);
        }

        if (variant.name && !result.colors.includes(variant.name)) {
          result.colors.push(variant.name);
          result.colorVariants.push(variant);
          
          if (variant.price) {
            result.variantPricing[variant.name] = variant.price;
          }
          
          if (variant.images.length > 0) {
            result.colorImageMap[variant.name] = variant.images;
          }
        }
      });
    } catch (e) {
      console.log('Failed to parse productColors:', e);
    }
  }

  // Method 2: Extract from variant selector elements - multiple selectors
  $('.product-variant-color, .color-variant, [data-color], .variant-color, .color-selector, .product-color').each((_, elem) => {
    const $elem = $(elem);
    const colorName = $elem.attr('data-color') || 
                     $elem.attr('title') || 
                     $elem.text().trim();
    
    const colorCode = $elem.attr('data-color-code') || 
                     $elem.attr('data-hex') ||
                     $elem.css('background-color');
    
    const isAvailable = !$elem.hasClass('disabled') && 
                       !$elem.hasClass('unavailable') &&
                       !$elem.attr('disabled');

    if (colorName && !result.colors.includes(colorName)) {
      result.colors.push(colorName);
      
      const variant: ColorVariant = {
        name: colorName,
        images: [],
        colorCode,
        isAvailable
      };

      // Try to find price for this variant
      const priceAttr = $elem.attr('data-price') || $elem.attr('data-variant-price');
      if (priceAttr) {
        variant.price = parseFloat(priceAttr);
        result.variantPricing[colorName] = variant.price;
      }

      // Try to find images for this variant
      const imageAttr = $elem.attr('data-image') || $elem.attr('data-variant-image');
      if (imageAttr) {
        let imageUrl = imageAttr;
        if (imageUrl.includes('cdn.dsmcdn.com')) {
          imageUrl = imageUrl.replace(/\/ty\d+\//, '/ty1660/');
          if (!imageUrl.includes('_org_zoom.jpg')) {
            imageUrl = imageUrl.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.jpg');
          }
          if (!imageUrl.startsWith('https:')) {
            imageUrl = imageUrl.startsWith('//') ? 'https:' + imageUrl : 'https://' + imageUrl;
          }
          variant.images.push(imageUrl);
          result.colorImageMap[colorName] = [imageUrl];
        }
      }

      result.colorVariants.push(variant);
    }
  });

  // Method 3: Extract from JavaScript window.__PRODUCT_DETAIL_APP_INITIAL_STATE__
  const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/;
  const initialStateMatch = htmlContent.match(initialStatePattern);
  
  if (initialStateMatch) {
    try {
      const initialState = JSON.parse(initialStateMatch[1]);
      const productDetail = initialState?.product?.productDetail;
      
      if (productDetail?.variants?.length > 0) {
        console.log(`🎯 Found ${productDetail.variants.length} variants in initial state`);
        
        productDetail.variants.forEach((variant: any) => {
          if (variant.color && variant.color.name) {
            const colorName = variant.color.name;
            
            if (!result.colors.includes(colorName)) {
              result.colors.push(colorName);
              
              const colorVariant: ColorVariant = {
                name: colorName,
                price: variant.price?.discountedPrice?.value ? parseFloat(variant.price.discountedPrice.value) : undefined,
                images: [],
                colorCode: variant.color.hex || variant.color.code,
                isAvailable: variant.isAvailable !== false
              };

              // Extract variant images
              if (variant.images && Array.isArray(variant.images)) {
                colorVariant.images = variant.images.map((img: any) => {
                  let url = img.url || img;
                  if (url && url.includes('cdn.dsmcdn.com')) {
                    url = url.replace(/\/ty\d+\//, '/ty1660/');
                    if (!url.includes('_org_zoom.jpg')) {
                      url = url.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.jpg');
                    }
                    if (!url.startsWith('https:')) {
                      url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
                    }
                    return url;
                  }
                  return url;
                }).filter(Boolean);
              }

              result.colorVariants.push(colorVariant);
              
              if (colorVariant.price) {
                result.variantPricing[colorName] = colorVariant.price;
              }
              
              if (colorVariant.images.length > 0) {
                result.colorImageMap[colorName] = colorVariant.images;
              }
            }
          }
        });
      }
    } catch (e) {
      console.log('Failed to parse initial state:', e);
    }
  }

  // Method 4: Extract from inline script tags with variant data
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // Look for variant color data patterns
    const colorVariantPatterns = [
      /"variants":\s*\[(.*?)\]/,
      /"colorVariants":\s*\[(.*?)\]/,
      /"availableColors":\s*\[(.*?)\]/
    ];

    colorVariantPatterns.forEach(pattern => {
      const match = scriptContent.match(pattern);
      if (match) {
        try {
          const variants = JSON.parse(`[${match[1]}]`);
          variants.forEach((variant: any) => {
            if (variant.color || variant.colorName) {
              const colorName = variant.color || variant.colorName;
              
              if (!result.colors.includes(colorName)) {
                result.colors.push(colorName);
                
                const colorVariant: ColorVariant = {
                  name: colorName,
                  price: variant.price ? parseFloat(variant.price) : undefined,
                  images: [],
                  isAvailable: variant.inStock !== false
                };

                if (variant.images && Array.isArray(variant.images)) {
                  colorVariant.images = variant.images.map((img: any) => {
                    let url = typeof img === 'string' ? img : (img.url || img);
                    if (url && url.includes('cdn.dsmcdn.com')) {
                      url = url.replace(/\/ty\d+\//, '/ty1660/');
                      if (!url.includes('_org_zoom.jpg')) {
                        url = url.replace(/\.(jpg|jpeg|png|webp)$/, '_org_zoom.jpg');
                      }
                      if (!url.startsWith('https:')) {
                        url = url.startsWith('//') ? 'https:' + url : 'https://' + url;
                      }
                      return url;
                    }
                    return url;
                  }).filter(Boolean);
                }

                result.colorVariants.push(colorVariant);
                
                if (colorVariant.price) {
                  result.variantPricing[colorName] = colorVariant.price;
                }
                
                if (colorVariant.images.length > 0) {
                  result.colorImageMap[colorName] = colorVariant.images;
                }
              }
            }
          });
        } catch (e) {
          // Continue to next pattern
        }
      }
    });
  });

  console.log(`✅ Extracted ${result.colors.length} color variants`);
  console.log(`💰 Found pricing for ${Object.keys(result.variantPricing).length} colors`);
  console.log(`🖼️ Found images for ${Object.keys(result.colorImageMap).length} colors`);

  // Log detailed results
  result.colorVariants.forEach(variant => {
    console.log(`  ${variant.name}: ${variant.images.length} images, price: ${variant.price || 'N/A'}`);
  });

  return result;
}