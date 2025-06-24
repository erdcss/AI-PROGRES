import * as cheerio from 'cheerio';

export function extractPriceWithFallbacks(html: string): number {
  const $ = cheerio.load(html);
  
  // Enhanced price selectors in order of preference
  const priceSelectors = [
    '.prc-dsc',
    '[data-testid="price-current"]', 
    '.product-price',
    '.prc-slg',
    '.discounted-price',
    '.price-current',
    '.current-price',
    '.product-price-container .price',
    '.price-box .price'
  ];
  
  let price = 0;
  let priceFound = false;
  
  console.log('🔍 Starting enhanced price extraction...');
  
  // Method 1: Try each CSS selector
  for (const selector of priceSelectors) {
    if (priceFound) break;
    
    const priceElements = $(selector);
    priceElements.each((i, el) => {
      if (priceFound) return;
      
      const priceText = $(el).text().trim();
      if (priceText && priceText.includes('TL')) {
        // Clean price text thoroughly
        let cleanPrice = priceText
          .replace('TL', '')
          .replace(/\./g, '') // Remove thousands separators
          .replace(',', '.') // Convert decimal separator  
          .replace(/[^\d.]/g, ''); // Remove non-numeric chars
        
        const parsedPrice = parseFloat(cleanPrice);
        if (parsedPrice > 0 && parsedPrice < 1000000) {
          price = parsedPrice;
          console.log(`💰 Price found via selector (${selector}): ${price} TL`);
          priceFound = true;
        }
      }
    });
  }
  
  // Method 2: Try script data extraction
  if (!priceFound) {
    console.log('🔍 Trying script data extraction...');
    const scripts = $('script');
    scripts.each((i, el) => {
      if (priceFound) return;
      
      const scriptContent = $(el).html() || '';
      
      // Try different JSON patterns
      const patterns = [
        /"price":\s*(\d+\.?\d*)/,
        /"originalPrice":\s*(\d+\.?\d*)/,
        /"sellingPrice":\s*(\d+\.?\d*)/,
        /"discountedPrice":\s*(\d+\.?\d*)/,
        /price['"]:?\s*['"]*(\d+\.?\d*)/,
        /"priceText['"]*:\s*['"]*(\d+\.?\d*)/
      ];
      
      for (const pattern of patterns) {
        const match = scriptContent.match(pattern);
        if (match) {
          const foundPrice = parseFloat(match[1]);
          if (foundPrice > 0 && foundPrice < 1000000) {
            price = foundPrice;
            console.log(`💰 Price found via script pattern: ${price} TL`);
            priceFound = true;
            break;
          }
        }
      }
    });
  }
  
  // Method 3: Try data attributes
  if (!priceFound) {
    console.log('🔍 Trying data attributes...');
    const dataElements = $('[data-price], [data-original-price], [data-selling-price]');
    dataElements.each((i, el) => {
      if (priceFound) return;
      
      const $el = $(el);
      const dataPrice = $el.attr('data-price') || $el.attr('data-original-price') || $el.attr('data-selling-price');
      
      if (dataPrice) {
        const parsedPrice = parseFloat(dataPrice);
        if (parsedPrice > 0 && parsedPrice < 1000000) {
          price = parsedPrice;
          console.log(`💰 Price found via data attribute: ${price} TL`);
          priceFound = true;
        }
      }
    });
  }
  
  // Method 4: Try meta tags
  if (!priceFound) {
    console.log('🔍 Trying meta tags...');
    const metaTags = $('meta[property*="price"], meta[name*="price"]');
    metaTags.each((i, el) => {
      if (priceFound) return;
      
      const content = $(el).attr('content');
      if (content) {
        const cleanContent = content.replace(/[^\d.]/g, '');
        const parsedPrice = parseFloat(cleanContent);
        if (parsedPrice > 0 && parsedPrice < 1000000) {
          price = parsedPrice;
          console.log(`💰 Price found via meta tag: ${price} TL`);
          priceFound = true;
        }
      }
    });
  }
  
  if (!priceFound) {
    console.log('❌ No price found with any method');
  }
  
  return price;
}

export function extractImagesWithFallbacks(html: string): string[] {
  const $ = cheerio.load(html);
  const images: string[] = [];
  const seenUrls = new Set<string>();
  
  console.log('🔍 Starting enhanced image extraction...');
  
  // Method 1: CDN images from img tags
  $('img').each((i, el) => {
    const $img = $(el);
    const sources = [
      $img.attr('src'),
      $img.attr('data-src'),
      $img.attr('data-lazy'),
      $img.attr('data-original'),
      $img.attr('data-srcset')
    ];
    
    sources.forEach(src => {
      if (src && src.includes('cdn.dsmcdn.com') && !src.includes('spacer.gif') && !src.includes('logo')) {
        const normalizedUrl = normalizeImageUrl(src);
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          images.push(normalizedUrl);
        }
      }
    });
  });
  
  // Method 2: Background images from CSS
  $('*').each((i, el) => {
    const style = $(el).attr('style');
    if (style && style.includes('background-image')) {
      const urlMatch = style.match(/url\(['"]?(https:\/\/cdn\.dsmcdn\.com[^'")\s]+)/);
      if (urlMatch) {
        const normalizedUrl = normalizeImageUrl(urlMatch[1]);
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          images.push(normalizedUrl);
        }
      }
    }
  });
  
  // Method 3: Script data extraction
  $('script').each((i, el) => {
    const scriptContent = $(el).html() || '';
    const imageMatches = scriptContent.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s,}]+\.(jpg|jpeg|png|webp)/g);
    
    if (imageMatches) {
      imageMatches.forEach(url => {
        const normalizedUrl = normalizeImageUrl(url);
        if (!seenUrls.has(normalizedUrl)) {
          seenUrls.add(normalizedUrl);
          images.push(normalizedUrl);
        }
      });
    }
  });
  
  console.log(`📸 Found ${images.length} unique images`);
  return images.slice(0, 10); // Limit to 10 images
}

function normalizeImageUrl(url: string): string {
  if (!url) return '';
  
  // Remove query parameters and fragments
  const cleanUrl = url.split('?')[0].split('#')[0];
  
  // Ensure it's a high-quality image
  if (cleanUrl.includes('_org_zoom.jpg')) {
    return cleanUrl;
  }
  
  // Convert to org_zoom if possible
  if (cleanUrl.includes('.jpg') && !cleanUrl.includes('_org_zoom')) {
    return cleanUrl.replace('.jpg', '_org_zoom.jpg');
  }
  
  return cleanUrl;
}