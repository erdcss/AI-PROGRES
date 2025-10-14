import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ProductVariant {
  color: string;
  url: string;
  productId: string;
  thumbnailImage: string;
  detailImages: string[];
  isProcessed: boolean;
}

export interface AdvancedVariantResult {
  mainProduct: {
    url: string;
    title: string;
    brand: string;
    baseProductId: string;
  };
  variants: ProductVariant[];
  totalVariants: number;
  processedVariants: number;
  totalImages: number;
  processingTime: number;
}

/**
 * Advanced Trendyol Variant Scraper
 * Step 1: Scrape main product page for variant links
 * Step 2: Visit each variant URL to extract detailed images
 */
export async function scrapeAdvancedVariants(mainUrl: string): Promise<AdvancedVariantResult> {
  const startTime = Date.now();
  console.log('🔍 Advanced Variant Scraper başlıyor...');
  console.log('📍 Ana URL:', mainUrl);
  
  try {
    // Step 1: Parse main product page for variant links
    console.log('\n🎯 Step 1: Ana ürün sayfasında varyant linklerini buluyorum...');
    const variants = await extractVariantLinksFromMainPage(mainUrl);
    console.log(`✅ ${variants.length} varyant linki bulundu`);
    
    // Step 2: Process each variant URL to get detailed images
    console.log('\n📸 Step 2: Her varyant için detay sayfalarına giriyorum...');
    let processedCount = 0;
    let totalImages = 0;
    
    for (const variant of variants) {
      try {
        console.log(`🎨 Processing: ${variant.color} (${variant.url})`);
        
        const detailImages = await extractDetailImagesFromVariant(variant.url);
        variant.detailImages = detailImages;
        variant.isProcessed = true;
        
        processedCount++;
        totalImages += detailImages.length;
        
        console.log(`✅ ${variant.color}: ${detailImages.length} detail images`);
        
      } catch (error) {
        console.error(`❌ ${variant.color} variant processing failed:`, error);
        variant.isProcessed = false;
        variant.detailImages = [];
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // Extract main product info
    const mainProductInfo = await extractMainProductInfo(mainUrl);
    
    const result: AdvancedVariantResult = {
      mainProduct: mainProductInfo,
      variants,
      totalVariants: variants.length,
      processedVariants: processedCount,
      totalImages,
      processingTime
    };
    
    console.log('\n🎉 Advanced Variant Scraping tamamlandı!');
    console.log('📊 Özet:');
    console.log(`  🎨 Toplam varyant: ${result.totalVariants}`);
    console.log(`  ✅ İşlenen varyant: ${result.processedVariants}`);
    console.log(`  📸 Toplam görsel: ${result.totalImages}`);
    console.log(`  ⏱️ İşlem süresi: ${result.processingTime}ms`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Advanced Variant Scraper hatası:', error);
    throw error;
  }
}

/**
 * Step 1: Extract variant links from main product page
 */
async function extractVariantLinksFromMainPage(url: string): Promise<ProductVariant[]> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    timeout: 30000
  });
  
  const $ = cheerio.load(response.data);
  const html = response.data;
  
  console.log(`📄 HTML analizi: ${(html.length / 1024).toFixed(1)}KB`);
  
  const variants: ProductVariant[] = [];
  
  // Method 1: Look for variant color selectors
  const colorSelectors = [
    '.pr-in-dt-cl button',
    '.pr-in-dt-cl a', 
    '.color-variant-item',
    '.product-color-option',
    '.variant-color-selector',
    '.pr-in-dt-cl .pr-in-dt-cl-it'
  ];
  
  for (const selector of colorSelectors) {
    $(selector).each((i, element) => {
      const $element = $(element);
      const href = $element.attr('href');
      const onClick = $element.attr('onclick');
      const dataUrl = $element.data('url') as string;
      const title = $element.attr('title') || $element.text().trim();
      
      let variantUrl = '';
      
      if (href && href.includes('/p-')) {
        variantUrl = href.startsWith('http') ? href : `https://www.trendyol.com${href}`;
      } else if (onClick && onClick.includes('http')) {
        const urlMatch = onClick.match(/https:\/\/[^"'\s]+/);
        if (urlMatch) variantUrl = urlMatch[0];
      } else if (dataUrl && typeof dataUrl === 'string') {
        variantUrl = dataUrl.startsWith('http') ? dataUrl : `https://www.trendyol.com${dataUrl}`;
      }
      
      if (variantUrl && !variants.find(v => v.url === variantUrl)) {
        const productId = extractProductIdFromURL(variantUrl);
        const color = extractColorFromURL(variantUrl) || title || `Varyant ${variants.length + 1}`;
        
        // Get thumbnail image if available
        const $img = $element.find('img');
        const thumbnailImage = $img.attr('src') || $img.attr('data-src') || '';
        
        variants.push({
          color,
          url: variantUrl,
          productId,
          thumbnailImage,
          detailImages: [],
          isProcessed: false
        });
      }
    });
  }
  
  // Method 2: Look for variant URLs in script tags
  const scriptVariants = extractVariantURLsFromScripts(html);
  for (const scriptVariant of scriptVariants) {
    if (!variants.find(v => v.url === scriptVariant.url)) {
      variants.push(scriptVariant);
    }
  }
  
  // Method 3: Look for related product links
  const relatedSelectors = [
    'a[href*="/p-"]',
    '.related-products a',
    '.similar-products a'
  ];
  
  for (const selector of relatedSelectors) {
    $(selector).each((i, element) => {
      const $element = $(element);
      const href = $element.attr('href');
      
      if (href && href.includes('/p-') && variants.length < 20) {
        const fullUrl = href.startsWith('http') ? href : `https://www.trendyol.com${href}`;
        const productId = extractProductIdFromURL(fullUrl);
        
        // Only add if it's from the same brand/merchant
        if (fullUrl.includes('sayina') && !variants.find(v => v.url === fullUrl)) {
          const color = extractColorFromURL(fullUrl) || `Varyant ${variants.length + 1}`;
          
          variants.push({
            color,
            url: fullUrl,
            productId,
            thumbnailImage: '',
            detailImages: [],
            isProcessed: false
          });
        }
      }
    });
  }
  
  console.log(`🔍 Variant detection methods used:`);
  console.log(`  - Color selectors: ${colorSelectors.length} patterns`);
  console.log(`  - Script analysis: active`);
  console.log(`  - Related products: active`);
  
  return variants;
}

/**
 * Step 2: Extract detailed images from variant page
 */
async function extractDetailImagesFromVariant(variantUrl: string): Promise<string[]> {
  try {
    const response = await axios.get(variantUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    const images: string[] = [];
    
    // Method 1: Extract from CDN patterns in HTML
    const cdnImages = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
    
    for (const imageUrl of cdnImages) {
      // Convert to high quality _org_zoom.jpg format
      const highQualityUrl = imageUrl
        .replace(/\/\d+x\d+\//, '/org/')
        .replace(/(_\d+)?\.jpg$/, '_org_zoom.jpg');
      
      if (!images.includes(highQualityUrl) && 
          !imageUrl.includes('icon') && 
          !imageUrl.includes('logo') && 
          !imageUrl.includes('badge')) {
        images.push(highQualityUrl);
      }
    }
    
    // Method 2: Look for structured image data in scripts
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const imageMatches = script.match(/"images":\s*\[(.*?)\]/);
        if (imageMatches) {
          try {
            const imageArray = JSON.parse(`[${imageMatches[1]}]`);
            for (const img of imageArray) {
              if (typeof img === 'string' && img.includes('cdn.dsmcdn.com')) {
                const highQualityUrl = img.replace(/(_\d+)?\.jpg$/, '_org_zoom.jpg');
                if (!images.includes(highQualityUrl)) {
                  images.push(highQualityUrl);
                }
              }
            }
          } catch (e) {
            // Continue with other methods
          }
        }
      }
    }
    
    // Remove duplicates - NO LIMIT, get ALL images
    const uniqueImages = [...new Set(images)];
    
    return uniqueImages;
    
  } catch (error) {
    console.error('Error extracting detail images:', error);
    return [];
  }
}

/**
 * Extract main product information
 */
async function extractMainProductInfo(url: string) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 20000
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    // Extract title from JSON-LD
    let title = '';
    const scriptTags = $('script[type="application/ld+json"]');
    scriptTags.each((i, el) => {
      try {
        const jsonData = JSON.parse($(el).html() || '');
        if (jsonData.name) {
          title = jsonData.name;
        }
      } catch (e) {
        // Continue
      }
    });
    
    // Fallback title extraction
    if (!title) {
      title = $('h1').first().text().trim() || $('title').text().trim();
    }
    
    // Extract brand from URL
    const urlParts = new URL(url);
    const brand = urlParts.pathname.split('/')[1] || '';
    
    // Extract product ID
    const productId = extractProductIdFromURL(url);
    
    return {
      url,
      title,
      brand,
      baseProductId: productId
    };
    
  } catch (error) {
    return {
      url,
      title: 'Unknown Product',
      brand: 'Unknown Brand',
      baseProductId: extractProductIdFromURL(url)
    };
  }
}

/**
 * Extract variant URLs from script tags
 */
function extractVariantURLsFromScripts(html: string): ProductVariant[] {
  const variants: ProductVariant[] = [];
  
  const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
  if (scriptMatches) {
    for (const script of scriptMatches) {
      // Look for Trendyol URLs in JavaScript
      const urlMatches = script.match(/https:\/\/www\.trendyol\.com\/[^"'\s]+p-\d+[^"'\s]*/g);
      
      if (urlMatches) {
        for (const url of urlMatches) {
          const productId = extractProductIdFromURL(url);
          const color = extractColorFromURL(url);
          
          if (color && color !== 'Bilinmeyen Renk' && !variants.find(v => v.url === url)) {
            variants.push({
              color,
              url,
              productId,
              thumbnailImage: '',
              detailImages: [],
              isProcessed: false
            });
          }
        }
      }
    }
  }
  
  return variants;
}

/**
 * Extract color from URL
 */
function extractColorFromURL(url: string): string {
  const colorMap: { [key: string]: string } = {
    'sari': 'Sarı',
    'bordo': 'Bordo', 
    'mavi': 'Mavi',
    'indigo-mavi': 'İndigo Mavi',
    'kirmizi': 'Kırmızı',
    'beyaz': 'Beyaz',
    'siyah': 'Siyah',
    'yesil': 'Yeşil',
    'mor': 'Mor',
    'turuncu': 'Turuncu',
    'pembe': 'Pembe',
    'gri': 'Gri',
    'kahverengi': 'Kahverengi',
    'lacivert': 'Lacivert',
    'krem': 'Krem',
    'bej': 'Bej',
    'taba': 'Taba'
  };
  
  for (const [urlColor, displayColor] of Object.entries(colorMap)) {
    if (url.includes(urlColor)) {
      return displayColor;
    }
  }
  
  return 'Bilinmeyen Renk';
}

/**
 * Extract product ID from URL
 */
function extractProductIdFromURL(url: string): string {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : '';
}

/**
 * Generate CSV for advanced variant results
 */
export function generateAdvancedVariantCSV(result: AdvancedVariantResult): string {
  const headers = [
    'Color',
    'Product ID',
    'Variant URL',
    'Thumbnail Image',
    'Is Processed',
    'Detail Images Count',
    'Detail Image 1',
    'Detail Image 2', 
    'Detail Image 3',
    'Detail Image 4',
    'Detail Image 5',
    'All Detail Images'
  ];
  
  const rows: string[][] = [];
  
  for (const variant of result.variants) {
    const row = [
      variant.color,
      variant.productId,
      variant.url,
      variant.thumbnailImage,
      variant.isProcessed.toString(),
      variant.detailImages.length.toString(),
      variant.detailImages[0] || '',
      variant.detailImages[1] || '',
      variant.detailImages[2] || '',
      variant.detailImages[3] || '',
      variant.detailImages[4] || '',
      variant.detailImages.join('; ')
    ];
    
    rows.push(row);
  }
  
  // Convert to CSV format
  const csvContent = [
    headers.map(h => `"${h}"`).join(','),
    ...rows.map(row => row.map(cell => {
      const cellStr = cell !== null && cell !== undefined ? String(cell) : '';
      return `"${cellStr.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');
  
  return csvContent;
}