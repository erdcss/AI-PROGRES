/**
 * Improved Image Deduplication System
 * Eliminates duplicate and unnecessary product images
 * Ensures only unique, high-quality product images are returned
 */

import * as cheerio from 'cheerio';

interface ImageData {
  url: string;
  quality: 'high' | 'medium' | 'low';
  type: 'main' | 'variant' | 'detail' | 'thumbnail';
  uniqueId: string;
}

export class ImageDeduplicator {
  private static extractImageIdentifier(url: string): string {
    // Extract unique identifier from Trendyol CDN URL
    // Format: .../[hash]/[image_id]_[variant].jpg
    const match = url.match(/\/([a-f0-9-]+)\/(\d+)(?:_[^.]*)?\.(?:jpg|jpeg|png|webp)/i);
    if (match) {
      return `${match[1]}_${match[2]}`;
    }
    
    // Fallback to URL hash
    return url.split('?')[0].split('#')[0].split('/').slice(-2).join('_');
  }

  private static categorizeImage(url: string): ImageData {
    const uniqueId = this.extractImageIdentifier(url);
    
    // Determine quality based on URL patterns
    let quality: 'high' | 'medium' | 'low' = 'medium';
    if (url.includes('_org_zoom') || url.includes('_org.jpg')) {
      quality = 'high';
    } else if (url.includes('_thumb') || url.includes('_small') || url.includes('mnresize')) {
      quality = 'low';
    }
    
    // Determine image type
    let type: 'main' | 'variant' | 'detail' | 'thumbnail' = 'main';
    if (url.includes('_thumb') || url.includes('_small')) {
      type = 'thumbnail';
    } else if (url.includes('variant') || url.includes('color')) {
      type = 'variant';
    } else if (url.includes('detail') || url.includes('zoom')) {
      type = 'detail';
    }

    return {
      url,
      quality,
      type,
      uniqueId
    };
  }

  private static optimizeImageUrl(url: string): string {
    let optimized = url;
    
    // Ensure HTTPS
    optimized = optimized.replace(/^http:/, 'https:');
    
    // Convert to highest quality if not already
    if (!optimized.includes('_org_zoom') && !optimized.includes('mnresize')) {
      optimized = optimized.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
    }
    
    return optimized;
  }

  public static deduplicateImages(imageUrls: string[]): string[] {
    console.log(`🔧 Starting deduplication for ${imageUrls.length} images`);
    
    // Step 1: Filter valid product images only
    const validImages = imageUrls.filter(url => {
      if (!url || typeof url !== 'string') return false;
      if (!url.includes('cdn.dsmcdn.com')) return false;
      if (!url.includes('prod/') && !url.includes('ty')) return false;
      
      // Exclude non-product images
      const excludePatterns = [
        'logo', 'icon', 'button', 'arrow', 'star', 'heart', 'badge',
        'banner', 'header', 'footer', 'nav', 'menu', 'social', 'sprite',
        'common', 'web/', 'ui/', 'static/'
      ];
      
      return !excludePatterns.some(pattern => url.toLowerCase().includes(pattern));
    });

    console.log(`✅ Filtered to ${validImages.length} valid product images`);

    // Step 2: Categorize and deduplicate
    const imageMap = new Map<string, ImageData>();
    
    validImages.forEach(url => {
      const imageData = this.categorizeImage(url);
      const existing = imageMap.get(imageData.uniqueId);
      
      if (!existing) {
        // First occurrence - add it
        imageMap.set(imageData.uniqueId, imageData);
      } else {
        // Duplicate found - keep the highest quality version
        if (this.getQualityScore(imageData.quality) > this.getQualityScore(existing.quality)) {
          imageMap.set(imageData.uniqueId, imageData);
        }
      }
    });

    console.log(`🔄 Deduplicated to ${imageMap.size} unique images`);

    // Step 3: Prioritize and sort
    const uniqueImages = Array.from(imageMap.values())
      .filter(img => img.type !== 'thumbnail') // Remove thumbnails
      .sort((a, b) => {
        // Sort by type priority: main > variant > detail
        const typePriority = { 'main': 3, 'variant': 2, 'detail': 1, 'thumbnail': 0 };
        const typeComparison = typePriority[b.type] - typePriority[a.type];
        if (typeComparison !== 0) return typeComparison;
        
        // Then by quality: high > medium > low
        return this.getQualityScore(b.quality) - this.getQualityScore(a.quality);
      })
      .slice(0, 8) // Limit to 8 high-quality images
      .map(img => this.optimizeImageUrl(img.url));

    console.log(`✨ Final result: ${uniqueImages.length} optimized unique images`);
    console.log(`📊 Deduplication reduced images by ${imageUrls.length - uniqueImages.length} (${Math.round((1 - uniqueImages.length / imageUrls.length) * 100)}%)`);

    return uniqueImages;
  }

  private static getQualityScore(quality: 'high' | 'medium' | 'low'): number {
    switch (quality) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }
}

/**
 * Enhanced feature extraction with proper variant detection
 */
export async function extractEnhancedFeatures($: cheerio.CheerioAPI, htmlContent: string): Promise<Array<{key: string, value: string}>> {
  console.log('🎯 Enhanced feature extraction starting...');
  
  const features: Array<{key: string, value: string}> = [];
  const processedKeys = new Set<string>();
  
  // Method 1: JSON-LD structured data (most reliable)
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      if (jsonData.additionalProperty && Array.isArray(jsonData.additionalProperty)) {
        jsonData.additionalProperty.forEach((prop: any) => {
          if (prop.name && prop.value) {
            const key = prop.name.toString().trim();
            const value = prop.value.toString().trim();
            
            if (key && value && !processedKeys.has(key.toLowerCase())) {
              features.push({ key, value });
              processedKeys.add(key.toLowerCase());
            }
          }
        });
      }
    } catch (e) {
      // Continue
    }
  });

  // Method 2: Enhanced product specification tables with Turkish e-commerce patterns
  const specSelectors = [
    '.product-detail-attributes .detail-attr-item',
    '.product-features .feature-item',
    '.attribute-list .attribute-item',
    '.product-specs tr',
    '.detail-table tr',
    '.properties-table tr',
    '.detail-attr-container .detail-attr-item',
    '.product-detail-info .detail-desc',
    '.feature-list .feature-item',
    '.spec-row',
    '.attribute-row',
    '.product-feature-list li'
  ];

  specSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      
      // Try different extraction patterns
      let key = '';
      let value = '';
      
      // Pattern 1: key-value in separate elements
      const keyEl = $el.find('.detail-attr-item-key, .feature-name, .attr-name, td:first-child').first();
      const valueEl = $el.find('.detail-attr-item-value, .feature-value, .attr-value, td:last-child').first();
      
      if (keyEl.length && valueEl.length) {
        key = keyEl.text().trim();
        value = valueEl.text().trim();
      } else {
        // Pattern 2: colon-separated text
        const fullText = $el.text().trim();
        const colonIndex = fullText.indexOf(':');
        if (colonIndex > 0 && colonIndex < fullText.length - 1) {
          key = fullText.substring(0, colonIndex).trim();
          value = fullText.substring(colonIndex + 1).trim();
        }
      }
      
      // Clean and validate
      if (key && value && key.length > 1 && value.length > 1 && !processedKeys.has(key.toLowerCase())) {
        // Clean up common artifacts
        key = key.replace(/[:\-\*]/g, '').trim();
        value = value.replace(/[^\w\s\-\.\/\%]/g, '').trim();
        
        if (key.length > 1 && value.length > 1 && value !== key) {
          features.push({ key, value });
          processedKeys.add(key.toLowerCase());
        }
      }
    });
  });

  // Method 3: Extract category information from breadcrumb and metadata
  $('.breadcrumb a, .breadcrumb-item, .category-link').each((_, el) => {
    const categoryText = $(el).text().trim();
    if (categoryText && categoryText.length > 2 && categoryText.length < 50 && 
        !processedKeys.has('kategori')) {
      features.push({ key: 'Kategori', value: categoryText });
      processedKeys.add('kategori');
    }
  });

  // Method 4: Extract brand information
  const brandSelectors = ['.brand-name', '.product-brand', '[data-testid="brand"]', '.vendor-name'];
  brandSelectors.forEach(selector => {
    const brandText = $(selector).first().text().trim();
    if (brandText && brandText.length > 1 && brandText.length < 30 && 
        !processedKeys.has('marka')) {
      features.push({ key: 'Marka', value: brandText });
      processedKeys.add('marka');
    }
  });

  // Method 5: Extract product code/SKU
  const codeSelectors = ['.product-code', '.sku', '[data-testid="product-code"]', '.model-no'];
  codeSelectors.forEach(selector => {
    const codeText = $(selector).first().text().trim();
    if (codeText && codeText.length > 3 && codeText.length < 30 && 
        !processedKeys.has('ürün kodu')) {
      features.push({ key: 'Ürün Kodu', value: codeText });
      processedKeys.add('ürün kodu');
    }
  });

  console.log(`✅ Extracted ${features.length} unique product features with category and brand info`);
  
  return features.slice(0, 20); // Increased to 20 to include category and brand info
}

/**
 * Enhanced variant extraction with proper size and color detection
 */
export function extractEnhancedVariants($: cheerio.CheerioAPI, htmlContent: string): Array<{
  color: string;
  colorCode: string;
  size: string;
  inStock: boolean;
}> {
  console.log('🔍 Enhanced variant extraction starting - using comprehensive size/color detection');
  
  const variants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }> = [];

  // Method 1: Extract from Trendyol JSON structures in script tags
  const scriptTags = $('script:not([src])');
  scriptTags.each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // First try to find complete stock information from newer Trendyol format
    const stockDataMatch = scriptContent.match(/variants":\s*\[(.*?)\]/s);
    if (stockDataMatch) {
      try {
        const variantsJson = `[${stockDataMatch[1]}]`;
        const stockVariants = JSON.parse(variantsJson);
        
        console.log(`🔍 Found ${stockVariants.length} variants with stock data`);
        
        stockVariants.forEach((variant: any) => {
          if (variant.size && variant.size.match(/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i)) {
            const sizeName = variant.size.toString().trim();
            const colorName = variant.color || 'Krem';
            
            // Comprehensive stock checking
            let isInStock = true;
            
            // Check multiple stock indicators
            if (variant.stock === 0 || variant.stock === '0' || variant.stockQuantity === 0) {
              isInStock = false;
            }
            if (variant.available === false || variant.available === 'false') {
              isInStock = false;
            }
            if (variant.inStock === false || variant.inStock === 'false') {
              isInStock = false;
            }
            if (variant.disabled === true || variant.selectable === false) {
              isInStock = false;
            }
            
            variants.push({
              color: colorName,
              colorCode: '#F5E6D3',
              size: sizeName,
              inStock: isInStock
            });
            
            console.log(`📦 Direct variant: ${colorName} ${sizeName} (stock: ${isInStock})`);
          }
        });
        
        if (variants.length > 0) {
          console.log(`✅ Found ${variants.length} variants from direct stock data`);
          return; // Skip other methods if we found direct stock data
        }
      } catch (error) {
        console.log('❌ Error parsing direct stock variants:', error);
      }
    }
    
    // Look for variants in __PRODUCT_DETAIL_APP_INITIAL_STATE__
    const productDetailMatch = scriptContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productDetailMatch) {
      try {
        const productData = JSON.parse(productDetailMatch[1]);
        
        if (productData.product?.variants) {
          console.log(`📊 Found ${productData.product.variants.length} variants in product data`);
          
          // Group variants by color and size
          const colorMap: Record<string, string[]> = {}; // color -> [sizes]
          const stockMap: Record<string, boolean> = {}; // color_size -> stock status
          
          productData.product.variants.forEach((variant: any) => {
            // Size variants (attributeType 2)
            if ((variant.attributeType === 2 || variant.attributeType === '2') && variant.attributeValue) {
              const sizeName = variant.attributeValue.toString().trim();
              
              // Validate size format
              const isValidSize = (
                sizeName.match(/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i) ||
                (sizeName.match(/^\d{2}$/) && parseInt(sizeName) >= 28 && parseInt(sizeName) <= 54) ||
                sizeName.match(/^(Tek Beden|One Size|OS)$/i)
              );
              
              if (isValidSize) {
                // Default color if no color variants
                const defaultColor = 'Black';
                if (!colorMap[defaultColor]) colorMap[defaultColor] = [];
                if (!colorMap[defaultColor].includes(sizeName)) {
                  colorMap[defaultColor].push(sizeName);
                  
                  // Check stock status with comprehensive detection
                  const stockKey = `${defaultColor}_${sizeName}`;
                  
                  // Multiple stock indicators to check
                  let isInStock = true;
                  
                  // Method 1: Check inStock field
                  if (variant.inStock === false || variant.inStock === 'false') {
                    isInStock = false;
                  }
                  
                  // Method 2: Check stock quantity
                  if (variant.stock === 0 || variant.stock === '0' || variant.stockQuantity === 0) {
                    isInStock = false;
                  }
                  
                  // Method 3: Check availability
                  if (variant.available === false || variant.available === 'false') {
                    isInStock = false;
                  }
                  
                  // Method 4: Check for out-of-stock text indicators
                  const stockText = JSON.stringify(variant).toLowerCase();
                  if (stockText.includes('stokta yok') || stockText.includes('out of stock') || 
                      stockText.includes('tükendi') || stockText.includes('sold out')) {
                    isInStock = false;
                  }
                  
                  // Method 5: Check for disabled status
                  if (variant.disabled === true || variant.disabled === 'true') {
                    isInStock = false;
                  }
                  
                  stockMap[stockKey] = isInStock;
                  
                  console.log(`📏 Found size: ${sizeName} (stock: ${stockMap[stockKey]})`);
                }
              }
            }
            
            // Color variants (attributeType 1)
            if ((variant.attributeType === 1 || variant.attributeType === '1') && variant.attributeValue) {
              const colorName = variant.attributeValue.toString().trim();
              if (!colorMap[colorName]) colorMap[colorName] = [];
              
              console.log(`🎨 Found color: ${colorName}`);
            }
          });
          
          // Generate variants from color/size combinations
          Object.entries(colorMap).forEach(([color, sizes]) => {
            if (sizes.length === 0) {
              // No sizes found, add default size
              variants.push({
                color: color,
                colorCode: '#000000',
                size: 'Tek Beden',
                inStock: true
              });
            } else {
              // Add each size for this color
              sizes.forEach(size => {
                const stockKey = `${color}_${size}`;
                variants.push({
                  color: color,
                  colorCode: '#000000',
                  size: size,
                  inStock: stockMap[stockKey] ?? true
                });
              });
            }
          });
        }
      } catch (error) {
        console.log('❌ Error parsing product data JSON:', error);
      }
    }
    
    // Alternative: Look for direct size arrays
    const sizeArrayMatch = scriptContent.match(/"sizes":\s*\[(.*?)\]/);
    if (sizeArrayMatch && variants.length === 0) {
      try {
        const sizesStr = `[${sizeArrayMatch[1]}]`;
        const sizes = JSON.parse(sizesStr);
        
        sizes.forEach((size: any) => {
          const sizeName = typeof size === 'string' ? size : size.name || size.value;
          
          if (sizeName && sizeName.match(/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i)) {
            variants.push({
              color: 'Black',
              colorCode: '#000000',
              size: sizeName,
              inStock: size.inStock !== false
            });
            console.log(`📏 Found size from array: ${sizeName}`);
          }
        });
      } catch (error) {
        console.log('❌ Error parsing sizes array:', error);
      }
    }
  });

  // Method 2: Advanced DOM-based stock detection
  if (variants.length === 0) {
    console.log('🔍 No variants found in JSON, trying advanced DOM extraction...');
    
    // Extract sizes from Trendyol size selectors
    const sizes: string[] = [];
    const stockStatus: Record<string, boolean> = {};
    
    // Advanced size selectors for Trendyol
    const sizeSelectors = [
      '.pr-in-sz button',
      '.size-selection-text',
      '.size-options button',
      '.size-button',
      '[data-testid*="size"] button',
      '[data-size]'
    ];
    
    sizeSelectors.forEach(selector => {
      $(selector).each((_, element) => {
        const $el = $(element);
        let sizeText = $el.text().trim() || $el.attr('data-size') || $el.val();
        
        if (sizeText && sizeText.match(/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i)) {
          if (!sizes.includes(sizeText)) {
            sizes.push(sizeText);
            
            // Check stock status
            const isDisabled = $el.hasClass('disabled') || 
                              $el.attr('disabled') !== undefined ||
                              $el.hasClass('out-of-stock') ||
                              $el.hasClass('sold-out') ||
                              $el.closest('.disabled').length > 0;
            
            // Also check for visual indicators
            const hasStockIndicator = $el.find('.stock-indicator').length > 0 ||
                                     $el.text().includes('Tükendi') ||
                                     $el.text().includes('Stokta yok');
            
            stockStatus[sizeText] = !isDisabled && !hasStockIndicator;
            
            console.log(`📏 DOM size: ${sizeText} (stock: ${stockStatus[sizeText]}, disabled: ${isDisabled})`);
          }
        }
      });
    });
    
    // Extract colors
    const colors: string[] = [];
    const colorSelectors = [
      '.pr-in-cn img',
      '[data-testid*="color"] img',
      '.color-option img'
    ];
    
    colorSelectors.forEach(selector => {
      $(selector).each((_, element) => {
        const colorName = $(element).attr('alt') || $(element).attr('title') || '';
        if (colorName && !colors.includes(colorName)) {
          colors.push(colorName);
          console.log(`🎨 DOM color: ${colorName}`);
        }
      });
    });
    
    // If no colors found, use default
    if (colors.length === 0) {
      colors.push('Krem');
    }
    
    // Generate variants from DOM data
    colors.forEach(color => {
      sizes.forEach(size => {
        variants.push({
          color: color,
          colorCode: '#F5E6D3',
          size: size,
          inStock: stockStatus[size] ?? true
        });
        console.log(`📦 DOM variant: ${color} ${size} (stock: ${stockStatus[size] ?? true})`);
      });
    });
  }

  // Remove duplicates
  const uniqueVariants = variants.filter((variant, index, self) => 
    index === self.findIndex(v => v.color === variant.color && v.size === variant.size)
  );

  console.log(`✅ Enhanced variant extraction complete: ${uniqueVariants.length} unique variants found`);
  
  return uniqueVariants;

  /* Disabled fake variant generation code below */
  /*
  // DISABLED - Method 1: Enhanced size extraction with Turkish size patterns
  const sizeSelectors = [
    '.sp-itm', // Trendyol size items
    '.variant-size',
    '.size-variant',
    '.product-size-item',
    '[data-testid*="size"]',
    '[data-size]',
    '.size-option',
    '.size-selector .option',
    '.product-variant-size',
    '.variant-option[data-variant-type="size"]'
  ];
  
  sizeSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      let sizeText = $el.text().trim() || $el.attr('data-size') || $el.attr('title') || $el.attr('data-value') || '';
      
      // Clean size text
      sizeText = sizeText.replace(/\s+/g, ' ').trim();
      
      // Turkish and international size patterns
      const sizePatterns = [
        /^(XS|S|M|L|XL|XXL|XXXL)$/i,
        /^(\d{1,3})$/,  // Numeric sizes like 38, 40, 42
        /^(\d{1,3}\/\d{1,3})$/, // Size ranges like 36/38
        /^(SMALL|MEDIUM|LARGE)$/i,
        /^(KÜÇÜK|ORTA|BÜYÜK)$/i, // Turkish sizes
        /^(TEK|STANDART|STD)$/i // Standard sizes
      ];
      
      const isValidSize = sizePatterns.some(pattern => pattern.test(sizeText));
      
      if (sizeText && isValidSize && sizeText.length <= 10) {
        sizes.add(sizeText.toUpperCase());
        console.log(`📏 Size found: ${sizeText}`);
      }
    });
  });

  // Method 2: Enhanced color extraction with Turkish color names
  const colorSelectors = [
    '.variant-color',
    '.color-variant', 
    '.product-color-item',
    '[data-testid*="color"]',
    '[data-color]',
    '.color-option',
    '.color-selector .option',
    '.product-variant-color',
    '.variant-option[data-variant-type="color"]',
    '[style*="background-color"]', // Color swatches
    '.color-swatch'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      let colorText = $el.attr('data-color') || 
                     $el.attr('title') || 
                     $el.attr('data-value') ||
                     $el.text().trim() ||
                     $el.attr('alt') || '';
      
      // Extract color from style attribute if present
      const style = $el.attr('style') || '';
      const colorMatch = style.match(/background-color:\s*([^;]+)/);
      if (colorMatch && !colorText) {
        colorText = colorMatch[1].trim();
      }
      
      // Clean color text
      colorText = colorText.replace(/\s+/g, ' ').trim();
      
      // Turkish and international color validation
      const turkishColors = [
        'beyaz', 'siyah', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'turuncu', 
        'mor', 'pembe', 'gri', 'kahverengi', 'lacivert', 'bordo', 'krem',
        'bej', 'füme', 'antrasit', 'ekru', 'pudra', 'mint', 'koyu', 'açık'
      ];
      
      const englishColors = [
        'white', 'black', 'red', 'blue', 'green', 'yellow', 'orange',
        'purple', 'pink', 'gray', 'grey', 'brown', 'navy', 'burgundy', 
        'cream', 'beige', 'dark', 'light', 'mint', 'coral', 'indigo'
      ];
      
      const allColors = [...turkishColors, ...englishColors];
      const colorLower = colorText.toLowerCase();
      
      const isValidColor = colorText.length > 2 && colorText.length < 30 && (
        allColors.some(color => colorLower.includes(color)) ||
        /^[a-zA-ZğüşıöçĞÜŞİÖÇ\s\-]+$/.test(colorText) // Turkish character support
      );
      
      if (isValidColor) {
        colors.add(colorText);
        console.log(`🎨 Color found: ${colorText}`);
      }
    });
  });

  // Method 3: JSON-LD variant extraction
  const jsonLdScripts = $('script[type="application/ld+json"]');
  jsonLdScripts.each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      // Extract variants from structured data
      if (jsonData.hasVariant && Array.isArray(jsonData.hasVariant)) {
        jsonData.hasVariant.forEach((variant: any) => {
          if (variant.name) {
            // Parse variant name for size/color info
            const variantName = variant.name.toLowerCase();
            
            // Extract sizes from variant names
            const sizeMatch = variantName.match(/\b(xs|s|m|l|xl|xxl|\d{2,3})\b/i);
            if (sizeMatch) {
              sizes.add(sizeMatch[1].toUpperCase());
            }
            
            // Extract colors from variant names
            const turkishColors = ['beyaz', 'siyah', 'kırmızı', 'mavi', 'yeşil', 'sarı'];
            turkishColors.forEach(color => {
              if (variantName.includes(color)) {
                colors.add(color.charAt(0).toUpperCase() + color.slice(1));
              }
            });
          }
        });
      }
    } catch (e) {
      // Continue with other methods
    }
  });

  // Method 4: Pattern extraction from HTML content
  const htmlText = $.text();
  
  // Extract size patterns from text
  const sizeMatches = htmlText.match(/\b(XS|S|M|L|XL|XXL|\d{2}|\d{2}\/\d{2})\b/gi);
  if (sizeMatches) {
    sizeMatches.slice(0, 10).forEach(size => {
      if (size.length <= 5) {
        sizes.add(size.toUpperCase());
      }
    });
  }
  
  // Extract color patterns from text
  const colorMatches = htmlText.match(/\b(beyaz|siyah|kırmızı|mavi|yeşil|sarı|turuncu|mor|pembe|gri|kahverengi|lacivert|bordo|krem|bej|white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|brown|navy)\b/gi);
  if (colorMatches) {
    colorMatches.slice(0, 5).forEach(color => {
      colors.add(color.charAt(0).toUpperCase() + color.slice(1).toLowerCase());
    });
  }

  // If no specific variants found, use defaults
  if (sizes.size === 0) {
    sizes.add('STANDART');
  }
  if (colors.size === 0) {
    colors.add('Varsayılan');
  }

  // Create variant combinations
  Array.from(colors).forEach(color => {
    Array.from(sizes).forEach(size => {
      variants.push({
        color,
        colorCode: color.toLowerCase().replace(/\s+/g, '-'),
        size,
        inStock: true // Default to in stock unless specifically marked otherwise
      });
    });
  });

  console.log(`✅ Generated ${variants.length} variants from ${colors.size} colors and ${sizes.size} sizes`);
  
  return variants;
  */ // End of disabled fake variant generation
}