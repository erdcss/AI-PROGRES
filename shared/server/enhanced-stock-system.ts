/**
 * Enhanced Stock Detection System for Trendyol
 * Reads real stock availability from DOM and prevents out-of-stock variants from appearing in CSV
 */

import * as cheerio from 'cheerio';

export interface RealStockData {
  variantStockMap: Record<string, boolean>;
  availableColors: string[];
  availableSizes: string[];
  outOfStockVariants: string[];
}

/**
 * Extracts real stock data from Trendyol's DOM structure
 * Detects disabled buttons and out-of-stock indicators
 */
export function extractRealStockFromDOM($: cheerio.CheerioAPI): RealStockData {
  console.log('🔧 ENHANCED STOCK DETECTION başlatılıyor...');
  
  const stockData: RealStockData = {
    variantStockMap: {},
    availableColors: [],
    availableSizes: [],
    outOfStockVariants: []
  };

  // Extract all colors from DOM
  const colors: string[] = [];
  $('.pr-in-cn img, [data-testid*="color"] img, .color-option img').each((_, el) => {
    const colorName = $(el).attr('alt') || $(el).attr('title') || '';
    if (colorName && !colors.includes(colorName)) {
      colors.push(colorName.toLowerCase());
    }
  });

  // Extract all sizes from DOM
  const sizes: string[] = [];
  $('.pr-in-sz button, [data-testid*="size"] button, .size-option').each((_, el) => {
    const sizeName = $(el).text().trim();
    if (sizeName && sizeName.match(/^(XS|S|M|L|XL|XXL|\d+)$/i)) {
      if (!sizes.includes(sizeName)) {
        sizes.push(sizeName);
      }
    }
  });

  console.log(`🔧 DOM'dan tespit edilen renkler: ${colors.join(', ')}`);
  console.log(`🔧 DOM'dan tespit edilen bedenler: ${sizes.join(', ')}`);

  // Check stock for each color-size combination
  colors.forEach(color => {
    sizes.forEach(size => {
      const variantKey = `${color}-${size}`;
      
      // Check if size button is disabled or out of stock
      const sizeDisabled = $(`.pr-in-sz button:contains("${size}").disabled`).length > 0 ||
                          $(`.pr-in-sz button:contains("${size}")[disabled]`).length > 0 ||
                          $(`[data-testid*="size"] button:contains("${size}").disabled`).length > 0 ||
                          $(`[data-testid*="size"] button:contains("${size}")[disabled]`).length > 0;

      // Check if color option is disabled
      const colorDisabled = $(`.pr-in-cn img[alt*="${color}"]`).closest('button').hasClass('disabled') ||
                            $(`.pr-in-cn img[alt*="${color}"]`).closest('button').attr('disabled') !== undefined;

      // Variant is in stock only if both color and size are available
      const inStock = !sizeDisabled && !colorDisabled;
      
      stockData.variantStockMap[variantKey] = inStock;
      
      if (inStock) {
        if (!stockData.availableColors.includes(color)) {
          stockData.availableColors.push(color);
        }
        if (!stockData.availableSizes.includes(size)) {
          stockData.availableSizes.push(size);
        }
        console.log(`✅ STOKTA: ${variantKey}`);
      } else {
        stockData.outOfStockVariants.push(variantKey);
        console.log(`❌ STOKTA YOK: ${variantKey}`);
      }
    });
  });

  console.log(`🔧 TOPLAM DURUM: ${Object.keys(stockData.variantStockMap).length} varyant analiz edildi`);
  console.log(`🔧 STOKTA OLAN: ${Object.values(stockData.variantStockMap).filter(Boolean).length}`);
  console.log(`🔧 STOKTA OLMAYAN: ${stockData.outOfStockVariants.length}`);

  return stockData;
}

/**
 * Filters variant stock map to only include in-stock variants
 */
export function filterInStockVariants(stockMap: Record<string, boolean>): Record<string, boolean> {
  const inStockOnly: Record<string, boolean> = {};
  
  Object.entries(stockMap).forEach(([variantKey, inStock]) => {
    if (inStock) {
      inStockOnly[variantKey] = true;
    }
  });
  
  return inStockOnly;
}

/**
 * Creates color-size matrix showing only available combinations
 */
export function createStockMatrix(stockData: RealStockData): Record<string, string[]> {
  const matrix: Record<string, string[]> = {};
  
  stockData.availableColors.forEach(color => {
    matrix[color] = [];
    
    stockData.availableSizes.forEach(size => {
      const variantKey = `${color}-${size}`;
      if (stockData.variantStockMap[variantKey]) {
        matrix[color].push(size);
      }
    });
    
    console.log(`🔧 ${color} rengi stokta olan bedenler: [${matrix[color].join(', ')}]`);
  });
  
  return matrix;
}