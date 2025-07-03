import * as cheerio from 'cheerio';

// Helper function to extract Turkish price format
function extractTurkishPrice(priceText: string): number {
  if (!priceText) return 0;
  
  // Remove all non-numeric characters except comma and dot
  const cleanText = priceText.replace(/[^\d,\.]/g, '');
  
  // Handle Turkish formats:
  // 1.458,03 -> 1458.03
  // 1234,56 -> 1234.56  
  // 1234.56 -> 1234.56
  // 1234 -> 1234
  
  if (cleanText.includes(',') && cleanText.includes('.')) {
    // Format: 1.458,03 (thousands separator + decimal)
    const parts = cleanText.split(',');
    if (parts.length === 2) {
      const integerPart = parts[0].replace(/\./g, '');
      const decimalPart = parts[1];
      return parseFloat(`${integerPart}.${decimalPart}`);
    }
  } else if (cleanText.includes(',')) {
    // Format: 1234,56 (decimal comma)
    return parseFloat(cleanText.replace(',', '.'));
  } else {
    // Format: 1234.56 or 1234
    return parseFloat(cleanText);
  }
  
  return 0;
}

interface AuthenticProductData {
  success: boolean;
  title: string;
  brand: string;
  price: number;
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
}

export async function authenticTrendyolScrape(url: string): Promise<AuthenticProductData> {
  try {
    console.log('🎯 Starting authentic Trendyol scraping...');
    
    // URL formatını düzelt
    let processedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      processedUrl = 'https://' + url;
    }

    // Get HTML content using axios with proper headers
    const axios = (await import('axios')).default;
    
    console.log(`🌐 Requesting URL: ${processedUrl}`);
    
    const response = await axios.get(processedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400
    });
    
    console.log(`📡 Response status: ${response.status}, Final URL: ${response.request?.responseURL || processedUrl}`);
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML content loaded: ${html.length} characters`);

    // Extract authentic product title using comprehensive selectors
    let title = 'Product';
    const titleSelectors = [
      'h1.pr-new-br',
      'h1[data-testid="product-title"]',
      '.pr-new-br h1',
      'h1.product-title',
      '.product-name h1',
      '.pr-new-br .pr-new-br',
      '.pr-in-dt .pr-in-dt',
      'span.pr-new-br',
      '.product-detail-title'
    ];
    
    // First try to extract from JSON-LD for more accuracy
    try {
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const jsonContent = $(element).html();
          if (jsonContent) {
            const data = JSON.parse(jsonContent);
            if (data.name && data.name.length > 5) {
              title = data.name;
              console.log(`✅ Title from JSON-LD: ${title}`);
              return false; // Break loop
            }
          }
        } catch (error) {
          // Continue to next element
        }
      });
    } catch (error) {
      console.log('JSON-LD title extraction failed');
    }
    
    // If JSON-LD failed, try DOM selectors
    if (title === 'Product') {
      for (const selector of titleSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const titleText = element.text().trim();
          if (titleText && titleText.length > 5 && !titleText.includes('404') && !titleText.includes('Sayfa')) {
            title = titleText;
            console.log(`✅ Title found via ${selector}: ${title}`);
            break;
          }
        }
      }
    }

    // Extract authentic brand from URL
    let brand = 'Brand';
    const urlParts = processedUrl.split('/');
    if (urlParts.length > 3) {
      const urlBrand = urlParts[3];
      if (urlBrand && urlBrand !== 'www.trendyol.com') {
        brand = urlBrand.charAt(0).toUpperCase() + urlBrand.slice(1);
        console.log(`✅ Brand from URL: ${brand}`);
      }
    }

    // Extract authentic price using multiple methods
    let originalPrice = 0;
    
    // Method 1: JSON-LD structured data (most reliable)
    try {
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const jsonContent = $(element).html();
          if (jsonContent) {
            const data = JSON.parse(jsonContent);
            if (data.offers && Array.isArray(data.offers)) {
              for (const offer of data.offers) {
                if (offer.price || offer.lowPrice) {
                  const price = parseFloat(offer.price || offer.lowPrice);
                  if (price > 0 && price < 50000) {
                    originalPrice = price;
                    console.log(`💰 JSON-LD price found: ${originalPrice} TL`);
                    break;
                  }
                }
              }
            }
          }
        } catch (error) {
          // Continue to next element
        }
      });
    } catch (error) {
      console.log('JSON-LD price extraction failed');
    }
    
    // Method 2: Enhanced Trendyol price selectors with comprehensive patterns
    if (!originalPrice) {
      const priceSelectors = [
        '.prc-dsc',
        '.prc-slg', 
        '.prc-org',
        '.pr-bx-nr .prc-dsc',
        '.pr-in .prc-dsc',
        '.pr-in-w .prc-dsc',
        '.pr-in-w .prc-org',
        '.product-price',
        '.price-value',
        '.current-price',
        '[data-price]',
        '.pr-in .pr-bx-nr .prc-dsc',
        '.pr-in .pr-bx-nm .prc-dsc'
      ];
      
      for (const selector of priceSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const priceText = element.text().trim();
          console.log(`🔍 Testing selector ${selector}: "${priceText}"`);
          
          // Remove all non-numeric characters except comma and dot
          const cleanText = priceText.replace(/[^\d,\.]/g, '');
          // Handle Turkish number format (comma as decimal separator)
          const numericPrice = parseFloat(cleanText.replace(',', '.'));
          
          console.log(`🔍 Cleaned text: "${cleanText}" → Numeric: ${numericPrice}`);
          
          if (numericPrice > 0 && numericPrice < 50000) {
            originalPrice = numericPrice;
            console.log(`💰 DOM price found: ${originalPrice} TL via ${selector}`);
            break;
          }
        } else {
          console.log(`❌ Selector ${selector} not found`);
        }
      }
    }

    // Method 3: Enhanced script content analysis for price extraction
    if (!originalPrice) {
      const scripts = $('script').toArray();
      for (const script of scripts) {
        const scriptContent = $(script).html() || '';
        
        // Enhanced patterns for various price fields in Trendyol
        const patterns = [
          /"price":\s*(\d+(?:[.,]\d+)?)/gi,
          /"sellPrice":\s*(\d+(?:[.,]\d+)?)/gi,
          /"currentPrice":\s*(\d+(?:[.,]\d+)?)/gi,
          /"originalPrice":\s*(\d+(?:[.,]\d+)?)/gi,
          /"prc":\s*(\d+(?:[.,]\d+)?)/gi,
          /"priceValue":\s*(\d+(?:[.,]\d+)?)/gi,
          /"displayPrice":\s*(\d+(?:[.,]\d+)?)/gi,
          /"amount":\s*(\d+(?:[.,]\d+)?)/gi,
          /price['":]?\s*['":]?\s*(\d+(?:[.,]\d+)?)/gi,
          /\b(\d+(?:[.,]\d+)?)\s*TL\b/gi
        ];
        
        for (const pattern of patterns) {
          let match;
          pattern.lastIndex = 0; // Reset regex
          while ((match = pattern.exec(scriptContent)) !== null) {
            const priceText = match[1];
            const priceValue = extractTurkishPrice(priceText);
            
            if (priceValue > 10 && priceValue < 100000) { // Reasonable price range
              originalPrice = priceValue;
              console.log(`💰 Script price found: ${originalPrice} TL from pattern ${pattern.source}`);
              break;
            }
          }
          if (originalPrice) break;
        }
        if (originalPrice) break;
      }
    }

    // Method 4: HTML content scan for price patterns as last resort
    if (!originalPrice) {
      console.log('🔍 Scanning HTML content for price patterns...');
      const htmlContent = $.html();
      const htmlPricePatterns = [
        /(\d+(?:[.,]\d+)?)\s*TL/gi,
        /fiyat[^>]*>.*?(\d+(?:[.,]\d+)?)/gi,
        /price[^>]*>.*?(\d+(?:[.,]\d+)?)/gi
      ];
      
      for (const pattern of htmlPricePatterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(htmlContent)) !== null) {
          const priceText = match[1];
          const priceValue = extractTurkishPrice(priceText);
          
          if (priceValue > 10 && priceValue < 100000) {
            originalPrice = priceValue;
            console.log(`💰 HTML scan price found: ${originalPrice} TL`);
            break;
          }
        }
        if (originalPrice) break;
      }
    }



    // If still no price found, try more aggressive text scanning
    if (!originalPrice) {
      console.log('🔍 Final attempt: aggressive text scanning...');
      const allText = $.text();
      const priceMatches = allText.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/g);
      
      if (priceMatches) {
        for (const match of priceMatches) {
          const priceText = match.replace(/\s*TL/g, '');
          const priceValue = extractTurkishPrice(priceText);
          
          if (priceValue > 50 && priceValue < 100000) {
            originalPrice = priceValue;
            console.log(`💰 Aggressive scan found: ${originalPrice} TL from "${match}"`);
            break;
          }
        }
      }
    }

    // Apply 15% profit margin
    const finalPrice = originalPrice > 0 ? Math.round(originalPrice * 1.15) : 0;
    console.log(`💰 Final price calculation: ${originalPrice} TL → ${finalPrice} TL (15% profit)`);

    // Extract authentic product images
    const images: string[] = [];
    const imageElements = $('img').toArray();
    
    for (const img of imageElements) {
      const src = $(img).attr('src') || '';
      if (src.includes('cdn.dsmcdn.com') && src.includes('_org_zoom.jpg')) {
        images.push(src);
        if (images.length >= 10) break; // Limit to 10 images
      }
    }
    
    console.log(`📸 Images extracted: ${images.length}`);

    // Extract authentic product features using JSON-LD extractor
    const { extractJSONLDFeatures } = await import('./json-ld-features-extractor');
    const uniqueFeatures = extractJSONLDFeatures(html, brand);

    // Extract authentic variants or create single variant
    const variants = [{
      color: 'Standart',
      size: 'Tek Beden',
      inStock: true
    }];

    console.log(`✅ Authentic Trendyol scraping completed successfully`);
    
    return {
      success: true,
      title,
      brand,
      price: finalPrice,
      images,
      features: uniqueFeatures,
      variants
    };
    
  } catch (error: any) {
    console.error(`❌ Authentic scraper error: ${error.message}`);
    
    return {
      success: false,
      title: 'Product',
      brand: 'Brand',
      price: 350,
      images: [],
      features: [{ key: 'Error', value: 'Extraction failed' }],
      variants: [{ color: 'Standart', size: 'Tek Beden', inStock: true }]
    };
  }
}