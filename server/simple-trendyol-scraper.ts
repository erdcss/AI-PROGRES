/**
 * Simple Trendyol Scraper - Working Version
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractTrendyolPrice } from './fixed-price-extractor';
import { extractMainProductImages } from './main-product-images-extractor';
import { extractWorkingFeatures } from './working-feature-extractor';
import { extractEnhancedAttributes } from './enhanced-attribute-extractor';
import { extractDirectTrendyolAttributes } from './direct-trendyol-extractor';
import { analyzeProductHTML } from './html-analyzer';
import { extractTargetedAttributes } from './targeted-attribute-extractor';
import { extractAllFeatures } from './manual-feature-extractor';

export interface SimpleTrendyolData {
  success: boolean;
  title: string;
  brand: string;
  price: {
    original: number;
    currency: string;
    formatted: string;
    withProfit: number;
    profitFormatted: string;
  };
  images: string[];
  features: Array<{key: string, value: string}>;
  variants: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
}

export async function simpleTrendyolScrape(url: string): Promise<SimpleTrendyolData> {
  try {
    console.log(`🚀 Simple Trendyol scraper starting: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    // Enhanced title extraction
    let title = 'Ürün Başlığı';
    let brand = 'Network';
    
    // Multiple title extraction methods
    const titleSelectors = [
      'h1[data-testid="pdp-product-name"]',
      '.pr-new-br h1',
      'h1.product-name',
      '.product-detail-name h1',
      'h1',
      '.pr-in-nm'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = $(selector);
      if (titleElement.length > 0) {
        const extractedTitle = titleElement.first().text().trim();
        if (extractedTitle && extractedTitle.length > 5 && extractedTitle.length < 200) {
          title = extractedTitle;
          console.log(`✅ Title from selector ${selector}: ${title.substring(0, 50)}...`);
          break;
        }
      }
    }
    
    // Enhanced fallback: Extract from script tags and meta
    if (title === 'Ürün Başlığı') {
      // Try meta tags first
      const metaTitle = $('meta[property="og:title"]').attr('content') || 
                       $('meta[name="twitter:title"]').attr('content') ||
                       $('title').text().trim();
      
      if (metaTitle && metaTitle.length > 5 && metaTitle.includes('Trendyol')) {
        // Extract clean title from page title
        const cleanTitle = metaTitle.replace(/\s*-\s*Trendyol.*$/, '').trim();
        if (cleanTitle.length > 5) {
          title = cleanTitle;
          console.log(`✅ Title from meta: ${title.substring(0, 50)}...`);
        }
      }
      
      // Script tag extraction as final fallback
      if (title === 'Ürün Başlığı') {
        const scriptTexts = html.match(/<script[^>]*>(.*?)<\/script>/gis);
        if (scriptTexts) {
          for (const scriptTag of scriptTexts) {
            // Look for product name in various JSON structures
            const titlePatterns = [
              /"name":\s*"([^"]{10,150})"/,
              /"productName":\s*"([^"]{10,150})"/,
              /"title":\s*"([^"]{10,150})"/,
              /"displayName":\s*"([^"]{10,150})"/
            ];
            
            for (const pattern of titlePatterns) {
              const titleMatch = scriptTag.match(pattern);
              if (titleMatch && titleMatch[1] && !titleMatch[1].includes('Özyürek')) {
                title = titleMatch[1];
                console.log(`✅ Title from script pattern: ${title.substring(0, 50)}...`);
                break;
              }
            }
            if (title !== 'Ürün Başlığı') break;
          }
        }
      }
    }
    
    // Price extraction using fixed extractor
    let priceObject = {
      original: 0,
      currency: 'TRY',
      formatted: '0,00 TL',
      withProfit: 0,
      profitFormatted: '0,00 TL'
    };
    
    try {
      console.log(`💰 Using fixed price extractor...`);
      const priceResult = await extractTrendyolPrice(url);
      
      if (priceResult.price > 0) {
        const rawPrice = priceResult.price;
        const profitPrice = Math.round(rawPrice * 1.15 * 100) / 100;
        
        priceObject = {
          original: rawPrice,
          currency: 'TRY',
          formatted: rawPrice.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }) + ' TL',
          withProfit: profitPrice,
          profitFormatted: profitPrice.toLocaleString('tr-TR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }) + ' TL'
        };
        
        brand = priceResult.brand;
        console.log(`✅ Price extracted: ${priceObject.formatted} → ${priceObject.profitFormatted}`);
      }
    } catch (e: any) {
      console.log(`⚠️ Price extraction error: ${e.message}`);
    }
    
    // Quick image extraction from HTML
    let images: string[] = [];
    try {
      const imageMatches = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g);
      if (imageMatches) {
        images = imageMatches
          .filter(img => img.includes('_org_zoom.jpg') || img.includes('_zoom.jpg'))
          .slice(0, 7);
      }
      console.log(`✅ Found ${images.length} product images`);
    } catch (e) {
      console.log('Image extraction fallback');
      images = [];
    }
    
    // Quick feature and variant extraction
    let features: Array<{key: string, value: string}> = [];
    let variants: Array<{color: string, size: string, inStock: boolean}> = [];
    
    try {
      // Manual comprehensive feature extraction
      console.log(`🎯 Manuel comprehensive özellik çıkarma başlatılıyor...`);
      
      try {
        const manualFeatures = await extractAllFeatures(url);
        if (manualFeatures && manualFeatures.length > 0) {
          features = manualFeatures.map(f => ({
            key: f.key,
            value: f.value
          }));
          console.log(`✅ Manuel extractor: ${features.length} comprehensive özellik bulundu`);
        }
      } catch (error) {
        console.log(`⚠️ Manuel extractor hatası: ${error}`);
      }
      
      // Enhanced feature extraction from script data (fallback)
      if (features.length < 10) {
        console.log(`🎯 Enhanced feature extraction başlatılıyor...`);
      
        // Extract from script tags - Look for product attributes
      const scriptTexts = html.match(/<script[^>]*>(.*?)<\/script>/gis);
      if (scriptTexts) {
        for (const scriptTag of scriptTexts) {
          // Look for product specifications in JSON structures
          try {
            // Extract structured product data from script content
            const productDataMatches = scriptTag.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s);
            if (productDataMatches) {
              const productData = JSON.parse(productDataMatches[1]);
              if (productData && productData.product && productData.product.attributes) {
                productData.product.attributes.forEach((attr: any) => {
                  if (attr.key && attr.value && attr.key.name && attr.value.name) {
                    const key = attr.key.name.trim();
                    const value = attr.value.name.trim();
                    if (key.length > 0 && value.length > 0 && value.length < 100) {
                      features.push({
                        key: key,
                        value: value
                      });
                    }
                  }
                });
              }
            }
          } catch (e) {
            // Continue with other methods
          }
          
          // Look for variant data
          const variantMatches = scriptTag.match(/"variants":\s*\[(.*?)\]/s);
          if (variantMatches && variants.length === 0) {
            try {
              const variantData = variantMatches[1];
              const colorMatches = variantData.match(/"attributeValue":\s*"([^"]+)"/g);
              if (colorMatches) {
                const colors = colorMatches.map(m => m.match(/"attributeValue":\s*"([^"]+)"/)?.[1]).filter(Boolean);
                const uniqueColors = [...new Set(colors)].slice(0, 10);
                variants = uniqueColors.map(color => ({
                  color: color,
                  size: 'Tek Beden',
                  inStock: true
                }));
              }
            } catch (e) {
              // Continue with fallback
            }
          }
        }
      }
      
      // Enhanced JSON-LD extraction
      if (features.length === 0) {
        const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis);
        if (jsonLdMatches) {
          jsonLdMatches.forEach(script => {
            try {
              const jsonContent = script.replace(/<script[^>]*>|<\/script>/gi, '');
              const data = JSON.parse(jsonContent);
              if (data && typeof data === 'object') {
                // Extract product features from JSON-LD
                const extractFeatures = (obj: any, prefix = '') => {
                  for (const [key, value] of Object.entries(obj)) {
                    if (typeof value === 'string' && value.length > 0 && value.length < 100) {
                      if (key.toLowerCase().includes('material') || key.toLowerCase().includes('fabric') || 
                          key.toLowerCase().includes('color') || key.toLowerCase().includes('size')) {
                        features.push({
                          key: key.charAt(0).toUpperCase() + key.slice(1),
                          value: value
                        });
                      }
                    } else if (typeof value === 'object' && value !== null) {
                      extractFeatures(value, `${prefix}${key}.`);
                    }
                  }
                };
                extractFeatures(data);
              }
            } catch (e) {
              // Continue with next script
            }
          });
        }
      }
      
      // Advanced pattern-based extraction for specific product attributes
      if (features.length === 0) {
        const advancedPatterns = [
          { key: 'Materyal', pattern: /(?:Materyal|Material)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü0-9%\s,]+?)(?:[,\.]|$)/i },
          { key: 'Kumaş Tipi', pattern: /(?:Kumaş|Fabric)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.]|$)/i },
          { key: 'Renk', pattern: /(?:Renk|Color)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s]+?)(?:[,\.]|$)/i },
          { key: 'Beden', pattern: /(?:Beden|Size)[:\s]*([A-Za-z0-9\s\-]+?)(?:[,\.]|$)/i },
          { key: 'Marka', pattern: /(?:Marka|Brand)[:\s]*([A-Za-zÇĞİÖŞÜçğıöşü\s&]+?)(?:[,\.]|$)/i }
        ];
        
        advancedPatterns.forEach(({key, pattern}) => {
          const matches = html.match(pattern);
          if (matches && matches[1]) {
            const cleanValue = matches[1].trim().replace(/[<>]/g, '');
            if (cleanValue && cleanValue.length > 1 && cleanValue.length < 50) {
              features.push({
                key: key,
                value: cleanValue
              });
            }
          }
        });
      }
      
      // REAL variant detection - only create if actual variants exist
      if (variants.length === 0) {
        console.log(`🔍 Checking for real variants...`);
        
        // Look for actual Trendyol variant selectors
        const $ = cheerio.load(html);
        const colorSelectors = $('.pr-in-dt-cl, .variants-content, [data-testid="variants"]').length;
        const sizeSelectors = $('.pr-in-dt-sz, .size-variants, [data-testid="sizes"]').length;
        
        console.log(`🎨 Color selectors found: ${colorSelectors}`);
        console.log(`📏 Size selectors found: ${sizeSelectors}`);
        
        // Only create variants if actual selectors exist
        if (colorSelectors > 0 || sizeSelectors > 0) {
          console.log(`✅ Real variants detected, creating variants...`);
          
          // Try to extract real variant data from script tags
          const scriptTexts = $('script').map((i, el) => $(el).text()).get();
          let realVariants = [];
          
          for (const script of scriptTexts) {
            const variantMatch = script.match(/"variants"\s*:\s*(\[.*?\])/);
            if (variantMatch) {
              try {
                const variantData = JSON.parse(variantMatch[1]);
                if (Array.isArray(variantData) && variantData.length > 0) {
                  realVariants = variantData.slice(0, 5).map((v: any) => ({
                    color: v.color || v.attributeValue || 'Standart',
                    size: v.size || v.value || 'Tek Beden',
                    inStock: v.inStock !== false
                  }));
                  break;
                }
              } catch (e) {
                console.log(`⚠️ Variant parsing error: ${e}`);
              }
            }
          }
          
          if (realVariants.length > 0) {
            variants = realVariants;
            console.log(`✅ Found ${variants.length} real variants`);
          }
        } else {
          console.log(`🚫 No real variant selectors found - product has no variants`);
          variants = []; // No fake variants
        }
      }
      
      console.log(`🎯 Gelişmiş sistem: ${features.length} özellik, ${variants.length} varyant çıkarıldı`);
      
    } catch (e: any) {
      console.log(`⚠️ Gelişmiş çıkarma hatası: ${e.message}`);
      
      // Fallback: Basit özellik çıkarma
      try {
        const $ = cheerio.load(html);
        $('.detail-attr').each((i, el) => {
          const key = $(el).find('.detail-attr-item-key').text().trim();
          const value = $(el).find('.detail-attr-item-value').text().trim();
          
          if (key && value) {
            features.push({ key, value });
          }
        });
        
        if (features.length === 0) {
          $('li').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes(':') && text.length < 100) {
              const [key, value] = text.split(':');
              if (key && value) {
                features.push({ 
                  key: key.trim(), 
                  value: value.trim() 
                });
              }
            }
          });
        }
        
        console.log(`📋 Fallback: ${features.length} özellik çıkarıldı`);
      } catch (fallbackError: any) {
        console.log(`⚠️ Fallback çıkarma hatası: ${fallbackError.message}`);
      }
      
      variants = []; // Gerçek varyant bulunamadı - sahte varyant oluşturma
    }
    
    console.log(`👕 Created ${variants.length} variants`);
    
    console.log(`✅ Scraping completed:
   📦 Title: ${title}
   🏷️ Brand: ${brand}
   💰 Price: ${priceObject.formatted} → ${priceObject.profitFormatted}
   🎯 Features: ${features.length} items
   📸 Images: ${images.length} items
   👕 Variants: ${variants.length} items`);
    
    return {
      success: true,
      title,
      brand,
      price: priceObject,
      images,
      features,
      variants
    };
    
  } catch (error) {
    console.error(`❌ Scraping error: ${error.message}`);
    return {
      success: false,
      title: 'Error',
      brand: 'Network',
      price: {
        original: 0,
        currency: 'TRY',
        formatted: '0,00 TL',
        withProfit: 0,
        profitFormatted: '0,00 TL'
      },
      images: [],
      features: [],
      variants: []
    };
  }
}