/**
 * Gelişmiş Renk Çıkarma Sistemi
 * Tüm renk seçeneklerini ve varyantlarını detaylı olarak çıkarır
 */

import * as cheerio from 'cheerio';

export interface ColorVariant {
  name: string;
  code?: string;
  hex?: string;
  images: string[];
  available: boolean;
  price?: number;
}

export interface EnhancedColorData {
  colors: ColorVariant[];
  totalColors: number;
  availableColors: string[];
  outOfStockColors: string[];
  colorImageMap: Record<string, string[]>;
}

/**
 * Gelişmiş renk çıkarma ana fonksiyonu
 */
export function extractEnhancedColors(htmlContent: string, $: cheerio.CheerioAPI): EnhancedColorData {
  console.log('🎨 Gelişmiş renk varyantları çıkarılıyor...');
  
  const colors: ColorVariant[] = [];
  const colorImageMap: Record<string, string[]> = {};
  const availableColors: string[] = [];
  const outOfStockColors: string[] = [];
  
  // Method 1: Script-based color extraction
  extractColorsFromScripts(htmlContent, colors, colorImageMap);
  
  // Method 2: DOM-based color extraction
  extractColorsFromDOM($, colors, colorImageMap);
  
  // Method 3: Image analysis for color detection
  extractColorsFromImages($, colors, colorImageMap);
  
  // Method 4: Merchant/variant data extraction
  extractColorsFromMerchantData(htmlContent, colors, colorImageMap);
  
  // Deduplicate and clean colors
  const uniqueColors = deduplicateColors(colors);
  
  // Categorize available vs out of stock
  uniqueColors.forEach(color => {
    if (color.available) {
      availableColors.push(color.name);
    } else {
      outOfStockColors.push(color.name);
    }
  });
  
  console.log(`✅ ${uniqueColors.length} renk varyantı bulundu:`);
  console.log(`   🟢 Mevcut: ${availableColors.length}`);
  console.log(`   🔴 Stokta yok: ${outOfStockColors.length}`);
  console.log(`   🎨 Renkler: ${availableColors.join(', ')}`);
  
  return {
    colors: uniqueColors,
    totalColors: uniqueColors.length,
    availableColors,
    outOfStockColors,
    colorImageMap
  };
}

/**
 * Script verilerinden renk çıkarma
 */
function extractColorsFromScripts(htmlContent: string, colors: ColorVariant[], colorImageMap: Record<string, string[]>) {
  // Product detail state extraction
  const productDetailMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productDetailMatch) {
    try {
      const productState = JSON.parse(productDetailMatch[1]);
      
      // Color options from product state
      if (productState.product?.colorOptions) {
        productState.product.colorOptions.forEach((color: any) => {
          const colorVariant: ColorVariant = {
            name: color.name || color.colorName || 'Bilinmeyen',
            code: color.code,
            hex: color.hexCode,
            images: color.images || [],
            available: color.isAvailable !== false,
            price: color.price
          };
          colors.push(colorVariant);
          
          if (color.images && color.images.length > 0) {
            colorImageMap[colorVariant.name] = color.images;
          }
        });
      }
      
      // Advanced color extraction from allVariants
      if (productState.product?.allVariants) {
        productState.product.allVariants.forEach((variant: any) => {
          if (variant.attributeValue) {
            const colorName = variant.attributeValue;
            const variantImages = variant.images || [];
            const colorVariant: ColorVariant = {
              name: colorName,
              images: variantImages,
              available: variant.isAvailable !== false,
              price: variant.price,
              code: variant.itemNumber
            };
            colors.push(colorVariant);
            
            if (variantImages.length > 0) {
              if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
              colorImageMap[colorName].push(...variantImages);
            }
          }
        });
      }
      
      // Variants with color info
      if (productState.product?.variants) {
        productState.product.variants.forEach((variant: any) => {
          if (variant.color || variant.colorName) {
            const colorName = variant.color || variant.colorName;
            const colorVariant: ColorVariant = {
              name: colorName,
              images: variant.images || [],
              available: variant.isAvailable !== false,
              price: variant.price
            };
            colors.push(colorVariant);
            
            if (variant.images) {
              if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
              colorImageMap[colorName].push(...variant.images);
            }
          }
        });
      }
      
      // Color images mapping
      if (productState.product?.colorImages) {
        Object.entries(productState.product.colorImages).forEach(([colorName, images]) => {
          if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
          colorImageMap[colorName].push(...(images as string[]));
        });
      }
      
    } catch (e) {
      console.log('Script renk çıkarma hatası:', e.message);
    }
  }
  
  // Merchant data extraction - Enhanced
  const merchantMatches = htmlContent.matchAll(/"merchants":\s*\[([^\]]+)\]/g);
  for (const match of merchantMatches) {
    try {
      const merchantsData = JSON.parse(`[${match[1]}]`);
      merchantsData.forEach((merchant: any) => {
        if (merchant.url) {
          const colorMatch = merchant.url.match(/renk=([^&]+)/);
          const sizeMatch = merchant.url.match(/beden=([^&]+)/);
          
          if (colorMatch) {
            const colorName = decodeURIComponent(colorMatch[1]).replace(/\+/g, ' ');
            const colorVariant: ColorVariant = {
              name: colorName,
              images: merchant.image ? [merchant.image] : [],
              available: merchant.isAvailable !== false,
              price: merchant.price
            };
            colors.push(colorVariant);
            
            if (merchant.image) {
              if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
              colorImageMap[colorName].push(merchant.image);
            }
          } else if (merchant.color || merchant.colorName) {
            // Direct color from merchant
            const colorName = merchant.color || merchant.colorName;
            const colorVariant: ColorVariant = {
              name: colorName,
              images: merchant.image ? [merchant.image] : [],
              available: merchant.isAvailable !== false,
              price: merchant.price
            };
            colors.push(colorVariant);
            
            if (merchant.image) {
              if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
              colorImageMap[colorName].push(merchant.image);
            }
          }
        }
      });
    } catch (e) {}
  }
  
  // Extract from product variants array
  const variantArrayMatches = htmlContent.matchAll(/"variants":\s*\[([^\]]+)\]/g);
  for (const match of variantArrayMatches) {
    try {
      const variantsData = JSON.parse(`[${match[1]}]`);
      variantsData.forEach((variant: any) => {
        if (variant.color || variant.colorName) {
          const colorName = variant.color || variant.colorName;
          const colorVariant: ColorVariant = {
            name: colorName,
            images: variant.images || (variant.image ? [variant.image] : []),
            available: variant.isAvailable !== false,
            price: variant.price
          };
          colors.push(colorVariant);
          
          if (variant.images || variant.image) {
            if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
            if (variant.images) {
              colorImageMap[colorName].push(...variant.images);
            } else if (variant.image) {
              colorImageMap[colorName].push(variant.image);
            }
          }
        }
      });
    } catch (e) {}
  }
}

/**
 * DOM elementlerinden renk çıkarma
 */
function extractColorsFromDOM($: cheerio.CheerioAPI, colors: ColorVariant[], colorImageMap: Record<string, string[]>) {
  // Color selector elements
  const colorSelectors = [
    '.color-options .color-option',
    '.variant-color-item',
    '.color-variant',
    '[data-color]',
    '.color-selector .color',
    '.product-colors .color-item'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((i, elem) => {
      const $elem = $(elem);
      const colorName = $elem.attr('data-color') || 
                       $elem.attr('title') || 
                       $elem.text().trim() ||
                       $elem.find('.color-name').text().trim();
      
      if (colorName && colorName.length > 0) {
        const isAvailable = !$elem.hasClass('disabled') && 
                           !$elem.hasClass('out-of-stock') &&
                           !$elem.attr('disabled');
        
        const colorVariant: ColorVariant = {
          name: colorName,
          images: [],
          available: isAvailable,
          hex: $elem.attr('data-hex') || $elem.css('background-color')
        };
        
        colors.push(colorVariant);
      }
    });
  });
  
  // Color links
  $('a[href*="renk="], a[href*="color="]').each((i, elem) => {
    const href = $(elem).attr('href') || '';
    const colorMatch = href.match(/(?:renk|color)=([^&]+)/);
    if (colorMatch) {
      const colorName = decodeURIComponent(colorMatch[1]);
      const colorVariant: ColorVariant = {
        name: colorName,
        images: [],
        available: true
      };
      colors.push(colorVariant);
    }
  });
}

/**
 * Görseller üzerinden renk tespiti
 */
function extractColorsFromImages($: cheerio.CheerioAPI, colors: ColorVariant[], colorImageMap: Record<string, string[]>) {
  // Image elements with color data
  $('img[data-color], img[alt*="renk"], img[title*="renk"]').each((i, elem) => {
    const $elem = $(elem);
    const colorName = $elem.attr('data-color') || 
                     extractColorFromAlt($elem.attr('alt') || '') ||
                     extractColorFromAlt($elem.attr('title') || '');
    
    if (colorName) {
      const imageSrc = $elem.attr('src') || $elem.attr('data-src');
      if (imageSrc) {
        if (!colorImageMap[colorName]) colorImageMap[colorName] = [];
        colorImageMap[colorName].push(imageSrc);
        
        // Add color variant if not exists
        const existingColor = colors.find(c => c.name === colorName);
        if (!existingColor) {
          colors.push({
            name: colorName,
            images: [imageSrc],
            available: true
          });
        }
      }
    }
  });
}

/**
 * Merchant verilerinden renk çıkarma
 */
function extractColorsFromMerchantData(htmlContent: string, colors: ColorVariant[], colorImageMap: Record<string, string[]>) {
  // Extract from merchant data structures
  const merchantRegex = /"merchant":\s*{[^}]*"url":\s*"[^"]*renk=([^"&]+)[^}]*}/g;
  let match;
  
  while ((match = merchantRegex.exec(htmlContent)) !== null) {
    const colorName = decodeURIComponent(match[1]);
    if (colorName && colorName.length > 1) {
      colors.push({
        name: colorName,
        images: [],
        available: true
      });
    }
  }
}

/**
 * Alt text'ten renk çıkarma
 */
function extractColorFromAlt(altText: string): string | null {
  const colorKeywords = ['renk', 'color', 'renkli'];
  for (const keyword of colorKeywords) {
    if (altText.toLowerCase().includes(keyword)) {
      // Extract color name after keyword
      const parts = altText.split(keyword);
      if (parts.length > 1) {
        const colorPart = parts[1].trim().split(/[\s,.-]/)[0];
        if (colorPart.length > 1) {
          return colorPart;
        }
      }
    }
  }
  return null;
}

/**
 * Renkleri temizle ve tekrarları kaldır
 */
function deduplicateColors(colors: ColorVariant[]): ColorVariant[] {
  const colorMap = new Map<string, ColorVariant>();
  
  colors.forEach(color => {
    const normalizedName = normalizeColorName(color.name);
    if (normalizedName && normalizedName.length > 1) {
      const existing = colorMap.get(normalizedName);
      if (existing) {
        // Merge images and data
        existing.images.push(...color.images);
        if (color.hex && !existing.hex) existing.hex = color.hex;
        if (color.code && !existing.code) existing.code = color.code;
        if (color.price && !existing.price) existing.price = color.price;
      } else {
        colorMap.set(normalizedName, {
          ...color,
          name: normalizedName,
          images: [...new Set(color.images)] // Remove duplicate images
        });
      }
    }
  });
  
  return Array.from(colorMap.values());
}

/**
 * Renk adını normalize et
 */
function normalizeColorName(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\sçğıöşü]/g, '')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}