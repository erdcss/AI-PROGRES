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
// Otomatik renk tespit fonksiyonu
function detectColorFromUrl(url: string, htmlContent: string, $: any): string {
  console.log(`🔍 Renk tespiti başlatılıyor URL: ${url}`);
  
  // URL'den renk tespiti - Maybelline örnekleri için özelleştirildi
  const urlColorPatterns = [
    // Maybelline pattern: "taupe", "koyu-kahverengi" etc.
    /-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)-p-\d+/g,
    /-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)$/g,
    /\/([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)-p-/g,
    // L'Oreal ve diğer pattern'ler
    /-(\d{2,3})-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)-?/g,
    /renk-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)/gi,
    /color-([a-zA-ZğüşıöçĞÜŞİÖÇ-]+)/gi
  ];

  // URL'den renk çıkarmayı dene
  for (const pattern of urlColorPatterns) {
    pattern.lastIndex = 0; // Reset regex state
    const match = pattern.exec(url);
    if (match && match[1]) {
      let colorName = match[1];
      
      // Özel renk isimlerini temizle
      if (colorName.includes('-')) {
        colorName = colorName.split('-').map(part => {
          // Türkçe karakterler ve renk adları için özel işlem
          if (part === 'koyu') return 'Koyu';
          if (part === 'kahverengi') return 'Kahverengi';
          if (part === 'taupe') return 'Taupe';
          if (part === 'fair') return 'Fair';
          return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        }).join(' ');
      } else {
        colorName = colorName.charAt(0).toUpperCase() + colorName.slice(1).toLowerCase();
      }
      
      console.log(`✅ URL'den renk tespit edildi: ${colorName}`);
      return colorName;
    }
  }

  // HTML içeriğinden renk tespiti
  const htmlColorPatterns = [
    /"selectedVariantName"\s*:\s*"([^"]+)"/g,
    /"variantName"\s*:\s*"([^"]+)"/g,
    /"colorName"\s*:\s*"([^"]+)"/g,
    /data-variant-name="([^"]+)"/g,
    /"allVariants".*?"colorName":\s*"([^"]+)"/g
  ];

  for (const pattern of htmlColorPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(htmlContent);
    if (match && match[1] && match[1].length < 50) {
      console.log(`✅ HTML'den renk tespit edildi: ${match[1].trim()}`);
      return match[1].trim();
    }
  }

  // Title'dan renk çıkarma
  const titleElement = $('h1.pr-new-br, h1[data-testid="pdp-product-name"], h1.product-name');
  if (titleElement.length > 0) {
    const title = titleElement.text().trim();
    console.log(`🔍 Title: ${title}`);
    
    // Title'dan renk pattern'leri
    const titleColorPatterns = [
      /\b(Taupe|Fair|Koyu Kahverengi|Kahverengi|Siyah|Kırmızı|Mavi|Yeşil|Pembe|Mor|Turuncu|Sarı|Beyaz|Gri)\b/gi,
      /-\s*([A-ZĞÜŞİÖÇ][a-zğüşıöç\s]+)\s*$/g,
      /\s([0-9]{2,3}\s[A-Za-zğüşıöçĞÜŞİÖÇ]+)\s/g
    ];
    
    for (const pattern of titleColorPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(title);
      if (match && match[1]) {
        console.log(`✅ Title'dan renk tespit edildi: ${match[1].trim()}`);
        return match[1].trim();
      }
    }
  }

  // Fallback: URL'den son kelimeyi al
  const urlParts = url.split('/').pop()?.split('-') || [];
  for (let i = urlParts.length - 1; i >= 0; i--) {
    const part = urlParts[i];
    if (part && part !== 'p' && !/^\d+$/.test(part) && part.length > 2 && part.length < 20) {
      const colorName = part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      console.log(`⚡ Fallback'den renk tespit edildi: ${colorName}`);
      return colorName;
    }
  }

  // En son fallback: rastgele renk ID
  const randomColor = `Color-${Date.now().toString().slice(-4)}`;
  console.log(`🎲 Rastgele renk oluşturuldu: ${randomColor}`);
  return randomColor;
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
  const allSizes = new Set<string>(); // Tüm URL'lerden gelen bedenler birleştirilecek
  const combinedColors = new Set<string>();
  const allVariants: Array<{
    color: string;
    colorCode: string;
    size: string;
    inStock: boolean;
  }> = [];
  
  let mainProduct: any = null; // İlk URL'den alınacak ortak bilgiler
  
  for (const { url } of request.urls) {
    try {
      console.log(`🎯 Scraping color variant from ${url}`);
      
      const response = await fetchWithRetry(url);
      const $ = cheerio.load(response);
      const htmlContent = response;
      
      // Otomatik renk tespiti
      const detectedColor = detectColorFromUrl(url, htmlContent, $);
      console.log(`🎨 Detected color: ${detectedColor}`);
      
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
          alt: `${mainProduct.title} - ${detectedColor}`,
          colorName: detectedColor
        });
      });
      
      // Extract sizes for this variant (TÜM URL'lerden gelen bedenler toplanacak)
      const sizes = extractSizesFromContent($, htmlContent);
      sizes.forEach(size => allSizes.add(size));
      
      // Add color to combined colors
      combinedColors.add(detectedColor);
      
      console.log(`✅ Successfully scraped ${detectedColor}: ${colorImages.length} images, ${sizes.length} sizes`);
      
    } catch (error) {
      console.error(`❌ Failed to scrape color from ${url}:`, error);
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
  
  // Create final variants: Her renk için tüm bedenleri oluştur
  const finalSizes = Array.from(allSizes);
  const finalColors = Array.from(combinedColors);
  
  // Eğer hiç beden bulunamazsa, default olarak "Standart" ekle
  if (finalSizes.length === 0) {
    finalSizes.push('Standart');
  }
  
  // Her renk-beden kombinasyonu için varyant oluştur
  finalColors.forEach(color => {
    finalSizes.forEach(size => {
      allVariants.push({
        color: color,
        colorCode: color.toLowerCase(),
        size: size,
        inStock: true // URL erişilebilir olduğu için stokta varsay
      });
    });
  });
  
  const result: CombinedProduct = {
    ...mainProduct,
    images: combinedImages,
    variants: {
      colors: finalColors,
      sizes: finalSizes,
      allVariants: allVariants
    },
    features: features,
    tags: tags
  };
  
  console.log(`🎨 Multi-URL scraping completed: ${result.variants.colors.length} colors, ${result.variants.allVariants.length} variants, ${result.images.length} images`);
  
  return result;
}