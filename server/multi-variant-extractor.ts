/**
 * Multi-Variant Extractor for Trendyol Products
 * Properly extracts multiple color variants with individual pricing
 */

import * as cheerio from 'cheerio';
import axios from 'axios';

interface VariantInfo {
  colors: string[];
  sizes: string[];
  pricing: Record<string, number>;
  images: Record<string, string[]>;
}

export async function extractMultiVariants(url: string): Promise<VariantInfo> {
  const colors: string[] = [];
  const sizes: string[] = [];
  const pricing: Record<string, number> = {};
  const images: Record<string, string[]> = {};

  try {
    // Get the main product page
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    const htmlContent = response.data;

    console.log('🔍 Multi-variant extraction starting...');

    // Extract product ID for API calls
    const productIdMatch = url.match(/p-(\d+)/);
    const productId = productIdMatch ? productIdMatch[1] : null;

    if (productId) {
      console.log(`🆔 Product ID: ${productId}`);
      
      // Try to get variant data from internal API
      try {
        const apiUrl = `https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`;
        console.log(`📡 Trying API: ${apiUrl}`);
        
        const apiResponse = await axios.get(apiUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15',
            'Accept': 'application/json',
            'Referer': 'https://m.trendyol.com/'
          },
          timeout: 15000
        });

        if (apiResponse.data?.result) {
          const productData = apiResponse.data.result;
          console.log(`✅ API data received for: ${productData.name}`);

          // Extract variants from API
          if (productData.variants && Array.isArray(productData.variants)) {
            console.log(`📊 API variants found: ${productData.variants.length}`);
            
            productData.variants.forEach((variant: any) => {
              // Color variants (attributeType 1)
              if (variant.attributeType === 1) {
                const colorName = variant.name || variant.attributeValue;
                if (colorName && !colors.includes(colorName)) {
                  colors.push(colorName);
                  console.log(`🎨 API Color: ${colorName}`);
                  
                  // Get pricing for this color
                  if (variant.price) {
                    pricing[colorName] = parseFloat(variant.price);
                  }
                  
                  // Get images for this color
                  if (variant.images && Array.isArray(variant.images)) {
                    images[colorName] = variant.images.map((img: any) => img.url || img);
                  }
                }
              }
              
              // Size variants (attributeType 2)
              if (variant.attributeType === 2) {
                const sizeName = variant.name || variant.attributeValue;
                if (sizeName && !sizes.includes(sizeName)) {
                  sizes.push(sizeName);
                  console.log(`📏 API Size: ${sizeName}`);
                }
              }
            });
          }

          // Check for color-specific pricing in allVariants
          if (productData.allVariants && Array.isArray(productData.allVariants)) {
            console.log(`📊 API allVariants: ${productData.allVariants.length}`);
            
            productData.allVariants.forEach((variant: any) => {
              if (variant.price && variant.attributeValue) {
                pricing[variant.attributeValue] = parseFloat(variant.price);
                console.log(`💰 API Pricing: ${variant.attributeValue} = ${variant.price}`);
              }
            });
          }
        }
      } catch (apiError) {
        console.log('⚠️ API call failed, continuing with HTML parsing');
      }
    }

    // Parse HTML for variant information
    const scriptMatches = htmlContent.match(/<script[^>]*>(.*?)<\/script>/gs) || [];
    
    for (const scriptTag of scriptMatches) {
      const scriptContent = scriptTag.replace(/<\/?script[^>]*>/g, '');
      
      // Look for product detail state
      const productDetailMatch = scriptContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
      if (productDetailMatch) {
        try {
          const productData = JSON.parse(productDetailMatch[1]);
          console.log('🔍 Product detail state found in HTML');
          
          // Extract variants from product structure - enhanced detection
          if (productData.product?.variants) {
            console.log(`📊 HTML variants: ${productData.product.variants.length}`);
            
            productData.product.variants.forEach((variant: any) => {
              // Colors (attributeType 1)
              if ((variant.attributeType === 1 || variant.attributeType === '1') && variant.attributeValue) {
                if (!colors.includes(variant.attributeValue)) {
                  colors.push(variant.attributeValue);
                  console.log(`🎨 HTML Color: ${variant.attributeValue}`);
                }
                
                if (variant.price) {
                  pricing[variant.attributeValue] = parseFloat(variant.price);
                }
              }
              
              // Sizes (attributeType 2)
              if ((variant.attributeType === 2 || variant.attributeType === '2') && variant.attributeValue) {
                if (!sizes.includes(variant.attributeValue)) {
                  sizes.push(variant.attributeValue);
                  console.log(`📏 HTML Size: ${variant.attributeValue}`);
                }
              }
            });
          }

          // Look for color-related data in deeper structures
          if (productData.product?.otherMerchants || productData.product?.allVariants) {
            const jsonStr = JSON.stringify(productData.product);
            
            // Only extract real product color variants
            const colorPatterns = [
              /"color":\s*"([^"]+)"/gi,
              /"renk":\s*"([^"]+)"/gi,
              /"variant":\s*"([^"]+)"/gi
            ];
            
            colorPatterns.forEach(pattern => {
              const matches = jsonStr.match(pattern);
              if (matches) {
                matches.forEach(match => {
                  const colorMatch = match.match(/"([^"]+)"$/);
                  if (colorMatch) {
                    const cleanColor = colorMatch[1].trim();
                    const actualColorKeywords = ['siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'turuncu', 'mor', 'pembe', 'gri', 'kahverengi', 'lacivert', 'bordo'];
                    
                    // Filter out brand names and non-color terms
                    const excludePatterns = ['grimelange', 'zetus', 'nike', 'adidas', 'trendyol', 'sarıyer', 'brand', '/', '-'];
                    const isExcluded = excludePatterns.some(pattern => cleanColor.toLowerCase().includes(pattern.toLowerCase()));
                    
                    if (actualColorKeywords.some(keyword => cleanColor.toLowerCase().includes(keyword)) && 
                        cleanColor.length > 2 && cleanColor.length < 15 && !colors.includes(cleanColor) && !isExcluded) {
                      colors.push(cleanColor);
                      console.log(`🎨 Actual product color: ${cleanColor}`);
                    }
                  }
                });
              }
            });
          }

          // Check allVariants in HTML
          if (productData.product?.allVariants) {
            console.log(`📊 HTML allVariants: ${productData.product.allVariants.length}`);
            
            productData.product.allVariants.forEach((variant: any) => {
              if (variant.price && variant.value) {
                pricing[variant.value] = parseFloat(variant.price);
                console.log(`💰 HTML Pricing: ${variant.value} = ${variant.price}`);
              }
            });
          }
          
        } catch (parseError) {
          console.log('⚠️ Failed to parse product detail state');
        }
      }
    }

    // Enhanced DOM scanning for color variants
    const colorSelectors = [
      '.product-variants .variant-item',
      '.color-variant-list .variant-item',
      '[data-testid="color-variant"]',
      '.variant-color-item',
      '.product-color-option',
      '.pr-cn-c .pr-cn-v',
      '.variants .variant',
      '.color-variants li',
      '.pr-cnt-w .slc-cnt'
    ];

    colorSelectors.forEach(selector => {
      $(selector).each((i, el) => {
        const colorText = $(el).text().trim();
        const colorTitle = $(el).attr('title');
        const colorAlt = $(el).find('img').attr('alt');
        const dataColor = $(el).attr('data-color');
        
        const possibleColor = colorText || colorTitle || colorAlt || dataColor;
        if (possibleColor && possibleColor.length > 2 && possibleColor.length < 30) {
          if (!colors.includes(possibleColor)) {
            colors.push(possibleColor);
            console.log(`🎨 DOM Color: ${possibleColor}`);
          }
        }
      });
    });

    // Additional check for color information in merchant variants
    const merchantColors = $('[class*="merchant"], [class*="variant"], [class*="color"]').toArray();
    merchantColors.forEach(el => {
      const text = $(el).text().trim();
      const colorKeywords = ['siyah', 'beyaz', 'kırmızı', 'mavi', 'yeşil', 'sarı', 'turuncu', 'mor', 'pembe', 'gri'];
      
      colorKeywords.forEach(keyword => {
        if (text.toLowerCase().includes(keyword) && !colors.includes(text) && text.length < 50) {
          colors.push(text);
          console.log(`🎨 Merchant Color: ${text}`);
        }
      });
    });

    // Enhanced size detection with stock status
    const sizeSelectors = [
      '.product-variants .size-variant',
      '.size-variant-list .variant-item',
      '[data-testid="size-variant"]',
      '.variant-size-item',
      '.product-size-option',
      '.pr-in-sz .pr-in-sz-v',
      '.size-options .size-option',
      '[class*="size"] span, [class*="beden"] span'
    ];

    const availableSizes: string[] = [];
    const outOfStockSizes: string[] = [];

    sizeSelectors.forEach(selector => {
      $(selector).each((i, el) => {
        const sizeText = $(el).text().trim();
        const isDisabled = $(el).hasClass('disabled') || $(el).hasClass('out-of-stock') || 
                          $(el).attr('disabled') === 'disabled' || 
                          $(el).css('opacity') === '0.5' ||
                          $(el).parent().hasClass('disabled');
        
        if (sizeText && /^(xs|s|m|l|xl|xxl|\d+)$/i.test(sizeText)) {
          if (isDisabled) {
            outOfStockSizes.push(sizeText);
            console.log(`📏 Out of stock size: ${sizeText}`);
          } else {
            availableSizes.push(sizeText);
            console.log(`📏 Available size: ${sizeText}`);
          }
          
          if (!sizes.includes(sizeText)) {
            sizes.push(sizeText);
          }
        }
      });
    });

    // Enhanced stock detection from product detail state
    const productDetailMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
    if (productDetailMatch) {
      try {
        const productState = JSON.parse(productDetailMatch[1]);
        
        // Check for variant stock information
        if (productState.product && productState.product.variants) {
          productState.product.variants.forEach((variant: any) => {
            if (variant.attributeType === 1 && variant.attributes) { // Size variants
              variant.attributes.forEach((attr: any) => {
                const size = attr.name;
                const inStock = attr.stock > 0;
                
                if (size && /^(xs|s|m|l|xl|xxl|\d+)$/i.test(size)) {
                  if (inStock) {
                    availableSizes.push(size);
                    console.log(`📏 Available size: ${size} (stock: ${attr.stock})`);
                  } else {
                    outOfStockSizes.push(size);
                    console.log(`📏 OUT OF STOCK size: ${size}`);
                  }
                  
                  if (!sizes.includes(size)) {
                    sizes.push(size);
                  }
                }
              });
            }
          });
        }
      } catch (e) {
        console.log('⚠️ Error parsing product state for stock:', e);
      }
    }

    // Additional stock check from allVariants data
    const allVariantsMatch = htmlContent.match(/"allVariants":\s*\[([^\]]*)\]/);
    if (allVariantsMatch) {
      try {
        const allVariants = JSON.parse(`[${allVariantsMatch[1]}]`);
        allVariants.forEach((variant: any) => {
          if (variant.value && variant.inStock !== undefined) {
            const size = variant.value;
            const inStock = variant.inStock;
            
            if (size && /^(xs|s|m|l|xl|xxl|\d+)$/i.test(size)) {
              if (inStock && !availableSizes.includes(size)) {
                availableSizes.push(size);
                console.log(`📏 Available: ${size}`);
              } else if (!inStock && !outOfStockSizes.includes(size)) {
                outOfStockSizes.push(size);
                console.log(`📏 OUT OF STOCK: ${size}`);
              }
              
              if (!sizes.includes(size)) {
                sizes.push(size);
              }
            }
          }
        });
      } catch (e) {
        console.log('⚠️ Error parsing allVariants for stock:', e);
      }
    }

    console.log(`📏 Final size summary: ${availableSizes.length} available (${availableSizes.join(', ')}), ${outOfStockSizes.length} out of stock (${outOfStockSizes.join(', ')})`);

    // Use only available sizes (exclude out-of-stock)
    const finalSizes = availableSizes.length > 0 ? availableSizes : sizes.filter(s => !outOfStockSizes.includes(s));
    console.log(`📏 Using only available sizes: ${finalSizes.join(', ')}`);

    // Only use real color variants, don't create artificial ones
    console.log(`🎨 Using only actual color variants found: ${colors.length} colors`);

    console.log(`✅ Multi-variant extraction complete: ${colors.length} colors, ${sizes.length} sizes, ${Object.keys(pricing).length} prices`);

    return {
      colors: colors.length > 0 ? colors : ['tek renk'],
      sizes: finalSizes.length > 0 ? finalSizes : ['tek beden'],
      pricing,
      images
    };

  } catch (error) {
    console.error('❌ Multi-variant extraction error:', error);
    return {
      colors: ['tek renk'],
      sizes: ['tek beden'],
      pricing: {},
      images: {}
    };
  }
}