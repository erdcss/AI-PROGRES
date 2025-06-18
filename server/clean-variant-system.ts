import * as cheerio from 'cheerio';

export interface CleanVariantData {
  colors: string[];
  sizes: string[];
  images: string[];
  variantImages: Record<string, string[]>;
  colorImageMap: Record<string, string[]>;
  variantPricing: Record<string, number>;
  variantSpecificPricing: Record<string, number>;
  stockMap: Record<string, boolean>;
}

export function extractCleanVariants(htmlContent: string, productId: string): CleanVariantData {
  const $ = cheerio.load(htmlContent);
  
  const colors: string[] = [];
  const sizes: string[] = [];
  const images: string[] = [];
  const variantImages: Record<string, string[]> = {};
  const colorImageMap: Record<string, string[]> = {};
  const variantPricing: Record<string, number> = {};
  const variantSpecificPricing: Record<string, number> = {};
  const stockMap: Record<string, boolean> = {};

  console.log('🔍 Temiz varyant çıkarma sistemi başlatılıyor...');

  // 1. Görsel çıkarma - çoklu kaynaklardan
  extractImages(htmlContent, images);
  
  // 2. Script tabanlı varyant çıkarma
  extractFromScripts(htmlContent, colors, sizes, variantImages, colorImageMap, variantPricing, variantSpecificPricing);
  
  // 3. HTML elementlerinden çıkarma
  extractFromHTML($, colors, sizes);
  
  // 4. Stok bilgisi çıkarma
  extractStockInfo(htmlContent, stockMap, colors, sizes);
  
  // 5. Varyant doğrulama ve temizleme
  const cleanResult = validateAndClean(colors, sizes, images, variantImages, colorImageMap, variantPricing, variantSpecificPricing, stockMap);
  
  console.log(`✅ Temiz çıkarım: ${cleanResult.colors.length} renk, ${cleanResult.sizes.length} beden, ${cleanResult.images.length} görsel`);
  
  return cleanResult;
}

function extractImages(htmlContent: string, images: string[]): void {
  try {
    // Pattern 1: Enhanced JSON image arrays with relative paths
    const imageArrayPatterns = [
      /"images":\s*\[(.*?)\]/g,
      /"galleryImages":\s*\[(.*?)\]/g,
      /"productImages":\s*\[(.*?)\]/g
    ];
    
    imageArrayPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        // Extract both full URLs and relative paths
        const fullUrlMatches = match[1].match(/https:\/\/cdn\.dsmcdn\.com\/[^"',\s}]+\.(jpg|jpeg|png|webp)/gi) || [];
        const relativePathMatches = match[1].match(/"([^"]*\/(?:QC|PIM)\/[^"]*\.(jpg|jpeg|png|webp))"/gi) || [];
        
        // Process full URLs
        fullUrlMatches.forEach(url => {
          const optimizedUrl = optimizeImageUrl(url);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        });
        
        // Process relative paths and convert to full URLs
        relativePathMatches.forEach(match => {
          const relativePath = match.replace(/"/g, '');
          if (relativePath.startsWith('/')) {
            const fullUrl = `https://cdn.dsmcdn.com${relativePath}`;
            const optimizedUrl = optimizeImageUrl(fullUrl);
            if (optimizedUrl && !images.includes(optimizedUrl)) {
              images.push(optimizedUrl);
              console.log(`🖼️ Relative path görsel: ${optimizedUrl}`);
            }
          }
        });
      }
    });
    
    // Pattern 2: Direct URL matches
    const directUrlPattern = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\/prod\/(?:QC|PIM)\/[^"'\s,}]+\.(jpg|jpeg|png|webp)/gi;
    const directMatches = htmlContent.match(directUrlPattern) || [];
    directMatches.forEach(url => {
      const optimizedUrl = optimizeImageUrl(url);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
    
    // Pattern 3: Enhanced relative path detection
    const relativeImagePattern = /['"]\/(ty\d+\/[^'"]*\/(?:QC|PIM)\/[^'"]*\.(jpg|jpeg|png|webp))['"]/gi;
    let relativeMatch;
    while ((relativeMatch = relativeImagePattern.exec(htmlContent)) !== null) {
      const fullUrl = `https://cdn.dsmcdn.com/${relativeMatch[1]}`;
      const optimizedUrl = optimizeImageUrl(fullUrl);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
        console.log(`🖼️ Enhanced relative görsel: ${optimizedUrl}`);
      }
    }
    
    // Pattern 4: More aggressive image pattern for HAKKE-style products
    const aggressiveImagePattern = /\/ty\d+\/[^"'\s,}]*\/(?:QC|PIM)\/[^"'\s,}]*\.(jpg|jpeg|png|webp)/gi;
    const aggressiveMatches = htmlContent.match(aggressiveImagePattern) || [];
    aggressiveMatches.forEach(imagePath => {
      const fullUrl = imagePath.startsWith('/') 
        ? `https://cdn.dsmcdn.com${imagePath}`
        : `https://cdn.dsmcdn.com/${imagePath}`;
      const optimizedUrl = optimizeImageUrl(fullUrl);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
        console.log(`🖼️ Aggressive pattern görsel: ${optimizedUrl}`);
      }
    });
    
  } catch (error) {
    console.log("Görsel çıkarma hatası:", error);
  }
}

function extractFromScripts(
  htmlContent: string, 
  colors: string[], 
  sizes: string[], 
  variantImages: Record<string, string[]>,
  colorImageMap: Record<string, string[]>,
  variantPricing: Record<string, number>,
  variantSpecificPricing: Record<string, number>
): void {
  try {
    // Extract from product detail state
    const statePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/;
    const stateMatch = htmlContent.match(statePattern);
    
    if (stateMatch) {
      try {
        const state = JSON.parse(stateMatch[1]);
        const product = state?.product;
        
        if (product?.variants && Array.isArray(product.variants)) {
          product.variants.forEach((variant: any) => {
            // Color extraction with strict validation
            if (variant.attributeType === 'color' || variant.attributeType === 'renk') {
              const colorValue = variant.attributeValue || variant.name;
              if (isValidColor(colorValue) && !colors.includes(colorValue)) {
                colors.push(colorValue);
                console.log(`🎨 Renk: ${colorValue}`);
                
                if (variant.price) {
                  const price = parseFloat(variant.price);
                  if (!isNaN(price)) {
                    variantPricing[colorValue] = price;
                    variantSpecificPricing[colorValue] = price * 1.10;
                  }
                }
              }
            }
            
            // Size extraction with strict validation
            if (variant.attributeType === 'size' || variant.attributeType === 'productSize') {
              const sizeValue = variant.attributeValue || variant.name;
              if (isValidSize(sizeValue) && !sizes.includes(sizeValue)) {
                sizes.push(sizeValue);
                console.log(`📏 Beden: ${sizeValue}`);
                
                if (variant.price) {
                  const price = parseFloat(variant.price);
                  if (!isNaN(price)) {
                    variantPricing[sizeValue] = price;
                  }
                }
              }
            }
          });
        }
      } catch (e) {
        console.log("State parse hatası:", e);
      }
    }
    
    // Fallback extraction from various JSON patterns - enhanced for colors
    const jsonPatterns = [
      /"allVariants":\s*\[(.*?)\]/g,
      /"productColors":\s*\[(.*?)\]/g,
      /"colors":\s*\[(.*?)\]/g,
      /"variants":\s*\[(.*?)\]/g,
      /"colorVariants":\s*\[(.*?)\]/g,
      /"sizes":\s*\[(.*?)\]/g
    ];
    
    // Enhanced color pattern matching
    const colorPatterns = [
      /"color":\s*"([^"]+)"/g,
      /"colorName":\s*"([^"]+)"/g,
      /"renk":\s*"([^"]+)"/g,
      /"variant.*color":\s*"([^"]+)"/gi
    ];
    
    jsonPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        try {
          const objects = extractJSONObjects(match[1]);
          objects.forEach(obj => {
            // Color from object
            const colorFields = ['colorName', 'color', 'name', 'value'];
            colorFields.forEach(field => {
              if (obj[field] && isValidColor(obj[field]) && !colors.includes(obj[field])) {
                colors.push(obj[field]);
                console.log(`🎨 JSON renk: ${obj[field]}`);
              }
            });
            
            // Size from object
            const sizeFields = ['sizeName', 'size', 'name', 'value'];
            sizeFields.forEach(field => {
              if (obj[field] && isValidSize(obj[field]) && !sizes.includes(obj[field])) {
                sizes.push(obj[field]);
                console.log(`📏 JSON beden: ${obj[field]}`);
              }
            });
          });
        } catch (e) {
          // Skip invalid JSON
        }
      }
    });
    
    // Additional color pattern extraction
    colorPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const colorValue = match[1];
        if (colorValue && isValidColor(colorValue) && !colors.includes(colorValue)) {
          colors.push(colorValue);
          console.log(`🎨 Pattern renk: ${colorValue}`);
        }
      }
    });
    
  } catch (error) {
    console.log("Script çıkarma hatası:", error);
  }
}

function extractFromHTML($: cheerio.CheerioAPI, colors: string[], sizes: string[]): void {
  try {
    // Select/option elements
    $('select option').each((_, option) => {
      const value = $(option).attr('value') || $(option).text().trim();
      
      if (value) {
        if (isValidSize(value) && !sizes.includes(value)) {
          sizes.push(value);
          console.log(`📏 HTML beden: ${value}`);
        } else if (isValidColor(value) && !colors.includes(value)) {
          colors.push(value);
          console.log(`🎨 HTML renk: ${value}`);
        }
      }
    });
    
    // Enhanced color detection from various HTML patterns
    const colorSelectors = [
      '[data-color]',
      '[data-variant-color]',
      '[data-testid*="color"]',
      '.color-option',
      '.variant-color',
      '.product-color',
      '.color-selector',
      '[class*="color"]',
      '[id*="color"]'
    ];
    
    colorSelectors.forEach(selector => {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        const colorValue = $elem.attr('data-color') || 
                          $elem.attr('data-variant-color') || 
                          $elem.attr('title') ||
                          $elem.attr('alt') ||
                          $elem.text().trim();
        
        if (colorValue && isValidColor(colorValue) && !colors.includes(colorValue)) {
          colors.push(colorValue);
          console.log(`🎨 HTML selector renk: ${colorValue}`);
        }
      });
    });
    
    $('[data-size], [data-variant-size]').each((_, elem) => {
      const sizeValue = $(elem).attr('data-size') || $(elem).attr('data-variant-size');
      if (sizeValue && isValidSize(sizeValue) && !sizes.includes(sizeValue)) {
        sizes.push(sizeValue);
        console.log(`📏 Data attr beden: ${sizeValue}`);
      }
    });
    
  } catch (error) {
    console.log("HTML çıkarma hatası:", error);
  }
}

function extractStockInfo(htmlContent: string, stockMap: Record<string, boolean>, colors: string[], sizes: string[]): void {
  try {
    // Initialize all variants as out of stock
    colors.forEach(color => {
      sizes.forEach(size => {
        const variantKey = `${color}-${size}`;
        stockMap[variantKey] = false;
      });
    });
    
    // Enhanced stock detection from allVariants
    const allVariantsPattern = /"allVariants":\s*\[(.*?)\]/g;
    let allVariantsMatch;
    while ((allVariantsMatch = allVariantsPattern.exec(htmlContent)) !== null) {
      const variantObjects = extractJSONObjects(allVariantsMatch[1]);
      variantObjects.forEach(variant => {
        const isInStock = variant.inStock === true;
        const sizeValue = variant.value;
        
        if (sizeValue && sizes.includes(sizeValue)) {
          colors.forEach(color => {
            const variantKey = `${color}-${sizeValue}`;
            stockMap[variantKey] = isInStock;
            console.log(`📦 Stok: ${variantKey} = ${isInStock ? 'Mevcut' : 'Tükendi'}`);
          });
        }
      });
    }
    
    // Fallback stock patterns
    const stockPatterns = [
      /"variants":\s*\[(.*?)\]/g,
      /"productVariants":\s*\[(.*?)\]/g
    ];
    
    stockPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const stockObjects = extractJSONObjects(match[1]);
        stockObjects.forEach(item => {
          if (item.attributeType === 'productSize' && item.variants) {
            item.variants.forEach((variant: any) => {
              if (variant.attributeValue && typeof variant.inStock === 'boolean') {
                const sizeKey = variant.attributeValue;
                colors.forEach(color => {
                  const variantKey = `${color}-${sizeKey}`;
                  stockMap[variantKey] = variant.inStock;
                  console.log(`📦 Fallback stok: ${variantKey} = ${variant.inStock ? 'Mevcut' : 'Tükendi'}`);
                });
              }
            });
          }
        });
      }
    });
    
  } catch (error) {
    console.log("Stok çıkarma hatası:", error);
  }
}

function validateAndClean(
  colors: string[], 
  sizes: string[], 
  images: string[],
  variantImages: Record<string, string[]>,
  colorImageMap: Record<string, string[]>,
  variantPricing: Record<string, number>,
  variantSpecificPricing: Record<string, number>,
  stockMap: Record<string, boolean>
): CleanVariantData {
  
  // Clean colors - remove sizes that were misclassified as colors
  const validColors = colors.filter(color => 
    isValidColor(color) && 
    !isValidSize(color) && 
    color !== 'Beden' && 
    color !== 'Size'
  );
  
  // Clean sizes - ensure only valid size formats
  const validSizes = sizes.filter(size => isValidSize(size));
  
  // Clean images - only authentic product images
  const validImages = images
    .filter(url => url.includes('/prod/QC/') || url.includes('/prod/PIM/'))
    .slice(0, 12);
  
  console.log(`🧹 Temizleme: ${colors.length}->${validColors.length} renk, ${sizes.length}->${validSizes.length} beden`);
  
  return {
    colors: validColors,
    sizes: validSizes,
    images: validImages,
    variantImages,
    colorImageMap,
    variantPricing,
    variantSpecificPricing,
    stockMap
  };
}

// Helper functions
function isValidColor(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  // Not a size
  if (isValidSize(value)) return false;
  
  // Not system keywords
  if (['Beden', 'Size', 'beden', 'size'].includes(value)) return false;
  
  // Reasonable length
  if (value.length < 2 || value.length > 25) return false;
  
  return true;
}

function isValidSize(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  // Standard size patterns
  return /^(XS|S|M|L|XL|XXL|2XL|3XL|4XL|\d+)$/i.test(value);
}

function extractJSONObjects(jsonString: string): any[] {
  const objects: any[] = [];
  const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const matches = jsonString.match(objectPattern) || [];
  
  matches.forEach(match => {
    try {
      const obj = JSON.parse(match);
      objects.push(obj);
    } catch (e) {
      // Skip invalid JSON
    }
  });
  
  return objects;
}

function optimizeImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Clean URL and ensure CDN domain
  let finalUrl = url.trim();
  if (finalUrl.startsWith('//')) {
    finalUrl = 'https:' + finalUrl;
  }
  if (finalUrl.startsWith('/') && !finalUrl.startsWith('//')) {
    finalUrl = 'https://cdn.dsmcdn.com' + finalUrl;
  }
  
  // Only Trendyol CDN
  if (!finalUrl.includes('cdn.dsmcdn.com')) return null;
  
  // Only product images (relaxed for more coverage)
  if (!(finalUrl.includes('/QC/') || finalUrl.includes('/PIM/') || finalUrl.includes('/prod/'))) return null;
  
  // Clean URL
  finalUrl = finalUrl.replace(/[{}]/g, '');
  
  // High quality
  if (!finalUrl.includes('_org_zoom.jpg')) {
    finalUrl = finalUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
  }
  
  // HTTPS
  if (!finalUrl.startsWith('https:')) {
    finalUrl = finalUrl.startsWith('//') ? 'https:' + finalUrl : 'https://' + finalUrl;
  }
  
  // Fix org_zoom to full resolution
  finalUrl = finalUrl.replace('org_zoom', 'org');
  
  return finalUrl;
}