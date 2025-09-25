/**
 * TRENDYOL JAVASCRIPT STATE EXTRACTOR - 2025 Anti-Blocking Solution
 * Extracts product data from Trendyol's JavaScript state instead of DOM parsing
 */

import * as cheerio from 'cheerio';

/**
 * Extract product data from Trendyol's JavaScript state
 * This bypasses DOM parsing and directly accesses the JSON data
 */
export function extractFromTrendyolJavaScriptState(htmlContent: string): any {
  console.log('🔍 JS-STATE: Searching for Trendyol JavaScript state...');
  
  try {
    // 1. Look for the main product state object
    const statePatterns = [
      /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s,
      /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
      /__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?})/s,
      /__INITIAL_STATE__\s*=\s*({.*?})/s
    ];
    
    let productData = null;
    
    for (const pattern of statePatterns) {
      const match = htmlContent.match(pattern);
      if (match && match[1]) {
        try {
          productData = JSON.parse(match[1]);
          console.log('✅ JS-STATE: Found Trendyol state object');
          break;
        } catch (parseError) {
          console.log('⚠️ JS-STATE: JSON parse failed, trying next pattern...');
          continue;
        }
      }
    }
    
    if (!productData) {
      console.log('❌ JS-STATE: No JavaScript state found, falling back to DOM parsing');
      return extractFromDOM(htmlContent);
    }
    
    // 2. Extract product information from state
    const result = extractProductFromState(productData);
    
    if (result && result.title && result.title !== 'Ürün') {
      console.log(`✅ JS-STATE: Successfully extracted: ${result.title}`);
      return result;
    } else {
      console.log('⚠️ JS-STATE: State extraction failed, trying DOM fallback');
      return extractFromDOM(htmlContent);
    }
    
  } catch (error) {
    console.log('❌ JS-STATE: Error in state extraction:', error.message);
    return extractFromDOM(htmlContent);
  }
}

/**
 * Extract product data from the parsed JavaScript state object
 */
function extractProductFromState(stateData: any): any {
  try {
    console.log('🔍 JS-STATE: Analyzing state structure...');
    
    // Common Trendyol state paths
    const productPaths = [
      stateData?.product,
      stateData?.productDetail?.product,
      stateData?.data?.product,
      stateData?.pageProps?.product,
      stateData?.props?.pageProps?.product
    ];
    
    let product = null;
    for (const path of productPaths) {
      if (path && path.name) {
        product = path;
        break;
      }
    }
    
    if (!product) {
      console.log('❌ JS-STATE: No product found in state paths');
      return null;
    }
    
    console.log('✅ JS-STATE: Product found in state');
    
    // Extract basic information
    const title = product.name || product.title || 'Ürün';
    const brand = product.brand?.name || product.brandName || product.merchant?.name || 'Marka';
    
    // Extract price information
    const price = extractPriceFromState(product);
    
    // Extract images
    const images = extractImagesFromState(product);
    
    // Extract variants (sizes, colors)
    const variants = extractVariantsFromState(product);
    
    const result = {
      title: title,
      brand: brand,
      price: price,
      images: images,
      variants: variants,
      category: product.category?.name || product.categoryName || 'Kategori',
      description: product.description || '',
      features: [],
      success: true,
      extractionMethod: 'trendyol-js-state-extractor',
      confidence: 99
    };
    
    console.log(`🎯 JS-STATE: Extracted product: ${title} by ${brand}`);
    return result;
    
  } catch (error) {
    console.log('❌ JS-STATE: Error extracting from state:', error.message);
    return null;
  }
}

/**
 * Extract price information from state
 */
function extractPriceFromState(product: any): any {
  try {
    console.log('💰 JS-STATE: Analyzing price data from state...');
    console.log('💰 JS-STATE: Product price keys:', Object.keys(product).filter(key => key.toLowerCase().includes('price')));
    
    const priceSources = [
      product.price?.originalPrice,
      product.price?.sellingPrice,
      product.price?.discountedPrice,
      product.originalPrice,
      product.sellingPrice,
      product.discountedPrice,
      product.priceInfo?.originalPrice,
      product.priceInfo?.sellingPrice,
      product.priceInfo?.discountedPrice,
      product.merchant?.originalPrice,
      product.merchant?.sellingPrice,
      product.variants?.[0]?.price,
      product.skus?.[0]?.originalPrice,
      product.skus?.[0]?.sellingPrice
    ];
    
    let originalPrice = null;
    for (const source of priceSources) {
      if (source && typeof source === 'number' && source > 0) {
        originalPrice = source;
        console.log(`💰 JS-STATE: Found numeric price: ${originalPrice}`);
        break;
      }
    }
    
    if (!originalPrice) {
      // Try string parsing
      const priceStrings = [
        product.price?.originalPriceText,
        product.price?.sellingPriceText,
        product.priceText
      ];
      
      for (const priceStr of priceStrings) {
        if (priceStr && typeof priceStr === 'string') {
          const match = priceStr.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
          if (match) {
            originalPrice = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
            break;
          }
        }
      }
    }
    
    if (originalPrice && originalPrice > 0) {
      return {
        original: originalPrice,
        currency: 'TL',
        formatted: `${originalPrice} TL`,
        withProfit: Math.round(originalPrice * 1.1 * 100) / 100,
        method: 'JavaScript State'
      };
    }
    
    return null;
    
  } catch (error) {
    console.log('⚠️ JS-STATE: Price extraction error:', error.message);
    return null;
  }
}

/**
 * Extract images from state
 */
function extractImagesFromState(product: any): any[] {
  try {
    const images: any[] = [];
    
    // Common image paths
    const imageSources = [
      product.images,
      product.productImages,
      product.media?.images,
      product.gallery
    ];
    
    for (const source of imageSources) {
      if (Array.isArray(source)) {
        for (const img of source) {
          let imageUrl = null;
          
          if (typeof img === 'string') {
            imageUrl = img;
          } else if (img.url) {
            imageUrl = img.url;
          } else if (img.src) {
            imageUrl = img.src;
          }
          
          if (imageUrl && images.length < 8) {
            // Ensure high quality image
            if (imageUrl.includes('_org_zoom') || imageUrl.includes('cdn.dsmcdn.com')) {
              images.push({ url: imageUrl, colorName: 'none' });
            }
          }
        }
        
        if (images.length > 0) break;
      }
    }
    
    console.log(`📸 JS-STATE: Extracted ${images.length} images`);
    return images;
    
  } catch (error) {
    console.log('⚠️ JS-STATE: Image extraction error:', error.message);
    return [];
  }
}

/**
 * Extract variants (sizes, colors) from state
 */
function extractVariantsFromState(product: any): any[] {
  try {
    const variants: any[] = [];
    
    // Look for variants in state
    const variantSources = [
      product.allVariants,
      product.variants,
      product.productVariants,
      product.options
    ];
    
    let allVariants = null;
    for (const source of variantSources) {
      if (Array.isArray(source) && source.length > 0) {
        allVariants = source;
        break;
      }
    }
    
    if (allVariants) {
      for (const variant of allVariants) {
        const size = variant.size || variant.attributeValue || variant.name;
        const color = variant.color || extractColorFromTitle(product.name) || 'Varsayılan';
        const inStock = variant.inStock !== false && variant.stock !== 0;
        
        // Accept variants with either color OR size (not requiring both)
        if (color || size) {
          variants.push({
            color: color || '',
            size: size || '',
            inStock: inStock,
            inventory: inStock ? 10 : 0
          });
        }
      }
    }
    
    // ❌ REMOVED FAKE FALLBACK - No more synthetic size generation
    // If no variants found, return empty array to handle as single product
    if (variants.length === 0) {
      console.log('📦 JS-STATE: No variants found - will be processed as single product without fake sizes');
    }
    
    console.log(`📦 JS-STATE: Extracted ${variants.length} variants`);
    return variants;
    
  } catch (error) {
    console.log('⚠️ JS-STATE: Variant extraction error:', error.message);
    return [];
  }
}

/**
 * Extract color from product title
 */
function extractColorFromTitle(title: string): string | null {
  if (!title) return null;
  
  const colorMap: Record<string, string> = {
    'lacivert': 'Lacivert',
    'mavi': 'Mavi', 
    'siyah': 'Siyah',
    'beyaz': 'Beyaz',
    'kırmızı': 'Kırmızı',
    'yeşil': 'Yeşil',
    'sarı': 'Sarı',
    'mor': 'Mor',
    'pembe': 'Pembe',
    'gri': 'Gri',
    'kahve': 'Kahve'
  };
  
  const titleLower = title.toLowerCase();
  for (const [keyword, color] of Object.entries(colorMap)) {
    if (titleLower.includes(keyword)) {
      return color;
    }
  }
  
  return null;
}

/**
 * Fallback DOM extraction for when JavaScript state is not available
 */
function extractFromDOM(htmlContent: string): any {
  console.log('🔍 JS-STATE: Using DOM fallback extraction...');
  
  try {
    const $ = cheerio.load(htmlContent);
    
    // Basic DOM selectors for Trendyol
    const title = $('h1 span').first().text().trim() || 
                 $('h1').first().text().trim() || 
                 $('title').text().replace('- Trendyol', '').trim() || 'Ürün';
    
    const brand = $('[data-testid="merchantName"]').first().text().trim() || 
                 $('.pr-in-mn a').first().text().trim() || 'Marka';
    
    // Enhanced price extraction from DOM
    let price = null;
    const priceSelectors = [
      '.prc-dsc', '.prc-slg', '.prc-org', '.price-p13n-price', '.pr-bx-price',
      '.discount-price', '.selling-price', '.original-price',
      '[data-testid="price-current-price"]', '[data-testid="price-original-price"]'
    ];
    
    for (const selector of priceSelectors) {
      const priceText = $(selector).text().trim();
      if (priceText) {
        const match = priceText.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
        if (match) {
          const parsedPrice = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
          if (parsedPrice > 0) {
            price = {
              original: parsedPrice,
              currency: 'TL',
              formatted: `${parsedPrice} TL`,
              withProfit: Math.round(parsedPrice * 1.1 * 100) / 100,
              method: 'DOM Price Extractor'
            };
            console.log(`💰 JS-STATE: DOM price found: ${parsedPrice} TL`);
            break;
          }
        }
      }
    }
    
    // Try to find images in DOM
    const images: any[] = [];
    $('img[src*="cdn.dsmcdn.com"]').each((i: number, el: any) => {
      const src = $(el).attr('src');
      if (src && src.includes('_org_zoom') && images.length < 8) {
        images.push({ url: src, colorName: 'none' });
      }
    });
    
    return {
      title: title !== 'Ürün' ? title : 'Trendyol Ürünü',
      brand: brand !== 'Marka' ? brand : 'Trendyol',
      price: price,
      images: images,
      variants: [],
      category: 'Kategori',
      description: '',
      features: [],
      success: title !== 'Ürün',
      extractionMethod: 'dom-fallback',
      confidence: 70
    };
    
  } catch (error) {
    console.log('❌ JS-STATE: DOM fallback failed:', error.message);
    return null;
  }
}