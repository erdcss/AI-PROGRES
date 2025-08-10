/**
 * Scenario-Based Scraper - Main Integration Point
 * Routes extraction through appropriate scenario-based handlers
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScenarioManager, ExtractionScenario } from './scenario-manager';
import { ScenarioExtractors } from './scenario-extractors';
import { ImageDeduplicator, extractEnhancedFeatures, extractEnhancedVariants } from './improved-image-deduplicator';
import { colorFilter } from './color-filter';

export interface ScenarioBasedResult {
  success: boolean;
  scenario: ExtractionScenario;
  confidence: number;
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
    colorCode: string;
    size: string;
    inStock: boolean;
  }>;
  tags: string[]; // Added advanced tags array
  extractionDetails: {
    scenario: string;
    confidence: number;
    evidence: string[];
    strategy: string;
  };
}

export async function scenarioBasedScrape(url: string): Promise<ScenarioBasedResult> {
  try {
    console.log(`🎯 SCENARIO-BASED EXTRACTION for: ${url}`);
    
    // Step 1: Fetch the page content with enhanced anti-detection
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    ];
    
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': randomUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1',
        'Connection': 'keep-alive'
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });
    
    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);
    
    console.log(`📄 HTML content loaded: ${htmlContent.length} characters`);
    
    // Step 2: Extract basic information
    const title = extractTitle($);
    const brand = extractBrand(url);
    const price = extractPrice($, htmlContent);
    
    // Enhanced extraction with improved deduplication
    const rawImages = await extractImagesBasic($, htmlContent);
    const images = ImageDeduplicator.deduplicateImages(rawImages);
    const features = await extractEnhancedFeatures($, htmlContent);
    
    // Enhanced category-based tag generation will be handled by generateAdvancedTags
    
    console.log(`✅ Basic info: title="${title}", brand="${brand}", price=${price.original}`);
    
    // Step 3: Initialize scenario manager and detect scenario
    const scenarioManager = new ScenarioManager();
    const detection = scenarioManager.detectScenario(htmlContent, $);
    
    console.log(`🎯 Detected scenario: ${detection.scenario} (${detection.confidence}% confidence)`);
    console.log(`📋 Evidence: ${detection.evidence.join(', ')}`);
    console.log(`💡 Strategy: ${detection.suggestedStrategy}`);
    
    // Step 4: Get scenario configuration and extract variants
    const config = scenarioManager.getScenarioConfig(detection.scenario);
    if (!config) {
      throw new Error(`No configuration found for scenario: ${detection.scenario}`);
    }
    
    const variantResult = ScenarioExtractors.extractByScenario(
      detection.scenario,
      config,
      $,
      htmlContent,
      title
    );
    
    // Step 5: Build final variants array with enhanced extraction
    let variants = buildVariantsArray(variantResult, detection.scenario);
    
    // Always try direct DOM extraction to get more color variants
    console.log('🔄 Trying direct DOM extraction for additional variants...');
    const directVariants = await extractVariantsDirect($, htmlContent);
    
    // Merge direct extraction results if they provide more colors/sizes
    if (directVariants.length > 0) {
      console.log(`🔄 Direct extraction found variants: ${directVariants.length} (existing: ${variants.length})`);
      
      // 🚨 SINGLE COLOR POLICY ENFORCEMENT - No merging allowed
      console.log(`🚨 ENFORCING SINGLE COLOR POLICY - Using only direct extraction`);
      
      if (directVariants.length > 0) {
        // Force single color if multiple detected
        const uniqueColors = [...new Set(directVariants.map(v => v.color))];
        if (uniqueColors.length > 1) {
          console.log(`🚨 FORCING SINGLE COLOR: Found ${uniqueColors.length} colors [${uniqueColors.join(', ')}], keeping only: ${uniqueColors[0]}`);
          variants = directVariants.filter(v => v.color === uniqueColors[0]);
        } else {
          variants = directVariants;
        }
        console.log(`✅ SINGLE COLOR RESULT: ${variants.length} variants with color: ${variants[0]?.color || 'none'}`);
      } else if (variants.length === 0) {
        console.log('⚠️ No variants found from any method');
        variants = [];
      }
    }
    
    // AUTHENTIC ONLY: Do not generate fake/enhanced variants
    if (variants.length === 0) {
      console.log('🔄 No authentic variants found from direct extraction');
      console.log('🚫 Not generating fake/enhanced variants - using authentic data only');
      variants = []; // Return empty variants instead of generating fake ones
    }
    
    // Step 6: Generate advanced tags based on all extracted data
    const advancedTags = generateAdvancedTags(title, brand, features, url);
    
    console.log(`✅ Scenario-based extraction completed: ${variants.length} variants, ${images.length} images, ${features.length} features, ${advancedTags.length} tags`);
    console.log(`🎨 Colors extracted: [${[...new Set(variants.map(v => v.color).filter(c => c && c.trim() !== ''))].join(', ')}]`);
    
    // Create proper variants structure for frontend - Fix Set iteration
    const uniqueColors = variants.map(v => v.color).filter(c => c && c.trim() !== '');
    const colors = Array.from(new Set(uniqueColors));
    const uniqueSizes = variants.map(v => v.size).filter(s => s && s.trim() !== '' && !['1', 'Standart', 'Varsayılan'].includes(s));
    const sizes = Array.from(new Set(uniqueSizes));
    
    return {
      success: true,
      scenario: detection.scenario,
      confidence: detection.confidence,
      title,
      brand,
      price,
      images,
      features,
      variants: {
        colors: colors,
        sizes: sizes,
        allVariants: variants
      },
      tags: advancedTags, // Added advanced tags
      extractionDetails: {
        scenario: detection.scenario,
        confidence: detection.confidence,
        evidence: detection.evidence,
        strategy: detection.suggestedStrategy
      }
    };
    
  } catch (error: any) {
    console.error(`❌ Scenario-based scraper error: ${error.message}`);
    
    return {
      success: false,
      scenario: ExtractionScenario.SINGLE_VARIANT,
      confidence: 0,
      title: 'Product',
      brand: 'Brand',
      price: {
        original: 0,
        currency: 'TL',
        formatted: '0 TL',
        withProfit: 0,
        profitFormatted: '0 TL'
      },
      images: [],
      features: [{ key: 'Error', value: 'Extraction failed' }],
      variants: {
        colors: [],
        sizes: [],
        allVariants: []
      },
      tags: [], // Add missing tags property
      extractionDetails: {
        scenario: 'error',
        confidence: 0,
        evidence: [error.message],
        strategy: 'Error handling'
      }
    };
  }
}

/**
 * Extract product title from page
 */
function extractTitle($: any): string {
  // Try multiple selectors for title
  const titleSelectors = [
    'script[type="application/ld+json"]',
    'h1',
    '.product-title',
    '.product-name',
    'title'
  ];
  
  // First try JSON-LD
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonData = JSON.parse($(jsonLdScripts[i]).html() || '{}');
      if (jsonData.name) {
        console.log(`✅ Title from JSON-LD: ${jsonData.name}`);
        return jsonData.name;
      }
    } catch (e) {
      // Continue to next script
    }
  }
  
  // Try other selectors
  for (const selector of titleSelectors.slice(1)) {
    const element = $(selector).first();
    if (element.length && element.text().trim()) {
      return element.text().trim();
    }
  }
  
  return 'Product';
}

/**
 * Extract brand from URL or page
 */
function extractBrand(url: string): string {
  // Extract from URL pattern
  const urlMatch = url.match(/trendyol\.com\/([^\/]+)\//);
  if (urlMatch) {
    const brand = urlMatch[1]
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('-');
    console.log(`✅ Brand from URL: ${brand}`);
    return brand;
  }
  
  return 'Brand';
}

/**
 * Extract price information
 */
function extractPrice($: any, htmlContent: string): any {
  // Try JSON-LD first
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonData = JSON.parse($(jsonLdScripts[i]).html() || '{}');
      if (jsonData.offers && jsonData.offers.price) {
        const originalPrice = parseFloat(jsonData.offers.price);
        const finalPrice = Math.round(originalPrice * 1.10); // 10% profit
        
        console.log(`💰 Price from JSON-LD: ${originalPrice} TL → ${finalPrice} TL`);
        
        return {
          original: originalPrice,
          currency: 'TL',
          formatted: `${originalPrice} TL`,
          withProfit: finalPrice,
          profitFormatted: `${finalPrice} TL`
        };
      }
    } catch (e) {
      // Continue
    }
  }
  
  // Fallback to HTML parsing with enhanced Trendyol selectors
  const priceSelectors = [
    '.prc-dsc', 
    '.prc-slg',
    '[data-testid="price-current-price"]',
    '.product-price .price',
    '.price-current',
    '.current-price',
    '.price', 
    '.sale-price'
  ];
  
  for (const selector of priceSelectors) {
    const priceElement = $(selector).first();
    if (priceElement.length) {
      const priceText = priceElement.text().trim();
      console.log(`💰 Price selector ${selector}: "${priceText}"`);
      
      // Enhanced price parsing for Turkish format
      const cleanText = priceText.replace(/[^\d,\.]/g, '');
      let price = 0;
      
      if (cleanText.includes(',')) {
        // Turkish format: 749,99
        price = parseFloat(cleanText.replace(',', '.'));
      } else {
        price = parseFloat(cleanText);
      }
      
      if (!isNaN(price) && price > 0) {
        const finalPrice = Math.round(price * 1.10);
        console.log(`💰 Price extracted: ${price} TL → ${finalPrice} TL (+10%)`);
        return {
          original: price,
          currency: 'TL',
          formatted: `${price} TL`,
          withProfit: finalPrice,
          profitFormatted: `${finalPrice} TL`
        };
      }
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

async function extractImagesBasic($: cheerio.CheerioAPI, htmlContent: string): Promise<string[]> {
  console.log('🖼️ Basic image extraction for deduplication system...');
  
  const allImages: string[] = [];
  
  // Method 1: CDN regex extraction
  const cdnPatterns = [
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpeg/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.png/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.webp/g
  ];
  
  cdnPatterns.forEach(pattern => {
    const matches = htmlContent.match(pattern) || [];
    allImages.push(...matches);
  });
  
  // Method 2: DOM extraction
  const imageSelectors = [
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    'img[data-original*="cdn.dsmcdn.com"]',
    '[style*="cdn.dsmcdn.com"]'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      const sources = [
        $el.attr('src'),
        $el.attr('data-src'),
        $el.attr('data-original')
      ];
      
      sources.forEach(src => {
        if (src && src.includes('cdn.dsmcdn.com')) {
          allImages.push(src);
        }
      });
      
      // Extract from style backgrounds
      const style = $el.attr('style') || '';
      const bgMatch = style.match(/url\(['"]?(https:\/\/cdn\.dsmcdn\.com[^'"]*)/);
      if (bgMatch) {
        allImages.push(bgMatch[1]);
      }
    });
  });
  
  // Method 3: JSON-LD extraction
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      if (jsonData.image) {
        const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
        images.forEach(img => {
          if (typeof img === 'string' && img.includes('cdn.dsmcdn.com')) {
            allImages.push(img);
          }
        });
      }
    } catch (e) {
      // Continue
    }
  });
  
  console.log(`📸 Raw extraction found ${allImages.length} total images`);
  return allImages;
}

// Removed old extractFeaturesAdvanced function - now using enhanced version from improved-image-deduplicator.ts

/**
 * Extract product images - Only product-specific images, not all site images
 */
function extractImages($: any): string[] {
  const images = new Set<string>();
  
  // Try to find active/current product images by checking for visible elements
  const productImageSelectors = [
    // Modern Trendyol selectors
    '[data-testid="product-images"] img',
    '[data-testid="product-image"] img',
    '.product-gallery img',
    '.product-image img',
    '.gallery-image img',
    '.product-main-image img',
    // Variant images
    '.variant-image img',
    '.color-variant img',
    // Thumbnail gallery
    '.thumbnail-gallery img',
    '.product-thumbs img',
    // Recent Trendyol patterns
    '.product-detail-image img',
    '.product-photos img'
  ];
  
  // First try specific product image selectors
  productImageSelectors.forEach(selector => {
    $(selector).each((i: number, el: any) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && isProductImage(src)) {
        const highResSrc = optimizeImageUrl(src);
        images.add(highResSrc);
      }
    });
  });
  
  // Try JSON-LD structured data for image URLs
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const jsonData = JSON.parse($(jsonLdScripts[i]).html() || '{}');
      if (jsonData.image) {
        const imageUrls = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
        imageUrls.forEach((img: string) => {
          if (img && isProductImage(img)) {
            const highResSrc = optimizeImageUrl(img);
            images.add(highResSrc);
          }
        });
      }
    } catch (e) {
      // Continue
    }
  }
  
  // If no specific product images found, try broader search with filtering
  if (images.size === 0) {
    $('img[src*="cdn.dsmcdn.com"]').each((i: number, el: any) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src && isProductImage(src)) {
        const highResSrc = optimizeImageUrl(src);
        images.add(highResSrc);
      }
    });
  }
  
  // Additional fallback: check for data-original, data-zoom, etc.
  if (images.size === 0) {
    $('img[data-original*="cdn.dsmcdn.com"], img[data-zoom*="cdn.dsmcdn.com"]').each((i: number, el: any) => {
      const src = $(el).attr('data-original') || $(el).attr('data-zoom') || $(el).attr('src');
      if (src && isProductImage(src)) {
        const highResSrc = optimizeImageUrl(src);
        images.add(highResSrc);
      }
    });
  }
  
  const imageArray = Array.from(images);
  console.log(`📸 Product images extracted: ${imageArray.length}`);
  
  // Debug: If no images found, log some stats
  if (imageArray.length === 0) {
    console.log(`🔍 Debug: Total img tags found: ${$('img').length}`);
    console.log(`🔍 Debug: CDN img tags found: ${$('img[src*="cdn.dsmcdn.com"]').length}`);
    console.log(`🔍 Debug: Checking first few CDN images...`);
    
    $('img[src*="cdn.dsmcdn.com"]').slice(0, 5).each((i: number, el: any) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      console.log(`🔍 Debug img ${i}: ${src} - isProductImage: ${isProductImage(src || '')}`);
    });
  }
  
  return imageArray;
}

/**
 * Check if image URL is a product image (not site assets)
 */
function isProductImage(src: string): boolean {
  // Must contain CDN pattern
  if (!src.includes('cdn.dsmcdn.com')) return false;
  
  // Accept both original and resized product images
  const isProductImage = src.includes('product/media/images/') || 
                         src.includes('mnresize') || 
                         src.includes('_org_zoom') ||
                         src.includes('ty1/') ||
                         src.includes('ty2/') ||
                         src.includes('ty3/') ||
                         src.includes('ty4/') ||
                         src.includes('ty5/');
  
  if (!isProductImage) return false;
  
  // Exclude site assets and UI elements
  const excludePatterns = [
    '/web/',
    'ty-web.svg',
    'logo',
    'icon',
    'button',
    'arrow',
    'star',
    'heart',
    'badge',
    'banner',
    'header',
    'footer',
    'nav',
    'menu',
    'social',
    'sprite',
    'common'
  ];
  
  for (const pattern of excludePatterns) {
    if (src.toLowerCase().includes(pattern)) {
      return false;
    }
  }
  
  // Include product image patterns
  const includePatterns = [
    '_org',
    '_zoom',
    'QC_ENRICHMENT',
    'PRODUCT_ENRICHMENT'
  ];
  
  for (const pattern of includePatterns) {
    if (src.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Optimize image URL for high resolution
 */
function optimizeImageUrl(src: string): string {
  // Keep original URL as-is for better compatibility
  let optimized = src;
  
  // Remove any _org or _zoom suffixes that might cause 404s
  optimized = optimized.replace(/_org_zoom\.jpg$/, '.jpg');
  optimized = optimized.replace(/_org\.jpg$/, '.jpg');
  optimized = optimized.replace(/_zoom\.jpg$/, '.jpg');
  
  // Ensure https protocol
  if (!optimized.startsWith('https:')) {
    optimized = optimized.replace(/^http:/, 'https:');
  }
  
  return optimized;
}

/**
 * Extract product features
 */
function extractFeatures($: any): Array<{key: string, value: string}> {
  const features: Array<{key: string, value: string}> = [];
  
  // Enhanced feature selectors for Trendyol "Öne Çıkan Özellikler" section
  const featureSelectors = [
    // Trendyol "Öne Çıkan Özellikler" - Ana hedef
    '.highlighted-features',
    '.product-highlights',
    '.key-features',
    '.main-features',
    '.öne-çıkan-özellikler',
    // Trendyol özellik tablosu yapısı
    '.product-feature-list li',
    '.product-features li', 
    '.feature-list li',
    '.features-table tr',
    '.specifications-table tr',
    '.product-specs dt, .product-specs dd',
    '.specification-item',
    '.product-details li',
    '.features li',
    '.attributes li',
    // Yeni Trendyol specific selectors
    '.product-attributes .attribute-item',
    '.product-info-item',
    '.product-detail-attributes li',
    '.product-specification-item',
    '[data-testid*="feature"] span',
    '[data-testid*="attribute"] span',
    '.slicing-attributes .slicing-attribute-section',
    '.variant-attribute',
    '.product-property',
    // Tablo yapısı için özel selectors
    '.feature-table tr',
    '.spec-table tr',
    'table.features tr',
    'table.specifications tr',
    // Generic table rows that might contain features
    'tr:has(td)',
    '.info-table tr',
    '.specifications table tr',
    '.product-table tr',
    '.spec-table tr'
  ];
  
  // ENHANCED TRENDYOL FEATURE EXTRACTION
  console.log('🔧 Starting enhanced feature extraction for Trendyol...');
  
  // Method 1: Look for "Öne Çıkan Özellikler" section specifically
  $('h2, h3, h4, .section-title, .feature-title').each((_, heading) => {
    const headingText = $(heading).text().trim().toLowerCase();
    if (headingText.includes('öne çıkan') || headingText.includes('özellik') || 
        headingText.includes('features') || headingText.includes('highlights')) {
      
      console.log(`🎯 Found features section: "${$(heading).text().trim()}"`);
      
      // Look for table or list structure after this heading
      const nextElement = $(heading).next();
      const nextTable = $(heading).siblings('table').first();
      const parentSection = $(heading).parent();
      
      // Check for table structure
      if (nextTable.length > 0) {
        console.log(`📋 Found features table after heading`);
        nextTable.find('tr').each((_, row) => {
          const cells = $(row).find('td, th');
          if (cells.length >= 2) {
            const key = $(cells[0]).text().trim();
            const value = $(cells[1]).text().trim();
            if (key && value && key.length > 0 && value.length > 0) {
              features.push({ key, value });
              console.log(`🔧 Table feature found: ${key} = ${value}`);
            }
          }
        });
      }
      
      // Check for list structure in parent section
      parentSection.find('li, .feature-item, .attribute-item').each((_, item) => {
        const text = $(item).text().trim();
        if (text && text.includes(':')) {
          const [key, value] = text.split(':').map(s => s.trim());
          if (key && value && key.length < 50 && value.length < 100) {
            features.push({ key, value });
            console.log(`🔧 List feature found: ${key} = ${value}`);
          }
        }
      });
    }
  });
  
  // Method 2: Generic table scanning for key-value pairs
  $('table').each((_, table) => {
    const rows = $(table).find('tr');
    if (rows.length > 0 && rows.length < 20) { // Reasonable table size
      rows.each((_, row) => {
        const cells = $(row).find('td, th');
        if (cells.length === 2) {
          const key = $(cells[0]).text().trim();
          const value = $(cells[1]).text().trim();
          
          // Filter for meaningful features
          if (key && value && key.length > 2 && key.length < 50 && 
              value.length > 0 && value.length < 100 &&
              !key.toLowerCase().includes('fiyat') &&
              !key.toLowerCase().includes('price') &&
              !value.toLowerCase().includes('javascript')) {
            features.push({ key, value });
            console.log(`🔧 Generic table feature: ${key} = ${value}`);
          }
        }
      });
    }
  });
  
  // Method 3: Fallback to original selectors
  featureSelectors.forEach(selector => {
    $(selector).each((i: number, el: any) => {
      const $el = $(el);
      const text = $el.text().trim();
      
      if (text && text.length > 2 && text.length < 200) {
        let key = '';
        let value = '';
        
        if (text.includes(':')) {
          const colonIndex = text.indexOf(':');
          key = text.substring(0, colonIndex).trim();
          value = text.substring(colonIndex + 1).trim();
        } else if (text.includes('=')) {
          const equalIndex = text.indexOf('=');
          key = text.substring(0, equalIndex).trim();
          value = text.substring(equalIndex + 1).trim();
        }
        
        if (key && value && key.length > 0 && value.length > 0 && 
            key.length < 50 && value.length < 200) {
          features.push({ key, value });
          console.log(`🔧 Selector feature: ${key} = ${value}`);
        }
      }
    });
  });
  
  // Try to extract from JSON-LD structured data
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      // Look for product properties
      if (jsonData.additionalProperty && Array.isArray(jsonData.additionalProperty)) {
        jsonData.additionalProperty.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({ key: prop.name, value: prop.value.toString() });
          }
        });
      }
      
      // Look for brand, model, category info
      if (jsonData.brand && typeof jsonData.brand === 'string') {
        features.push({ key: 'Marka', value: jsonData.brand });
      }
      if (jsonData.model && typeof jsonData.model === 'string') {
        features.push({ key: 'Model', value: jsonData.model });
      }
      if (jsonData.category && typeof jsonData.category === 'string') {
        features.push({ key: 'Kategori', value: jsonData.category });
      }
      
    } catch (e) {
      // Continue silently
    }
  });
  
  // Deduplicate features
  const uniqueFeatures = features.filter((feature, index, self) => 
    index === self.findIndex(f => f.key === feature.key && f.value === feature.value)
  );
  
  console.log(`🔧 Features extracted: ${uniqueFeatures.length} (${features.length} total, ${features.length - uniqueFeatures.length} duplicates removed)`);
  return uniqueFeatures;
}

/**
 * Build variants array from extraction result
 */
function buildVariantsArray(variantResult: any, scenario: ExtractionScenario): any[] {
  const variants = [];
  
  const { sizes, colors, stockMap } = variantResult;
  
  console.log(`🔧 Building variants from scenario: ${scenario}`);
  console.log(`📊 Raw data - sizes: [${sizes.join(', ')}], colors: [${colors.join(', ')}]`);
  
  // CRITICAL: Only use authentic data - no fake fallbacks
  if (scenario === ExtractionScenario.SINGLE_VARIANT) {
    // For single variant products, return empty variants to avoid fake data
    console.log(`🚫 Single variant product: No authentic variants found - returning empty variants`);
    return [];
  } else {
    // For multi-variant products, use authentic extracted data
    const finalSizes = sizes.length > 0 ? sizes : [];
    const finalColors = colors.length > 0 ? colors : [];
    
    // STRICT: Only create variants if we have REAL size/color data
    if (sizes.length > 0 && colors.length > 0) {
      // Full matrix: both sizes and colors
      for (const color of finalColors) {
        for (const size of finalSizes) {
          const inStock = stockMap.get(size) !== false;
          
          variants.push({
            color,
            colorCode: getColorCode(color),
            size,
            inStock
          });
        }
      }
      console.log(`✅ Multi-variant product: ${finalColors.length} colors × ${finalSizes.length} sizes = ${variants.length} variants`);
    } else if (sizes.length > 0) {
      // Size-only variants - NO DEFAULT COLOR
      for (const size of finalSizes) {
        const inStock = stockMap.get(size) !== false;
        variants.push({
          color: 'Standart',
          colorCode: getColorCode('Standart'),
          size,
          inStock
        });
      }
      console.log(`✅ Size-only variants: ${finalSizes.length} sizes with default color`);
    } else if (colors.length > 0) {
      // Color-only variants - NO DEFAULT SIZE
      for (const color of finalColors) {
        const inStock = stockMap.get(color) !== false;
        variants.push({
          color,
          colorCode: getColorCode(color),
          size: 'Tek Beden',
          inStock
        });
      }
      console.log(`✅ Color-only variants: ${finalColors.length} colors with default size`);
    } else {
      // No authentic variants found - return empty
      console.log(`🚫 No authentic variants found - returning empty variants`);
      return [];
    }
  }
  
  console.log(`🔧 Built ${variants.length} authentic variants from scenario: ${scenario}`);
  return variants;
}

/**
 * Extract variants directly from DOM elements
 */
async function extractVariantsDirect($: cheerio.CheerioAPI, htmlContent: string): Promise<Array<{color: string, colorCode: string, size: string, inStock: boolean}>> {
  const variants: Array<{color: string, colorCode: string, size: string, inStock: boolean}> = [];
  
  // Method 1: Enhanced color extraction with modern Trendyol selectors
  const colors: string[] = [];
  
  // Modern Trendyol color selectors including slicing-attributes structure
  const colorSelectors = [
    '[data-testid*="color"] button',
    '[data-testid*="variant"] button', 
    '.variants-color button',
    '.product-variants .color-item',
    '.variant-buttons button[title]',
    '.color-selector button',
    '.product-color-options button',
    'button[data-color]',
    'button[aria-label*="renk"]',
    'button[aria-label*="color"]',
    '.variant-option[data-color]',
    '.color-option button',
    '.variant-color button',
    '.color-variant-item',
    'div[data-testid*="color-variant"]',
    // NEW: Trendyol slicing-attributes structure
    '.slicing-attributes .slicing-attribute-section-value span[data-testid*="color"]',
    '.slicing-attribute-section-value[data-testid*="color"]',
    '.slicing-attribute-section span[data-testid*="color"]'
  ];
  
  colorSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      const colorName = $el.attr('title') || $el.attr('alt') || $el.attr('data-color') || 
                       $el.attr('aria-label') || $el.text().trim();
      if (colorName && colorName.length > 0 && colorName.length < 30) {
        colors.push(colorName);
        console.log(`🎨 Found color via selector "${selector}": ${colorName}`);
      }
    });
  });

  // Additional method for Trendyol's slicing-attributes structure
  $('.slicing-attributes .slicing-attribute-section').each((_, section) => {
    const $section = $(section);
    
    // Check if this is a color section
    const sectionHeader = $section.find('.slicing-attribute-section-header').text().toLowerCase();
    if (sectionHeader.includes('renk') || sectionHeader.includes('color')) {
      
      $section.find('.slicing-attribute-section-value span').each((_, valueSpan) => {
        const $span = $(valueSpan);
        const colorValue = $span.text().trim();
        
        if (colorValue && colorValue.length > 0) {
          colors.push(colorValue);
          console.log(`🎨 Found color from slicing-attributes: ${colorValue}`);
        }
      });
    }
  });
  
  // Method 2: Enhanced size extraction with modern Trendyol selectors  
  const sizes: string[] = [];
  
  console.log('👕 Starting comprehensive size extraction...');
  
  // Modern Trendyol size selectors - COMPREHENSIVE APPROACH
  const sizeSelectors = [
    // Primary Trendyol size selectors
    '[data-testid*="size"] button',
    '[data-testid*="variant"] button', 
    '.variants-size button',
    '.product-variants .size-item',
    '.variant-buttons button[data-size]',
    '.size-selector button',
    '.product-size-options button',
    'button[data-size]',
    // Extended selectors for all size buttons
    'button[title*="XL"]',
    'button[title*="2XL"]', 
    'button[title*="3XL"]',
    'button:contains("XL")',
    'button:contains("2XL")',
    'button:contains("3XL")',
    'span:contains("XL")',
    '.size-option',
    '.variant-size',
    'button[aria-label*="beden"]',
    'button[aria-label*="size"]',
    '.variant-option[data-size]',
    '.size-option button',
    '.variant-size button',
    '.size-variant-item',
    'div[data-testid*="size-variant"]',
    '.product-detail-size button',
    '.pr-in-sz button',
    '.size-variants button'
  ];
  
  sizeSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      const sizeName = $el.text().trim() || $el.attr('title') || $el.attr('data-size') || 
                      $el.attr('aria-label');
      // ÖNEMLİ: Disabled kontrol etme, sadece mevcut bedenleri topla
      // Stok kontrolü ayrı yapılacak
      
      if (sizeName && typeof sizeName === 'string' && sizeName.length > 0 && sizeName.length < 10) {
        // Enhanced size pattern for Turkish and international sizes
        const sizePattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d+(\.\d+)?|Tek\s*Beden|One\s*Size)$/i;
        const cleanSizeName = sizeName.trim();
        
        if (sizePattern.test(cleanSizeName)) {
          sizes.push(cleanSizeName);
          const stockStatus = $el.is('[disabled]') || $el.hasClass('disabled') || 
                            $el.hasClass('out-of-stock') || $el.hasClass('sold-out') ? '(STOKTA YOK)' : '(STOKTA VAR)';
          console.log(`👕 FOUND SIZE: "${cleanSizeName}" ${stockStatus} [via: ${selector}]`);
        } else {
          console.log(`❌ Size rejected: "${cleanSizeName}" (doesn't match pattern) [via: ${selector}]`);
        }
      }
    });
  });
  
  // Method 3: Extract from JavaScript variables and JSON data
  const jsonExtractedColors = extractColorsFromJS($, htmlContent);
  const jsonExtractedSizes = extractSizesFromJS($, htmlContent);
  
  // Method 4: AGGRESSIVE SIZE DETECTION - Scan entire HTML for missing sizes
  console.log(`🔍 AGGRESSIVE SIZE SCAN: Looking for XL, 2XL, 3XL patterns...`);
  const aggressiveSizePatterns = [
    /\bXL\b/gi,
    /\b2XL\b/gi,
    /\b3XL\b/gi,
    /\bXXL\b/gi,
    /\bXXXL\b/gi,
    /size["\s]*[=:]["\s]*(XL|2XL|3XL|XXL|XXXL)/gi,
    /title["\s]*[=:]["\s]*(XL|2XL|3XL|XXL|XXXL)/gi,
    /data-size["\s]*[=:]["\s]*(XL|2XL|3XL|XXL|XXXL)/gi
  ];
  
  aggressiveSizePatterns.forEach((pattern, index) => {
    const matches = htmlContent.match(pattern);
    if (matches) {
      matches.forEach(match => {
        let extractedSize = match.replace(/[^A-Z0-9]/g, '');
        if (extractedSize && ['XL', '2XL', '3XL', 'XXL', 'XXXL'].includes(extractedSize)) {
          if (!sizes.includes(extractedSize)) {
            sizes.push(extractedSize);
            console.log(`👕 AGGRESSIVE SCAN FOUND: ${extractedSize} via pattern ${index}`);
          }
        }
      });
    }
  });
  
  // Combine all found colors and sizes with safety checks
  const allRawColors = Array.from(new Set([...colors, ...jsonExtractedColors]));
  
  // Safety filter: Only accept valid string sizes and exclude invalid values
  const filteredSizes = [...sizes, ...jsonExtractedSizes].filter(size => {
    return size && typeof size === 'string' && size.toString().trim() !== '' && 
           size !== '1' && size !== '0' && size !== 'undefined' && size !== 'null';
  });
  
  const allSizes = Array.from(new Set(filteredSizes));
  
  console.log(`🔍 Raw colors detected: ${allRawColors.length} [${allRawColors.join(', ')}]`);
  
  // ✅ FORCED SINGLE COLOR POLICY: Sadece 1 renk döndür
  let detectedColors: string[] = [];
  
  console.log(`🚨 FORCING SINGLE COLOR POLICY - Raw colors: [${allRawColors.join(', ')}]`);
  console.log(`🔥 CRITICAL DEBUG: About to execute frequency-based selection logic`);
  
  // 1. Önce script verilerinden gerçek renk bilgisini bul
  const scriptColors = extractActualColorsFromScript($, htmlContent);
  console.log(`🔍 DEBUG: scriptColors = [${scriptColors.join(', ')}]`);
  
  // 2. DOM'dan seçili/aktif rengi tespit et  
  const activeColor = extractActiveColorFromDOM($);
  console.log(`🔍 DEBUG: activeColor = ${activeColor}`);
  
  // 3. URL'den renk bilgisini çıkar
  const urlColor = extractColorFromURL(htmlContent);
  console.log(`🔍 DEBUG: urlColor = ${urlColor}`);
  
  // ABSOLUTE SINGLE COLOR: En yaygın rengi al (frequency-based selection)
  if (scriptColors.length > 0) {
    detectedColors = [scriptColors[0]];
    console.log(`🎯 FINAL: Script color selected: ${detectedColors[0]}`);
  } else if (activeColor) {
    detectedColors = [activeColor];
    console.log(`🎯 FINAL: Active color selected: ${activeColor}`);
  } else if (urlColor) {
    detectedColors = [urlColor];
    console.log(`🎯 FINAL: URL color selected: ${urlColor}`);
  } else if (allRawColors.length > 0) {
    // CRITICAL FIX: Use frequency-based selection instead of hardcoded logic
    const colorCounts = new Map<string, number>();
    allRawColors.forEach(color => {
      colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
    });
    
    // Get the most frequent color
    const sortedColors = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
    if (sortedColors.length > 0) {
      detectedColors = [sortedColors[0][0]];
      console.log(`🎯 FINAL: Most frequent color selected: ${sortedColors[0][0]} (found ${sortedColors[0][1]} times)`);
      console.log(`📊 All color frequencies: ${sortedColors.map(([c, count]) => `${c}:${count}`).join(', ')}`);
    } else {
      detectedColors = ['Standart'];
      console.log(`🎯 FINAL: Fallback to Standart`);
    }
  } else {
    detectedColors = ['Standart'];
    console.log(`🎯 FINAL: Default color: Standart`);
  }
  
  const filteredColors = detectedColors;
  
  console.log(`✅ AKILLI TESPİT: Renk tespiti tamamlandı - Renk sayısı: ${filteredColors.length}, Beden sayısı: ${allSizes.length}`);
  console.log(`🎨 Tespit edilen renkler: [${filteredColors.join(', ')}]`);
  // Güvenli beden listesi yazdırma
  const safeSizeList = allSizes
    .filter(size => typeof size === 'string')
    .map(size => String(size));
  console.log(`👕 Bedenler: [${safeSizeList.join(', ')}]`);
  
  // Build variants with stock check
  if (filteredColors.length > 0 && allSizes.length > 0) {
    // Multi-variant product - filter out fake sizes ve güvenlik kontrolü
    const realSizes = allSizes.filter(size => {
      if (!size || typeof size !== 'string') return false;
      const trimmedSize = size.trim();
      return trimmedSize !== '1' && trimmedSize !== '0' && trimmedSize !== 'Standart' && trimmedSize !== 'Varsayılan' && trimmedSize !== '';
    });
    if (realSizes.length > 0) {
      // Use real sizes - güvenli size kontrolü
      filteredColors.forEach(color => {
        realSizes.forEach(size => {
          if (typeof size === 'string' && size.trim() !== '') {
            const inStock = checkVariantStock($, htmlContent, color, size);
            variants.push({
              color: color,
              colorCode: getColorCode(color),
              size: size,
              inStock: inStock
            });
          }
        });
      });
    } else {
      // Only colors, no real sizes
      filteredColors.forEach(color => {
        const inStock = checkVariantStock($, htmlContent, color, '');
        variants.push({
          color: color,
          colorCode: getColorCode(color),
          size: '', // No fake size
          inStock: inStock
        });
      });
    }
  } else if (filteredColors.length > 0) {
    // Color variants only - No fake size information
    filteredColors.forEach(color => {
      const inStock = checkVariantStock($, htmlContent, color, '');
      variants.push({
        color: color,
        colorCode: getColorCode(color),
        size: '', // No fake size
        inStock: inStock
      });
    });
  } else if (allSizes.length > 0) {
    // Size variants only - No fake color information  
    allSizes.forEach(size => {
      // Skip fake sizes like "1", "Standart", "Varsayılan"
      if (size && size !== '1' && size !== 'Standart' && size !== 'Varsayılan' && size.trim() !== '') {
        const inStock = checkVariantStock($, htmlContent, '', size);
        variants.push({
          color: '', // No fake color
          colorCode: '',
          size: size,
          inStock: inStock
        });
      }
    });
  }
  
  // AUTHENTIC VARIANT POLICY: Show all detected variants regardless of stock
  // Users want to see genuine color options even if out of stock
  console.log(`📦 Stock check: ${variants.length} total variants, ${variants.filter(v => v.inStock).length} in stock`);
  
  // Remove duplicates based on color+size combination
  const uniqueVariants = variants.filter((variant, index, arr) => {
    const variantKey = `${variant.color}-${variant.size}`;
    return arr.findIndex(v => `${v.color}-${v.size}` === variantKey) === index;
  });
  
  console.log(`✅ Direct extraction generated ${uniqueVariants.length} authentic variants from ${filteredColors.length} main colors`);
  
  // Return all unique authentic variants (both in-stock and out-of-stock)
  return uniqueVariants;
}

/**
 * Script verilerinden gerçek renk bilgisini çıkar
 */
function extractActualColorsFromScript($: any, htmlContent: string): string[] {
  const colors: string[] = [];
  
  // Trendyol script verilerinden renk tespiti
  const scriptTags = $('script').toArray();
  for (const script of scriptTags) {
    const scriptContent = $(script).html() || '';
    
    // Mevcut seçili renk pattern'i
    const currentColorMatch = scriptContent.match(/"selectedVariant"[^}]*"color"\s*:\s*"([^"]+)"/);
    if (currentColorMatch) {
      colors.push(currentColorMatch[1]);
      console.log(`🎯 Selected variant color found: ${currentColorMatch[1]}`);
    }
    
    // Aktif renk pattern'i  
    const activeColorMatch = scriptContent.match(/"activeColor"\s*:\s*"([^"]+)"/);
    if (activeColorMatch) {
      colors.push(activeColorMatch[1]);
      console.log(`🎯 Active color found: ${activeColorMatch[1]}`);
    }
    
    // Ürün state'inden renk
    const productStateMatch = scriptContent.match(/"productState"[^}]*"colorName"\s*:\s*"([^"]+)"/);
    if (productStateMatch) {
      colors.push(productStateMatch[1]);
      console.log(`🎯 Product state color found: ${productStateMatch[1]}`);
    }
  }
  
  return Array.from(new Set(colors));
}

/**
 * DOM'dan aktif/seçili rengi tespit et
 */
function extractActiveColorFromDOM($: any): string | null {
  // Seçili renk butonunu bul
  const activeColorSelectors = [
    'button[data-color].selected',
    'button[data-color].active',
    '.color-option.selected',
    '.color-option.active',
    '.variant-color.selected',
    '.variant-color.active'
  ];
  
  for (const selector of activeColorSelectors) {
    const activeElement = $(selector).first();
    if (activeElement.length) {
      const colorName = activeElement.attr('data-color') || 
                       activeElement.attr('title') || 
                       activeElement.text().trim();
      if (colorName) {
        console.log(`🎯 Active color from DOM: ${colorName}`);
        return colorName;
      }
    }
  }
  
  return null;
}

/**
 * URL'den renk bilgisini çıkar
 */
function extractColorFromURL(htmlContent: string): string | null {
  // URL pattern'lerinden renk çıkar
  const urlColorPatterns = [
    /[?&]renk=([^&]+)/i,
    /[?&]color=([^&]+)/i,
    /\/([a-zA-ZçşığüöĞŞIİÇÜÖ]+)-renk/i,
    /-([a-zA-ZçşığüöĞŞIİÇÜÖ]+)-gömlek/i
  ];
  
  for (const pattern of urlColorPatterns) {
    const match = htmlContent.match(pattern);
    if (match && match[1]) {
      const colorName = decodeURIComponent(match[1]).replace(/[+_-]/g, ' ').trim();
      console.log(`🎯 Color from URL: ${colorName}`);
      return colorName;
    }
  }
  
  return null;
}

/**
 * Gelişmiş stok kontrolü - Gerçek stok durumunu tespit et
 */
function checkVariantStock($: any, htmlContent: string, color: string, size: string): boolean {
  // 1. Beden butonlarının durumunu kontrol et
  if (size && size.trim() !== '') {
    const sizeButtons = $(`button:contains("${size}"), [data-size="${size}"], [title="${size}"]`);
    if (sizeButtons.length > 0) {
      const isDisabled = sizeButtons.is('[disabled]') || 
                        sizeButtons.hasClass('disabled') || 
                        sizeButtons.hasClass('out-of-stock') ||
                        sizeButtons.hasClass('sold-out') ||
                        sizeButtons.hasClass('unavailable');
      
      if (isDisabled) {
        console.log(`❌ Beden stok kontrolü: ${size} - stokta yok (disabled)`);
        return false;
      } else {
        console.log(`✅ Beden stok kontrolü: ${size} - stokta var`);
        return true;
      }
    }
  }
  
  // 2. Script verilerinden stok bilgisini kontrol et
  const scriptTags = $('script').toArray();
  for (const script of scriptTags) {
    const scriptContent = $(script).html() || '';
    
    // Trendyol variant stock pattern
    if (size && scriptContent.includes(size)) {
      const stockPattern = new RegExp(`"size"\\s*:\\s*"${size}"[^}]*"inStock"\\s*:\\s*(true|false)`, 'i');
      const stockMatch = scriptContent.match(stockPattern);
      if (stockMatch) {
        const inStock = stockMatch[1] === 'true';
        console.log(`${inStock ? '✅' : '❌'} Script stok kontrolü: ${size} - ${inStock ? 'stokta var' : 'stokta yok'}`);
        return inStock;
      }
    }
    
    // Alternative pattern for stock checking
    const availablePattern = new RegExp(`"${size}"[^}]*"available"\\s*:\\s*(true|false)`, 'i');
    const availableMatch = scriptContent.match(availablePattern);
    if (availableMatch) {
      const available = availableMatch[1] === 'true';
      console.log(`${available ? '✅' : '❌'} Script available kontrolü: ${size} - ${available ? 'mevcut' : 'mevcut değil'}`);
      return available;
    }
  }
  
  // 3. Varsayılan: Buton varsa ve disabled değilse stokta var
  if (size && size.trim() !== '') {
    const hasButton = $(`button:contains("${size}")`, 'input[value*="${size}"]').length > 0;
    if (hasButton) {
      console.log(`✅ Varsayılan stok kontrolü: ${size} - buton mevcut, stokta var kabul edildi`);
      return true;
    }
  }
  
  // 4. Beden bilgisi yoksa, genel stok durumunu kontrol et
  const generalStockIndicators = [
    '.product-not-available',
    '.out-of-stock',
    '.sold-out',
    '.unavailable'
  ];
  
  for (const indicator of generalStockIndicators) {
    if ($(indicator).length > 0) {
      console.log(`❌ Genel stok kontrolü: Ürün stokta yok (${indicator})`);
      return false;
    }
  }
  
  // Varsayılan olarak stokta var kabul et
  console.log(`✅ Varsayılan: Stokta var kabul edildi`);
  return true;
}

/**
 * Extract category information for advanced tagging
 */
function extractCategoryInformation($: any, htmlContent: string, url: string): Array<{key: string, value: string}> {
  const categoryFeatures: Array<{key: string, value: string}> = [];
  
  // Method 1: Breadcrumb navigation
  const breadcrumbs: string[] = [];
  $('.breadcrumb a, .breadcrumb span, nav a, .nav-link').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 1 && !text.includes('Trendyol') && !text.includes('Ana Sayfa')) {
      breadcrumbs.push(text);
    }
  });
  
  if (breadcrumbs.length > 0) {
    categoryFeatures.push({ key: 'Kategori Yolu', value: breadcrumbs.join(' > ') });
    categoryFeatures.push({ key: 'Ana Kategori', value: breadcrumbs[0] });
    if (breadcrumbs.length > 1) {
      categoryFeatures.push({ key: 'Alt Kategori', value: breadcrumbs[breadcrumbs.length - 1] });
    }
  }
  
  // Method 2: Meta category information
  const metaCategory = $('meta[property="product:category"]').attr('content') || 
                      $('meta[name="category"]').attr('content');
  if (metaCategory) {
    categoryFeatures.push({ key: 'Meta Kategori', value: metaCategory });
  }
  
  // Method 3: JSON-LD category data
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      if (jsonData.category) {
        categoryFeatures.push({ key: 'Ürün Kategorisi', value: jsonData.category });
      }
      if (jsonData['@type'] === 'Product' && jsonData.productCategory) {
        categoryFeatures.push({ key: 'Ürün Tipi', value: jsonData.productCategory });
      }
    } catch (e) {
      // Continue
    }
  });
  
  // Method 4: URL-based category extraction
  try {
    const urlObject = new URL(url);
    const urlParts = urlObject.pathname.split('/');
    if (urlParts.length > 1) {
      const categoryFromUrl = urlParts[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      if (categoryFromUrl && !categoryFromUrl.includes('www') && !categoryFromUrl.includes('com')) {
        categoryFeatures.push({ key: 'URL Kategorisi', value: categoryFromUrl });
      }
    }
  } catch (e) {
    // Continue if URL parsing fails
  }
  
  console.log(`📂 Category extraction found ${categoryFeatures.length} category features`);
  return categoryFeatures;
}

/**
 * Extract size and measurement information
 */
function extractSizeInformation($: any, htmlContent: string): Array<{key: string, value: string}> {
  const sizeFeatures: Array<{key: string, value: string}> = [];
  
  // Method 1: Size chart extraction
  $('.size-chart, .size-guide, .olcu-tablosu').each((_, el) => {
    const sizeText = $(el).text().trim();
    if (sizeText.length > 0) {
      sizeFeatures.push({ key: 'Ölçü Tablosu', value: sizeText.substring(0, 200) });
    }
  });
  
  // Method 2: Measurement patterns in text
  const measurementPatterns = [
    /(\d+)\s*cm/gi,
    /(\d+)\s*mm/gi,
    /Boy:\s*(\d+)/gi,
    /En:\s*(\d+)/gi,
    /Yükseklik:\s*(\d+)/gi,
    /Ağırlık:\s*(\d+)/gi,
    /Kapasite:\s*(\d+)/gi
  ];
  
  const fullText = $.text();
  measurementPatterns.forEach((pattern, index) => {
    const matches = fullText.match(pattern);
    if (matches && matches.length > 0) {
      const measurements = [...new Set(matches)].slice(0, 3).join(', ');
      sizeFeatures.push({ key: `Ölçüler ${index + 1}`, value: measurements });
    }
  });
  
  // Method 3: Size guide links or buttons
  $('a[href*="size"], button[data-testid*="size"], .size-info').each((_, el) => {
    const sizeInfo = $(el).text().trim() || $(el).attr('title') || $(el).attr('data-title');
    if (sizeInfo && sizeInfo.length > 3) {
      sizeFeatures.push({ key: 'Beden Bilgisi', value: sizeInfo });
    }
  });
  
  console.log(`📏 Size extraction found ${sizeFeatures.length} size features`);
  return sizeFeatures;
}

/**
 * Extract material and fabric information
 */
function extractMaterialInformation($: any, htmlContent: string): Array<{key: string, value: string}> {
  const materialFeatures: Array<{key: string, value: string}> = [];
  
  // Method 1: Material composition patterns
  const materialPatterns = [
    /(%?\d+%?\s*(?:pamuk|cotton|polyester|elastan|spandex|lycra|viskon|ipek|yün|keten|denim|jean|kumaş))/gi,
    /(Kumaş:\s*[^\.]+)/gi,
    /(Malzeme:\s*[^\.]+)/gi,
    /(Materyal:\s*[^\.]+)/gi,
    /(Composition:\s*[^\.]+)/gi,
    /(Fabric:\s*[^\.]+)/gi
  ];
  
  const fullText = $.text();
  materialPatterns.forEach((pattern, index) => {
    const matches = fullText.match(pattern);
    if (matches && matches.length > 0) {
      const materials = [...new Set(matches)].slice(0, 3).join(', ');
      materialFeatures.push({ key: `Malzeme ${index + 1}`, value: materials });
    }
  });
  
  // Method 2: Care instructions
  const carePatterns = [
    /(Yıkama:\s*[^\.]+)/gi,
    /(Bakım:\s*[^\.]+)/gi,
    /(Care:\s*[^\.]+)/gi,
    /(Washing:\s*[^\.]+)/gi,
    /(\d+°C?\s*(?:yıkanır|yıkama|wash))/gi
  ];
  
  carePatterns.forEach((pattern, index) => {
    const matches = fullText.match(pattern);
    if (matches && matches.length > 0) {
      const care = [...new Set(matches)].slice(0, 2).join(', ');
      materialFeatures.push({ key: `Bakım ${index + 1}`, value: care });
    }
  });
  
  // Method 3: Quality and certification
  const qualityPatterns = [
    /(Oeko-Tex|GOTS|Organic|Organik|Sertifikalı)/gi,
    /(Kalite:\s*[^\.]+)/gi,
    /(Quality:\s*[^\.]+)/gi
  ];
  
  qualityPatterns.forEach((pattern, index) => {
    const matches = fullText.match(pattern);
    if (matches && matches.length > 0) {
      const quality = [...new Set(matches)].slice(0, 2).join(', ');
      materialFeatures.push({ key: `Kalite ${index + 1}`, value: quality });
    }
  });
  
  console.log(`🧵 Material extraction found ${materialFeatures.length} material features`);
  return materialFeatures;
}

/**
 * Generate advanced tags based on product data
 */
function generateAdvancedTags(
  title: string, 
  brand: string, 
  features: Array<{key: string, value: string}>,
  url: string
): string[] {
  const tags = new Set<string>();
  
  // Remove generic tags - create meaningful product-specific tags only
  
  // Brand-based tags (cleaner without generic "marka-" prefix)
  if (brand && brand !== 'Brand') {
    const cleanBrand = brand.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-çğıöşüÇĞIİÖŞÜ]/g, '');
    if (cleanBrand.length > 2) {
      tags.add(cleanBrand);
    }
  }
  
  // Enhanced category-based tags from features and title
  features.forEach(feature => {
    if (feature.key.includes('Kategori') || feature.key.includes('Category')) {
      const categoryWords = feature.value.split(/[\s>-]+/);
      categoryWords.forEach(word => {
        if (word.length > 2) {
          tags.add(word.toLowerCase().replace(/[^a-z0-9çğıöşüÇĞIİÖŞÜ]/g, ''));
        }
      });
    }
  });
  
  // Intelligent product categorization from title
  const categoryMappings = {
    // Clothing categories
    'ayakkabı': ['ayakkabı', 'ayakkabi', 'shoe', 'bot', 'sandalet', 'terlik', 'spor-ayakkabı'],
    'kadın': ['kadın', 'kadın-giyim', 'woman', 'female', 'bayan'],
    'erkek': ['erkek', 'erkek-giyim', 'man', 'male', 'bay'],
    'elbise': ['elbise', 'dress', 'abiye', 'günlük-elbise'],
    'pantolon': ['pantolon', 'pant', 'jean', 'şort', 'eşofman'],
    'gömlek': ['gömlek', 'shirt', 'bluz', 'tunik'],
    'tişört': ['tişört', 'tshirt', 't-shirt', 'polo'],
    'kazak': ['kazak', 'sweater', 'hırka', 'yelek'],
    'mont': ['mont', 'jacket', 'ceket', 'kaban', 'palto'],
    'çanta': ['çanta', 'bag', 'sırt-çantası', 'el-çantası'],
    'aksesuar': ['aksesuar', 'accessory', 'takı', 'saat', 'kemer', 'şapka'],
    'iç-giyim': ['iç-giyim', 'underwear', 'sütyern', 'külot', 'boxer', 'atlet'],
    'pijama': ['pijama', 'pajama', 'gecelik', 'sabahlık'],
    'mayo': ['mayo', 'bikini', 'swimsuit', 'deniz-şortu'],
    'spor': ['spor', 'sport', 'fitness', 'yoga', 'koşu', 'antrenman'],
    
    // Electronics
    'telefon': ['telefon', 'phone', 'iphone', 'samsung', 'huawei', 'xiaomi'],
    'bilgisayar': ['bilgisayar', 'computer', 'laptop', 'notebook', 'tablet'],
    'elektronik': ['elektronik', 'electronic', 'teknoloji', 'dijital'],
    'kulaklık': ['kulaklık', 'headphone', 'earphone', 'airpods'],
    'şarj': ['şarj', 'charger', 'power-bank', 'kablo'],
    
    // Home & Garden
    'ev': ['ev', 'home', 'ev-dekor', 'dekorasyon', 'mobilya'],
    'mutfak': ['mutfak', 'kitchen', 'yemek', 'tabak', 'bardak'],
    'banyo': ['banyo', 'bathroom', 'duş', 'havlu'],
    'yatak': ['yatak', 'bed', 'yorgan', 'yastık', 'çarşaf'],
    'bahçe': ['bahçe', 'garden', 'saksı', 'bitki', 'çiçek'],
    
    // Beauty & Personal Care
    'kozmetik': ['kozmetik', 'cosmetic', 'makyaj', 'makeup', 'ruj', 'fondöten'],
    'cilt': ['cilt', 'skin', 'krem', 'serum', 'nemlendirici'],
    'saç': ['saç', 'hair', 'şampuan', 'saç-bakım', 'fön'],
    'parfüm': ['parfüm', 'perfume', 'koku', 'deodorant'],
    
    // Sports & Outdoors
    'spor-giyim': ['spor-giyim', 'sportswear', 'atletik', 'fitness-giyim'],
    'outdoor': ['outdoor', 'kamp', 'doğa', 'yürüyüş', 'dağcılık'],
    'su-sporları': ['su-sporları', 'water-sport', 'yüzme', 'dalış'],
    
    // Books & Media
    'kitap': ['kitap', 'book', 'roman', 'dergi', 'eğitim'],
    'müzik': ['müzik', 'music', 'cd', 'vinyl', 'enstrüman'],
    
    // Toys & Games
    'oyuncak': ['oyuncak', 'toy', 'çocuk', 'bebek', 'oyun'],
    'bebek': ['bebek', 'baby', 'çocuk-giyim', 'mama', 'bez'],
    
    // Health & Medicine
    'sağlık': ['sağlık', 'health', 'vitamin', 'tıbbi', 'medikal'],
    'fitness': ['fitness', 'supplement', 'protein', 'spor-beslenmesi']
  };
  
  const titleLower = title.toLowerCase();
  const urlLower = url.toLowerCase();
  
  // Apply category mappings
  Object.entries(categoryMappings).forEach(([category, keywords]) => {
    keywords.forEach(keyword => {
      if (titleLower.includes(keyword) || urlLower.includes(keyword)) {
        tags.add(category);
        // Add specific keyword as well
        tags.add(keyword.replace(/\s+/g, '-'));
      }
    });
  });
  
  // Material-based tags (direct material names without generic prefixes)
  const materialKeywords = ['pamuk', 'cotton', 'polyester', 'elastan', 'spandex', 'lycra', 'viskon', 'ipek', 'yün', 'keten', 'denim', 'jean', 'plastik', 'metal', 'cam', 'seramik', 'ahşap', 'silikon'];
  features.forEach(feature => {
    if (feature.key.includes('Malzeme') || feature.key.includes('Material') || feature.key.includes('Kumaş') || feature.key.includes('Materyal')) {
      materialKeywords.forEach(keyword => {
        if (feature.value.toLowerCase().includes(keyword)) {
          tags.add(keyword); // Direct material name without "malzeme-" prefix
        }
      });
    }
  });
  
  // Size-based tags (direct size names without generic prefixes)
  const sizeKeywords = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 'tek-beden', 'standart'];
  features.forEach(feature => {
    if (feature.key.includes('Beden') || feature.key.includes('Size')) {
      sizeKeywords.forEach(size => {
        if (feature.value.toLowerCase().includes(size)) {
          tags.add(size); // Direct size name without "beden-" prefix
        }
      });
    }
  });
  
  // Enhanced color-based tags from title (direct color names)
  const colorKeywords = ['beyaz', 'siyah', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahve', 'turuncu', 'lacivert', 'krem', 'bej', 'bordo', 'füme', 'ekru', 'vizon', 'mint', 'pudra'];
  colorKeywords.forEach(color => {
    if (titleLower.includes(color)) {
      tags.add(color); // Only add color as standalone tag
    }
  });
  
  // Season-based tags (direct season names)
  const seasonKeywords = ['yaz', 'kış', 'sonbahar', 'ilkbahar', 'summer', 'winter', 'autumn', 'spring'];
  seasonKeywords.forEach(season => {
    if (titleLower.includes(season) || features.some(f => f.value.toLowerCase().includes(season))) {
      tags.add(season); // Direct season name
    }
  });
  
  // Gender-based tags (direct gender names)
  const genderKeywords = ['kadın', 'erkek', 'unisex', 'woman', 'man', 'women', 'men', 'bayan', 'bay'];
  genderKeywords.forEach(gender => {
    if (titleLower.includes(gender) || urlLower.includes(gender)) {
      tags.add(gender); // Direct gender name
    }
  });
  
  // Style-based tags (direct style names)
  const styleKeywords = ['casual', 'formal', 'spor', 'klasik', 'modern', 'vintage', 'retro', 'minimalist', 'boho', 'chic'];
  styleKeywords.forEach(style => {
    if (titleLower.includes(style)) {
      tags.add(style); // Direct style name
    }
  });
  
  // Usage-based tags (direct usage names)
  const usageKeywords = ['günlük', 'iş', 'parti', 'düğün', 'tatil', 'plaj', 'okul', 'ofis', 'ev', 'spor'];
  usageKeywords.forEach(usage => {
    if (titleLower.includes(usage)) {
      tags.add(usage); // Direct usage name
    }
  });
  
  console.log(`🏷️ Generated ${tags.size} enhanced category-based tags`);
  return Array.from(tags);
}

/**
 * Extract colors from JavaScript variables and JSON data
 */
function extractColorsFromJS($: any, htmlContent: string): string[] {
  const colors: string[] = [];
  
  // Method 1: Extract from script tags containing color data
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // ENHANCED: Priority extraction for L'Oreal patterns first
    const lOrealDirectPatterns = [
      /(901|902|903|904|905)[-\s]*(fair|light|medium|deep|rich)[-\s]*glow/gi,
      /(fair|light|medium|deep|rich)[-\s]*glow/gi,
      /"(901|902|903|904|905)[-\s]*(fair|light|medium|deep|rich)[-\s]*glow"/gi,
      /"(fair|light|medium|deep|rich)[-\s]*glow"/gi
    ];
    
    lOrealDirectPatterns.forEach(pattern => {
      const matches = scriptContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanColor = match.replace(/['"]/g, '').trim();
          if (cleanColor && cleanColor.length > 5) {
            colors.push(cleanColor);
            console.log(`🎨 Found L'Oreal color directly: ${cleanColor}`);
          }
        });
      }
    });
    
    // Standard color extraction patterns
    const colorPatterns = [
      /colors?\s*:\s*\[(.*?)\]/gi,
      /variants?\s*:\s*\[(.*?)color.*?\]/gi,
      /"colors?":\s*\[(.*?)\]/gi,
      /color.*?:\s*["'](.*?)["']/gi,
      /renk.*?:\s*["'](.*?)["']/gi,
      // Trendyol specific patterns
      /"DsmColor":\s*"([^"]+)"/gi,
      /slicingAttributes.*?"DsmColor":\s*"([^"]+)"/gi
    ];
    
    colorPatterns.forEach(pattern => {
      const matches = scriptContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Extract L'Oreal specific colors first
          const lOrealMatch = match.match(/(901|902|903|904|905)[-\s]*(fair|light|medium|deep|rich)[-\s]*glow/gi);
          if (lOrealMatch) {
            lOrealMatch.forEach(lOrealColor => {
              const cleanColor = lOrealColor.trim();
              colors.push(cleanColor);
              console.log(`🎨 Found L'Oreal color in JS: ${cleanColor}`);
            });
          }
          
          // Extract Trendyol DsmColor values
          const dsmColorMatch = match.match(/DsmColor":\s*"([^"]+)"/gi);
          if (dsmColorMatch) {
            dsmColorMatch.forEach(dsmMatch => {
              const colorValue = dsmMatch.match(/"([^"]+)"$/)?.[1];
              if (colorValue) {
                colors.push(colorValue);
                console.log(`🎨 Found DsmColor in JS: ${colorValue}`);
              }
            });
          }
          
          // Extract general color names from the match
          const colorMatch = match.match(/["'](beyaz|siyah|gri|mavi|kırmızı|yeşil|sarı|mor|pembe|kahverengi|turuncu|lacivert|krem|white|black|gray|blue|red|green|yellow|purple|pink|brown|orange|navy|cream|beige|şeffaf|taupe|transparent|clear)["']/gi);
          if (colorMatch) {
            colorMatch.forEach(color => {
              const cleanColor = color.replace(/["']/g, '').trim();
              if (cleanColor.length > 1) {
                colors.push(cleanColor);
                console.log(`🎨 Found color in JS: ${cleanColor}`);
              }
            });
          }
        });
      }
    });
  });
  
  // Method 2: Extract from JSON-LD data
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      // Check for color in offers or variants
      if (jsonData.offers && Array.isArray(jsonData.offers)) {
        jsonData.offers.forEach((offer: any) => {
          if (offer.color) {
            colors.push(offer.color);
            console.log(`🎨 Found color in JSON-LD offer: ${offer.color}`);
          }
        });
      }
      
      // Check for hasVariant array
      if (jsonData.hasVariant && Array.isArray(jsonData.hasVariant)) {
        jsonData.hasVariant.forEach((variant: any) => {
          if (variant.color) {
            colors.push(variant.color);
            console.log(`🎨 Found color in JSON-LD variant: ${variant.color}`);
          }
        });
      }
      
      // Check for product variants in nested structures
      if (jsonData['@graph'] && Array.isArray(jsonData['@graph'])) {
        jsonData['@graph'].forEach((item: any) => {
          if (item.color) {
            colors.push(item.color);
            console.log(`🎨 Found color in JSON-LD graph: ${item.color}`);
          }
          if (item.hasVariant && Array.isArray(item.hasVariant)) {
            item.hasVariant.forEach((variant: any) => {
              if (variant.color) {
                colors.push(variant.color);
                console.log(`🎨 Found color in JSON-LD graph variant: ${variant.color}`);
              }
            });
          }
        });
      }
      
    } catch (e) {
      // Continue silently
    }
  });
  
  // Method 3: Extract from HTML content patterns (enhanced for Trendyol)
  console.log(`🔍 Searching for colors in HTML content...`);
  
  const htmlColorPatterns = [
    /"color":\s*"([^"]+)"/gi,
    /"renk":\s*"([^"]+)"/gi,
    /color['"]\s*:\s*['"]([\w\s\-ğüşöçıİÇÖÜŞĞ]+)['"]/gi,
    /renk['"]\s*:\s*['"]([\w\s\-ğüşöçıİÇÖÜŞĞ]+)['"]/gi,
    /"name":\s*"Renk",\s*"value":\s*"([^"]+)"/gi,
    /"color":\s*"([a-zA-ZğüşöçıİÇÖÜŞĞ]+)-[A-Z0-9]+"/gi,
    /"renk":\s*"([a-zA-ZğüşöçıİÇÖÜŞĞ]+)-[A-Z0-9]+"/gi,
    // NEW: Trendyol specific DsmColor pattern
    /"DsmColor":\s*"([^"]+)"/gi,
    /slicingAttributes.*?"DsmColor":\s*"([^"]+)"/gi,
    // NEW: L'Oreal specific patterns
    /"(901|902|903|904|905)[-\s]*(fair|light|medium|deep|rich)[-\s]*glow"/gi,
    /"(fair|light|medium|deep|rich)[-\s]*glow"/gi,
    /(901|902|903|904|905)[-\s]*(fair|light|medium|deep|rich)[-\s]*glow/gi,
    /(fair|light|medium|deep|rich)[-\s]*glow/gi
  ];
  
  htmlColorPatterns.forEach((pattern, index) => {
    let match;
    let patternMatches = 0;
    // Reset regex lastIndex
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(htmlContent)) !== null) {
      patternMatches++;
      const colorName = match[1].trim();
      console.log(`🔍 Pattern ${index + 1} found potential color: "${colorName}"`);
      
      // Filter for valid color names
      if (colorName && colorName.length > 1 && colorName.length < 50) {
        // Remove color codes like -BG106
        const cleanColor = colorName.replace(/-[A-Z0-9]+$/, '');
        if (cleanColor && cleanColor !== colorName) {
          colors.push(cleanColor);
          console.log(`🎨 Found color in HTML pattern ${index + 1}: ${cleanColor} (from: ${colorName})`);
        } else {
          colors.push(colorName);
          console.log(`🎨 Found color in HTML pattern ${index + 1}: ${colorName}`);
        }
      }
    }
    
    if (patternMatches > 0) {
      console.log(`🔍 Pattern ${index + 1} found ${patternMatches} matches total`);
    }
  });
  
  return Array.from(new Set(colors)); // Remove duplicates
}

/**
 * Extract sizes from JavaScript variables and JSON data
 */
function extractSizesFromJS($: any, htmlContent: string): string[] {
  const sizes: string[] = [];
  
  // Method 1: Extract from script tags containing size data
  $('script').each((_, script) => {
    const scriptContent = $(script).html() || '';
    
    // Look for size arrays in JavaScript
    const sizePatterns = [
      /sizes?\s*:\s*\[(.*?)\]/gi,
      /variants?\s*:\s*\[(.*?)size.*?\]/gi,
      /"sizes?":\s*\[(.*?)\]/gi,
      /size.*?:\s*["'](.*?)["']/gi,
      /beden.*?:\s*["'](.*?)["']/gi
    ];
    
    sizePatterns.forEach(pattern => {
      const matches = scriptContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Extract size values from the match - exclude invalid sizes like "1"
          const sizeMatch = match.match(/["'](XXS|XS|S|M|L|XL|XXL|XXXL|2XL|3XL|4XL|5XL|Tek\s*Beden|One\s*Size|(?:2[4-9]|[3-5][0-9])(?:\.\d+)?|(?:3[6-9]|4[0-9]|5[0-2]))["']/gi);
          if (sizeMatch) {
            sizeMatch.forEach(size => {
              const cleanSize = size.replace(/["']/g, '').trim();
              // Ek güvenlik: "1" gibi geçersiz bedenler engelle
              if (cleanSize.length > 0 && cleanSize !== '1' && cleanSize !== '0') {
                sizes.push(cleanSize);
                console.log(`👕 Found size in JS: ${cleanSize}`);
              }
            });
          }
        });
      }
    });
  });
  
  // Method 2: Extract from JSON-LD data
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      // Check for size in offers or variants
      if (jsonData.offers && Array.isArray(jsonData.offers)) {
        jsonData.offers.forEach((offer: any) => {
          if (offer.size || offer.Size) {
            const size = offer.size || offer.Size;
            sizes.push(size);
            console.log(`👕 Found size in JSON-LD offer: ${size}`);
          }
        });
      }
      
      // Check for hasVariant array
      if (jsonData.hasVariant && Array.isArray(jsonData.hasVariant)) {
        jsonData.hasVariant.forEach((variant: any) => {
          if (variant.size || variant.Size) {
            const size = variant.size || variant.Size;
            // Virgülle ayrılmış string kontrolü
            if (typeof size === 'string' && size.includes(',')) {
              const splitSizes = size.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0 && s !== '1' && s !== '0');
              splitSizes.forEach((s: string) => {
                sizes.push(s);
                console.log(`👕 Found size in JSON-LD variant: ${s}`);
              });
            } else if (typeof size === 'string' && size !== '1' && size !== '0') {
              sizes.push(size);
              console.log(`👕 Found size in JSON-LD variant: ${size}`);
            }
          }
        });
      }
      
      // Check for product variants in nested structures
      if (jsonData['@graph'] && Array.isArray(jsonData['@graph'])) {
        jsonData['@graph'].forEach((item: any) => {
          if (item.size || item.Size) {
            const size = item.size || item.Size;
            sizes.push(size);
            console.log(`👕 Found size in JSON-LD graph: ${size}`);
          }
          if (item.hasVariant && Array.isArray(item.hasVariant)) {
            item.hasVariant.forEach((variant: any) => {
              if (variant.size || variant.Size) {
                const size = variant.size || variant.Size;
                sizes.push(size);
                console.log(`👕 Found size in JSON-LD graph variant: ${size}`);
              }
            });
          }
        });
      }
      
    } catch (e) {
      // Continue silently
    }
  });
  
  // Method 3: Extract from HTML content patterns (enhanced for Trendyol)
  const htmlSizePatterns = [
    /"size":\s*"([^"]+)"/gi,
    /"beden":\s*"([^"]+)"/gi,
    /size['"]\s*:\s*['"]([\w\s\-]+)['"]/gi,
    /beden['"]\s*:\s*['"]([\w\s\-]+)['"]/gi,
    /"name":\s*"Beden",\s*"value":\s*"([^"]+)"/gi
  ];
  
  htmlSizePatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const sizeName = match[1].trim();
      // Filter for valid size names
      if (sizeName && sizeName.length > 0 && sizeName.length < 10) {
        const sizePattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|\d+(\.\d+)?|Tek\s*Beden|One\s*Size)$/i;
        if (sizePattern.test(sizeName)) {
          sizes.push(sizeName);
          console.log(`👕 Found size in HTML pattern: ${sizeName}`);
        }
      }
    }
  });
  
  return Array.from(new Set(sizes)); // Remove duplicates
}



/**
 * Get color code for a color name
 */
function getColorCode(colorName: string): string {
  // IMPORTANT: Keep original color names without translation
  // Only provide hex codes for specific L'Oreal patterns and basic colors
  const colorMap: Record<string, string> = {
    // L'Oreal Glotion specific color codes (keep original patterns)
    '901-FAIR-GLOW': '#F5E6D3',
    '902-LIGHT-GLOW': '#E8D7C2', 
    '903-MEDIUM-GLOW': '#D4C0A1',
    '904-DEEP-GLOW': '#C0A888',
    '905-RICH-GLOW': '#B39670',
    'LIGHT-GLOW': '#E8D7C2',
    'FAIR-GLOW': '#F5E6D3',
    'MEDIUM-GLOW': '#D4C0A1',
    'DEEP-GLOW': '#C0A888',
    'RICH-GLOW': '#B39670'
  };
  
  // Handle with case-insensitive lookup
  const upperColor = colorName.toUpperCase();
  
  // Direct match first for L'Oreal patterns
  if (colorMap[upperColor]) {
    return colorMap[upperColor];
  }
  
  // Try to match L'Oreal patterns with flexible formatting
  if (upperColor.match(/^(901|902|903|904|905)[\s\-]*(FAIR|LIGHT|MEDIUM|DEEP|RICH)[\s\-]*GLOW$/)) {
    return colorMap[upperColor.replace(/[\s]+/g, '-')] || '#E8D7C2';
  }
  
  // Fallback: return original color if it looks like a hex code
  if (colorName.startsWith('#') && colorName.length === 7) {
    return colorName;
  }
  
  // Default: generate a simple color based on first letter to avoid generic blue
  const firstChar = colorName.charAt(0).toLowerCase();
  const colorHues: Record<string, string> = {
    'a': '#E8D7C2', 'b': '#F5E6D3', 'c': '#D4C0A1', 'd': '#C0A888',
    'e': '#B39670', 'f': '#F5E6D3', 'g': '#E8D7C2', 'h': '#D4C0A1',
    'i': '#C0A888', 'j': '#B39670', 'k': '#F5E6D3', 'l': '#E8D7C2',
    'm': '#D4C0A1', 'n': '#C0A888', 'o': '#B39670', 'p': '#F5E6D3',
    'q': '#E8D7C2', 'r': '#D4C0A1', 's': '#C0A888', 't': '#B39670',
    'u': '#F5E6D3', 'v': '#E8D7C2', 'w': '#D4C0A1', 'x': '#C0A888',
    'y': '#B39670', 'z': '#F5E6D3'
  };
  
  return colorHues[firstChar] || '#E8D7C2';
}