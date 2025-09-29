/**
 * Real Size Extractor - Authentic size variant detection with stock status
 */

import * as cheerio from 'cheerio';

export interface RealVariant {
  color: string;
  size: string;
  inStock: boolean;
  variantId?: string;
}

export async function extractRealSizes(html: string, url: string): Promise<RealVariant[]> {
  const $ = cheerio.load(html);
  
  console.log('🎯 Real size extraction starting...');
  
  const variants: RealVariant[] = [];
  
  // Method 1: Enhanced Trendyol variants JSON data extraction
  try {
    const scriptTags = $('script').toArray();
    
    for (const script of scriptTags) {
      const scriptContent = $(script).html();
      if (scriptContent) {
        
        // Enhanced patterns for Trendyol variant structures
        const advancedPatterns = [
          // Standard variants array
          /"variants":\s*\[([\s\S]*?)\]/g,
          /"productVariants":\s*\[([\s\S]*?)\]/g,
          /"allVariants":\s*\[([\s\S]*?)\]/g,
          // Attribute variants
          /"attributes":\s*\[([\s\S]*?)\]/g,
          /"productAttributes":\s*\[([\s\S]*?)\]/g,
          // Size-specific patterns
          /"sizes":\s*\[([\s\S]*?)\]/g,
          /"availableSizes":\s*\[([\s\S]*?)\]/g,
          // Color-specific patterns
          /"colors":\s*\[([\s\S]*?)\]/g,
          /"availableColors":\s*\[([\s\S]*?)\]/g,
          // Trendyol specific
          /"slrCts":\s*\[([\s\S]*?)\]/g,
          /"vrnts":\s*\[([\s\S]*?)\]/g
        ];
        
        for (const pattern of advancedPatterns) {
          let match;
          while ((match = pattern.exec(scriptContent)) !== null) {
            try {
              const content = match[1];
              if (content) {
                // Try to parse individual variant objects
                const itemPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
                let itemMatch;
                
                while ((itemMatch = itemPattern.exec(content)) !== null) {
                  try {
                    const item = JSON.parse(itemMatch[0]);
                    
                    // Extract size/color information
                    const size = item.size || item.attributeValue || item.value || 
                               item.name || item.displayValue || item.label;
                    const color = item.color || item.colorName || item.colourName || 
                                item.colorDisplayName || item.colorValue;
                    const inStock = item.inStock !== false && 
                                  item.stock !== 0 && 
                                  item.available !== false &&
                                  item.isAvailable !== false;
                    
                    // Only add if it looks like a real size/color variant
                    if (size && size.length > 0) {
                      // Filter out fake size values like "0.0", "20", "34.99", "AZ"
                      const isValidSize = (
                        // Standard clothing sizes
                        size.match(/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i) ||
                        // Shoe sizes (28-54)
                        (size.match(/^\d{2}$/) && parseInt(size) >= 28 && parseInt(size) <= 54) ||
                        // European clothing sizes (34-56)
                        (size.match(/^\d{2}$/) && parseInt(size) >= 34 && parseInt(size) <= 56) ||
                        // Age-based sizes for children's clothing (e.g., "6-8 yaş", "9-10 yaş", "12-14 yaş")
                        size.match(/^\d{1,2}-\d{1,2}\s*(yaş|ya|age|yrs?|years?)$/i) ||
                        // Single age sizes (e.g., "8 yaş", "10 yaş")
                        size.match(/^\d{1,2}\s*(yaş|ya|age|yrs?|years?)$/i) ||
                        // Month-based sizes for babies (e.g., "6-9 ay", "12-18 ay")
                        size.match(/^\d{1,2}-\d{1,2}\s*(ay|aylık|months?|mo)$/i) ||
                        // Other valid size patterns
                        size.match(/^(Tek Beden|One Size|OS)$/i) ||
                        size.match(/^\d+\/\d+$/) // Size like "38/40"
                      );
                      
                      // Don't add random numbers or invalid patterns
                      const isInvalidSize = (
                        size.match(/^\d+\.\d+$/) ||  // Decimal numbers like "34.99"
                        size.match(/^[A-Z]{1,3}$/) && !size.match(/^(XS|S|M|L|XL|XXL|XXXL|OS)$/i) || // Random letters like "AZ"
                        (parseFloat(size) < 10 && !size.match(/^[XS|S|M|L]/) && !size.match(/^\d{1,2}\s*(yaş|ya|age|yrs?|years?|ay|aylık|months?|mo)$/i)) // Small numbers that aren't sizes or ages
                      );
                      
                      if (isValidSize && !isInvalidSize) {
                        variants.push({
                          color: color || 'Standart',
                          size: size,
                          inStock: inStock,
                          variantId: item.id || item.variantId || item.attributeId
                        });
                      }
                    }
                  } catch (parseError) {
                    // Continue with next item
                  }
                }
              }
            } catch (error) {
              // Continue with next pattern
            }
          }
        }
        
        // Look for direct size/color arrays in script - but be more selective
        const directSizePattern = /"([XS|S|M|L|XL|XXL|XXXL|\d+])"/g;
        let sizeMatch;
        const foundSizes = new Set<string>();
        
        // Only process if this looks like a clothing/shoe product
        const productTitle = scriptContent.toLowerCase();
        const isClothingProduct = productTitle.includes('elbise') || 
                                productTitle.includes('tişört') || 
                                productTitle.includes('pantolon') ||
                                productTitle.includes('ayakkabı') ||
                                productTitle.includes('çanta') ||
                                productTitle.includes('gömlek') ||
                                productTitle.includes('mont') ||
                                productTitle.includes('ceket');
        
        if (isClothingProduct) {
          while ((sizeMatch = directSizePattern.exec(scriptContent)) !== null) {
            const size = sizeMatch[1];
            if (size && !foundSizes.has(size) && 
                (size.match(/^(XS|S|M|L|XL|XXL|XXXL)$/) || 
                 size.match(/^\d{1,2}$/) && parseInt(size) >= 28 && parseInt(size) <= 54)) {
              foundSizes.add(size);
              variants.push({
                color: 'Standart',
                size: size,
                inStock: true
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.log('Enhanced JSON variant extraction failed');
  }
  
  // Method 2: Size selector elements
  if (variants.length === 0) {
    try {
      const sizeElements = $('.pr-in-dt-sz .pr-in-dt-sz-wr button, .size-selector button, .variant-size button');
      
      sizeElements.each((_, element) => {
        const $element = $(element);
        const size = $element.text().trim();
        const isDisabled = $element.hasClass('disabled') || $element.attr('disabled');
        const isOutOfStock = $element.hasClass('out-of-stock') || $element.hasClass('sold-out');
        
        if (size && size !== '') {
          variants.push({
            color: 'Standart',
            size: size,
            inStock: !isDisabled && !isOutOfStock,
            variantId: $element.attr('data-id') || $element.attr('data-variant-id')
          });
        }
      });
    } catch (error) {
      console.log('Size selector extraction failed');
    }
  }
  
  // Method 3: Color selector elements
  if (variants.length === 0) {
    try {
      const colorElements = $('.pr-in-dt-cl .pr-in-dt-cl-wr button, .color-selector button, .variant-color button');
      
      colorElements.each((_, element) => {
        const $element = $(element);
        const color = $element.attr('title') || $element.text().trim() || 'Standart';
        const isDisabled = $element.hasClass('disabled') || $element.attr('disabled');
        const isOutOfStock = $element.hasClass('out-of-stock') || $element.hasClass('sold-out');
        
        variants.push({
          color: color,
          size: 'Tek Beden',
          inStock: !isDisabled && !isOutOfStock,
          variantId: $element.attr('data-id') || $element.attr('data-variant-id')
        });
      });
    } catch (error) {
      console.log('Color selector extraction failed');
    }
  }
  
  // Method 4: Script-based variant detection
  if (variants.length === 0) {
    try {
      const scriptTags = $('script').toArray();
      
      for (const script of scriptTags) {
        const scriptContent = $(script).html();
        if (scriptContent) {
          
          // Look for size patterns in script content
          const sizePatterns = [
            /"size":\s*"([^"]+)"/g,
            /"attributeValue":\s*"([^"]+)"/g,
            /"value":\s*"([^"]+)"/g,
            /size:\s*"([^"]+)"/g
          ];
          
          const foundSizes = new Set<string>();
          
          sizePatterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(scriptContent)) !== null) {
              const size = match[1];
              if (size && !foundSizes.has(size)) {
                foundSizes.add(size);
                
                // Try to determine stock status from surrounding context
                const contextStart = Math.max(0, match.index - 200);
                const contextEnd = Math.min(scriptContent.length, match.index + 200);
                const context = scriptContent.substring(contextStart, contextEnd);
                
                const inStock = !context.includes('"inStock":false') && 
                               !context.includes('"stock":0') &&
                               !context.includes('soldOut:true');
                
                variants.push({
                  color: 'Standart',
                  size: size,
                  inStock: inStock
                });
              }
            }
          });
        }
      }
    } catch (error) {
      console.log('Script-based variant extraction failed');
    }
  }
  
  // Method 5: Default fallback with stock detection
  if (variants.length === 0) {
    console.log('🚫 Gerçek varyant seçenekleri bulunamadı - varsayılan varyant oluşturuluyor');
    
    // Check if product is in stock at all
    const stockIndicators = [
      $('.product-stock-status'),
      $('.stock-info'),
      $('.add-to-basket'),
      $('.sepete-ekle')
    ];
    
    let inStock = true;
    stockIndicators.forEach(indicator => {
      const text = indicator.text().toLowerCase();
      if (text.includes('stokta yok') || text.includes('tükendi') || text.includes('out of stock')) {
        inStock = false;
      }
    });
    
    variants.push({
      color: 'Standart',
      size: 'Tek Beden',
      inStock: inStock
    });
  }
  
  // Remove duplicates and sort
  const uniqueVariants = variants.filter((variant, index, self) => 
    index === self.findIndex(v => v.color === variant.color && v.size === variant.size)
  );
  
  // Sort sizes numerically if they are numbers
  uniqueVariants.sort((a, b) => {
    const aSize = parseFloat(a.size);
    const bSize = parseFloat(b.size);
    
    if (!isNaN(aSize) && !isNaN(bSize)) {
      return aSize - bSize;
    }
    return a.size.localeCompare(b.size);
  });
  
  console.log(`✅ Real variants extracted: ${uniqueVariants.length} variants`);
  uniqueVariants.forEach(variant => {
    console.log(`   📦 ${variant.color} - ${variant.size} (${variant.inStock ? 'Stokta' : 'Stokta Yok'})`);
  });
  
  return uniqueVariants;
}