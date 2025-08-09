/**
 * Scenario-Based Scraper - Main Integration Point
 * Routes extraction through appropriate scenario-based handlers
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScenarioManager, ExtractionScenario } from './scenario-manager';
import { ScenarioExtractors } from './scenario-extractors';
import { ImageDeduplicator, extractEnhancedFeatures, extractEnhancedVariants } from './improved-image-deduplicator';

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
    
    // If no variants found, try enhanced extraction methods
    if (variants.length === 0) {
      console.log('🔄 No variants from scenario extraction, trying enhanced methods...');
      variants = extractEnhancedVariants($, htmlContent);
    }
    
    // Additional fallback: Try direct DOM extraction
    if (variants.length === 0) {
      console.log('🔄 No variants from enhanced extraction, trying direct DOM extraction...');
      variants = await extractVariantsDirect($, htmlContent);
    }
    
    // Step 6: Generate advanced tags based on all extracted data
    const advancedTags = generateAdvancedTags(title, brand, features, url);
    
    console.log(`✅ Scenario-based extraction completed: ${variants.length} variants, ${images.length} images, ${features.length} features, ${advancedTags.length} tags`);
    
    return {
      success: true,
      scenario: detection.scenario,
      confidence: detection.confidence,
      title,
      brand,
      price,
      images,
      features,
      variants,
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
      variants: [],
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
        const finalPrice = Math.round(originalPrice * 1.15); // 15% profit
        
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
  
  // Fallback to HTML parsing
  const priceSelectors = ['.price', '.current-price', '.sale-price'];
  for (const selector of priceSelectors) {
    const priceElement = $(selector).first();
    if (priceElement.length) {
      const priceText = priceElement.text().replace(/[^\d,]/g, '').replace(',', '.');
      const price = parseFloat(priceText);
      if (!isNaN(price)) {
        const finalPrice = Math.round(price * 1.15);
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
  
  // Try to extract features from various selectors
  $('.product-feature, .feature-item, .specification').each((i: number, el: any) => {
    const key = $(el).find('.feature-key, .spec-key').text().trim();
    const value = $(el).find('.feature-value, .spec-value').text().trim();
    
    if (key && value) {
      features.push({ key, value });
    }
  });
  
  console.log(`✅ Features extracted: ${features.length}`);
  return features;
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
  
  // Modern Trendyol color selectors
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
    'div[data-testid*="color-variant"]'
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
  
  // Method 2: Enhanced size extraction with modern Trendyol selectors  
  const sizes: string[] = [];
  
  // Modern Trendyol size selectors
  const sizeSelectors = [
    '[data-testid*="size"] button',
    '[data-testid*="variant"] button',
    '.variants-size button',
    '.product-variants .size-item',
    '.variant-buttons button[data-size]',
    '.size-selector button',
    '.product-size-options button',
    'button[data-size]',
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
      const isDisabled = $el.is('[disabled]') || $el.hasClass('disabled') || 
                        $el.hasClass('out-of-stock') || $el.hasClass('sold-out');
      
      if (sizeName && sizeName.length > 0 && sizeName.length < 10 && !isDisabled) {
        // Filter out obvious non-size values
        const sizePattern = /^(XXS|XS|S|M|L|XL|XXL|XXXL|\d+(\.\d+)?|Tek\s*Beden|One\s*Size)$/i;
        if (sizePattern.test(sizeName.trim())) {
          sizes.push(sizeName.trim());
          console.log(`👕 Found size via selector "${selector}": ${sizeName}`);
        }
      }
    });
  });
  
  // Method 3: Extract from JavaScript variables and JSON data
  const jsonExtractedColors = extractColorsFromJS($, htmlContent);
  const jsonExtractedSizes = extractSizesFromJS($, htmlContent);
  
  // Combine all found colors and sizes
  const allColors = Array.from(new Set([...colors, ...jsonExtractedColors]));
  const allSizes = Array.from(new Set([...sizes, ...jsonExtractedSizes]));
  
  console.log(`🎨 Direct extraction - Colors: ${allColors.length}, Sizes: ${allSizes.length}`);
  console.log(`🎨 Final colors: [${allColors.join(', ')}]`);
  console.log(`👕 Final sizes: [${allSizes.join(', ')}]`);
  
  // Build variants
  if (allColors.length > 0 && allSizes.length > 0) {
    // Multi-variant product
    allColors.forEach(color => {
      allSizes.forEach(size => {
        variants.push({
          color: color,
          colorCode: getColorCode(color),
          size: size,
          inStock: true
        });
      });
    });
  } else if (allColors.length > 0) {
    // Color variants only
    allColors.forEach(color => {
      variants.push({
        color: color,
        colorCode: getColorCode(color),
        size: 'Standart',
        inStock: true
      });
    });
  } else if (allSizes.length > 0) {
    // Size variants only
    allSizes.forEach(size => {
      variants.push({
        color: 'Varsayılan',
        colorCode: '#CCCCCC',
        size: size,
        inStock: true
      });
    });
  }
  
  console.log(`✅ Direct extraction generated ${variants.length} variants`);
  return variants;
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
    
    // Look for color arrays in JavaScript
    const colorPatterns = [
      /colors?\s*:\s*\[(.*?)\]/gi,
      /variants?\s*:\s*\[(.*?)color.*?\]/gi,
      /"colors?":\s*\[(.*?)\]/gi,
      /color.*?:\s*["'](.*?)["']/gi,
      /renk.*?:\s*["'](.*?)["']/gi
    ];
    
    colorPatterns.forEach(pattern => {
      const matches = scriptContent.match(pattern);
      if (matches) {
        matches.forEach(match => {
          // Extract color names from the match
          const colorMatch = match.match(/["'](beyaz|siyah|gri|mavi|kırmızı|yeşil|sarı|mor|pembe|kahverengi|turuncu|lacivert|krem|bej|white|black|gray|blue|red|green|yellow|purple|pink|brown|orange|navy|cream|beige)["']/gi);
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
      
    } catch (e) {
      // Continue silently
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
          // Extract size values from the match
          const sizeMatch = match.match(/["'](XXS|XS|S|M|L|XL|XXL|XXXL|\d+(\.\d+)?|Tek\s*Beden|One\s*Size)["']/gi);
          if (sizeMatch) {
            sizeMatch.forEach(size => {
              const cleanSize = size.replace(/["']/g, '').trim();
              if (cleanSize.length > 0) {
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
            sizes.push(size);
            console.log(`👕 Found size in JSON-LD variant: ${size}`);
          }
        });
      }
      
    } catch (e) {
      // Continue silently
    }
  });
  
  return Array.from(new Set(sizes)); // Remove duplicates
}

/**
 * Get color code for a color name
 */
function getColorCode(colorName: string): string {
  const colorMap: Record<string, string> = {
    'BEYAZ': '#FFFFFF',
    'SİYAH': '#000000',
    'MAVİ': '#0000FF',
    'KIRMIZI': '#FF0000',
    'YEŞİL': '#008000',
    'SARI': '#FFFF00',
    'MOR': '#800080',
    'PEMBE': '#FFC0CB',
    'GRİ': '#808080',
    'KAHVE': '#8B4513',
    'TURUNCU': '#FFA500',
    'LACİVERT': '#000080',
    'KREM': '#F5F5DC',
    'BEJ': '#F5F5DC',
    'WHITE': '#FFFFFF',
    'BLACK': '#000000',
    'BLUE': '#0000FF',
    'RED': '#FF0000',
    'GREEN': '#008000',
    'YELLOW': '#FFFF00',
    'PURPLE': '#800080',
    'PINK': '#FFC0CB',
    'GRAY': '#808080',
    'BROWN': '#8B4513',
    'ORANGE': '#FFA500',
    'NAVY': '#000080',
    'CREAM': '#F5F5DC',
    'BEIGE': '#F5F5DC'
  };
  
  return colorMap[colorName.toUpperCase()] || '#1E40AF';
}