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
    
    // For single variant products, only use "Tek Beden" if no authentic size variants exist
    const sizes = ['Tek Beden'];
    
    // Extract authentic color from title if available
    const titleColors = this.extractColorFromTitle(title);
    const colors = titleColors && titleColors.length > 0 ? titleColors : ['Standart'];
    
    const stockMap = new Map<string, boolean>();
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    // Check if product is in stock
    const isInStock = !this.isOutOfStock($, htmlContent);
    stockMap.set('Tek Beden', isInStock);
    
    console.log(`📦 Single variant: color="${colors[0]}", size="${sizes[0]}", stock=${isInStock}`);
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract multi-size products (multiple sizes, single color)
   */
  private static extractMultiSize($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`📏 Extracting multi-size product`);
    
    const sizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    
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
    
    // Method 3: Advanced pattern matching in HTML
    if (colors.length === 0) {
      const htmlColorPatterns = [
        /color[^>]*>(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM|BEJ)/gi,
        /"color":\s*"([^"]*BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM|BEJ[^"]*)"/gi,
        /renk[^>]*>(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM|BEJ)/gi
      ];
      
      htmlColorPatterns.forEach((pattern, index) => {
        const matches = htmlContent.match(pattern);
        if (matches && colors.length === 0) {
          matches.forEach(match => {
            const colorMatch = match.match(/(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM|BEJ)/i);
            if (colorMatch) {
              colors.push(colorMatch[1]);
              console.log(`🎨 Color "${colorMatch[1]}" found via HTML pattern ${index + 1}`);
            }
          });
        }
      });
    }
    
    // Default fallback only if absolutely no colors found
    if (colors.length === 0) {
      colors = ['Standart'];
      console.log(`🎨 No colors found, using default: Standart`);
    }
    
    const stockMap = this.extractSizeStockStatus($, config.stockSelectors, sizes);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`📏 Multi-size: ${sizes.length} sizes found [${sizes.join(', ')}], color="${colors[0]}"`);
    
    // CRITICAL: If no authentic sizes found, convert to single variant
    if (sizes.length === 0) {
      console.log(`🔄 No authentic sizes found - converting to single variant`);
      return {
        sizes: ['Tek Beden'],
        colors,
        stockMap: new Map([['Tek Beden', true]]),
        priceMap,
        imageMap
      };
    }
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract multi-color products (multiple colors, single size)
   */
  private static extractMultiColor($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`🎨 Extracting multi-color product`);
    
    const sizes = ['Tek Beden'];
    const colors = this.extractColors($, config.colorSelectors, htmlContent, title);
    const stockMap = this.extractColorStockStatus($, config.stockSelectors, colors);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`🎨 Multi-color: ${colors.length} colors found [${colors.join(', ')}], size="${sizes[0]}"`);
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract full matrix products (multiple sizes and colors)
   */
  private static extractFullMatrix($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`🔳 Extracting full matrix product`);
    
    const sizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    const colors = this.extractColors($, config.colorSelectors, htmlContent, title);
    const stockMap = this.extractMatrixStockStatus($, config.stockSelectors, sizes, colors);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`🔳 Full matrix: ${sizes.length} sizes × ${colors.length} colors = ${sizes.length * colors.length} variants`);
    
    return { sizes, colors, stockMap, priceMap, imageMap };
  }

  /**
   * Extract out of stock products
   */
  private static extractOutOfStock($: any, config: ScenarioExtractionConfig, htmlContent: string, title: string): VariantExtractionResult {
    console.log(`❌ Extracting out-of-stock product`);
    
    // Try to extract what variants were available
    const sizes = this.extractSizes($, config.sizeSelectors, htmlContent);
    const colors = this.extractColors($, config.colorSelectors, htmlContent, title);
    const stockMap = new Map<string, boolean>();
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    // Mark all variants as out of stock
    if (sizes.length === 0) sizes.push('Tek Beden');
    if (colors.length === 0) colors.push(this.extractColorFromTitle(title)?.[0] || 'Standart');
    
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
    const colors = this.extractColors($, config.colorSelectors, htmlContent, title);
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
    
    // Method 1: STRICT selector-based detection - only from actual variant elements
    const strictSizeSelectors = [
      'button[data-testid*="size"]:not([disabled])',
      'button[class*="size"]:not([disabled])',
      '.size-selector button:not([disabled])',
      '.variant-size-option:not([disabled])',
      'button[aria-label*="beden"]:not([disabled])',
      'button[title*="beden"]:not([disabled])',
      'div[data-testid*="variant"] button:not([disabled])',
      'button[data-testid*="variant"]:not([disabled])',
      '.variant-item:not([disabled])',
      '.product-variant button:not([disabled])'
    ];
    
    let foundValidSizeElements = false;
    
    strictSizeSelectors.forEach(selector => {
      const elements = $(selector);
      console.log(`🔍 Strict selector "${selector}" found ${elements.length} elements`);
      
      if (elements.length > 0) {
        foundValidSizeElements = true;
        elements.each((i: number, el: any) => {
          const text = $(el).text().trim();
          const ariaLabel = $(el).attr('aria-label') || '';
          const title = $(el).attr('title') || '';
          const dataValue = $(el).attr('data-value') || '';
          const dataSize = $(el).attr('data-size') || '';
          
          console.log(`🔍 Strict element ${i}: text="${text}", aria-label="${ariaLabel}", title="${title}"`);
          
          [text, ariaLabel, title, dataValue, dataSize].forEach(value => {
            if (value && /^(XS|S|M|L|XL|XXL|XXXL|\d+)$/i.test(value.trim())) {
              const size = value.trim().toUpperCase();
              extractedSizes.add(size);
              console.log(`✅ AUTHENTIC Size "${size}" found via strict selector: ${selector}`);
            }
          });
        });
      }
    });
    
    // Method 2: Only run pattern matching if no strict selectors found sizes
    if (!foundValidSizeElements) {
      console.log(`🔍 No strict size selectors found, checking for variant-specific patterns...`);
      
      // Very specific patterns that indicate real variants
      const variantSpecificPatterns = [
        /"variants":\s*\[[^\]]*"(XS|S|M|L|XL|XXL|XXXL)"/gi,
        /"sizes":\s*\[[^\]]*"(XS|S|M|L|XL|XXL|XXXL)"/gi,
        /data-variant-size="(XS|S|M|L|XL|XXL|XXXL)"/gi,
        /class="[^"]*variant[^"]*"[^>]*>(XS|S|M|L|XL|XXL|XXXL)/gi
      ];
      
      variantSpecificPatterns.forEach((pattern, index) => {
        const matches = htmlContent.match(pattern);
        if (matches) {
          console.log(`🔍 Variant-specific pattern ${index + 1} found ${matches.length} matches`);
          matches.forEach(match => {
            const sizeMatch = match.match(/(XS|S|M|L|XL|XXL|XXXL)/i);
            if (sizeMatch) {
              extractedSizes.add(sizeMatch[1].toUpperCase());
              console.log(`✅ AUTHENTIC Size "${sizeMatch[1].toUpperCase()}" found via variant pattern`);
            }
          });
        }
      });
    }
    
    // DISABLE FALLBACK PATTERNS - they cause false positives
    console.log(`🚫 Skipping general pattern matching to avoid false positives`);
    
    // If no strict selectors found any sizes, DON'T fallback to general patterns
    if (!foundValidSizeElements && extractedSizes.size === 0) {
      console.log(`❌ No authentic size variants found - product likely has no size variants`);
      return [];
    }
    
    // FORCE DISABLE: Even if patterns found sizes, ignore them if no strict elements
    if (!foundValidSizeElements) {
      console.log(`🚫 FORCE DISABLE: No strict variant elements found - ignoring pattern matches`);
      return [];
    }
    
    const finalSizes = Array.from(extractedSizes).sort();
    console.log(`📏 Final AUTHENTIC sizes extracted: [${finalSizes.join(', ')}]`);
    
    // STRICT VALIDATION: Only return sizes if we found actual variant elements
    if (finalSizes.length > 0 && !foundValidSizeElements) {
      console.log(`⚠️  WARNING: Sizes found but no variant elements - likely false positive`);
      console.log(`🔍 Performing strict validation...`);
      
      // Check if there are actual clickable size elements with variant classes
      const variantElements = $('button, div, a').filter((i: number, el: any) => {
        const text = $(el).text().trim();
        const hasVariantClass = $(el).hasClass('variant') || $(el).hasClass('size') || $(el).closest('.variant').length > 0;
        const isClickable = $(el).is('button') || $(el).is('a') || $(el).attr('onclick') || $(el).attr('role') === 'button';
        const matchesSize = finalSizes.some(size => text === size || text.includes(size));
        
        return hasVariantClass && isClickable && matchesSize;
      });
      
      console.log(`🔍 Found ${variantElements.length} valid variant elements`);
      
      if (variantElements.length === 0) {
        console.log(`❌ No valid variant elements found - clearing false positive sizes`);
        console.log(`🚫 This product likely has no size variants`);
        return [];
      }
    }
    
    return finalSizes;
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
      /\b(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM|BEJ)\b/gi,
      /\b(WHITE|BLACK|BLUE|RED|GREEN|YELLOW|PURPLE|PINK|GRAY|BROWN|ORANGE|NAVY|CREAM|BEIGE)\b/gi,
      /\b(Beyaz|Siyah|Mavi|Kırmızı|Yeşil|Sarı|Mor|Pembe|Gri|Kahve|Turuncu|Lacivert|Krem|Bej)\b/gi,
      /\b(beyaz|siyah|mavi|kırmızı|yeşil|sarı|mor|pembe|gri|kahve|turuncu|lacivert|krem|bej)\b/gi
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
      'BEJ': ['BEJ', 'BEIGE', 'Bej']
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
   * Check if a value is a valid color
   */
  private static isValidColor(value: string): boolean {
    const validColors = [
      'beyaz', 'siyah', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahve',
      'turuncu', 'lacivert', 'krem', 'bej', 'white', 'black', 'blue', 'red', 'green',
      'yellow', 'purple', 'pink', 'gray', 'brown', 'orange', 'navy', 'cream', 'beige'
    ];
    
    return validColors.includes(value.toLowerCase()) && value.length > 2 && value.length < 20;
  }

  /**
   * Extract stock status for sizes
   */
  private static extractSizeStockStatus($: any, stockSelectors: string[], sizes: string[]): Map<string, boolean> {
    const stockMap = new Map<string, boolean>();
    
    sizes.forEach(size => {
      let isInStock = true; // Default to in stock
      
      // Check for disabled buttons or out-of-stock indicators
      stockSelectors.forEach(selector => {
        const elements = $(selector);
        elements.each((i: number, el: any) => {
          const text = $(el).text().trim();
          const isDisabled = $(el).attr('disabled') !== undefined;
          const hasOutOfStockClass = $(el).hasClass('out-of-stock') || $(el).hasClass('disabled');
          
          if ((text === size || text.includes(size)) && (isDisabled || hasOutOfStockClass)) {
            isInStock = false;
            console.log(`❌ Size "${size}" marked as out of stock`);
          }
        });
      });
      
      stockMap.set(size, isInStock);
    });
    
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
    
    // For matrix products, check each size-color combination
    sizes.forEach(size => {
      const isInStock = !this.isSizeOutOfStock($, stockSelectors, size);
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