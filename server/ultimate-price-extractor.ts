/**
 * Ultimate Price Extractor - Comprehensive Trendyol Price Detection
 * Fixes all price extraction issues with multiple fallback strategies
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

export interface ExtractedPrice {
  original: number;
  currency: string;
  formatted: string;
  withProfit: number;
  profitFormatted: string;
  method: string;
  raw: string;
}

export class UltimatePriceExtractor {
  private $: CheerioAPI;
  private htmlContent: string;
  private debugMode: boolean = true;

  constructor($: CheerioAPI, htmlContent: string) {
    this.$ = $;
    this.htmlContent = htmlContent;
  }

  /**
   * Main extraction method with multiple fallback strategies
   */
  extractPrice(): ExtractedPrice {
    console.log('🎯 ULTIMATE PRICE EXTRACTOR - Starting comprehensive extraction');
    console.log(`📄 HTML content length: ${this.htmlContent.length} characters`);

    const allResults: ExtractedPrice[] = [];

    // Strategy 1: Current discounted price selectors
    let result = this.tryCurrentPriceSelectors();
    if (result) {
      console.log(`✅ Found via Current Price Selectors: ${result.original} TL`);
      allResults.push(result);
    } else {
      console.log(`❌ Current Price Selectors: No results`);
    }

    // Strategy 2: JSON-LD structured data
    result = this.tryJsonLdExtraction();
    if (result) {
      console.log(`✅ Found via JSON-LD: ${result.original} TL`);
      allResults.push(result);
    } else {
      console.log(`❌ JSON-LD: No results`);
    }

    // Strategy 3: Script data parsing
    result = this.tryScriptDataExtraction();
    if (result) {
      console.log(`✅ Found via Script Data: ${result.original} TL`);
      allResults.push(result);
    } else {
      console.log(`❌ Script Data: No results`);
    }

    // Strategy 4: Advanced DOM selectors
    result = this.tryAdvancedSelectors();
    if (result) {
      console.log(`✅ Found via Advanced Selectors: ${result.original} TL`);
      allResults.push(result);
    } else {
      console.log(`❌ Advanced DOM Selectors: No results`);
    }

    // Strategy 5: Regex patterns on HTML content
    result = this.tryRegexPatterns();
    if (result) {
      console.log(`✅ Found via Regex Patterns: ${result.original} TL`);
      allResults.push(result);
    } else {
      console.log(`❌ Regex Patterns: No results`);
    }

    // Strategy 6: Meta tag extraction
    result = this.tryMetaTagExtraction();
    if (result) {
      console.log(`✅ Found via Meta Tags: ${result.original} TL`);
      allResults.push(result);
    } else {
      console.log(`❌ Meta Tags: No results`);
    }

    // Analyze all results and pick the best one
    if (allResults.length > 0) {
      console.log(`🔍 Found ${allResults.length} potential prices:`);
      allResults.forEach((res, idx) => {
        console.log(`   ${idx + 1}. ${res.original} TL via ${res.method}`);
      });

      // Filter reasonable prices (15-5000 TL range for most Turkish e-commerce products)
      const reasonablePrices = allResults.filter(r => r.original >= 15 && r.original <= 5000);
      
      if (reasonablePrices.length > 0) {
        // Sort by price (ascending) and return the LOWEST reasonable price (customer wants discounts!)
        // This prioritizes sale/discounted prices over original prices
        reasonablePrices.sort((a, b) => a.original - b.original);
        const bestPrice = reasonablePrices[0];
        console.log(`🎯 SELECTED BEST PRICE (LOWEST): ${bestPrice.original} TL via ${bestPrice.method}`);
        return bestPrice;
      } else {
        // No reasonable prices, try expanded range for luxury items (5000-15000 TL)
        const luxuryPrices = allResults.filter(r => r.original >= 5000 && r.original <= 15000);
        if (luxuryPrices.length > 0) {
          luxuryPrices.sort((a, b) => a.original - b.original);
          console.log(`💎 Using luxury price range: ${luxuryPrices[0].original} TL`);
          return luxuryPrices[0];
        }
        
        // Last resort: filter out obviously wrong prices (>15000 TL) and use lowest
        const filteredResults = allResults.filter(r => r.original <= 15000);
        if (filteredResults.length > 0) {
          filteredResults.sort((a, b) => a.original - b.original);
          console.log(`🔧 Using filtered lowest result: ${filteredResults[0].original} TL`);
          return filteredResults[0];
        }
        
        console.log(`❌ All prices seem unreasonable, using fallback`);
        return this.createFallbackPrice();
      }
    }

    console.log('❌ ALL EXTRACTION STRATEGIES FAILED');
    return this.createFallbackPrice();
  }

  /**
   * Strategy 1: Current discounted price selectors
   */
  private tryCurrentPriceSelectors(): ExtractedPrice | null {
    console.log('🔍 Strategy 1: Current price selectors');
    
    const currentPriceSelectors = [
      // ORIGINAL PRICE SELECTORS (may be higher than discounted)
      '.prc-org',
      '.original-price',
      '.price-original',
      '.was-price',
      '.before-discount',
      // SALE/DISCOUNTED PRICE SELECTORS (usually lower/better price)
      '.prc-slg',
      '.sale-price', 
      '.discounted-price',
      '.price-sale',
      '.promotion-price',
      '.campaign-price',
      '.special-price',
      // CURRENT PRICE SELECTORS (could be either)
      '.prc-dsc',
      '.price-discount',
      '.discounted-price-value', 
      '[data-testid="price-current-price"]',
      '.price-container .discounted',
      '.price-container span.discounted',
      '.product-price-container .discounted',
      '.current-price',
      '.final-price',
      '.selling-price',
      '.product-price .price',
      '.price-current',
      // GENERIC PRICE SELECTORS
      '.price',
      '.product-price',
      '.price-value',
      '.price-text',
      '.amount'
    ];

    for (const selector of currentPriceSelectors) {
      try {
        const elements = this.$(selector);
        console.log(`🔍 Testing selector "${selector}": ${elements.length} elements found`);
        
        for (let i = 0; i < elements.length; i++) {
          const element = elements.eq(i);
          const priceText = element.text().trim();
          
          if (priceText) {
            console.log(`   Element ${i}: "${priceText}"`);
            
            // CRITICAL FIX: Special handling for "Son X Günün" pattern
            if (priceText.includes('Son') && priceText.includes('Günün')) {
              console.log(`   🚨 Detected "Son X Günün" pattern in: "${priceText}"`);
              
              // Extract ALL prices that end with TL
              const allPriceMatches = [...priceText.matchAll(/(\d+)\s*TL/g)];
              console.log(`   🔍 Found ${allPriceMatches.length} price matches`);
              
              if (allPriceMatches.length > 0) {
                // Log all matches for debugging
                allPriceMatches.forEach((match, idx) => {
                  console.log(`      Match ${idx}: ${match[0]} -> ${match[1]} TL`);
                });
                
                // Get the LAST price (which should be the current/sale price)
                const lastMatch = allPriceMatches[allPriceMatches.length - 1];
                const actualPrice = parseInt(lastMatch[1]);
                
                console.log(`   🎯 Selected LAST price: ${actualPrice} TL (from "${lastMatch[0]}")`);
                
                // Always use the last price when "Son X Günün" pattern is detected
                if (actualPrice > 0) {
                  const withProfit = Math.round(actualPrice * 1.10 * 100) / 100;
                  
                  return {
                    original: actualPrice,
                    currency: 'TL',
                    formatted: `${actualPrice} TL`,
                    withProfit: withProfit,
                    profitFormatted: `${withProfit.toFixed(2)} TL`,
                    method: `Current Selector: ${selector} (Last Price)`,
                    raw: priceText
                  };
                }
              }
            }
            
            // Normal extraction but skip if it's "30" from "Son 30 Günün"
            const extracted = this.parsePrice(priceText, `Current Selector: ${selector}`);
            if (extracted && extracted.original > 0) {
              // Skip if it's "30" and raw contains "Son 30 Günün"
              if (extracted.original === 30 && priceText.includes('Son 30 Günün')) {
                console.log(`   ⚠️ Skipping false positive: 30 from "Son 30 Günün"`);
                continue;
              }
              return extracted;
            }
          }
        }
      } catch (error) {
        console.log(`❌ Error with selector ${selector}:`, error);
      }
    }

    return null;
  }

  /**
   * Strategy 2: JSON-LD structured data extraction
   */
  private tryJsonLdExtraction(): ExtractedPrice | null {
    console.log('🔍 Strategy 2: JSON-LD structured data');
    
    const jsonLdScripts = this.$('script[type="application/ld+json"]');
    console.log(`📜 Found ${jsonLdScripts.length} JSON-LD scripts`);
    
    for (let i = 0; i < jsonLdScripts.length; i++) {
      try {
        const scriptContent = this.$(jsonLdScripts[i]).html();
        if (!scriptContent) continue;
        
        const jsonData = JSON.parse(scriptContent);
        console.log(`📜 JSON-LD ${i}:`, JSON.stringify(jsonData).substring(0, 200));
        
        // Check for price in offers
        if (jsonData.offers) {
          const offers = Array.isArray(jsonData.offers) ? jsonData.offers[0] : jsonData.offers;
          if (offers.price || offers.lowPrice) {
            const price = offers.price || offers.lowPrice;
            const extracted = this.parsePrice(price.toString(), 'JSON-LD offers');
            if (extracted && extracted.original > 0) {
              return extracted;
            }
          }
        }
        
        // Check for direct price
        if (jsonData.price) {
          const extracted = this.parsePrice(jsonData.price.toString(), 'JSON-LD direct');
          if (extracted && extracted.original > 0) {
            return extracted;
          }
        }
      } catch (error) {
        console.log(`❌ JSON-LD parsing error:`, error);
      }
    }
    
    return null;
  }

  /**
   * Strategy 3: Script data extraction (window.__INITIAL_STATE__ etc.)
   */
  private tryScriptDataExtraction(): ExtractedPrice | null {
    console.log('🔍 Strategy 3: Script data extraction');
    
    const scripts = this.$('script:not([src])');
    console.log(`📜 Found ${scripts.length} inline scripts`);
    
    for (let i = 0; i < scripts.length; i++) {
      try {
        const scriptContent = this.$(scripts[i]).html() || '';
        
        // Look for price patterns in JavaScript data
        const pricePatterns = [
          /price['"]\s*:\s*['"]*(\d+[.,]\d{2})['"]*|price['"]\s*:\s*(\d+)/gi,
          /currentPrice['"]\s*:\s*['"]*(\d+[.,]\d{2})['"]*|currentPrice['"]\s*:\s*(\d+)/gi,
          /sellingPrice['"]\s*:\s*['"]*(\d+[.,]\d{2})['"]*|sellingPrice['"]\s*:\s*(\d+)/gi,
          /finalPrice['"]\s*:\s*['"]*(\d+[.,]\d{2})['"]*|finalPrice['"]\s*:\s*(\d+)/gi
        ];
        
        for (const pattern of pricePatterns) {
          const matches = scriptContent.match(pattern);
          if (matches) {
            console.log(`📜 Script pattern found:`, matches[0]);
            const priceStr = matches[1] || matches[2];
            if (priceStr) {
              const extracted = this.parsePrice(priceStr, 'Script Data');
              if (extracted && extracted.original > 0) {
                return extracted;
              }
            }
          }
        }
      } catch (error) {
        console.log(`❌ Script parsing error:`, error);
      }
    }
    
    return null;
  }

  /**
   * Strategy 4: Advanced DOM selectors
   */
  private tryAdvancedSelectors(): ExtractedPrice | null {
    console.log('🔍 Strategy 4: Advanced DOM selectors');
    
    const advancedSelectors = [
      // More specific selectors
      '[data-testid*="price"] span',
      '[data-testid*="price"]',
      '[class*="price"] span',
      '[class*="discount"] span',
      '.product-detail .price',
      '.product-info .price',
      '.price-box .price',
      '.price-wrap .price',
      // ID selectors
      '#product-price',
      '#current-price',
      '#final-price',
      // Attribute selectors
      '[data-price]',
      '[data-current-price]',
      '[data-selling-price]'
    ];

    for (const selector of advancedSelectors) {
      try {
        const elements = this.$(selector);
        if (elements.length > 0) {
          console.log(`🔍 Advanced selector "${selector}": ${elements.length} elements`);
          
          for (let i = 0; i < elements.length; i++) {
            const element = elements.eq(i);
            const priceText = element.text().trim();
            const dataPrice = element.attr('data-price') || element.attr('data-current-price') || element.attr('data-selling-price');
            
            if (priceText) {
              console.log(`   Element ${i} text: "${priceText}"`);
              const extracted = this.parsePrice(priceText, `Advanced Selector: ${selector}`);
              if (extracted && extracted.original > 0) {
                return extracted;
              }
            }
            
            if (dataPrice) {
              console.log(`   Element ${i} data: "${dataPrice}"`);
              const extracted = this.parsePrice(dataPrice, `Data Attribute: ${selector}`);
              if (extracted && extracted.original > 0) {
                return extracted;
              }
            }
          }
        }
      } catch (error) {
        console.log(`❌ Error with advanced selector ${selector}:`, error);
      }
    }

    return null;
  }

  /**
   * Strategy 5: Regex patterns on HTML content
   */
  private tryRegexPatterns(): ExtractedPrice | null {
    console.log('🔍 Strategy 5: Comprehensive regex patterns on HTML content');
    
    // First, try to find all price patterns and analyze them
    const allPriceMatches = this.htmlContent.match(/\d+[.,]\d{2}\s*(?:TL|₺)/g);
    if (allPriceMatches) {
      console.log(`🔍 Found ${allPriceMatches.length} potential prices:`, allPriceMatches.slice(0, 10));
      
      // Extract unique prices and sort them
      const uniquePrices = [...new Set(allPriceMatches)];
      const parsedPrices = uniquePrices
        .map(p => {
          const match = p.match(/(\d+)[.,](\d{2})/);
          if (match) {
            const price = parseFloat(match[1] + '.' + match[2]);
            return { original: p, parsed: price };
          }
          return null;
        })
        .filter(p => p !== null && p.parsed > 10 && p.parsed < 1000) // Reasonable price range
        .sort((a, b) => a.parsed - b.parsed); // Sort ascending (lowest first)
      
      console.log(`🔍 Parsed valid prices:`, parsedPrices);
      
      // Return the lowest reasonable price (likely the sale price)
      if (parsedPrices.length > 0) {
        const bestPrice = parsedPrices[0]; // Lowest price
        console.log(`🎯 Selected lowest price: ${bestPrice.original} (${bestPrice.parsed} TL)`);
        
        const extracted = this.parsePrice(bestPrice.original, 'Regex Pattern - Lowest Price');
        if (extracted && extracted.original > 0) {
          return extracted;
        }
      }
    }
    
    // Specific targeted patterns
    const patterns = [
      // Priority patterns for sale/discounted prices
      /prc-slg[^>]*>([^<]*\d+[.,]\d{2}[^<]*TL)/gi,
      /sale-price[^>]*>([^<]*\d+[.,]\d{2}[^<]*TL)/gi,
      /discounted[^>]*>([^<]*\d+[.,]\d{2}[^<]*TL)/gi,
      /promotion[^>]*>([^<]*\d+[.,]\d{2}[^<]*TL)/gi,
      // Generic price patterns
      /(\d+)[.,](\d{2})\s*(?:TL|₺)/g,
      /price[^>]*>([^<]*\d+[.,]\d{2}[^<]*)/gi,
      /fiyat[^>]*>([^<]*\d+[.,]\d{2}[^<]*)/gi
    ];

    for (const pattern of patterns) {
      const matches = this.htmlContent.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`🔍 Pattern found ${matches.length} matches:`, matches.slice(0, 3));
        
        for (const match of matches.slice(0, 5)) {
          const priceStr = match.match(/(\d+[.,]\d{2})/)?.[1];
          if (priceStr) {
            const extracted = this.parsePrice(priceStr, 'Regex Pattern');
            if (extracted && extracted.original > 0 && extracted.original < 200) { // Reasonable range
              return extracted;
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Strategy 6: Meta tag extraction
   */
  private tryMetaTagExtraction(): ExtractedPrice | null {
    console.log('🔍 Strategy 6: Meta tag extraction');
    
    const metaSelectors = [
      'meta[property="product:price:amount"]',
      'meta[property="og:price"]',
      'meta[name="price"]',
      'meta[property="price"]',
      'meta[itemprop="price"]'
    ];

    for (const selector of metaSelectors) {
      const metaTag = this.$(selector);
      if (metaTag.length > 0) {
        const content = metaTag.attr('content');
        if (content) {
          console.log(`🔍 Meta tag "${selector}": "${content}"`);
          const extracted = this.parsePrice(content, `Meta Tag: ${selector}`);
          if (extracted && extracted.original > 0) {
            return extracted;
          }
        }
      }
    }

    return null;
  }

  /**
   * Parse price string and return structured price object
   */
  private parsePrice(priceStr: string, method: string): ExtractedPrice | null {
    if (!priceStr || typeof priceStr !== 'string') return null;
    
    console.log(`💰 Parsing price "${priceStr}" via ${method}`);
    
    // Clean the price string
    const cleanStr = priceStr.toString().trim();
    
    // TURKISH PRICE FORMAT DETECTION AND PARSING
    // Turkish format: 56.263,68 TL (56,263.68 TL in international format)
    // Pattern: thousands separator = dot (.), decimal separator = comma (,)
    
    // Step 1: Look for full Turkish price format with TL symbol
    const turkishPricePattern = /([\d.]+),(\d{2})\s*(?:TL|₺)/g;
    let match = turkishPricePattern.exec(cleanStr);
    
    if (match) {
      const wholePart = match[1].replace(/\./g, ''); // Remove thousand separators
      const decimalPart = match[2];
      const price = parseFloat(wholePart + '.' + decimalPart);
      
      console.log(`💰 TURKISH FORMAT: "${match[0]}" -> ${wholePart}.${decimalPart} = ${price} TL`);
      
      if (price >= 10 && price <= 100000) {
        const withProfit = Math.round(price * 1.10 * 100) / 100;
        
        return {
          original: parseFloat(price.toFixed(2)),
          currency: 'TL',
          formatted: `${price.toFixed(2)} TL`,
          withProfit: parseFloat(withProfit.toFixed(2)),
          profitFormatted: `${withProfit.toFixed(2)} TL`,
          method: method + ' (Turkish Format)',
          raw: priceStr
        };
      }
    }
    
    // Step 2: Look for simpler decimal format with comma (no thousands)
    const simpleDecimalPattern = /(\d+),(\d{2})\s*(?:TL|₺)/g;
    match = simpleDecimalPattern.exec(cleanStr);
    
    if (match) {
      const price = parseFloat(match[1] + '.' + match[2]);
      console.log(`💰 SIMPLE DECIMAL: "${match[0]}" -> ${price} TL`);
      
      if (price >= 10 && price <= 100000) {
        const withProfit = Math.round(price * 1.10 * 100) / 100;
        
        return {
          original: parseFloat(price.toFixed(2)),
          currency: 'TL',
          formatted: `${price.toFixed(2)} TL`,
          withProfit: parseFloat(withProfit.toFixed(2)),
          profitFormatted: `${withProfit.toFixed(2)} TL`,
          method: method + ' (Simple Decimal)',
          raw: priceStr
        };
      }
    }
    
    // Step 3: Look for integer prices
    const integerPattern = /(\d+)\s*(?:TL|₺)/g;
    match = integerPattern.exec(cleanStr);
    
    if (match) {
      const price = parseInt(match[1]);
      console.log(`💰 INTEGER: "${match[0]}" -> ${price} TL`);
      
      if (price >= 10 && price <= 100000) {
        // Check if this is NOT in a day/month context
        const contextCheck = cleanStr.substring(Math.max(0, match.index! - 10), match.index! + match[0].length + 10);
        if (!contextCheck.match(/\b(gün|ay|hafta|yıl|dakika|saat)\b/i)) {
          const withProfit = Math.round(price * 1.10 * 100) / 100;
          
          return {
            original: parseFloat(price.toFixed(2)),
            currency: 'TL',
            formatted: `${price.toFixed(2)} TL`,
            withProfit: parseFloat(withProfit.toFixed(2)),
            profitFormatted: `${withProfit.toFixed(2)} TL`,
            method: method + ' (Integer)',
            raw: priceStr
          };
        }
      }
    }
    
    // Step 4: Fallback - try to extract without TL symbol
    const fallbackTurkishPattern = /([\d.]+),(\d{2})/;
    const fallbackMatch = cleanStr.match(fallbackTurkishPattern);
    
    if (fallbackMatch) {
      const wholePart = fallbackMatch[1].replace(/\./g, '');
      const decimalPart = fallbackMatch[2];
      const price = parseFloat(wholePart + '.' + decimalPart);
      
      console.log(`💰 FALLBACK TURKISH: "${fallbackMatch[0]}" -> ${price} TL`);
      
      if (price >= 10 && price <= 100000) {
        const withProfit = Math.round(price * 1.10 * 100) / 100;
        
        return {
          original: parseFloat(price.toFixed(2)),
          currency: 'TL',
          formatted: `${price.toFixed(2)} TL`,
          withProfit: parseFloat(withProfit.toFixed(2)),
          profitFormatted: `${withProfit.toFixed(2)} TL`,
          method: method + ' (Fallback Turkish)',
          raw: priceStr
        };
      }
    }
    
    console.log(`❌ No valid price found in: "${cleanStr}"`);
    return null;
  }

  /**
   * Create fallback price when all strategies fail
   */
  private createFallbackPrice(): ExtractedPrice {
    console.log('❌ Creating fallback price - extraction failed');
    
    return {
      original: 0,
      currency: 'TL',
      formatted: '0 TL',
      withProfit: 0,
      profitFormatted: '0 TL',
      method: 'EXTRACTION_FAILED',
      raw: 'NO_PRICE_FOUND'
    };
  }
}

/**
 * Main function to use the Ultimate Price Extractor
 */
export function ultimatePriceExtract($: CheerioAPI, htmlContent: string): ExtractedPrice {
  const extractor = new UltimatePriceExtractor($, htmlContent);
  return extractor.extractPrice();
}