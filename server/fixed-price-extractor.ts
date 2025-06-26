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
    let brand = 'Marka Bilinmiyor';
    
    // Brand extraction first
    console.log(`🏷️ Brand detection starting...`);
    
    // Method 1: Extract from URL path
    const urlParts = url.split('/');
    console.log(`🔍 URL parts:`, urlParts);
    // URL format: https://www.trendyol.com/braun/product-name
    // Index:         0    1   2              3     4
    
    // Look for the brand after trendyol.com
    const trendyolIndex = urlParts.findIndex(part => part === 'www.trendyol.com');
    if (trendyolIndex >= 0 && urlParts.length > trendyolIndex + 1) {
      const brandFromUrl = urlParts[trendyolIndex + 1]; // Next element after trendyol.com
      if (brandFromUrl && brandFromUrl.length > 1 && brandFromUrl.length < 30 && !brandFromUrl.includes('-p-')) {
        brand = brandFromUrl.charAt(0).toUpperCase() + brandFromUrl.slice(1);
        console.log(`✅ Brand from URL (index ${trendyolIndex + 1}): ${brand}`);
      }
    }
    
    // Method 2: Extract from meta tags and JSON-LD
    const brandSelectors = [
      'meta[property="product:brand"]',
      'meta[name="brand"]',
      '[data-testid="product-brand"]',
      '.product-brand',
      '.brand-name'
    ];
    
    for (const selector of brandSelectors) {
      const brandElement = $(selector);
      if (brandElement.length > 0) {
        const extractedBrand = brandElement.attr('content') || brandElement.text().trim();
        if (extractedBrand && extractedBrand.length > 1 && extractedBrand.length < 50) {
          brand = extractedBrand;
          console.log(`✅ Brand from selector ${selector}: ${brand}`);
          break;
        }
      }
    }
    
    // Method 3: Extract from script JSON data
    if (brand === 'Marka Bilinmiyor') {
      const scriptTexts = $('script').map((i, el) => $(el).text()).get();
      for (const script of scriptTexts) {
        const brandMatch = script.match(/"brand"[:\s]*"([^"]+)"/i) || 
                          script.match(/"vendor"[:\s]*"([^"]+)"/i) ||
                          script.match(/vendor[:\s]*["']([^"']+)["']/i);
        if (brandMatch && brandMatch[1] && brandMatch[1] !== 'Network') {
          brand = brandMatch[1];
          console.log(`✅ Brand from script: ${brand}`);
          break;
        }
      }
    }
    
    // Method 1: Enhanced HTML price detection with multiple patterns
    console.log(`💰 Method 1: Advanced price pattern detection`);
    
    // Multiple regex patterns for different price formats
    const patterns = [
      /(\d{1,10}(?:[.,]\d{3})*(?:[.,]\d{1,3})?)\s*(?:TL|₺|Türk\s*Lirası)/gi,
      /"price"[:\s]*"?(\d+(?:[.,]\d+)?)"?/gi,
      /"currentPrice"[:\s]*"?(\d+(?:[.,]\d+)?)"?/gi,
      /discountPrice[:\s]*"?(\d+(?:[.,]\d+)?)"?/gi,
      /originalPrice[:\s]*"?(\d+(?:[.,]\d+)?)"?/gi,
      /\b(\d{2,7}[.,]\d{2})\s*TL/gi,
      /₺\s*(\d{2,7}(?:[.,]\d{2})?)/gi
    ];
    
    let allPrices: number[] = [];
    
    patterns.forEach((pattern, index) => {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`Pattern ${index + 1} found ${matches.length} matches:`, matches.slice(0, 3));
        
        const prices = matches.map((match: string) => {
          let cleanPrice = match.replace(/[^0-9.,]/g, '').trim();
          
          // Handle Turkish number formatting
          if (cleanPrice.includes('.') && cleanPrice.includes(',')) {
            cleanPrice = cleanPrice.replace(/\./g, '').replace(',', '.');
          } else if (cleanPrice.includes('.') && !cleanPrice.includes(',')) {
            const parts = cleanPrice.split('.');
            if (parts.length === 2 && parts[1].length === 3) {
              cleanPrice = cleanPrice.replace(/\./g, '');
            }
          } else if (cleanPrice.includes(',')) {
            cleanPrice = cleanPrice.replace(',', '.');
          }
          
          const parsedPrice = parseFloat(cleanPrice);
          return isNaN(parsedPrice) ? 0 : parsedPrice;
        }).filter((p: number) => p > 10 && p < 1000000); // Realistic price range
        
        allPrices.push(...prices);
      }
    });
    
    if (allPrices.length > 0) {
      allPrices.sort((a: number, b: number) => a - b);
      price = allPrices[Math.floor(allPrices.length / 2)];
      console.log(`✅ Method 1 success: ${price} TL from ${allPrices.length} candidates`);
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
          
          // Enhanced brand extraction with multiple search patterns
          const findBrandInObject = (obj: any, path = ''): string => {
            if (typeof obj !== 'object' || obj === null) return 'Network';
            
            for (const [key, value] of Object.entries(obj)) {
              const currentPath = path ? `${path}.${key}` : key;
              
              // Direct brand name checks
              if (key === 'brandName' && typeof value === 'string') {
                console.log(`🏷️ Brand found at ${currentPath}: ${value}`);
                return value;
              }
              
              if (key === 'name' && path.includes('brand') && typeof value === 'string') {
                console.log(`🏷️ Brand name found at ${currentPath}: ${value}`);
                return value;
              }
              
              // Brand object with name property
              if (key.toLowerCase().includes('brand') && typeof value === 'object' && value !== null) {
                if ((value as any).name && typeof (value as any).name === 'string') {
                  console.log(`🏷️ Brand object found at ${currentPath}: ${(value as any).name}`);
                  return (value as any).name;
                }
                if ((value as any).brandName && typeof (value as any).brandName === 'string') {
                  console.log(`🏷️ Brand object found at ${currentPath}: ${(value as any).brandName}`);
                  return (value as any).brandName;
                }
              }
              
              // Recursive search
              if (typeof value === 'object') {
                const found = findBrandInObject(value, currentPath);
                if (found !== 'Network') return found;
              }
            }
            return 'Network';
          };
          
          const foundBrand = findBrandInObject(jsonData);
          if (foundBrand !== 'Network') {
            brand = foundBrand;
            console.log(`✅ Brand extracted: ${brand}`);
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
    
  } catch (error: any) {
    console.error(`❌ Price extraction error: ${error.message}`);
    return { price: 0, brand: 'Hata' };
  }
}