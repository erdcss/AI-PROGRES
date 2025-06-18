import * as cheerio from 'cheerio';
import axios from 'axios';

export interface EnhancedVariantData {
  colors: string[];
  sizes: string[];
  images: string[];
  variantImages: Record<string, string[]>;
  colorImageMap: Record<string, string[]>;
  variantPricing: Record<string, number>;
  variantSpecificPricing: Record<string, number>;
  stockMap: Record<string, boolean>;
}

export async function scrapeTrendyolProduct(url: string) {
  try {
    console.log('🚀 Enhanced Trendyol handler başlatılıyor...');
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });

    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);

    // Extract basic product info
    const title = $('h1').first().text().trim() || 
                  $('[data-id="product-name"]').text().trim() ||
                  $('title').text().replace(' - Trendyol', '').trim();

    const priceText = $('.prc-dsc').first().text().trim() || 
                      $('.prc-slg').first().text().trim() ||
                      $('[data-id="price"]').text().trim();
                      
    const price = priceText.replace(/[^\d,]/g, '').replace(',', '.');

    // Extract product ID from URL
    const productIdMatch = url.match(/p-(\d+)/);
    const productId = productIdMatch ? productIdMatch[1] : '';

    // Enhanced variant extraction
    const variantData = extractEnhancedVariants(htmlContent, productId);
    
    // Calculate total variants
    const totalVariants = variantData.colors.length * variantData.sizes.length;

    console.log(`🎯 ${variantData.images.length} görsel çıkarıldı`);
    console.log(`🔍 ${variantData.colors.length} renk, ${variantData.sizes.length} beden tespit edildi`);
    console.log(`📊 ${totalVariants} toplam varyant`);

    return {
      title,
      price: price || '0',
      id: parseInt(productId) || 0,
      url,
      description: '',
      basePrice: price || '0',
      images: variantData.images,
      video: null,
      brand: null,
      vendor: 'Trendyol',
      category: null,
      subcategory: null,
      productType: null,
      tags: [],
      attributes: {},
      categories: null,
      variants: {
        colors: variantData.colors,
        sizes: variantData.sizes,
        totalVariants,
        variantImages: variantData.variantImages,
        colorImageMap: variantData.colorImageMap,
        variantPricing: variantData.variantPricing,
        variantSpecificPricing: variantData.variantSpecificPricing,
        stockMap: variantData.stockMap
      }
    };

  } catch (error) {
    console.log("❌ Enhanced Trendyol handler hatası:", error);
    throw error;
  }
}

function extractEnhancedVariants(htmlContent: string, productId: string): EnhancedVariantData {
  const $ = cheerio.load(htmlContent);
  
  const colors: string[] = [];
  const sizes: string[] = [];
  const images: string[] = [];
  const variantImages: Record<string, string[]> = {};
  const colorImageMap: Record<string, string[]> = {};
  const variantPricing: Record<string, number> = {};
  const variantSpecificPricing: Record<string, number> = {};
  const stockMap: Record<string, boolean> = {};

  console.log('🔍 Enhanced varyant çıkarma sistemi başlatılıyor...');

  // 1. Enhanced image extraction
  extractImages(htmlContent, images);
  
  // 2. Script-based variant extraction
  extractFromScripts(htmlContent, colors, sizes, variantImages, colorImageMap, variantPricing, variantSpecificPricing);
  
  // 3. HTML element extraction
  extractFromHTML($, colors, sizes);
  
  // 4. Stock information extraction
  extractStock(htmlContent, stockMap, colors, sizes);
  
  // 5. Validate and clean results
  const cleanResult = validateAndClean(colors, sizes, images, variantImages, colorImageMap, variantPricing, variantSpecificPricing, stockMap);
  
  console.log(`✅ Enhanced çıkarım: ${cleanResult.colors.length} renk, ${cleanResult.sizes.length} beden, ${cleanResult.images.length} görsel`);
  
  return cleanResult;
}

function extractImages(htmlContent: string, images: string[]): void {
  try {
    // Pattern 1: JSON arrays with image data
    const jsonImagePattern = /\[((?:[^[\]]*\[[^[\]]*\][^[\]]*)*[^[\]]*)\]/g;
    let match;

    while ((match = jsonImagePattern.exec(htmlContent)) !== null) {
      if (match[1].includes('.jpg') || match[1].includes('.jpeg') || match[1].includes('.png') || match[1].includes('.webp')) {
        const fullUrlMatches = match[1].match(/https:\/\/cdn\.dsmcdn\.com\/[^"',\s}]+\.(jpg|jpeg|png|webp)/gi) || [];
        const relativePathMatches = match[1].match(/"([^"]*\/(?:QC|PIM)\/[^"]*\.(jpg|jpeg|png|webp))"/gi) || [];
        
        fullUrlMatches.forEach(url => {
          const optimizedUrl = optimizeImageUrl(url);
          if (optimizedUrl && !images.includes(optimizedUrl)) {
            images.push(optimizedUrl);
          }
        });
        
        relativePathMatches.forEach(matchItem => {
          const relativePath = matchItem.replace(/"/g, '');
          if (relativePath.startsWith('/')) {
            const fullUrl = `https://cdn.dsmcdn.com${relativePath}`;
            const optimizedUrl = optimizeImageUrl(fullUrl);
            if (optimizedUrl && !images.includes(optimizedUrl)) {
              images.push(optimizedUrl);
            }
          }
        });
      }
    }
    
    // Pattern 2: Direct URL matches
    const directUrlPattern = /https:\/\/cdn\.dsmcdn\.com\/[^"'\s,}]+\/prod\/(?:QC|PIM)\/[^"'\s,}]+\.(jpg|jpeg|png|webp)/gi;
    const directMatches = htmlContent.match(directUrlPattern) || [];
    directMatches.forEach(url => {
      const optimizedUrl = optimizeImageUrl(url);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
    
    // Pattern 3: Enhanced relative path detection
    const relativeImagePattern = /['"]\/(ty\d+\/[^'"]*\/(?:QC|PIM)\/[^'"]*\.(jpg|jpeg|png|webp))['"]/gi;
    let relativeMatch;
    while ((relativeMatch = relativeImagePattern.exec(htmlContent)) !== null) {
      const fullUrl = `https://cdn.dsmcdn.com/${relativeMatch[1]}`;
      const optimizedUrl = optimizeImageUrl(fullUrl);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    }
    
    // Pattern 4: HAKKE-style products
    const aggressiveImagePattern = /\/ty\d+\/[^"'\s,}]*\/(?:QC|PIM)\/[^"'\s,}]*\.(jpg|jpeg|png|webp)/gi;
    const aggressiveMatches = htmlContent.match(aggressiveImagePattern) || [];
    aggressiveMatches.forEach(imagePath => {
      const fullUrl = imagePath.startsWith('/') 
        ? `https://cdn.dsmcdn.com${imagePath}`
        : `https://cdn.dsmcdn.com/${imagePath}`;
      const optimizedUrl = optimizeImageUrl(fullUrl);
      if (optimizedUrl && !images.includes(optimizedUrl)) {
        images.push(optimizedUrl);
      }
    });
    
  } catch (error) {
    console.log("Görsel çıkarma hatası:", error);
  }
}

function extractFromScripts(
  htmlContent: string,
  colors: string[],
  sizes: string[],
  variantImages: Record<string, string[]>,
  colorImageMap: Record<string, string[]>,
  variantPricing: Record<string, number>,
  variantSpecificPricing: Record<string, number>
): void {
  try {
    // Extract from window.__PRODUCT_DETAIL_APP_INITIAL_STATE__
    const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s;
    const initialStateMatch = htmlContent.match(initialStatePattern);

    if (initialStateMatch) {
      try {
        const initialState = JSON.parse(initialStateMatch[1]);
        
        // Extract colors
        if (initialState.product?.variants?.length) {
          initialState.product.variants.forEach((variant: any) => {
            if (variant.attributeType === 1 && variant.name) { // Color variants
              const colorName = variant.name.toLowerCase();
              if (!colors.includes(colorName)) {
                colors.push(colorName);
              }
              
              // Extract variant images
              if (variant.images?.length) {
                colorImageMap[colorName] = variant.images.map((img: any) => 
                  optimizeImageUrl(img.url)).filter(Boolean);
              }
              
              // Extract variant pricing
              if (variant.price?.originalPrice) {
                variantSpecificPricing[colorName] = variant.price.originalPrice.value;
              }
            }
            
            if (variant.attributeType === 2 && variant.name) { // Size variants
              const sizeName = variant.name;
              if (!sizes.includes(sizeName)) {
                sizes.push(sizeName);
              }
            }
          });
        }

        // Extract from allVariants for stock info
        if (initialState.product?.allVariants?.length) {
          initialState.product.allVariants.forEach((variant: any) => {
            if (variant.attributeName1 && variant.attributeName2) {
              const key = `${variant.attributeName1}-${variant.attributeName2}`;
              // Extract stock status
              if (typeof variant.inStock === 'boolean') {
                // stockMap will be populated in extractStock function
              }
            }
          });
        }
      } catch (parseError) {
        console.log("Initial state parsing error:", parseError);
      }
    }

    // Additional script extraction patterns
    const scriptTags = htmlContent.match(/<script[^>]*>(.*?)<\/script>/gis) || [];
    scriptTags.forEach(scriptContent => {
      extractJSONObjects(scriptContent).forEach(obj => {
        // Extract colors
        if (obj.attributes || obj.variants) {
          const attrs = obj.attributes || obj.variants;
          if (Array.isArray(attrs)) {
            attrs.forEach((attr: any) => {
              if (attr.attributeType === 1 && attr.name) {
                const colorName = attr.name.toLowerCase();
                if (!colors.includes(colorName)) {
                  colors.push(colorName);
                }
              }
              if (attr.attributeType === 2 && attr.name) {
                const sizeName = attr.name;
                if (!sizes.includes(sizeName)) {
                  sizes.push(sizeName);
                }
              }
            });
          }
        }
        
        // Extract pricing
        if (obj.price?.originalPrice?.value) {
          const price = obj.price.originalPrice.value;
          if (obj.name) {
            variantPricing[obj.name.toLowerCase()] = price;
          }
        }
      });
    });

  } catch (error) {
    console.log("Script extraction error:", error);
  }
}

function extractFromHTML($: cheerio.CheerioAPI, colors: string[], sizes: string[]): void {
  // Extract colors from color selectors
  $('.color-variants .color-variant').each((_, elem) => {
    const colorName = $(elem).attr('title') || $(elem).attr('data-color') || '';
    if (colorName && !colors.includes(colorName.toLowerCase())) {
      colors.push(colorName.toLowerCase());
    }
  });

  // Extract sizes from size selectors
  $('.size-variants .size-variant').each((_, elem) => {
    const sizeName = $(elem).text().trim();
    if (sizeName && !sizes.includes(sizeName)) {
      sizes.push(sizeName);
    }
  });

  // Alternative selectors
  $('[data-testid="color-variant"]').each((_, elem) => {
    const colorName = $(elem).attr('title') || '';
    if (colorName && !colors.includes(colorName.toLowerCase())) {
      colors.push(colorName.toLowerCase());
    }
  });

  $('[data-testid="size-variant"]').each((_, elem) => {
    const sizeName = $(elem).text().trim();
    if (sizeName && !sizes.includes(sizeName)) {
      sizes.push(sizeName);
    }
  });
}

function extractStock(htmlContent: string, stockMap: Record<string, boolean>, colors: string[], sizes: string[]): void {
  try {
    // Extract stock information from allVariants
    const allVariantsPattern = /"allVariants":\s*\[(.*?)\]/s;
    const allVariantsMatch = htmlContent.match(allVariantsPattern);

    if (allVariantsMatch) {
      try {
        const allVariantsStr = `[${allVariantsMatch[1]}]`;
        const allVariants = JSON.parse(allVariantsStr);

        allVariants.forEach((variant: any) => {
          if (variant.attributeName1 && variant.attributeName2) {
            const color = variant.attributeName1.toLowerCase();
            const size = variant.attributeName2;
            const key = `${color}-${size}`;
            
            // Set stock status
            stockMap[key] = variant.inStock === true;
          }
        });
      } catch (parseError) {
        console.log("Stock parsing error:", parseError);
      }
    }

    // Fallback: assume all combinations are in stock if no data found
    if (Object.keys(stockMap).length === 0) {
      colors.forEach(color => {
        sizes.forEach(size => {
          const key = `${color}-${size}`;
          stockMap[key] = true;
        });
      });
    }

  } catch (error) {
    console.log("Stock extraction error:", error);
  }
}

function validateAndClean(
  colors: string[],
  sizes: string[],
  images: string[],
  variantImages: Record<string, string[]>,
  colorImageMap: Record<string, string[]>,
  variantPricing: Record<string, number>,
  variantSpecificPricing: Record<string, number>,
  stockMap: Record<string, boolean>
): EnhancedVariantData {
  // Clean and validate colors
  const cleanColors = colors
    .filter(color => isValidColor(color))
    .map(color => color.toLowerCase().trim())
    .filter((color, index, arr) => arr.indexOf(color) === index);

  // Clean and validate sizes
  const cleanSizes = sizes
    .filter(size => isValidSize(size))
    .map(size => size.trim())
    .filter((size, index, arr) => arr.indexOf(size) === index);

  // Remove duplicate images
  const cleanImages = images.filter((img, index, arr) => arr.indexOf(img) === index);

  return {
    colors: cleanColors,
    sizes: cleanSizes,
    images: cleanImages,
    variantImages,
    colorImageMap,
    variantPricing,
    variantSpecificPricing,
    stockMap
  };
}

function isValidColor(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.toLowerCase().trim();
  
  // Turkish color names and common patterns
  const validColors = [
    'siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'mor', 'pembe',
    'lacivert', 'gri', 'kahverengi', 'turuncu', 'bordo', 'bej', 'krem',
    'ekru', 'haki', 'koyu', 'açık', 'petrol', 'mint', 'fuşya', 'lila',
    'somon', 'çok-renkli', 'desenli', 'karışık'
  ];
  
  // Check for valid color patterns
  if (validColors.some(color => cleaned.includes(color))) return true;
  if (cleaned.match(/^#[0-9a-f]{6}$/i)) return true; // Hex colors
  if (cleaned.length >= 3 && cleaned.length <= 20) return true; // Reasonable length
  
  return false;
}

function isValidSize(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const cleaned = value.trim();
  
  // Size patterns
  const sizePatterns = [
    /^(XS|S|M|L|XL|XXL|XXXL)$/i,
    /^\d{1,3}$/,
    /^\d{1,3}-\d{1,3}$/,
    /^[0-9]+[.,]?[0-9]*$/,
    /^(TEK|STANDART|UNIVERSAL)$/i
  ];
  
  return sizePatterns.some(pattern => pattern.test(cleaned)) || 
         (cleaned.length >= 1 && cleaned.length <= 10);
}

function extractJSONObjects(jsonString: string): any[] {
  const objects: any[] = [];
  
  try {
    // Find JSON-like patterns
    const jsonPattern = /{[^{}]*}/g;
    let match;
    
    while ((match = jsonPattern.exec(jsonString)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        objects.push(obj);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  } catch (error) {
    // Skip parsing errors
  }
  
  return objects;
}

function optimizeImageUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Clean URL and ensure CDN domain
  let finalUrl = url.trim();
  if (finalUrl.startsWith('//')) {
    finalUrl = 'https:' + finalUrl;
  }
  if (finalUrl.startsWith('/') && !finalUrl.startsWith('//')) {
    finalUrl = 'https://cdn.dsmcdn.com' + finalUrl;
  }
  
  // Only Trendyol CDN
  if (!finalUrl.includes('cdn.dsmcdn.com')) return null;
  
  // Only product images
  if (!(finalUrl.includes('/QC/') || finalUrl.includes('/PIM/') || finalUrl.includes('/prod/'))) return null;
  
  // Clean URL
  finalUrl = finalUrl.replace(/[{}]/g, '');
  
  // High quality
  if (!finalUrl.includes('_org_zoom.jpg')) {
    finalUrl = finalUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '_org_zoom.jpg');
  }
  
  // HTTPS
  if (!finalUrl.startsWith('https:')) {
    finalUrl = finalUrl.startsWith('//') ? 'https:' + finalUrl : 'https://' + finalUrl;
  }
  
  // Fix org_zoom to full resolution
  finalUrl = finalUrl.replace('org_zoom', 'org');
  
  return finalUrl;
}