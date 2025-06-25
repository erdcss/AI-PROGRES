/**
 * Simple Trendyol Scraper - Working Version
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractTrendyolPrice } from './fixed-price-extractor';
import { extractProductImages } from './working-image-extractor';

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
    
    // Basic product info
    let title = $('h1').first().text().trim() || 'Product Title';
    let brand = 'Network';
    
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
    } catch (e) {
      console.log(`⚠️ Price extraction error: ${e.message}`);
    }
    
    // Use the working image extractor
    const images = await extractProductImages(url);
    
    console.log(`✅ Found ${images.length} unique images`);
    
    // Features extraction
    const features: Array<{key: string, value: string}> = [];
    
    try {
      $('.detail-attr').each((i, el) => {
        const key = $(el).find('.detail-attr-item-key').text().trim();
        const value = $(el).find('.detail-attr-item-value').text().trim();
        
        if (key && value) {
          features.push({ key, value });
        }
      });
      
      if (features.length === 0) {
        // Fallback feature extraction
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
    } catch (e) {
      console.log(`⚠️ Feature extraction error: ${e.message}`);
    }
    
    console.log(`📋 Extracted ${features.length} features`);
    
    // Variant extraction
    const variants: Array<{color: string, size: string, inStock: boolean}> = [];
    
    try {
      // Simple variant detection
      const colors = ['Siyah', 'Beyaz', 'Mavi', 'Kırmızı', 'Yeşil', 'Sarı', 'Mor', 'Gri', 'Lacivert'];
      const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '37', '38', '39', '40', '41', '42', '43', '44'];
      
      let foundColors: string[] = [];
      let foundSizes: string[] = [];
      
      // Look for colors and sizes in HTML
      const lowerHtml = html.toLowerCase();
      colors.forEach(color => {
        if (lowerHtml.includes(color.toLowerCase())) {
          foundColors.push(color);
        }
      });
      
      sizes.forEach(size => {
        if (lowerHtml.includes(size.toLowerCase())) {
          foundSizes.push(size);
        }
      });
      
      if (foundColors.length === 0) foundColors = ['Standart'];
      if (foundSizes.length === 0) foundSizes = ['Standart'];
      
      // Create variants
      foundColors.forEach(color => {
        foundSizes.forEach(size => {
          variants.push({
            color,
            size,
            inStock: true
          });
        });
      });
      
    } catch (e) {
      console.log(`⚠️ Variant extraction error: ${e.message}`);
      variants.push({ color: 'Standart', size: 'Standart', inStock: true });
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