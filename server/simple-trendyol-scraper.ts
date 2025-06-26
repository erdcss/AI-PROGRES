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
      // Quick HTML pattern extraction for speed
      const featurePatterns = [
        { key: 'Materyal', pattern: /Materyal[:\s]*([^<>\n,]+)/i },
        { key: 'Kumaş', pattern: /Kumaş[:\s]*([^<>\n,]+)/i },
        { key: 'Kalıp', pattern: /Kalıp[:\s]*([^<>\n,]+)/i },
        { key: 'Yıkama', pattern: /Yıkama[:\s]*([^<>\n,]+)/i },
        { key: 'Marka', pattern: /vendor["\s:]*["']([^"']+)/i }
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
      
      // Quick size extraction
      const sizePattern = /\b(3[0-9]|4[0-9]|5[0-9])\b/g;
      const sizeMatches = html.match(sizePattern);
      if (sizeMatches) {
        const uniqueSizes = sizeMatches.filter((size, index, arr) => arr.indexOf(size) === index).slice(0, 10);
        variants = uniqueSizes.map(size => ({
          color: 'Standart',
          size: size,
          inStock: true
        }));
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