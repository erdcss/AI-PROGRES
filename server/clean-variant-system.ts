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
    // Pattern 1: Script içindeki JSON görsel arrays
    const imageArrayPatterns = [
      /"images":\s*\[(.*?)\]/g,
      /"galleryImages":\s*\[(.*?)\]/g,
      /"productImages":\s*\[(.*?)\]/g
    ];
    
    imageArrayPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const urlMatches = match[1].match(/https:\/\/cdn\.dsmcdn\.com\/[^"',\s}]+\.(jpg|jpeg|png|webp)/gi) || [];
        urlMatches.forEach(url => {
          const cleanUrl = optimizeImageUrl(url);
          if (cleanUrl && !images.includes(cleanUrl)) {
            images.push(cleanUrl);
          }
        });
      }
    });
    
    // Pattern 2: Direct URL matches
    const directUrlPattern = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\/prod\/(?:QC|PIM)\/[^"'\s,}]+\.(jpg|jpeg|png|webp)/gi;
    const directMatches = htmlContent.match(directUrlPattern) || [];
    directMatches.forEach(url => {
      const cleanUrl = optimizeImageUrl(url);
      if (cleanUrl && !images.includes(cleanUrl)) {
        images.push(cleanUrl);
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
    
    // Fallback extraction from various JSON patterns
    const jsonPatterns = [
      /"allVariants":\s*\[(.*?)\]/g,
      /"productColors":\s*\[(.*?)\]/g,
      /"sizes":\s*\[(.*?)\]/g
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
    
    // Data attributes
    $('[data-color], [data-variant-color]').each((_, elem) => {
      const colorValue = $(elem).attr('data-color') || $(elem).attr('data-variant-color');
      if (colorValue && isValidColor(colorValue) && !colors.includes(colorValue)) {
        colors.push(colorValue);
        console.log(`🎨 Data attr renk: ${colorValue}`);
      }
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
    const stockPattern = /"variants":\s*\[(.*?)\]/;
    const stockMatch = htmlContent.match(stockPattern);
    
    if (stockMatch) {
      const stockObjects = extractJSONObjects(stockMatch[1]);
      stockObjects.forEach(item => {
        if (item.attributeType === 'productSize' && item.variants) {
          item.variants.forEach((variant: any) => {
            if (variant.attributeValue && typeof variant.inStock === 'boolean') {
              const sizeKey = variant.attributeValue;
              colors.forEach(color => {
                const variantKey = `${color.toLowerCase()}-${sizeKey}`;
                stockMap[variantKey] = variant.inStock;
              });
            }
          });
        }
      });
    }
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
  
  // Only Trendyol CDN
  if (!url.includes('cdn.dsmcdn.com')) return null;
  
  // Only product images
  if (!(url.includes('/prod/QC/') || url.includes('/prod/PIM/'))) return null;
  
  // Clean URL
  let cleanUrl = url.replace(/[{}]/g, '');
  
  // High quality
  if (!cleanUrl.includes('_org_zoom.jpg')) {
    cleanUrl = cleanUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
  }
  
  // HTTPS
  if (!cleanUrl.startsWith('https:')) {
    cleanUrl = cleanUrl.startsWith('//') ? 'https:' + cleanUrl : 'https://' + cleanUrl;
  }
  
  return cleanUrl;
}