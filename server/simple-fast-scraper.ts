/**
 * Simple Fast Scraper - Basic but reliable extraction
 * Basit ama güvenilir veri çekme sistemi
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SimpleFastResult {
  success: boolean;
  title?: string;
  brand?: string;
  price?: number;
  images?: string[];
  variants?: Array<{
    color: string;
    size: string;
    inStock: boolean;
  }>;
  error?: string;
}

export async function simpleFastExtract(url: string): Promise<SimpleFastResult> {
  console.log('🚀 SIMPLE FAST: Starting extraction for', url);
  
  try {
    // Simple HTTP request with minimal headers
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Extract title
    const title = $('h1').first().text().trim() || 
                 $('[data-testid="product-name"]').text().trim() ||
                 $('.product-name').text().trim() ||
                 $('title').text().replace(' - Trendyol', '').trim();

    // Extract brand 
    const brand = $('.product-brand').text().trim() || 
                 $('[data-testid="product-brand"]').text().trim() ||
                 $('.brand').text().trim() ||
                 extractBrandFromTitle(title);

    // Extract price with multiple strategies
    let price = 0;
    
    // Strategy 1: Common price selectors
    const priceSelectors = [
      '.prc-dsc',
      '.prc-org',  
      '.price-current',
      '.price',
      '[data-testid="price"]',
      '.product-price .current-price',
      '.discounted-price',
      '.current-price'
    ];

    for (const selector of priceSelectors) {
      const priceText = $(selector).text().trim();
      if (priceText) {
        const extractedPrice = extractPrice(priceText);
        if (extractedPrice > 0) {
          price = extractedPrice;
          console.log(`💰 Price found via ${selector}: ${price} TL`);
          break;
        }
      }
    }

    // Strategy 2: If no price found, search in all text
    if (price === 0) {
      const bodyText = $('body').text();
      const priceMatch = bodyText.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)\s*TL/g);
      if (priceMatch) {
        const prices = priceMatch.map(p => extractPrice(p)).filter(p => p > 0 && p < 100000);
        if (prices.length > 0) {
          price = Math.min(...prices); // Take lowest reasonable price
          console.log(`💰 Price found via text search: ${price} TL`);
        }
      }
    }

    // Extract images
    const images: string[] = [];
    $('img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && src.includes('cdn.dsmcdn.com') && src.includes('org_zoom')) {
        images.push(src);
      }
    });

    // Remove duplicates and limit
    const uniqueImages = [...new Set(images)].slice(0, 10);

    // Basic variant extraction
    const variants = [{
      color: 'Standart',
      size: 'Standart', 
      inStock: true
    }];

    // Success if we have title and price
    if (title && price > 0) {
      console.log(`✅ SIMPLE FAST: Success - ${title}, ${price} TL, ${uniqueImages.length} images`);
      
      return {
        success: true,
        title,
        brand,
        price,
        images: uniqueImages,
        variants
      };
    }

    // Partial success if we have title but no price
    if (title) {
      console.log(`⚠️ SIMPLE FAST: Partial success - title found but no valid price`);
      return {
        success: true,
        title,
        brand,
        price: 0,
        images: uniqueImages,
        variants
      };
    }

    console.log('❌ SIMPLE FAST: No valid data extracted');
    return {
      success: false,
      error: 'No valid product data found'
    };

  } catch (error) {
    console.log('❌ SIMPLE FAST: Error -', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

function extractPrice(priceText: string): number {
  if (!priceText) return 0;
  
  // Remove all non-numeric characters except dots, commas and spaces
  let cleaned = priceText.replace(/[^\d.,\s]/g, '');
  
  // Handle Turkish number format (1.234,56)
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // Has both dots and comma - Turkish format
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Only comma - could be decimal separator
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      // Decimal separator
      cleaned = cleaned.replace(',', '.');
    } else {
      // Thousands separator  
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  
  const price = parseFloat(cleaned.trim());
  
  // Return only if reasonable price range
  if (price > 0 && price < 500000) {
    return price;
  }
  
  return 0;
}

function extractBrandFromTitle(title: string): string {
  if (!title) return 'Genel';
  
  const words = title.split(' ');
  const firstWord = words[0];
  
  // If first word looks like a brand (capitalized, reasonable length)
  if (firstWord && firstWord.length > 2 && firstWord.length < 20) {
    return firstWord;
  }
  
  return 'Genel';
}