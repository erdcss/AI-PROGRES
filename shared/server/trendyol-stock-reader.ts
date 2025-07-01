/**
 * Trendyol Real Stock Reader
 * Extracts actual stock availability by analyzing disabled buttons and stock indicators
 */

import * as cheerio from 'cheerio';

export interface TrendyolStockData {
  stockMatrix: Record<string, string[]>; // color: [available_sizes]
  outOfStockVariants: string[];
  totalVariants: number;
  inStockVariants: number;
}

/**
 * Reads actual stock data from Trendyol's product page DOM
 */
export function readTrendyolRealStock($: cheerio.CheerioAPI): TrendyolStockData {
  console.log('🔍 TRENDYOL GERÇEK STOK OKUYUCU başlatılıyor...');
  
  const stockData: TrendyolStockData = {
    stockMatrix: {},
    outOfStockVariants: [],
    totalVariants: 0,
    inStockVariants: 0
  };

  // Extract colors from image elements
  const colors: string[] = [];
  $('.pr-in-cn img').each((_, el) => {
    const alt = $(el).attr('alt')?.toLowerCase() || '';
    if (alt && !colors.includes(alt)) {
      colors.push(alt);
      console.log(`🎨 Renk bulundu: ${alt}`);
    }
  });

  // Extract sizes from button elements
  const sizes: string[] = [];
  $('.pr-in-sz button').each((_, el) => {
    const text = $(el).text().trim();
    if (text.match(/^(XS|S|M|L|XL|XXL|\d+)$/i)) {
      if (!sizes.includes(text)) {
        sizes.push(text);
        console.log(`📏 Beden bulundu: ${text}`);
      }
    }
  });

  console.log(`📊 Toplam renk: ${colors.length}, Toplam beden: ${sizes.length}`);

  // Analyze stock for each color-size combination
  colors.forEach(color => {
    stockData.stockMatrix[color] = [];
    
    sizes.forEach(size => {
      stockData.totalVariants++;
      
      // Check if size button is disabled for this specific combination
      let isOutOfStock = false;
      
      // Method 1: Check disabled attribute on size buttons
      $('.pr-in-sz button').each((_, button) => {
        const buttonText = $(button).text().trim();
        if (buttonText === size) {
          const isDisabled = $(button).hasClass('disabled') || 
                            $(button).attr('disabled') !== undefined ||
                            $(button).hasClass('sold-out') ||
                            $(button).css('opacity') === '0.5';
          
          if (isDisabled) {
            isOutOfStock = true;
            console.log(`❌ ${color}-${size}: Beden butonu deaktif`);
          }
        }
      });
      
      // Method 2: Check for specific out-of-stock indicators
      if (!isOutOfStock) {
        const outOfStockSelectors = [
          `.pr-in-sz button:contains("${size}").disabled`,
          `.pr-in-sz button:contains("${size}")[disabled]`,
          `.size-option:contains("${size}").out-of-stock`,
          `[data-testid*="size"] button:contains("${size}").disabled`
        ];
        
        outOfStockSelectors.forEach(selector => {
          if ($(selector).length > 0) {
            isOutOfStock = true;
            console.log(`❌ ${color}-${size}: CSS seçici ile tespit edildi - ${selector}`);
          }
        });
      }
      
      // Method 3: Check JavaScript variables or data attributes
      if (!isOutOfStock) {
        $('script').each((_, script) => {
          const scriptContent = $(script).html() || '';
          if (scriptContent.includes('variants') || scriptContent.includes('stock')) {
            // Look for stock data in JavaScript
            const stockPattern = new RegExp(`"${size}"[^}]*"stock"[^}]*:\\s*0`, 'i');
            if (stockPattern.test(scriptContent)) {
              isOutOfStock = true;
              console.log(`❌ ${color}-${size}: JavaScript verisi ile tespit edildi`);
            }
          }
        });
      }
      
      if (!isOutOfStock) {
        stockData.stockMatrix[color].push(size);
        stockData.inStockVariants++;
        console.log(`✅ ${color}-${size}: STOKTA`);
      } else {
        stockData.outOfStockVariants.push(`${color}-${size}`);
        console.log(`❌ ${color}-${size}: STOKTA YOK`);
      }
    });
    
    console.log(`🔧 ${color} rengi için stokta olan bedenler: [${stockData.stockMatrix[color].join(', ')}]`);
  });

  console.log(`📈 STOK ÖZET: ${stockData.inStockVariants}/${stockData.totalVariants} varyant stokta`);
  
  return stockData;
}

/**
 * Converts Trendyol stock data to the format expected by Shopify export
 */
export function convertToShopifyStockFormat(stockData: TrendyolStockData): {
  stockMap: Record<string, boolean>;
  colorSizeMatrix: Record<string, string[]>;
} {
  const stockMap: Record<string, boolean> = {};
  
  // Create stock map with all combinations
  Object.entries(stockData.stockMatrix).forEach(([color, availableSizes]) => {
    // Mark available combinations as true
    availableSizes.forEach(size => {
      stockMap[`${color}-${size}`] = true;
    });
  });
  
  // Mark out-of-stock combinations as false
  stockData.outOfStockVariants.forEach(variantKey => {
    stockMap[variantKey] = false;
  });
  
  console.log('🔄 Shopify formatına dönüştürüldü:');
  Object.entries(stockMap).forEach(([key, inStock]) => {
    console.log(`   ${key}: ${inStock ? 'STOKTA' : 'STOKTA YOK'}`);
  });
  
  return {
    stockMap,
    colorSizeMatrix: stockData.stockMatrix
  };
}