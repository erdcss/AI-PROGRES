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
    
    const sizes = ['Tek Beden'];
    const colors = this.extractColorFromTitle(title) || ['Standart'];
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
    const colors = this.extractColorFromTitle(title) || ['Standart'];
    const stockMap = this.extractSizeStockStatus($, config.stockSelectors, sizes);
    const priceMap = new Map<string, number>();
    const imageMap = new Map<string, string[]>();
    
    console.log(`📏 Multi-size: ${sizes.length} sizes found [${sizes.join(', ')}], color="${colors[0]}"`);
    
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
    
    // Method 1: Use provided selectors
    selectors.forEach(selector => {
      const elements = $(selector);
      elements.each((i: number, el: any) => {
        const text = $(el).text().trim();
        const ariaLabel = $(el).attr('aria-label') || '';
        const title = $(el).attr('title') || '';
        const dataValue = $(el).attr('data-value') || '';
        const dataSize = $(el).attr('data-size') || '';
        
        [text, ariaLabel, title, dataValue, dataSize].forEach(value => {
          if (value && /^(XS|S|M|L|XL|XXL|XXXL)$/i.test(value.trim())) {
            const size = value.trim().toUpperCase();
            extractedSizes.add(size);
            console.log(`📏 Size "${size}" found via selector: ${selector}`);
          }
        });
      });
    });
    
    // Method 2: Search HTML content patterns
    const sizePatterns = [
      /\b(XS|S|M|L|XL|XXL|XXXL)\b/g,
      /"size":\s*"(XS|S|M|L|XL|XXL|XXXL)"/gi,
      /beden[^>]*>(XS|S|M|L|XL|XXL|XXXL)/gi
    ];
    
    sizePatterns.forEach(pattern => {
      const matches = htmlContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const sizeMatch = match.match(/(XS|S|M|L|XL|XXL|XXXL)/i);
          if (sizeMatch) {
            extractedSizes.add(sizeMatch[1].toUpperCase());
          }
        });
      }
    });
    
    return Array.from(extractedSizes).sort();
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
    
    const colorPattern = /\b(BEYAZ|SİYAH|MAVİ|KIRMIZI|YEŞİL|SARI|MOR|PEMBE|GRİ|KAHVE|TURUNCU|LACİVERT|KREM|BEJ|WHITE|BLACK|BLUE|RED|GREEN|YELLOW|PURPLE|PINK|GRAY|BROWN|ORANGE|NAVY|CREAM|BEIGE)\b/i;
    const match = title.match(colorPattern);
    
    if (match) {
      console.log(`🎨 Color "${match[1]}" extracted from title: "${title}"`);
      return [match[1]];
    }
    
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