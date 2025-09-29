/**
 * Scenario-Based Extractors
 * Specialized extraction logic for each scenario type
 */

import { ExtractionScenario, ScenarioExtractionConfig } from './scenario-manager';

export interface VariantExtractionResult {
  sizes: string[];
  colors: string[];
  stockMap: Map<string, boolean>;
  priceMap: Map<string, number>;
  imageMap: Map<string, string[]>;
}

export class ScenarioExtractors {
  
  /**
   * Extract variants based on detected scenario
   */
  static extractByScenario(
    scenario: ExtractionScenario,
    config: ScenarioExtractionConfig,
    $: any,
    htmlContent: string,
    title: string = ''
  ): VariantExtractionResult {
    console.log(`🎯 Using ${scenario} extraction strategy`);
    
    switch (scenario) {
      case ExtractionScenario.SINGLE_VARIANT:
        return this.extractSingleVariant($, htmlContent, title);
      
      case ExtractionScenario.MULTI_SIZE:
        return this.extractMultiSize($, config, htmlContent, title);
      
      case ExtractionScenario.MULTI_COLOR:
        return this.extractMultiColor($, config, htmlContent, title);
      
      case ExtractionScenario.FULL_MATRIX:
        return this.extractFullMatrix($, config, htmlContent, title);
      
      case ExtractionScenario.OUT_OF_STOCK:
        return this.extractOutOfStock($, config, htmlContent, title);
      
      case ExtractionScenario.COMPLEX_VARIANTS:
        return this.extractComplexVariants($, config, htmlContent, title);
      
      default:
        return this.extractSingleVariant($, htmlContent, title);
    }
  }

  /**
   * Extract single variant products (no size/color options)
   */
  private static extractSingleVariant($: any, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`📦 Extracting single variant product`);
    
    // For single variant products, return empty variants to avoid fake data
    const sizes: string[] = [];
    const colors: string[] = [];
    
    const stockMap = new Map<string, boolean>();
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`📦 Single variant: No authentic variants found - returning empty variants`);
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract multi-size products (multiple sizes, single color)
   */
  private static extractMultiSize($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`📏 Extracting multi-size product`);
    
    const sizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    
    // If no authentic sizes found, return empty variants
    if (sizes.length === 0) {
      console.log(`📏 No authentic sizes found - returning empty variants`);
      return { 
        sizes: [], 
        colors: [], 
        stockMap: new Map<string, boolean>(), 
        priceMap: new Map<string, number>(), 
        imageMap: new Map<string, string[]>() 
      };
    }
    
    // Enhanced color extraction - try multiple methods
    let colors: string[] = [];
    
    // Method 1: Extract from title
    const titleColors = this.extractColorFromTitle(title);
    if (titleColors && titleColors.length > 0) {
      colors = titleColors;
      console.log(`🎨 Colors from title: [${colors.join(', ')}]`);
    }
    
    // Method 2: Extract from HTML content if no title colors
    if (colors.length === 0) {
      colors = this.extractColors($, config.colorSelectors, htmlContent, title);
      console.log(`🎨 Colors from HTML: [${colors.join(', ')}]`);
    }
    
    // Method 3: Advanced pattern matching in HTML - with validation
    if (colors.length === 0) {
      const htmlColorPatterns = [
        /color[^>]*>(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM)/gi,
        /"color":\s*"([^"]*BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM[^"]*)"/gi,
        /renk[^>]*>(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM)/gi
      ];
      
      const candidateColors: string[] = [];
      htmlColorPatterns.forEach((pattern, index) => {
        const matches = htmlContent.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const colorMatch = match.match(/(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM)/i);
            if (colorMatch) {
              candidateColors.push(colorMatch[1].toLowerCase()); // Normalize case
              console.log(`🎨 Color candidate "${colorMatch[1]}" found via HTML pattern ${index + 1}`);
            }
          });
        }
      });
      
      // ✅ ENHANCED: Apply validation to HTML-extracted colors
      colors = candidateColors.filter(color => this.isValidColor(color));
      console.log(`🎨 HTML pattern validation: ${candidateColors.length} candidates -> ${colors.length} valid colors`);
    }
    
    // ✅ ENHANCED: Final validation pass for all extracted colors
    colors = colors.filter(color => this.isValidColor(color));
    
    // ✅ FIXED: NO FALLBACK - Return empty if no authentic colors found
    if (colors.length === 0) {
      console.log(`❌ No authentic colors found after validation - returning empty array`);
    }
    
    // Size güvenlik kontrolü - string olmayan değerleri filtrele ve comma-separated string'leri ayır
    const safeSizes: string[] = [];
    sizes.forEach((size: any) => {
      if (typeof size === 'string' && size.trim().length > 0) {
        // Virgülle ayrılmış string'leri kontrol et
        if (size.includes(',')) {
          const splitSizes = size.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          safeSizes.push(...splitSizes);
          console.log(`📏 Comma-separated sizes split: "${size}" -> [${splitSizes.join(', ')}]`);
        } else {
          safeSizes.push(size.trim());
        }
      }
    });
    
    // Stok durumu kontrolü ve stoktaki bedenleri filtreleme
    const stockMap = this.extractSizeStockStatus($, config.stockSelectors, safeSizes);
    const stockedSizes = this.filterInStockSizes(safeSizes, stockMap);
    
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`📏 Multi-size: ${stockedSizes.length} sizes found [${stockedSizes.join(', ')}], color="${colors[0]}"`);
    console.log(`📦 Stoktaki bedenler: [${stockedSizes.join(', ')}] (toplam ${safeSizes.length} bedenden ${stockedSizes.length} tanesi stoktaki)`);
    
    // ✅ FIXED: NO FALLBACK - Return empty if no authentic sizes found
    if (stockedSizes.length === 0) {
      console.log(`❌ No authentic sizes found - product has no size variants`);
      return {
        sizes: [],
        colors: [],
        stockMap: new Map(),
        priceMap,
        imageMap
      };
    }
    
    return { sizes: stockedSizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract multi-color products (SINGLE COLOR POLICY - tek renk per URL)
   */
  private static extractMultiColor($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`🎨 Extracting SINGLE COLOR (multi-color scenario with single color policy)`);
    
    const extractedColors = this.extractColors($, config.colorSelectors, htmlContent, title);
    
    // ✅ ENHANCED: Apply validation to extracted colors
    const validatedColors = extractedColors.filter(color => this.isValidColor(color));
    
    // ✅ TEK RENK POLİTİKASI: Sadece ilk rengi al
    let finalColors: string[] = [];
    
    if (validatedColors.length > 0) {
      const singleColor = validatedColors[0]; // SADECE İLK RENK
      finalColors = [singleColor];
      console.log(`🎯 SINGLE COLOR policy applied: ${singleColor} (from ${validatedColors.length} validated colors)`);
    } else {
      console.log(`❌ No authentic color found after validation - returning empty array`);
      finalColors = [];
    }
    
    // ✅ FIXED: NO FALLBACK - Return empty sizes if no authentic size data
    const sizes: string[] = [];
    const stockMap = this.extractColorStockStatus($, config.stockSelectors, finalColors);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`✅ Multi-color with SINGLE COLOR: 1 color [${finalColors.join(', ')}], size="${sizes[0]}"`);
    
    return { sizes, colors: finalColors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract full matrix products (SINGLE COLOR POLICY - tek renk × multiple sizes)
   */
  private static extractFullMatrix($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`🔳 Extracting SINGLE COLOR matrix product`);
    
    const rawSizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    const extractedColors = this.extractColors($, config.colorSelectors, htmlContent, title);
    
    // ✅ ENHANCED: Apply validation to extracted colors
    const validatedColors = extractedColors.filter(color => this.isValidColor(color));
    
    // Size güvenlik kontrolü ve comma-separated string'leri ayır
    const safeSizes: string[] = [];
    rawSizes.forEach((size: any) => {
      if (typeof size === 'string' && size.trim().length > 0) {
        // Virgülle ayrılmış string'leri kontrol et
        if (size.includes(',')) {
          const splitSizes = size.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          safeSizes.push(...splitSizes);
          console.log(`📏 Matrix comma-separated sizes split: "${size}" -> [${splitSizes.join(', ')}]`);
        } else {
          safeSizes.push(size.trim());
        }
      }
    });
    
    // ✅ ENHANCED: Use validated colors only
    let finalColors: string[] = [];
    
    if (validatedColors.length > 0) {
      const singleColor = validatedColors[0]; // SADECE İLK VALIDATED RENK
      finalColors = [singleColor];
      console.log(`🎯 SINGLE COLOR for matrix: ${singleColor} (from ${validatedColors.length} validated colors)`);
    } else {
      finalColors = [];
      console.log(`❌ No authentic color found after validation for matrix - returning empty array`);
    }
    
    const stockMap = this.extractMatrixStockStatus($, config.stockSelectors, safeSizes, finalColors);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`✅ Matrix with SINGLE COLOR: ${safeSizes.length} sizes × 1 color = ${safeSizes.length} variants`);
    
    return { sizes: safeSizes, colors: finalColors, stockMap, priceMap, imageMap };
  }

  /**
   * Stoktaki bedenleri filtrele
   */
  private static filterInStockSizes(sizes: string[], stockMap: Map<string, boolean>): string[] {
    const inStockSizes = sizes.filter(size => {
      const isInStock = stockMap.get(size);
      if (isInStock === false) {
        console.log(`❌ Beden "${size}" stokta yok - filtrelendi`);
        return false;
      }
      console.log(`✅ Beden "${size}" stoktaki`);
      return true;
    });
    
    console.log(`📦 Stok filtresi: ${sizes.length} bedenden ${inStockSizes.length} tanesi stoktaki`);
    return inStockSizes;
  }

  /**
   * Extract out of stock products
   */
  private static extractOutOfStock($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`❌ Extracting out-of-stock product`);
    
    // Try to extract what variants were available
    const sizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    const rawColors = this.extractColors($, config.colorSelectors, htmlContent, title);
    
    // ✅ ENHANCED: Apply validation to extracted colors
    const colors = rawColors.filter(color => this.isValidColor(color));
    
    const stockMap = new Map<string, boolean>();
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    // If no authentic variants found, return empty variants
    if (sizes.length === 0 && colors.length === 0) {
      console.log(`❌ No authentic variants found for out-of-stock product - returning empty variants`);
      return { sizes: [], colors: [], stockMap, priceMap, imageMap };
    }
    
    // Mark all variants as out of stock
    sizes.forEach(size => stockMap.set(size, false));
    
    console.log(`❌ Out of stock: ${sizes.length} sizes, ${colors.length} colors (all unavailable)`);
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract complex variants (custom handling)
   */
  private static extractComplexVariants($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`🔧 Extracting complex variants`);
    
    // Use all available extraction methods
    const sizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    const rawColors = this.extractColors($, config.colorSelectors, htmlContent, title);
    
    // ✅ ENHANCED: Apply validation to extracted colors
    const colors = rawColors.filter(color => this.isValidColor(color));
    
    const stockMap = this.extractMatrixStockStatus($, config.stockSelectors, sizes, colors);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`🔧 Complex variants: ${sizes.length} sizes, ${colors.length} colors`);
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract sizes using multiple selectors
   */
  private static extractSizes($: any, selectors: string[], htmlContent: string): string[] {
    const extractedSizes = new Set<string>();
    
    console.log(`🔍 Extracting sizes with ${selectors.length} selectors...`);
    
    // Method 1: Enhanced selector-based detection
    const sizeSelectors = [
      // Button selectors
      'button[data-testid*="size"]',
      'button[class*="size"]',
      'button[aria-label*="beden"]',
      'button[title*="beden"]',
      'button[data-testid*="variant"]',
      '.size-selector button',
      '.variant-size-option',
      '.product-variant button',
      '.variant-item',
      
      // Span and div selectors  
      'span[data-testid*="size"]',
      'div[data-testid*="size"]',
      'span[class*="size"]',
      'div[class*="size"]',
      'span[aria-label*="beden"]',
      'div[aria-label*="beden"]',
      
      // General variant selectors
      '[data-variant-size]',
      '[data-size]',
      '.variant-option',
      '.size-option',
      
      // Trendyol specific selectors
      '.pr-in-sz button',
      '.variant-buttons button',
      '.size-variants button',
      '.product-sizes button'
    ];
    
    let foundValidSizeElements = false;
    
    sizeSelectors.forEach(selector => {
      const elements = $(selector);
      console.log(`🔍 Selector "${selector}" found ${elements.length} elements`);
      
      if (elements.length > 0) {
        elements.each((i: number, el: any) => {
          const text = $(el).text().trim();
          const ariaLabel = $(el).attr('aria-label') || '';
          const title = $(el).attr('title') || '';
          const dataValue = $(el).attr('data-value') || '';
          const dataSize = $(el).attr('data-size') || '';
          const dataVariantSize = $(el).attr('data-variant-size') || '';
          
          console.log(`🔍 Element ${i}: text="${text}", aria-label="${ariaLabel}", title="${title}"`);
          
          [text, ariaLabel, title, dataValue, dataSize, dataVariantSize].forEach(value => {
            if (value && typeof value === 'string') {
              // Handle comma-separated size strings
              if (value.includes(',')) {
                const sizes = value.split(',').map((s: string) => s.trim());
                sizes.forEach((size: string) => {
                  if (this.isValidSize(size)) {
                    extractedSizes.add(size.toUpperCase());
                    foundValidSizeElements = true;
                    console.log(`✅ AUTHENTIC Size "${size}" found via selector: ${selector}`);
                  }
                });
              } else if (this.isValidSize(value.trim())) {
                const size = value.trim().toUpperCase();
                extractedSizes.add(size);
                foundValidSizeElements = true;
                console.log(`✅ AUTHENTIC Size "${size}" found via selector: ${selector}`);
              }
            }
          });
        });
      }
    });
    
    // Method 2: JSON-LD and structured data extraction
    if (!foundValidSizeElements) {
      console.log(`🔍 No DOM elements found, checking structured data...`);
      
      $('script[type="application/ld+json"]').each((_, script) => {
        try {
          const jsonData = JSON.parse($(script).html() || '{}');
          
          // Check for product variants in JSON-LD
          if (jsonData.hasVariant) {
            jsonData.hasVariant.forEach((variant: any) => {
              if (variant.size || variant.name) {
                const sizeValue = variant.size || variant.name;
                
                // Handle comma-separated size strings
                if (typeof sizeValue === 'string' && sizeValue.includes(',')) {
                  const sizes = sizeValue.split(',').map((s: string) => s.trim());
                  sizes.forEach((size: string) => {
                    if (this.isValidSize(size)) {
                      extractedSizes.add(size.toUpperCase());
                      foundValidSizeElements = true;
                      console.log(`👕 Found size in JSON-LD variant: ${size}`);
                    }
                  });
                } else if (typeof sizeValue === 'string' && this.isValidSize(sizeValue)) {
                  extractedSizes.add(sizeValue.toUpperCase());
                  foundValidSizeElements = true;
                  console.log(`✅ AUTHENTIC Size "${sizeValue}" found via JSON-LD`);
                }
              }
            });
          }
          
          // Check for size property
          if (jsonData.size && this.isValidSize(jsonData.size)) {
            extractedSizes.add(jsonData.size.toUpperCase());
            foundValidSizeElements = true;
            console.log(`✅ AUTHENTIC Size "${jsonData.size}" found via JSON-LD size property`);
          }
          
        } catch (e) {
          // Continue
        }
      });
    }
    
    // Method 3: HTML pattern matching for authentic variant data
    if (!foundValidSizeElements) {
      console.log(`🔍 No structured data found, checking HTML patterns...`);
      
      const variantPatterns = [
        /"variants":\s*\[[^\]]*"(XS|S|M|L|XL|XXL|XXXL|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|\d{1,2}-\d{1,2}\s*yaş|\d{1,2}\s*yaş|\d{1,2}-\d{1,2}\s*ay)"/gi,
        /"sizes":\s*\[[^\]]*"(XS|S|M|L|XL|XXL|XXXL|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|\d{1,2}-\d{1,2}\s*yaş|\d{1,2}\s*yaş|\d{1,2}-\d{1,2}\s*ay)"/gi,
        /"size":\s*"(XS|S|M|L|XL|XXL|XXXL|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|\d{1,2}-\d{1,2}\s*yaş|\d{1,2}\s*yaş|\d{1,2}-\d{1,2}\s*ay)"/gi,
        /data-variant-size="(XS|S|M|L|XL|XXL|XXXL|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|\d{1,2}-\d{1,2}\s*yaş|\d{1,2}\s*yaş|\d{1,2}-\d{1,2}\s*ay)"/gi,
        /data-size="(XS|S|M|L|XL|XXL|XXXL|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|\d{1,2}-\d{1,2}\s*yaş|\d{1,2}\s*yaş|\d{1,2}-\d{1,2}\s*ay)"/gi
      ];
      
      variantPatterns.forEach((pattern, index) => {
        const matches = htmlContent.match(pattern);
        if (matches) {
          console.log(`🔍 Variant pattern ${index + 1} found ${matches.length} matches`);
          matches.forEach(match => {
            const sizeMatch = match.match(/(XS|S|M|L|XL|XXL|XXXL|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|\d{1,2}-\d{1,2}\s*yaş|\d{1,2}\s*yaş|\d{1,2}-\d{1,2}\s*ay)/i);
            if (sizeMatch) {
              // Preserve original case for age-based sizes, uppercase for standard sizes
              const matchedSize = sizeMatch[1];
              const finalSize = /\d+.*yaş|\d+.*ay/i.test(matchedSize) ? matchedSize : matchedSize.toUpperCase();
              extractedSizes.add(finalSize);
              foundValidSizeElements = true;
              console.log(`✅ AUTHENTIC Size "${finalSize}" found via pattern`);
            }
          });
        }
      });
    }
    
    // Son güvenlik kontrolü: comma-separated string'leri tekrar kontrol et ve geçersiz değerleri filtrele
    const finalSizesArray: string[] = [];
    
    // Set'i Array'e çevir ve kontrol et
    Array.from(extractedSizes).forEach(size => {
      if (typeof size === 'string' && size.trim().length > 0) {
        const trimmedSize = size.trim();
        
        // Virgülle ayrılmış string'leri kontrol et
        if (trimmedSize.includes(',')) {
          const splitSizes = trimmedSize.split(',').map(s => s.trim()).filter(s => s.length > 0);
          splitSizes.forEach(s => {
            if (this.isValidSize(s)) {
              finalSizesArray.push(s.toUpperCase());
            }
          });
        } else if (this.isValidSize(trimmedSize)) {
          // Preserve original case for age-based sizes, uppercase for standard sizes  
          const finalSize = /\d+.*yaş|\d+.*ay/i.test(trimmedSize) ? trimmedSize : trimmedSize.toUpperCase();
          finalSizesArray.push(finalSize);
        }
      }
    });
    
    // Dublicate'leri kaldır ve sırala
    const finalSizes = [...new Set(finalSizesArray)].sort();
    console.log(`📏 Final AUTHENTIC sizes extracted: [${finalSizes.join(', ')}]`);
    
    if (finalSizes.length === 0) {
      console.log(`❌ No authentic size variants found - product has no size variants`);
      return [];
    }
    
    return finalSizes;
  }

  /**
   * Validate if a string represents a valid size
   */
  private static isValidSize(size: any): boolean {
    if (!size || typeof size !== 'string' || size.length === 0) return false;
    
    const normalizedSize = size.trim().toUpperCase();
    
    // Exclude clearly invalid values
    if (normalizedSize.length > 15 || normalizedSize === '1' || normalizedSize === '0') return false;
    
    // ✅ ENHANCED SIZE VALIDATION - Accept authentic product sizes
    
    // 1. Standard clothing sizes (S, M, L, XL, etc.)
    if (/^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL)$/.test(normalizedSize)) return true;
    
    // 1.5. Age-based sizes for children's clothing (ORIGINAL CASE PRESERVED)
    const originalCase = size.trim(); // Preserve original case for age-based sizes
    if (/^\d{1,2}-\d{1,2}\s*(yaş|ya|age|yrs?|years?)$/i.test(originalCase)) return true;
    if (/^\d{1,2}\s*(yaş|ya|age|yrs?|years?)$/i.test(originalCase)) return true;
    if (/^\d{1,2}-\d{1,2}\s*(ay|aylık|months?|mo)$/i.test(originalCase)) return true;
    
    // 2. Numeric sizes for shoes (24-54)
    if (/^(2[4-9]|[3-5][0-9])$/.test(normalizedSize)) return true;
    
    // 3. EU clothing sizes (34-60)
    if (/^(3[4-9]|[4-6][0-9])$/.test(normalizedSize)) return true;
    
    // 4. US clothing sizes (0-30)
    if (/^([0-9]|[12][0-9]|30)$/.test(normalizedSize)) return true;
    
    // 5. Bra sizes (A, B, C, D, DD, DDD, etc.)
    if (/^(A{1,3}|B{1,3}|C{1,3}|D{1,3}|E{1,3}|F{1,3}|G{1,3})$/.test(normalizedSize)) return true;
    
    // 6. Special size formats
    if (/^(TEK\s*BEDEN|ONE\s*SIZE|OS|STANDART|STD|UNIVERSAL|FREE|F)$/i.test(normalizedSize)) return true;
    
    // 7. Size ranges like "S-M", "38-40", etc.
    if (/^(XS|S|M|L|XL)-?(XS|S|M|L|XL)$/.test(normalizedSize)) return true;
    if (/^\d{2}-?\d{2}$/.test(normalizedSize)) return true;
    
    // 8. Double sizes like "6-8", "10/12", etc.
    if (/^\d{1,2}[\/\-]\d{1,2}$/.test(normalizedSize)) return true;
    
    // 9. Baby/Kids sizes like "0-3M", "2T", "3Y", etc.
    if (/^\d{1,2}[MTYX]$/.test(normalizedSize)) return true;
    if (/^\d{1,2}-\d{1,2}[MY]$/.test(normalizedSize)) return true;
    
    // 10. UK sizes and other formats
    if (/^UK\s?\d{1,2}$/.test(normalizedSize)) return true;
    if (/^EU\s?\d{2}$/.test(normalizedSize)) return true;
    
    // 11. Turkish specific sizes
    if (/^(KÜÇÜK|ORTA|BÜYÜK)$/.test(normalizedSize)) return true;
    
    // 12. Accept any reasonable alphanumeric size (2-8 characters)
    if (/^[A-Z0-9\/\-]{1,8}$/.test(normalizedSize) && normalizedSize.length >= 1 && normalizedSize.length <= 8) {
      // Additional filtering for clearly invalid values
      const invalidPatterns = [
        /^0+$/, // All zeros
        /^\d{5,}$/, // Too many digits
        /^[A-Z]{6,}$/, // Too many letters
      ];
      
      if (invalidPatterns.some(pattern => pattern.test(normalizedSize))) return false;
      
      return true;
    }
    
    return false;
  }

  /**
   * Extract colors using multiple selectors
   */
  private static extractColors($: any, selectors: string[], htmlContent: string, title: string): string[] {
    const extractedColors = new Set<string>();
    
    // Method 1: Use provided selectors
    selectors.forEach(selector => {
      const elements = $(selector);
      elements.each((i: number, el: any) => {
        const text = $(el).text().trim();
        const ariaLabel = $(el).attr('aria-label') || '';
        const title = $(el).attr('title') || '';
        const dataValue = $(el).attr('data-value') || '';
        const dataColor = $(el).attr('data-color') || '';
        
        [text, ariaLabel, title, dataValue, dataColor].forEach(value => {
          if (value && this.isValidColor(value)) {
            extractedColors.add(value.trim());
            console.log(`🎨 Color "${value}" found via selector: ${selector}`);
          }
        });
      });
    });
    
    // Method 2: Extract from title if no colors found
    if (extractedColors.size === 0) {
      const titleColors = this.extractColorFromTitle(title);
      if (titleColors) {
        titleColors.forEach(color => extractedColors.add(color));
      }
    }
    
    return Array.from(extractedColors);
  }

  /**
   * Extract color from product title
   */
  private static extractColorFromTitle(title: string): string[] | null {
    if (!title) return null;
    
    console.log(`🔍 Analyzing title for colors: "${title}"`);
    
    // Enhanced color patterns - including case insensitive and Turkish variations
    const colorPatterns = [
      /\b(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM)\b/gi,
      /\b(WHITE|BLACK|BLUE|RED|GREEN|YELLOW|PURPLE|PINK|GRAY|BROWN|ORANGE|NAVY|CREAM|BEIGE)\b/gi,
      /\b(Beyaz|Siyah|Mavi|Kırmızı|Yeşil|Sarı|Mor|Pembe|Gri|Kahve|Turuncu|Lacivert|Krem)\b/gi,
      /\b(beyaz|siyah|mavi|kırmızı|yeşil|sarı|mor|pembe|gri|kahve|turuncu|lacivert|krem)\b/gi
    ];
    
    const foundColors = new Set<string>();
    
    colorPatterns.forEach((pattern, index) => {
      const matches = title.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const normalizedColor = match.toUpperCase();
          foundColors.add(normalizedColor);
          console.log(`🎨 Color "${normalizedColor}" found in title via pattern ${index + 1}`);
        });
      }
    });
    
    // Check for common Turkish color terms in title
    const turkishColors = {
      'SIYAH': ['SİYAH', 'BLACK', 'Siyah'],
      'BEYAZ': ['BEYAZ', 'WHITE', 'Beyaz'],
      'MAVI': ['MAVİ', 'BLUE', 'Mavi'],
      'KIRMIZI': ['KIRMIZI', 'RED', 'Kırmızı'],
      'YEŞIL': ['YEŞİL', 'GREEN', 'Yeşil'],
      'SARI': ['SARI', 'YELLOW', 'Sarı'],
      'MOR': ['MOR', 'PURPLE', 'Mor'],
      'PEMBE': ['PEMBE', 'PINK', 'Pembe'],
      'GRİ': ['GRİ', 'GRAY', 'Gri'],
      'KAHVE': ['KAHVE', 'BROWN', 'Kahve'],
      'TURUNCU': ['TURUNCU', 'ORANGE', 'Turuncu'],
      'LACİVERT': ['LACİVERT', 'NAVY', 'Lacivert'],
      'KREM': ['KREM', 'CREAM', 'Krem'],
      // REMOVED: BEJ mapping to prevent fake color detection
    };
    
    Object.entries(turkishColors).forEach(([mainColor, variations]) => {
      variations.forEach(variation => {
        if (title.includes(variation)) {
          foundColors.add(mainColor);
          console.log(`🎨 Color "${mainColor}" detected from variation "${variation}" in title`);
        }
      });
    });
    
    if (foundColors.size > 0) {
      const colorsArray = Array.from(foundColors);
      console.log(`🎨 Final colors from title: [${colorsArray.join(', ')}]`);
      return colorsArray;
    }
    
    console.log(`🎨 No colors found in title: "${title}"`);
    return null;
  }

  /**
   * ✅ ENHANCED: Balanced Turkish color validation - Exclude materials but allow legitimate colors
   */
  private static isValidColor(value: string): boolean {
    if (!value || typeof value !== 'string') return false;
    
    const normalizedValue = value.toLowerCase().trim();
    
    // ❌ STRICT EXCLUSION: Material names that are NOT colors
    const excludedMaterials = [
      'çelik', 'metal', 'ahşap', 'cam', 'plastik', 'seramik', 'granit', 'mermer',
      'steel', 'wood', 'glass', 'plastic', 'ceramic', 'granite', 'marble',
      'alüminyum', 'aluminum', 'bakır', 'copper', 'bronz', 'bronze', 'deri', 'leather',
      'tekstil', 'fabric', 'polyester', 'pamuk', 'cotton', 'yün', 'wool'
    ];
    
    // ❌ REJECT materials immediately
    if (excludedMaterials.includes(normalizedValue)) {
      console.log(`❌ Color validation: "${value}" rejected (material name)`);
      return false;
    }
    
    // ✅ EXPANDED Turkish/English color vocabulary
    const validColors = [
      // Basic Turkish colors
      'beyaz', 'siyah', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahve',
      'turuncu', 'lacivert', 'krem', 'bej', 'bordo', 'haki', 'füme', 'ekru', 'pudra',
      // Extended Turkish colors
      'antrasit', 'camel', 'altın', 'gümüş', 'taş', 'mint', 'turkuaz', 'petrol', 'hardal',
      'lila', 'çok renkli', 'melanj', 'gri melanj', 'siyah melanj', 'koyu', 'açık',
      'koyu mavi', 'açık mavi', 'koyu gri', 'açık gri', 'vizon', 'deve tabanı',
      // Basic English colors
      'white', 'black', 'blue', 'red', 'green', 'yellow', 'purple', 'pink', 'gray', 'grey',
      'brown', 'orange', 'navy', 'cream', 'beige', 'burgundy', 'khaki', 'smoke',
      // Extended English colors
      'indigo', 'gold', 'silver', 'rose', 'mint', 'turquoise', 'olive', 'mustard',
      'lilac', 'multicolor', 'maroon', 'coral', 'salmon', 'plum', 'teal', 'magenta'
    ];
    
    // ✅ LENGTH CHECK: Reasonable color name length
    if (normalizedValue.length < 2 || normalizedValue.length > 20) {
      console.log(`❌ Color validation: "${value}" rejected (invalid length)`);
      return false;
    }
    
    // ✅ CHECK valid colors list
    const isInWhitelist = validColors.includes(normalizedValue);
    
    // ✅ PATTERN CHECK: Allow color-like words that aren't materials
    const colorPattern = /^[a-zçşığüöĞŞIİÇÜÖ\s-]+$/i;
    const looksLikeColor = colorPattern.test(normalizedValue) && 
                          !normalizedValue.match(/\d/) && // No numbers
                          !normalizedValue.includes('size') && // Not size-related
                          !normalizedValue.includes('beden');
    
    const isValid = isInWhitelist || looksLikeColor;
    
    if (!isValid) {
      console.log(`❌ Color validation: "${value}" rejected (pattern/whitelist)`);
    }
    
    return isValid;
  }

  /**
   * Extract stock status for sizes
   */
  private static extractSizeStockStatus($: any, stockSelectors: string[], sizes: string[]): Map<string, boolean> {
    const stockMap = new Map<string, boolean>();
    
    console.log(`📦 Stok kontrolü başlatılıyor ${sizes.length} beden için...`);
    
    sizes.forEach(size => {
      let isInStock = true; // Varsayılan olarak stoktaki
      
      // Method 1: disabled attribute kontrolü
      const disabledButtons = $(`button[disabled]:contains("${size}"), button[disabled][data-size="${size}"], button[disabled][aria-label*="${size}"]`);
      if (disabledButtons.length > 0) {
        isInStock = false;
        console.log(`❌ Beden "${size}" disabled button ile stokta yok`);
      }
      
      // Method 2: out-of-stock class kontrolü
      const outOfStockElements = $(`.out-of-stock:contains("${size}"), .unavailable:contains("${size}"), .disabled:contains("${size}")`);
      if (outOfStockElements.length > 0) {
        isInStock = false;
        console.log(`❌ Beden "${size}" out-of-stock class ile stokta yok`);
      }
      
      // Method 3: Aria-disabled kontrolü
      const ariaDisabledElements = $(`[aria-disabled="true"]:contains("${size}"), [aria-disabled="true"][data-size="${size}"]`);
      if (ariaDisabledElements.length > 0) {
        isInStock = false;
        console.log(`❌ Beden "${size}" aria-disabled ile stokta yok`);
      }
      
      // Method 4: Trendyol özel selectors
      const trendyolOutOfStock = $(`.pr-in-sz button[disabled]:contains("${size}"), .size-selector button[disabled]:contains("${size}")`);
      if (trendyolOutOfStock.length > 0) {
        isInStock = false;
        console.log(`❌ Beden "${size}" Trendyol selector ile stokta yok`);
      }
      
      // Method 5: Check for disabled buttons or out-of-stock indicators (original method)
      stockSelectors.forEach(selector => {
        const elements = $(selector);
        elements.each((i: number, el: any) => {
          const text = $(el).text().trim();
          const isDisabled = $(el).attr('disabled') !== undefined;
          const hasOutOfStockClass = $(el).hasClass('out-of-stock') || $(el).hasClass('disabled');
          
          if ((text === size || text.includes(size)) && (isDisabled || hasOutOfStockClass)) {
            isInStock = false;
            console.log(`❌ Beden "${size}" selector ile stokta yok: ${selector}`);
          }
        });
      });
      
      stockMap.set(size, isInStock);
      
      if (isInStock) {
        console.log(`✅ Beden "${size}" stoktaki olarak işaretlendi`);
      }
    });
    
    const inStockCount = Array.from(stockMap.values()).filter(Boolean).length;
    console.log(`📦 Stok kontrolü tamamlandı: ${inStockCount}/${sizes.length} beden stoktaki`);
    
    return stockMap;
  }

  /**
   * Extract stock status for colors
   */
  private static extractColorStockStatus($: any, stockSelectors: string[], colors: string[]): Map<string, boolean> {
    const stockMap = new Map<string, boolean>();
    
    colors.forEach(color => {
      stockMap.set(color, true); // Default to in stock for colors
    });
    
    return stockMap;
  }

  /**
   * Extract stock status for size-color matrix
   */
  private static extractMatrixStockStatus($: any, stockSelectors: string[], sizes: string[], colors: string[]): Map<string, boolean> {
    const stockMap = new Map<string, boolean>();
    
    // For matrix products, check each size-color combination using enhanced stock detection
    sizes.forEach(size => {
      const sizeStockMap = this.extractSizeStockStatus($, stockSelectors, [size]);
      const isInStock = sizeStockMap.get(size) || false;
      stockMap.set(size, isInStock);
    });
    
    return stockMap;
  }

  /**
   * Check if a specific size is out of stock
   */
  private static isSizeOutOfStock($: any, stockSelectors: string[], size: string): boolean {
    for (const selector of stockSelectors) {
      const elements = $(selector);
      for (let i = 0; i < elements.length; i++) {
        const el = elements.eq(i);
        const text = el.text().trim();
        const isDisabled = el.attr('disabled') !== undefined;
        const hasOutOfStockClass = el.hasClass('out-of-stock') || el.hasClass('disabled');
        
        if ((text === size || text.includes(size)) && (isDisabled || hasOutOfStockClass)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if product is generally out of stock
   */
  private static isOutOfStock($: any, htmlContent: string): boolean {
    const outOfStockIndicators = [
      'out of stock', 'sold out', 'tükendi', 'stokta yok', 'stock yok',
      'unavailable', 'not available', 'mevcut değil'
    ];
    
    const lowerContent = htmlContent.toLowerCase();
    return outOfStockIndicators.some(indicator => lowerContent.includes(indicator));
  }
}