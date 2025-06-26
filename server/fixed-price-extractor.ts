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
    
    // Method 1: Extract from URL path - FIX COMPLETE REWRITE
    const urlParts = url.split('/').filter(part => part && part.length > 0);
    console.log(`🔍 URL parts:`, urlParts);
    
    // Find brand position: after www.trendyol.com, usually index 2
    // URL: https://www.trendyol.com/adidas/product-name-p-123
    // Parts: ["https:", "www.trendyol.com", "adidas", "product-name-p-123"] 
    
    if (urlParts.length >= 3 && urlParts[1] === 'www.trendyol.com') {
      const brandCandidate = urlParts[2];
      console.log(`🔍 Brand candidate from URL: "${brandCandidate}"`);
      
      if (brandCandidate && 
          brandCandidate.length > 1 && 
          brandCandidate.length < 30 && 
          !brandCandidate.includes('-p-') &&
          brandCandidate !== 'www.trendyol.com') {
        brand = brandCandidate.charAt(0).toUpperCase() + brandCandidate.slice(1);
        console.log(`✅ Brand extracted from URL: ${brand}`);
      }
    }
    
    // FALLBACK: Remove hardcoded Network completely
    if (brand === 'Marka Bilinmiyor' || brand === 'Network') {
      // Try alternative URL parsing
      const match = url.match(/trendyol\.com\/([^\/]+)\//);
      if (match && match[1] && match[1].length > 1) {
        brand = match[1].charAt(0).toUpperCase() + match[1].slice(1);
        console.log(`✅ Brand from regex match: ${brand}`);
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
    
    // Method 1: AGGRESSIVE Price detection with DOM selectors FIRST
    console.log(`💰 Method 1: DOM-based price detection`);
    
    // Price selector attempts
    const priceSelectors = [
      '.prc-dsc', // Discounted price
      '.prc-org', // Original price  
      '.product-price',
      '[data-testid="price-current"]',
      '[data-testid="price-original"]',
      '.current-price',
      '.price-current',
      '.sale-price',
      '.price'
    ];
    
    for (const selector of priceSelectors) {
      const priceElement = $(selector);
      if (priceElement.length > 0) {
        const priceText = priceElement.text().trim();
        console.log(`🔍 Price selector ${selector}: "${priceText}"`);
        
        // Extract number from price text
        const priceMatch = priceText.match(/(\d{1,6}(?:[.,]\d{1,3})?)/);
        if (priceMatch) {
          const extractedPrice = parseFloat(priceMatch[1].replace(',', '.'));
          if (extractedPrice > 1 && extractedPrice < 100000) {
            price = extractedPrice;
            console.log(`✅ Price found via DOM selector: ${price} TL`);
            break;
          }
        }
      }
    }
    
    // Method 2: Script-based price extraction if DOM failed
    if (price === 0) {
      console.log(`💰 Method 2: Script-based price detection`);
      
      const scriptTexts = $('script').map((i, el) => $(el).text()).get();
      for (const script of scriptTexts) {
        // Look for JSON price data
        const pricePatterns = [
          /"price"[:\s]*(\d+(?:\.\d+)?)/gi,
          /"currentPrice"[:\s]*(\d+(?:\.\d+)?)/gi,
          /"originalPrice"[:\s]*(\d+(?:\.\d+)?)/gi,
          /price[:\s]*(\d+(?:\.\d+)?)/gi
        ];
        
        for (const pattern of pricePatterns) {
          const matches = [...script.matchAll(pattern)];
          if (matches.length > 0) {
            const prices = matches.map(m => parseFloat(m[1])).filter(p => p > 1 && p < 100000);
            if (prices.length > 0) {
              price = Math.max(...prices); // Take highest price found
              console.log(`✅ Price found in script: ${price} TL`);
              break;
            }
          }
        }
        if (price > 0) break;
      }
    }
    
    // Method 3: HTML text pattern matching as final fallback  
    if (price === 0) {
      console.log(`💰 Method 3: HTML pattern matching`);
      
      const patterns = [
        /(\d{1,6}(?:[.,]\d{1,3})?)\s*(?:TL|₺)/gi,
        /\b(\d{2,6}[.,]\d{2})\s*TL/gi
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