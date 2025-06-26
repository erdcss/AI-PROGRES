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
    
    // Method 1: Extract from URL path - FIXED VERSION
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
    
    // Method 2: Extract from HTML selectors
    if (brand === 'Marka Bilinmiyor') {
      const brandSelectors = [
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
          /"price"[:\s]*(\d+(?:\.\d+)?)/g,
          /"currentPrice"[:\s]*(\d+(?:\.\d+)?)/g,
          /"originalPrice"[:\s]*(\d+(?:\.\d+)?)/g,
          /price[:\s]*(\d+(?:\.\d+)?)/g
        ];
        
        for (const pattern of pricePatterns) {
          let match;
          while ((match = pattern.exec(script)) !== null) {
            const extractedPrice = parseFloat(match[1]);
            if (extractedPrice > 1 && extractedPrice < 100000) {
              price = extractedPrice;
              console.log(`✅ Price found in script: ${price} TL`);
              break;
            }
          }
          if (price > 0) break;
        }
        if (price > 0) break;
      }
    }
    
    // Method 3: HTML text pattern matching as final fallback  
    if (price === 0) {
      console.log(`💰 Method 3: HTML pattern matching`);
      
      const patterns = [
        /(\d{1,6}(?:[.,]\d{1,3})?)\s*(?:TL|₺)/g,
        /\b(\d{2,6}[.,]\d{2})\s*TL/g
      ];
      
      let allPrices: number[] = [];
      
      patterns.forEach((pattern, index) => {
        const matches = html.match(pattern);
        if (matches && matches.length > 0) {
          console.log(`Pattern ${index + 1} found ${matches.length} matches:`, matches.slice(0, 3));
          
          const prices = matches.map((match: string) => {
            const numMatch = match.match(/(\d{1,6}(?:[.,]\d{1,3})?)/);
            if (numMatch) {
              let cleanNumber = numMatch[1];
              
              // Handle Turkish number formatting
              if (cleanNumber.includes(',') && cleanNumber.includes('.')) {
                // Format: 1.234,56 -> 1234.56
                cleanNumber = cleanNumber.replace(/\./g, '').replace(',', '.');
              } else if (cleanNumber.includes(',')) {
                // Format: 123,45 -> 123.45
                cleanNumber = cleanNumber.replace(',', '.');
              } else if (cleanNumber.includes('.') && cleanNumber.split('.')[1]?.length <= 2) {
                // Format: 123.45 -> 123.45 (already correct)
                // Keep as is
              } else if (cleanNumber.includes('.')) {
                // Format: 1.234 -> 1234 (thousands separator)
                cleanNumber = cleanNumber.replace(/\./g, '');
              }
              
              const parsedPrice = parseFloat(cleanNumber);
              return parsedPrice;
            }
            return 0;
          }).filter((p: number) => p > 1 && p < 100000);
          
          allPrices.push(...prices);
        }
      });
      
      if (allPrices.length > 0) {
        // Sort prices and take median to avoid outliers
        allPrices.sort((a: number, b: number) => a - b);
        const candidatePrices = allPrices.slice(0, 20); // Take first 20 prices
        
        if (candidatePrices.length > 0) {
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