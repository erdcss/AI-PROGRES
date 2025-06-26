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
    
    // Fallback: Extract from script tags
    if (title === 'Ürün Başlığı') {
      const scriptTexts = html.match(/<script[^>]*>(.*?)<\/script>/gis);
      if (scriptTexts) {
        for (const scriptTag of scriptTexts) {
          const titleMatch = scriptTag.match(/"name":\s*"([^"]{10,150})"/);
          if (titleMatch && titleMatch[1]) {
            title = titleMatch[1];
            console.log(`✅ Title from script: ${title.substring(0, 50)}...`);
            break;
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
      // Enhanced feature extraction from script data
      console.log(`🎯 Enhanced feature extraction başlatılıyor...`);
      
      // Extract from script tags - Look for product attributes
      const scriptTexts = html.match(/<script[^>]*>(.*?)<\/script>/gis);
      if (scriptTexts) {
        for (const scriptTag of scriptTexts) {
          // Look for attributes in JSON structures
          const attributeMatches = scriptTag.match(/"attributes":\s*\[(.*?)\]/s);
          if (attributeMatches) {
            try {
              const attributesText = attributeMatches[1];
              const attrPairs = attributeMatches[1].match(/"name":\s*"([^"]+)"[^}]*"value":\s*"([^"]+)"/g);
              if (attrPairs) {
                attrPairs.forEach(pair => {
                  const nameMatch = pair.match(/"name":\s*"([^"]+)"/);
                  const valueMatch = pair.match(/"value":\s*"([^"]+)"/);
                  if (nameMatch && valueMatch) {
                    features.push({
                      key: nameMatch[1],
                      value: valueMatch[1]
                    });
                  }
                });
              }
            } catch (e) {
              // Continue with fallback
            }
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
      
      // Fallback: Pattern-based extraction
      if (features.length === 0) {
        const featurePatterns = [
          { key: 'Materyal', pattern: /Materyal[:\s]*([^<>\n,]+)/i },
          { key: 'Kumaş', pattern: /Kumaş[:\s]*([^<>\n,]+)/i },
          { key: 'Kalıp', pattern: /Kalıp[:\s]*([^<>\n,]+)/i },
          { key: 'Yıkama', pattern: /Yıkama[:\s]*([^<>\n,]+)/i },
          { key: 'Beden', pattern: /Beden[:\s]*([^<>\n,]+)/i }
        ];
        
        featurePatterns.forEach(({key, pattern}) => {
          const match = html.match(pattern);
          if (match && match[1]) {
            features.push({
              key: key,
              value: match[1].trim()
            });
          }
        });
      }
      
      // Size extraction fallback
      if (variants.length === 0) {
        const sizePattern = /\b(3[0-9]|4[0-9]|5[0-9]|XS|S|M|L|XL|XXL)\b/g;
        const sizeMatches = html.match(sizePattern);
        if (sizeMatches) {
          const uniqueSizes = sizeMatches.filter((size: string, index: number, arr: string[]) => arr.indexOf(size) === index).slice(0, 8);
          variants = uniqueSizes.map((size: string) => ({
            color: 'Standart',
            size: size,
            inStock: true
          }));
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
      
      variants = []; // Hata durumunda boş varyant array
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