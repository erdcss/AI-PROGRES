/**
 * Test Enhanced Extraction - Working Version
 * Comprehensive product image and feature extraction
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

export interface EnhancedExtractionResult {
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
  tags: string[];
}

export async function testEnhancedExtraction(url: string): Promise<EnhancedExtractionResult> {
  try {
    console.log(`🎯 TEST ENHANCED EXTRACTION for: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);
    
    // Extract basic data
    const title = extractTitle($);
    const brand = extractBrand(url);
    const price = extractPrice($, htmlContent);
    const images = await extractImagesEnhanced($, htmlContent);
    const features = await extractFeaturesSimple($, htmlContent);
    const tags = generateSimpleTags(title, brand, features, url);
    
    console.log(`✅ Enhanced extraction completed: ${images.length} images, ${features.length} features, ${tags.length} tags`);
    
    return {
      success: true,
      title,
      brand,
      price,
      images,
      features,
      tags
    };
    
  } catch (error) {
    console.error('❌ Enhanced extraction error:', error);
    return {
      success: false,
      title: 'Error',
      brand: 'Error',
      price: { original: 0, currency: 'TL', formatted: '0 TL', withProfit: 0, profitFormatted: '0 TL' },
      images: [],
      features: [],
      tags: []
    };
  }
}

function extractTitle($: any): string {
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonData = JSON.parse($(jsonLdScripts[i]).html() || '{}');
      if (jsonData.name) {
        return jsonData.name;
      }
    } catch (e) {
      continue;
    }
  }
  
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;
  
  return 'Product';
}

function extractBrand(url: string): string {
  const urlMatch = url.match(/trendyol\.com\/([^\/]+)\//);
  if (urlMatch) {
    return urlMatch[1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('-');
  }
  return 'Brand';
}

function extractPrice($: any, htmlContent: string): any {
  // Try JSON-LD first
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonData = JSON.parse($(jsonLdScripts[i]).html() || '{}');
      if (jsonData.offers && jsonData.offers.price) {
        const originalPrice = parseFloat(jsonData.offers.price);
        const finalPrice = Math.round(originalPrice * 1.15);
        
        return {
          original: originalPrice,
          currency: 'TL',
          formatted: `${originalPrice} TL`,
          withProfit: finalPrice,
          profitFormatted: `${finalPrice} TL`
        };
      }
    } catch (e) {
      continue;
    }
  }
  
  return {
    original: 0,
    currency: 'TL',
    formatted: '0 TL',
    withProfit: 0,
    profitFormatted: '0 TL'
  };
}

async function extractImagesEnhanced($: cheerio.CheerioAPI, htmlContent: string): Promise<string[]> {
  console.log('🖼️ ENHANCED IMAGE EXTRACTION starting...');
  
  // Extract all CDN images with regex
  const cdnPatterns = [
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpeg/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.png/g
  ];
  
  const allImages: string[] = [];
  cdnPatterns.forEach(pattern => {
    const matches = htmlContent.match(pattern) || [];
    allImages.push(...matches);
  });
  
  // Extract from DOM
  const domImages: string[] = [];
  $('img[src*="cdn.dsmcdn.com"]').each((_, el) => {
    const src = $(el).attr('src');
    if (src) domImages.push(src);
  });
  
  // Combine and filter
  const combinedImages = [...allImages, ...domImages];
  const uniqueImages = [...new Set(combinedImages)]
    .filter(img => 
      img.includes('cdn.dsmcdn.com') && 
      img.includes('prod/') &&
      !img.includes('_thumb') &&
      !img.includes('_small')
    )
    .map(img => {
      // Optimize for high quality
      return img.replace(/\/(small|medium|thumb)\//, '/mnresize/620/920/');
    });
  
  console.log(`✅ Enhanced image extraction: ${uniqueImages.length} unique images`);
  return uniqueImages.slice(0, 20);
}

async function extractFeaturesSimple($: cheerio.CheerioAPI, htmlContent: string): Promise<Array<{key: string, value: string}>> {
  const features: Array<{key: string, value: string}> = [];
  
  // Extract from JSON-LD
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      if (jsonData.brand) {
        features.push({ key: 'Marka', value: jsonData.brand.name || jsonData.brand });
      }
      if (jsonData.description) {
        features.push({ key: 'Açıklama', value: jsonData.description.substring(0, 300) });
      }
      if (jsonData.sku) {
        features.push({ key: 'SKU', value: jsonData.sku });
      }
      if (jsonData.offers && jsonData.offers.availability) {
        features.push({ key: 'Stok Durumu', value: jsonData.offers.availability });
      }
    } catch (e) {
      // Continue
    }
  });
  
  // Extract from meta tags
  const metaProps = [
    { selector: 'meta[name="description"]', key: 'Meta Açıklama' },
    { selector: 'meta[name="keywords"]', key: 'Anahtar Kelimeler' }
  ];
  
  metaProps.forEach(({ selector, key }) => {
    const content = $(selector).attr('content');
    if (content && content.trim()) {
      features.push({ key, value: content.trim() });
    }
  });
  
  console.log(`✅ Simple feature extraction: ${features.length} features`);
  return features;
}

function generateSimpleTags(title: string, brand: string, features: Array<{key: string, value: string}>, url: string): string[] {
  const tags = new Set<string>();
  
  // Basic tags
  tags.add('import');
  tags.add('trendyol');
  tags.add('enhanced');
  
  // Brand tag
  if (brand && brand !== 'Brand') {
    tags.add(brand.toLowerCase().replace(/\s+/g, '-'));
  }
  
  // Color tags from title
  const colorKeywords = ['beyaz', 'siyah', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahve'];
  colorKeywords.forEach(color => {
    if (title.toLowerCase().includes(color)) {
      tags.add(`renk-${color}`);
    }
  });
  
  // Product type tags
  const productTypes = ['takım', 'elbise', 'pantolon', 'gömlek', 'tişört', 'kazak', 'mont'];
  productTypes.forEach(type => {
    if (title.toLowerCase().includes(type)) {
      tags.add(`tip-${type}`);
    }
  });
  
  console.log(`🏷️ Generated ${tags.size} simple tags`);
  return Array.from(tags);
}