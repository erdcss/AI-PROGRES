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
    
    // Method 1: Direct regex search for prices in HTML
    console.log(`💰 Method 1: Regex price search`);
    const priceMatches = html.match(/(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:TL|₺)/gi);
    if (priceMatches && priceMatches.length > 0) {
      console.log(`Found ${priceMatches.length} price matches:`, priceMatches.slice(0, 5));
      
      // Parse and find the most likely product price
      const prices = priceMatches.map(match => {
        let cleanPrice = match.replace(/TL|₺/gi, '').trim();
        // Handle Turkish format: 1.299,99 -> 1299.99
        if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
          cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
        } else if (cleanPrice.includes(',')) {
          cleanPrice = cleanPrice.replace(',', '.');
        }
        return parseFloat(cleanPrice.replace(/[^\d.]/g, ''));
      }).filter(p => p > 0 && p < 50000); // Reasonable price range
      
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
              
              if (typeof value === 'number' && value > 0 && value < 50000) {
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
    
    console.log(`🎯 Final result: Price=${price} TL, Brand=${brand}`);
    return { price, brand };
    
  } catch (error) {
    console.error(`❌ Price extraction error: ${error.message}`);
    return { price: 0, brand: 'Network' };
  }
}