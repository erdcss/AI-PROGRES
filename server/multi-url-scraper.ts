import * as cheerio from 'cheerio';
// Import fetchWithRetry from a working source
async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.text();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw new Error('Fetch failed after retries');
}
// Helper functions for extracting product data
function extractSizesFromContent($: any, htmlContent: string): string[] {
  const sizes = new Set<string>();
  
  // Extract from size selectors
  $('.sp-itm, .size-variant-item, [data-size]').each((_: any, elem: any) => {
    const sizeText = $(elem).text().trim();
    if (sizeText && sizeText.length > 0 && sizeText.length < 10) {
      sizes.add(sizeText);
    }
  });
  
  // Extract from JavaScript
  const sizePatterns = [
    /size["\']?\s*:\s*["\']([^"']+)["\']/gi,
    /beden["\']?\s*:\s*["\']([^"']+)["\']/gi,
    /"slicingAttributeName":"Beden".*?"slicingAttributeValues":\["([^"]+)"\]/gi
  ];
  
  sizePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const size = match[1].trim();
      if (size && size.length > 0 && size.length < 10) {
        sizes.add(size);
      }
    }
  });
  
  return Array.from(sizes);
}

function extractFeaturesFromContent($: any, htmlContent: string): Array<{ key: string; value: string }> {
  const features: Array<{ key: string; value: string }> = [];
  
  // Extract from product details section
  $('.product-detail-feature li, .detail-feature-item').each((_: any, elem: any) => {
    const text = $(elem).text().trim();
    if (text.includes(':')) {
      const [key, value] = text.split(':', 2);
      features.push({
        key: key.trim(),
        value: value.trim()
      });
    }
  });
  
  return features;
}

function generateTags(title: string, description: string, colors: string[]): string[] {
  const tags = new Set<string>();
  
  // Add color-based tags
  colors.forEach(color => {
    tags.add(color);
  });
  
  // Add common cosmetic tags
  if (title.toLowerCase().includes('ruj') || title.toLowerCase().includes('lipstick')) {
    tags.add('ruj');
    tags.add('dudak');
  }
  
  if (title.toLowerCase().includes('fondöten') || title.toLowerCase().includes('foundation')) {
    tags.add('fondöten');
    tags.add('makyaj');
  }
  
  return Array.from(tags);
}

interface MultiUrlScrapeRequest {
  urls: Array<{
    url: string;
    colorName: string;
  }>;
  mode: 'multi-url';
}

interface CombinedProduct {
  id: string;
  title: string;
  brand: string;
  price: any;
  description: string;
  category: string;
  images: Array<{ url: string; alt?: string; colorName?: string }>;
  variants: {
    colors: string[];
    sizes: string[];
    allVariants: Array<{
      color: string;
      colorCode: string;
      size: string;
      inStock: boolean;
    }>;
  };
  features: Array<{ key: string; value: string }>;
  tags: string[];
}

export async function scrapeMultipleUrls(request: MultiUrlScrapeRequest): Promise<CombinedProduct> {
  console.log(`🎨 Multi-URL scraping started for ${request.urls.length} color variants`);
  
  const results = [];
  const combinedImages: Array<{ url: string; alt?: string; colorName?: string }> = [];
  const combinedSizes = new Set<string>();
  const combinedColors = new Set<string>();
  const allVariants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }> = [];
  
  let mainProduct: any = null;
  
  for (const { url, colorName } of request.urls) {
    try {
      console.log(`🎯 Scraping color variant: ${colorName} from ${url}`);
      
      const response = await fetchWithRetry(url);
      const $ = cheerio.load(response);
      const htmlContent = response;
      
      // Extract basic product info (use first URL as main product info)
      if (!mainProduct) {
        const titleElement = $('h1.pr-new-br[data-testid="product-detail-name"]');
        const title = titleElement.text().trim();
        
        const brandElement = $('a[data-testid="product-detail-brand"]');
        const brand = brandElement.text().trim();
        
        const descriptionElement = $('.product-detail-description, .detail-desc-text');
        const description = descriptionElement.text().trim();
        
        // Extract price
        let price: any = "0";
        const priceElement = $('.prc-dsc, .prc-org, [data-testid="price-current-price"]');
        if (priceElement.length > 0) {
          const priceText = priceElement.first().text().trim();
          const priceMatch = priceText.match(/[\d.,]+/);
          if (priceMatch) {
            price = {
              profitFormatted: priceText,
              value: parseFloat(priceMatch[0].replace(',', '.'))
            };
          }
        }
        
        mainProduct = {
          id: url.split('-p-')[1]?.split('?')[0] || Date.now().toString(),
          title,
          brand,
          description,
          price,
          category: 'Kozmetik'
        };
      }
      
      // Extract images for this color
      const colorImages: string[] = [];
      
      // Primary image
      const mainImageElement = $('.product-detail-picture img, [data-testid="product-detail-main-image"] img');
      if (mainImageElement.length > 0) {
        const mainImageSrc = mainImageElement.attr('src');
        if (mainImageSrc) {
          const cleanImageUrl = mainImageSrc.replace(/\/ty\d+\//, '/ty1200/').replace(/_crop\.jpg$/, '_org_zoom.jpg');
          colorImages.push(cleanImageUrl);
        }
      }
      
      // Additional images from gallery
      $('.product-slide-list img, .product-detail-gallery img').each((_, img) => {
        const imageSrc = $(img).attr('src') || $(img).attr('data-src');
        if (imageSrc && !imageSrc.includes('video-placeholder')) {
          const cleanImageUrl = imageSrc.replace(/\/ty\d+\//, '/ty1200/').replace(/_crop\.jpg$/, '_org_zoom.jpg');
          if (!colorImages.includes(cleanImageUrl)) {
            colorImages.push(cleanImageUrl);
          }
        }
      });
      
      // Add images with color association
      colorImages.forEach(imageUrl => {
        combinedImages.push({
          url: imageUrl,
          alt: `${mainProduct.title} - ${colorName}`,
          colorName: colorName
        });
      });
      
      // Extract sizes for this variant
      const sizes = extractSizesFromContent($, htmlContent);
      sizes.forEach(size => combinedSizes.add(size));
      
      // Add color to combined colors
      combinedColors.add(colorName);
      
      // Create variants for this color
      const colorSizes = sizes.length > 0 ? sizes : ['Standart'];
      colorSizes.forEach(size => {
        allVariants.push({
          color: colorName,
          colorCode: colorName.toLowerCase(),
          size: size,
          inStock: true // Assume in stock since URL is accessible
        });
      });
      
      console.log(`✅ Successfully scraped ${colorName}: ${colorImages.length} images, ${colorSizes.length} sizes`);
      
    } catch (error) {
      console.error(`❌ Failed to scrape color ${colorName} from ${url}:`, error);
      // Continue with other colors
    }
  }
  
  if (!mainProduct) {
    throw new Error('Failed to extract main product information from any URL');
  }
  
  // Extract features from first URL
  let features: Array<{ key: string; value: string }> = [];
  if (request.urls.length > 0) {
    try {
      const firstResponse = await fetchWithRetry(request.urls[0].url);
      const firstCheerio = cheerio.load(firstResponse);
      features = extractFeaturesFromContent(firstCheerio, firstResponse);
    } catch (error) {
      console.error('❌ Failed to extract features:', error);
    }
  }
  
  // Generate tags
  const tags = generateTags(mainProduct.title, mainProduct.description, Array.from(combinedColors));
  
  const result: CombinedProduct = {
    ...mainProduct,
    images: combinedImages,
    variants: {
      colors: Array.from(combinedColors),
      sizes: Array.from(combinedSizes),
      allVariants: allVariants
    },
    features: features,
    tags: tags
  };
  
  console.log(`🎨 Multi-URL scraping completed: ${result.variants.colors.length} colors, ${result.variants.allVariants.length} variants, ${result.images.length} images`);
  
  return result;
}