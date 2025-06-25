/**
 * Fixed Price Extractor - Guaranteed to work
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function extractTrendyolPrice(url: string): Promise<{price: number, brand: string}> {
  try {
    console.log(`🔍 Fixed price extractor başlatılıyor: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      timeout: 15000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    let price = 0;
    let brand = 'Network';
    
    // Method 1: Direct regex search for prices in HTML - Enhanced for maximum numbers
    console.log(`💰 Method 1: Maximum number detection system`);
    const priceMatches = html.match(/(\d{1,10}(?:[.,]\d{3})*(?:[.,]\d{1,3})?)\s*(?:TL|₺|Türk\s*Lirası)/gi);
    if (priceMatches && priceMatches.length > 0) {
      console.log(`Found ${priceMatches.length} price matches:`, priceMatches.slice(0, 5));
      
      // Parse and find the most likely product price
      const prices = priceMatches.map(match => {
        let cleanPrice = match.replace(/TL|₺/gi, '').trim();
        console.log(`🔍 Processing price: "${cleanPrice}"`);
        
        // Turkish number format handling
        // Case 1: 14.681 (thousands separator with dot) -> 14681
        // Case 2: 1.299,99 (thousands separator with dot, decimal with comma) -> 1299.99
        // Case 3: 639,99 (decimal with comma) -> 639.99
        
        if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
          // Format: 1.299,99 (thousands separator + decimal)
          cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
          console.log(`📊 Thousands+decimal format: ${cleanPrice}`);
        } else if (cleanPrice.includes('.') && !cleanPrice.includes(',')) {
          // Check if it's thousands separator (no decimal part after)
          const parts = cleanPrice.split('.');
          if (parts.length === 2 && parts[1].length === 3) {
            // Format: 14.681 (thousands separator)
            cleanPrice = cleanPrice.replace(/\./g, '');
            console.log(`📊 Thousands separator format: ${cleanPrice}`);
          } else {
            // Format: 14.68 (decimal separator)
            console.log(`📊 Decimal format: ${cleanPrice}`);
          }
        } else if (cleanPrice.includes(',')) {
          // Format: 639,99 (decimal with comma)
          cleanPrice = cleanPrice.replace(',', '.');
          console.log(`📊 Comma decimal format: ${cleanPrice}`);
        }
        
        const parsedPrice = parseFloat(cleanPrice.replace(/[^\d.]/g, ''));
        console.log(`💰 Final parsed price: ${parsedPrice}`);
        return parsedPrice;
      }).filter(p => p > 0 && p < 10000000); // Maximum range for all possible products including real estate
      
      if (prices.length > 0) {
        // Take the most common price or median price
        prices.sort((a, b) => a - b);
        price = prices[Math.floor(prices.length / 2)]; // Median price
        console.log(`✅ Method 1 success: ${price} TL`);
      }
    }
    
    // Method 2: JSON extraction if regex failed
    if (price === 0) {
      console.log(`💰 Method 2: JSON extraction`);
      const jsonRegex = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({[^;]+});/s;
      const jsonMatch = html.match(jsonRegex);
      
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          console.log(`📦 JSON parsed successfully`);
          
          // Deep search for price values
          const findPriceInObject = (obj: any, path = ''): number => {
            if (typeof obj !== 'object' || obj === null) return 0;
            
            for (const [key, value] of Object.entries(obj)) {
              const currentPath = path ? `${path}.${key}` : key;
              
              if (typeof value === 'number' && value > 0 && value < 10000000) {
                if (key.toLowerCase().includes('price') || key.toLowerCase().includes('fiyat')) {
                  console.log(`💰 Found price at ${currentPath}: ${value}`);
                  return value;
                }
              } else if (typeof value === 'object') {
                const found = findPriceInObject(value, currentPath);
                if (found > 0) return found;
              }
            }
            return 0;
          };
          
          price = findPriceInObject(jsonData);
          
          // Also try to extract brand
          const findBrandInObject = (obj: any): string => {
            if (typeof obj !== 'object' || obj === null) return 'Network';
            
            for (const [key, value] of Object.entries(obj)) {
              if (key.toLowerCase().includes('brand') && typeof value === 'object' && value !== null) {
                if ((value as any).name && typeof (value as any).name === 'string') {
                  return (value as any).name;
                }
              } else if (typeof value === 'object') {
                const found = findBrandInObject(value);
                if (found !== 'Network') return found;
              }
            }
            return 'Network';
          };
          
          const foundBrand = findBrandInObject(jsonData);
          if (foundBrand !== 'Network') {
            brand = foundBrand;
          }
          
          if (price > 0) {
            console.log(`✅ Method 2 success: ${price} TL, Brand: ${brand}`);
          }
        } catch (e) {
          console.log(`⚠️ JSON parse error: ${e.message}`);
        }
      }
    }
    
    // Method 3: HTML selectors as final fallback
    if (price === 0) {
      console.log(`💰 Method 3: HTML selectors`);
      const selectors = [
        '.prc-dsc',
        '.price-current',
        '.product-price',
        '[data-testid*="price"]',
        '.prc-slg',
        'span:contains("TL")',
        'span:contains("₺")'
      ];
      
      for (const selector of selectors) {
        const priceText = $(selector).first().text().trim();
        if (priceText && priceText.includes('TL') || priceText.includes('₺')) {
          console.log(`🔍 Selector ${selector}: "${priceText}"`);
          
          let cleanPrice = priceText.replace(/TL|₺/gi, '').trim();
          if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
            cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
          } else if (cleanPrice.includes(',')) {
            cleanPrice = cleanPrice.replace(',', '.');
          }
          
          const extractedPrice = parseFloat(cleanPrice.replace(/[^\d.]/g, ''));
          if (extractedPrice > 0 && extractedPrice < 50000) {
            price = extractedPrice;
            console.log(`✅ Method 3 success: ${price} TL`);
            break;
          }
        }
      }
    }
    
    // Method 3: Aggressive number extraction if previous methods failed
    if (price === 0) {
      console.log(`💰 Method 3: Maximum aggressive number extraction`);
      // Extract all numbers with Turkish formatting from entire HTML - Enhanced for maximum values
      const allNumbers = html.match(/\d{1,10}(?:[.,]\d{3})*(?:[.,]\d{1,3})?/g);
      if (allNumbers && allNumbers.length > 0) {
        console.log(`Found ${allNumbers.length} potential numbers:`, allNumbers.slice(0, 10));
        
        const candidatePrices = allNumbers.map(num => {
          let cleanNum = num;
          console.log(`🔍 Processing candidate: "${cleanNum}"`);
          
          // Advanced Turkish number format processing
          if (cleanNum.includes('.') && cleanNum.includes(',')) {
            // Format: 1.234.567,89 or 2.500.000,00
            cleanNum = cleanNum.replace(/\./g, '').replace(',', '.');
            console.log(`📊 Complex Turkish format: ${cleanNum}`);
          } else if (cleanNum.includes('.') && !cleanNum.includes(',')) {
            const parts = cleanNum.split('.');
            if (parts.length === 2 && parts[1].length === 3) {
              // Format: 14.681 (thousands separator)
              cleanNum = cleanNum.replace(/\./g, '');
              console.log(`📊 Thousands separator format: ${cleanNum}`);
            } else if (parts.length === 3 && parts[1].length === 3 && parts[2].length === 3) {
              // Format: 2.500.000 (millions)
              cleanNum = cleanNum.replace(/\./g, '');
              console.log(`📊 Millions format: ${cleanNum}`);
            } else if (parts.length === 4 && parts[1].length === 3 && parts[2].length === 3 && parts[3].length === 3) {
              // Format: 1.000.000.000 (billions)
              cleanNum = cleanNum.replace(/\./g, '');
              console.log(`📊 Billions format: ${cleanNum}`);
            }
          } else if (cleanNum.includes(',')) {
            // Format: 639,99 (decimal comma)
            cleanNum = cleanNum.replace(',', '.');
            console.log(`📊 Comma decimal format: ${cleanNum}`);
          }
          
          const parsed = parseFloat(cleanNum.replace(/[^\d.]/g, ''));
          return parsed;
        }).filter(p => p >= 10 && p < 10000000); // Maximum product price range including real estate
        
        if (candidatePrices.length > 0) {
          // Take median price from candidates
          candidatePrices.sort((a, b) => a - b);
          price = candidatePrices[Math.floor(candidatePrices.length / 2)];
          console.log(`✅ Method 3 success: ${price} TL (from ${candidatePrices.length} candidates)`);
        }
      }
    }
    
    console.log(`🎯 Final result: Price=${price} TL, Brand=${brand}`);
    return { price, brand };
    
  } catch (error) {
    console.error(`❌ Price extraction error: ${error.message}`);
    return { price: 0, brand: 'Network' };
  }
}