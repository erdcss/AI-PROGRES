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

export async function scrapeTrendyolProduct(inputUrl: string) {
  try {
    console.log('🚀 Enhanced Trendyol handler başlatılıyor...');
    
    // Normalize URL - ensure https:// prefix
    let url = inputUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Geçersiz URL formatı: ${inputUrl}`);
    }
    
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
        console.log("🔍 Initial state bulundu, varyantlar çıkarılıyor...");
        
        // Extract colors and sizes from attributes
        if (initialState.product?.attributes?.length) {
          initialState.product.attributes.forEach((attr: any) => {
            if (attr.key?.name === 'Renk' && attr.value?.name) {
              const colorName = attr.value.name.toLowerCase();
              if (!colors.includes(colorName)) {
                colors.push(colorName);
                console.log(`🎨 Renk tespit edildi: ${colorName}`);
              }
            }
            if (attr.key?.name === 'Beden' && attr.value?.name) {
              const sizeName = attr.value.name;
              if (!sizes.includes(sizeName)) {
                sizes.push(sizeName);
                console.log(`📏 Beden tespit edildi: ${sizeName}`);
              }
            }
          });
        }

        // Extract from variants array
        if (initialState.product?.variants?.length) {
          initialState.product.variants.forEach((variant: any) => {
            if (variant.attributeType === 1 && variant.name) { // Color variants
              const colorName = variant.name.toLowerCase();
              if (!colors.includes(colorName)) {
                colors.push(colorName);
                console.log(`🎨 Varyant rengi: ${colorName}`);
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
                console.log(`📏 Varyant bedeni: ${sizeName}`);
              }
            }
          });
        }

        // Extract from allVariants for detailed info
        if (initialState.product?.allVariants?.length) {
          console.log(`📊 ${initialState.product.allVariants.length} adet allVariant bulundu`);
          
          // Debug: Log the structure of the first variant
          console.log("🔍 İlk variant yapısı:", JSON.stringify(initialState.product.allVariants[0], null, 2));
          
          initialState.product.allVariants.forEach((variant: any, index: number) => {
            // Extract from direct properties
            if (variant.attributeName1) {
              const colorName = variant.attributeName1.toLowerCase();
              if (isValidColor(colorName) && !colors.includes(colorName)) {
                colors.push(colorName);
                console.log(`🎨 AllVariant attributeName1: ${colorName}`);
              }
            }
            
            if (variant.attributeName2) {
              const sizeName = variant.attributeName2;
              if (isValidSize(sizeName) && !sizes.includes(sizeName)) {
                sizes.push(sizeName);
                console.log(`📏 AllVariant attributeName2: ${sizeName}`);
              }
            }
            
            // Extract from attributes array
            if (variant.attributes?.length) {
              variant.attributes.forEach((attr: any) => {
                if (attr.key?.name === 'Renk' && attr.value?.name) {
                  const colorName = attr.value.name.toLowerCase();
                  if (!colors.includes(colorName)) {
                    colors.push(colorName);
                    console.log(`🎨 AllVariant rengi: ${colorName}`);
                  }
                }
                if (attr.key?.name === 'Beden' && attr.value?.name) {
                  const sizeName = attr.value.name;
                  if (!sizes.includes(sizeName)) {
                    sizes.push(sizeName);
                    console.log(`📏 AllVariant bedeni: ${sizeName}`);
                  }
                }
              });
            }
            
            // Look for any size-like properties
            Object.keys(variant).forEach(key => {
              if (key.toLowerCase().includes('size') || key.toLowerCase().includes('beden')) {
                const value = variant[key];
                if (typeof value === 'string' && isValidSize(value) && !sizes.includes(value)) {
                  sizes.push(value);
                  console.log(`📏 AllVariant ${key}: ${value}`);
                }
              }
            });
          });
        }
      } catch (parseError) {
        console.log("Initial state parsing error:", parseError);
      }
    }

    // Enhanced pattern matching for variants
    const variantPatterns = [
      /"attributeType":1[^}]*"name":"([^"]+)"/g,  // Color patterns
      /"attributeType":2[^}]*"name":"([^"]+)"/g,  // Size patterns
      /"Renk"[^}]*"name":"([^"]+)"/g,             // Turkish color
      /"Beden"[^}]*"name":"([^"]+)"/g,            // Turkish size
      /"Color"[^}]*"name":"([^"]+)"/g,            // English color
      /"Size"[^}]*"name":"([^"]+)"/g,             // English size
      /"size":"([^"]+)"/g,                        // Simple size
      /"color":"([^"]+)"/g,                       // Simple color
      /"attributeName2":"([^"]+)"/g,              // Attribute name 2 (usually size)
      /"attributeName1":"([^"]+)"/g               // Attribute name 1 (usually color)
    ];

    variantPatterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const value = match[1];
        if (index < 5 || index === 7 || index === 9) { // Color patterns
          if (isValidColor(value) && !colors.includes(value.toLowerCase())) {
            colors.push(value.toLowerCase());
            console.log(`🎨 Pattern renk: ${value}`);
          }
        } else { // Size patterns
          if (isValidSize(value) && !sizes.includes(value)) {
            sizes.push(value);
            console.log(`📏 Pattern beden: ${value}`);
          }
        }
      }
    });

    // Additional fallback patterns for sizes
    const sizePatterns = [
      /['"](XS|S|M|L|XL|XXL|XXXL)['"]/g,
      /['"](36|38|40|42|44|46|48|50|52)['"]/g,
      /['"](TEK|STANDART|UNIVERSAL)['"]/g,
      /"value":"([SMLX]{1,4})"/g,
      /"text":"([SMLX]{1,4})"/g
    ];

    sizePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(htmlContent)) !== null) {
        const value = match[1];
        if (isValidSize(value) && !sizes.includes(value)) {
          sizes.push(value);
          console.log(`📏 Fallback pattern beden: ${value}`);
        }
      }
    });

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
  console.log("🔍 HTML elementlerinden varyant çıkarma...");
  
  // Extract colors from color selectors
  $('.color-variants .color-variant').each((_, elem) => {
    const colorName = $(elem).attr('title') || $(elem).attr('data-color') || '';
    if (colorName && !colors.includes(colorName.toLowerCase())) {
      colors.push(colorName.toLowerCase());
      console.log(`🎨 HTML renk: ${colorName}`);
    }
  });

  // Extract sizes from size selectors
  $('.size-variants .size-variant').each((_, elem) => {
    const sizeName = $(elem).text().trim();
    if (sizeName && !sizes.includes(sizeName)) {
      sizes.push(sizeName);
      console.log(`📏 HTML beden: ${sizeName}`);
    }
  });

  // Enhanced size selectors for HAKKE-style products
  const sizeSelectors = [
    '.size-variants button',
    '[data-testid="size-variant"]',
    '.size-selector button',
    '.product-size-options button',
    '.size-list button',
    '.size-option',
    '[class*="size"] button',
    '[class*="Size"] button',
    '.variant-size',
    '.product-variant-size'
  ];

  sizeSelectors.forEach(selector => {
    $(selector).each((_, elem) => {
      const sizeName = $(elem).text().trim();
      if (sizeName && isValidSize(sizeName) && !sizes.includes(sizeName)) {
        sizes.push(sizeName);
        console.log(`📏 HTML beden (${selector}): ${sizeName}`);
      }
    });
  });

  // Enhanced color selectors
  const colorSelectors = [
    '[data-testid="color-variant"]',
    '.color-option',
    '.product-color-options button',
    '[class*="color"] button',
    '[class*="Color"] button',
    '.variant-color'
  ];

  colorSelectors.forEach(selector => {
    $(selector).each((_, elem) => {
      const colorName = $(elem).attr('title') || $(elem).attr('data-color') || $(elem).text().trim();
      if (colorName && isValidColor(colorName) && !colors.includes(colorName.toLowerCase())) {
        colors.push(colorName.toLowerCase());
        console.log(`🎨 HTML renk (${selector}): ${colorName}`);
      }
    });
  });

  // Look for any button or span that might contain size info
  $('button, span, div').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length <= 10 && isValidSize(text) && !sizes.includes(text)) {
      // Check if this element seems to be in a size context
      const classes = $(elem).attr('class') || '';
      const parent = $(elem).parent();
      const parentClasses = parent.attr('class') || '';
      
      if (classes.toLowerCase().includes('size') || 
          classes.toLowerCase().includes('beden') ||
          parentClasses.toLowerCase().includes('size') ||
          parentClasses.toLowerCase().includes('beden')) {
        sizes.push(text);
        console.log(`📏 HTML context beden: ${text}`);
      }
    }
  });
}

function extractStock(htmlContent: string, stockMap: Record<string, boolean>, colors: string[], sizes: string[]): void {
  try {
    console.log("📦 Stok bilgisi çıkarılıyor...");
    
    // Extract from window.__PRODUCT_DETAIL_APP_INITIAL_STATE__
    const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.+?});/s;
    const initialStateMatch = htmlContent.match(initialStatePattern);

    if (initialStateMatch) {
      try {
        const initialState = JSON.parse(initialStateMatch[1]);
        
        if (initialState.product?.allVariants?.length) {
          console.log(`📊 ${initialState.product.allVariants.length} varyant stok bilgisi kontrol ediliyor`);
          
          initialState.product.allVariants.forEach((variant: any) => {
            let colorName = '';
            let sizeName = '';
            
            // Extract color and size from attributes
            if (variant.attributes?.length) {
              variant.attributes.forEach((attr: any) => {
                if (attr.key?.name === 'Renk' && attr.value?.name) {
                  colorName = attr.value.name.toLowerCase();
                }
                if (attr.key?.name === 'Beden' && attr.value?.name) {
                  sizeName = attr.value.name;
                }
              });
            }
            
            // Fallback to attributeName1/attributeName2
            if (!colorName && variant.attributeName1) {
              colorName = variant.attributeName1.toLowerCase();
            }
            if (!sizeName && variant.attributeName2) {
              sizeName = variant.attributeName2;
            }
            
            if (colorName && sizeName) {
              const key = `${colorName}-${sizeName}`;
              const inStock = variant.inStock === true || variant.hasStock === true;
              stockMap[key] = inStock;
              
              console.log(`📦 ${key}: ${inStock ? 'Stokta' : 'Stokta yok'}`);
            }
          });
        }
      } catch (parseError) {
        console.log("Stock parsing error:", parseError);
      }
    }

    // Extract stock information from JSON patterns
    const stockPatterns = [
      /"allVariants":\s*\[(.*?)\]/s,
      /"variants":\s*\[(.*?)\]/s,
      /"productVariants":\s*\[(.*?)\]/s
    ];

    stockPatterns.forEach(pattern => {
      const match = htmlContent.match(pattern);
      if (match) {
        try {
          const variantsStr = `[${match[1]}]`;
          const variants = JSON.parse(variantsStr);

          variants.forEach((variant: any) => {
            if (variant.attributeName1 && variant.attributeName2) {
              const color = variant.attributeName1.toLowerCase();
              const size = variant.attributeName2;
              const key = `${color}-${size}`;
              
              // Set stock status
              const inStock = variant.inStock === true || variant.hasStock === true;
              stockMap[key] = inStock;
            }
          });
        } catch (parseError) {
          // Skip invalid JSON
        }
      }
    });

    // Clean up invalid sizes
    const cleanedSizes = sizes.filter(size => {
      const cleaned = size.replace(/^Beden:?/, '').trim();
      return cleaned.length > 0 && cleaned !== 'SML' && isValidSize(cleaned);
    });
    
    // If no valid sizes found, add defaults for clothing
    if (cleanedSizes.length === 0 && colors.length > 0) {
      cleanedSizes.push(...['S', 'M', 'L', 'XL']);
    }
    
    sizes.length = 0;
    sizes.push(...cleanedSizes);

    // Fallback: assume all combinations are in stock if no data found
    if (Object.keys(stockMap).length === 0 && colors.length > 0 && sizes.length > 0) {
      console.log("⚠️ Stok bilgisi bulunamadı, tüm varyantlar stokta varsayılıyor");
      colors.forEach(color => {
        sizes.forEach(size => {
          const key = `${color}-${size}`;
          stockMap[key] = true;
        });
      });
    }

    console.log(`📦 Toplam ${Object.keys(stockMap).length} varyant stok bilgisi çıkarıldı`);

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
  
  // Size patterns - more comprehensive
  const sizePatterns = [
    /^(XS|S|M|L|XL|XXL|XXXL)$/i,
    /^\d{1,3}$/,
    /^\d{1,3}-\d{1,3}$/,
    /^[0-9]+[.,]?[0-9]*$/,
    /^(TEK|STANDART|UNIVERSAL|ONE SIZE|FREE SIZE)$/i,
    /^(34|36|38|40|42|44|46|48|50|52|54|56)$/,
    /^[0-9]{1,2}[A-Z]*$/,
    /^[A-Z]{1,4}$/
  ];
  
  // Also accept single letters/numbers that could be sizes
  if (cleaned.length === 1 && /[SMLX0-9]/.test(cleaned)) return true;
  
  return sizePatterns.some(pattern => pattern.test(cleaned)) || 
         (cleaned.length >= 1 && cleaned.length <= 15);
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