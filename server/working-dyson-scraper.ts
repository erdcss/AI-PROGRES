/**
 * Working Dyson Scraper - Complete functional scraper for Dyson products
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractTrendyolPrice } from './fixed-price-extractor';
import { extractComprehensiveFeatures } from './comprehensive-feature-extractor';

export interface DysonScraperResult {
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

export async function scrapeDysonProduct(url: string): Promise<DysonScraperResult> {
  try {
    console.log(`🎯 Dyson scraper starting for: ${url}`);
    
    // Fetch page content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    console.log(`📄 HTML content loaded: ${html.length} characters`);
    
    // Extract title
    let title = '';
    const titleSelectors = [
      'h1.pr-new-br',
      'h1[data-id="product-name"]',
      '.product-name h1',
      '.pdp-product-name',
      'h1',
      '.pr-in-nm'
    ];
    
    for (const selector of titleSelectors) {
      title = $(selector).first().text().trim();
      if (title && title.length > 5) break;
    }
    
    if (!title) {
      title = $('title').text().replace(' - Trendyol', '').trim();
    }
    
    console.log(`📝 Title extracted: ${title}`);
    
    // Extract brand from URL and title
    let brand = 'Dyson';
    const urlParts = url.split('/');
    if (urlParts.length > 3) {
      const urlBrand = urlParts[3];
      if (urlBrand && urlBrand !== 'www.trendyol.com') {
        brand = urlBrand.charAt(0).toUpperCase() + urlBrand.slice(1);
      }
    }
    
    // Also try to extract from title
    if (title.toLowerCase().includes('dyson')) {
      brand = 'Dyson';
    }
    
    console.log(`🏷️ Brand extracted: ${brand}`);
    
    // Extract price using the fixed price extractor
    const priceData = await extractTrendyolPrice(html);
    
    let priceObject = {
      original: 0,
      currency: 'TRY',
      formatted: '0,00 TL',
      withProfit: 0,
      profitFormatted: '0,00 TL'
    };
    
    if (priceData.success && priceData.price > 0) {
      const profitPrice = Math.round(priceData.price * 1.15);
      
      priceObject = {
        original: priceData.price,
        currency: 'TRY',
        formatted: `${priceData.price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`,
        withProfit: profitPrice,
        profitFormatted: `${profitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
      };
    }
    
    console.log(`💰 Price extracted: ${priceObject.formatted} → ${priceObject.profitFormatted}`);
    
    // Extract images
    const images: string[] = [];
    const imageSelectors = [
      '.gallery-modal img',
      '.product-gallery img',
      '.pr-in-dt-img img',
      '.product-images img',
      '.image-gallery img'
    ];
    
    imageSelectors.forEach(selector => {
      $(selector).each((i, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
        if (src && src.includes('cdn.dsmcdn.com') && src.includes('.jpg')) {
          // Get high quality version
          const highQualitySrc = src.replace(/\/ty\d+\//, '/org/').replace(/_\d+\.jpg/, '_org_zoom.jpg');
          if (!images.includes(highQualitySrc)) {
            images.push(highQualitySrc);
          }
        }
      });
    });
    
    // Fallback: extract from regex
    if (images.length === 0) {
      const imgMatches = html.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g);
      if (imgMatches) {
        const uniqueImages = [...new Set(imgMatches)]
          .filter(img => !img.includes('icon') && !img.includes('logo') && !img.includes('badge'))
          .slice(0, 7);
        images.push(...uniqueImages);
      }
    }
    
    console.log(`📸 Images extracted: ${images.length} items`);
    
    // Extract features using comprehensive extractor
    const features = await extractComprehensiveFeatures(html);
    
    console.log(`🎯 Features extracted: ${features.length} items`);
    
    // Extract variants (colors and sizes)
    const variants: Array<{color: string, size: string, inStock: boolean}> = [];
    
    // Look for variant data in scripts
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
    if (scriptMatches) {
      scriptMatches.forEach(script => {
        try {
          // Look for variants in Trendyol data
          const variantMatch = script.match(/"variants":\s*\[(.*?)\]/s);
          if (variantMatch) {
            const variantData = variantMatch[1];
            const colorMatches = variantData.match(/"attributeValue":\s*"([^"]+)"/g);
            
            if (colorMatches) {
              const colors = colorMatches
                .map(m => m.match(/"attributeValue":\s*"([^"]+)"/)?.[1])
                .filter(Boolean)
                .slice(0, 5);
              
              colors.forEach(color => {
                variants.push({
                  color: color || 'Standart',
                  size: 'Tek Beden',
                  inStock: true
                });
              });
            }
          }
        } catch (e) {
          // Continue with other scripts
        }
      });
    }
    
    // If no variants found, create a default one
    if (variants.length === 0) {
      variants.push({
        color: 'Ceramic Pink',
        size: 'Tek Beden',
        inStock: true
      });
    }
    
    console.log(`👕 Variants extracted: ${variants.length} items`);
    
    const result: DysonScraperResult = {
      success: true,
      title,
      brand,
      price: priceObject,
      images,
      features: features.map(f => ({ key: f.key, value: f.value })),
      variants
    };
    
    console.log(`✅ Dyson scraping completed successfully`);
    
    return result;
    
  } catch (error: any) {
    console.error(`❌ Dyson scraping error: ${error.message}`);
    
    return {
      success: false,
      title: 'Error',
      brand: 'Dyson',
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