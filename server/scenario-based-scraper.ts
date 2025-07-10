/**
 * Scenario-Based Scraper - Main Integration Point
 * Routes extraction through appropriate scenario-based handlers
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScenarioManager, ExtractionScenario } from './scenario-manager';
import { ScenarioExtractors } from './scenario-extractors';

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
    
    // Step 1: Fetch the page content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 30000
    });
    
    const htmlContent = response.data;
    const $ = cheerio.load(htmlContent);
    
    console.log(`📄 HTML content loaded: ${htmlContent.length} characters`);
    
    // Step 2: Extract basic information
    const title = extractTitle($);
    const brand = extractBrand(url);
    const price = extractPrice($, htmlContent);
    const images = await extractImagesAdvanced($, htmlContent, url);
    const features = await extractFeaturesAdvanced($, htmlContent, url);
    
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
    
    // If no variants found, try direct extraction methods
    if (variants.length === 0) {
      console.log('🔄 No variants from scenario extraction, trying direct methods...');
      variants = await extractVariantsDirect($, htmlContent);
    }
    
    console.log(`✅ Scenario-based extraction completed: ${variants.length} variants found`);
    
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

async function extractImagesAdvanced($: cheerio.CheerioAPI, htmlContent: string, url: string): Promise<string[]> {
  console.log('🖼️ Advanced image extraction starting...');
  
  // Method 1: Extract all CDN images with regex
  const cdnImageMatches = htmlContent.match(/https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g) || [];
  const cdnImages = [...new Set(cdnImageMatches)]; // Remove duplicates
  console.log(`🔍 CDN regex found ${cdnImages.length} images`);
  
  // Method 2: Enhanced DOM selectors
  const domImages: string[] = [];
  const imageSelectors = [
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    '[style*="cdn.dsmcdn.com"]',
    '[data-original*="cdn.dsmcdn.com"]'
  ];
  
  imageSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src') || $el.attr('data-original');
      const style = $el.attr('style') || '';
      
      if (src && src.includes('cdn.dsmcdn.com')) {
        domImages.push(src);
      }
      
      // Extract from style background-image
      const styleMatch = style.match(/url\(['"]?(https:\/\/cdn\.dsmcdn\.com[^'"]*\.jpg)/);
      if (styleMatch) {
        domImages.push(styleMatch[1]);
      }
    });
  });
  
  console.log(`🖼️ DOM selectors found ${domImages.length} images`);
  
  // Method 3: JSON-LD structured data
  const jsonImages: string[] = [];
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      if (jsonData.image) {
        const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
        images.forEach(img => {
          if (typeof img === 'string' && img.includes('cdn.dsmcdn.com')) {
            jsonImages.push(img);
          }
        });
      }
    } catch (e) {
      // Continue
    }
  });
  
  console.log(`📋 JSON-LD found ${jsonImages.length} images`);
  
  // Combine all methods and filter
  const allImages = [...cdnImages, ...domImages, ...jsonImages];
  const uniqueImages = [...new Set(allImages)]
    .filter(img => 
      img.includes('cdn.dsmcdn.com') && 
      img.includes('prod/') &&
      !img.includes('_thumb') &&
      !img.includes('_small')
    )
    .map(img => {
      // Convert to high quality version
      return img.replace(/\/(small|medium|thumb)\//, '/mnresize/620/920/');
    });
  
  console.log(`✅ Final processed images: ${uniqueImages.length}`);
  return uniqueImages.slice(0, 15); // Limit to 15 images
}

async function extractFeaturesAdvanced($: cheerio.CheerioAPI, htmlContent: string, url: string): Promise<Array<{key: string, value: string}>> {
  console.log('🎯 Advanced feature extraction starting...');
  
  const features: Array<{key: string, value: string}> = [];
  
  // Method 1: Product attributes table - Enhanced selectors
  const attributeSelectors = [
    '.product-attributes tr',
    '.product-details tr', 
    '.attribute-row',
    '.product-property-row',
    '.spec-table tr',
    '.feature-table tr',
    '.detail-table tr',
    '.properties-table tr'
  ];
  
  attributeSelectors.forEach(selector => {
    $(selector).each((_, row) => {
      const $row = $(row);
      const key = $row.find('td:first-child, .attribute-name, .detail-name, .property-name, .spec-name').text().trim();
      const value = $row.find('td:last-child, .attribute-value, .detail-value, .property-value, .spec-value').text().trim();
      
      if (key && value && key !== value && key.length > 1 && value.length > 1) {
        features.push({ key, value });
      }
    });
  });
  
  // Method 2: JSON-LD product data - Enhanced extraction
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      // Basic product info
      if (jsonData.brand) {
        features.push({ key: 'Marka', value: jsonData.brand.name || jsonData.brand });
      }
      if (jsonData.category) {
        features.push({ key: 'Kategori', value: jsonData.category });
      }
      if (jsonData.model) {
        features.push({ key: 'Model', value: jsonData.model });
      }
      if (jsonData.description) {
        features.push({ key: 'Açıklama', value: jsonData.description.substring(0, 300) });
      }
      if (jsonData.sku) {
        features.push({ key: 'SKU', value: jsonData.sku });
      }
      if (jsonData.gtin) {
        features.push({ key: 'GTIN', value: jsonData.gtin });
      }
      if (jsonData.mpn) {
        features.push({ key: 'MPN', value: jsonData.mpn });
      }
      
      // Product features from JSON-LD
      if (jsonData.additionalProperty) {
        jsonData.additionalProperty.forEach((prop: any) => {
          if (prop.name && prop.value) {
            features.push({ key: prop.name, value: prop.value });
          }
        });
      }
      
      // Product offers
      if (jsonData.offers && jsonData.offers.availability) {
        features.push({ key: 'Stok Durumu', value: jsonData.offers.availability });
      }
      
    } catch (e) {
      // Continue
    }
  });
  
  // Method 3: Meta properties - Enhanced
  const metaProps = [
    { selector: 'meta[property="product:brand"]', key: 'Marka' },
    { selector: 'meta[property="product:category"]', key: 'Kategori' },
    { selector: 'meta[property="product:condition"]', key: 'Durum' },
    { selector: 'meta[property="product:price:amount"]', key: 'Fiyat' },
    { selector: 'meta[property="product:price:currency"]', key: 'Para Birimi' },
    { selector: 'meta[name="description"]', key: 'Meta Açıklama' },
    { selector: 'meta[name="keywords"]', key: 'Anahtar Kelimeler' }
  ];
  
  metaProps.forEach(({ selector, key }) => {
    const content = $(selector).attr('content');
    if (content && content.trim()) {
      features.push({ key, value: content.trim() });
    }
  });
  
  // Method 4: Product detail sections - Enhanced
  const detailSelectors = [
    '.product-detail-section',
    '.product-info-section', 
    '.product-description',
    '.product-specifications',
    '.product-features-section',
    '.product-properties'
  ];
  
  detailSelectors.forEach(selector => {
    $(selector).each((_, section) => {
      const $section = $(section);
      const title = $section.find('h3, h4, h5, .section-title, .detail-title').text().trim();
      const content = $section.find('p, .section-content, .detail-content').text().trim();
      
      if (title && content && content.length > 5) {
        features.push({ key: title, value: content.substring(0, 250) });
      }
    });
  });
  
  // Method 5: Specification lists - Enhanced
  const specSelectors = [
    '.spec-list li',
    '.feature-list li', 
    '.product-features li',
    '.attributes-list li',
    '.properties-list li',
    '.details-list li'
  ];
  
  specSelectors.forEach(selector => {
    $(selector).each((_, item) => {
      const text = $(item).text().trim();
      const parts = text.split(':');
      if (parts.length === 2) {
        features.push({ 
          key: parts[0].trim(), 
          value: parts[1].trim() 
        });
      }
    });
  });
  
  // Method 6: Data attributes from HTML
  $('[data-product-property], [data-feature], [data-attribute]').each((_, el) => {
    const $el = $(el);
    const key = $el.attr('data-property-name') || $el.attr('data-feature-name') || $el.attr('data-attribute-name');
    const value = $el.attr('data-property-value') || $el.attr('data-feature-value') || $el.attr('data-attribute-value') || $el.text().trim();
    
    if (key && value && key.length > 1 && value.length > 1) {
      features.push({ key, value });
    }
  });
  
  // Method 7: Extract from HTML content patterns
  const contentPatterns = [
    /([A-Za-zÇĞİÖŞÜçğıöşü\s]+):\s*([A-Za-z0-9ÇĞİÖŞÜçğıöşü\s%.,'-]+)/g,
    /([A-Za-zÇĞİÖŞÜçğıöşü\s]+):\s*([A-Za-z0-9ÇĞİÖŞÜçğıöşü\s%.,'-]+)/g
  ];
  
  const bodyText = $.text();
  contentPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(bodyText)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      
      if (key.length > 2 && value.length > 2 && key.length < 50 && value.length < 200) {
        features.push({ key, value });
      }
    }
  });
  
  // Remove duplicates and clean up
  const uniqueFeatures = features.filter((feature, index, self) => 
    index === self.findIndex(f => f.key === feature.key)
  );
  
  console.log(`✅ Advanced feature extraction found ${uniqueFeatures.length} unique features`);
  return uniqueFeatures.slice(0, 30); // Increased limit to 30 features
}

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
  
  // Method 1: Extract colors from color selector elements
  const colors: string[] = [];
  $('.color-option, .variant-color, [data-testid*="color"]').each((_, el) => {
    const $el = $(el);
    const colorName = $el.attr('title') || $el.attr('alt') || $el.text().trim();
    if (colorName && colorName.length > 0) {
      colors.push(colorName);
    }
  });
  
  // Method 2: Extract sizes from size selector elements
  const sizes: string[] = [];
  $('button[data-testid*="size"], .size-option, .variant-size').each((_, el) => {
    const $el = $(el);
    const sizeName = $el.text().trim() || $el.attr('title') || $el.attr('data-size');
    const isDisabled = $el.is('[disabled]') || $el.hasClass('disabled') || $el.hasClass('out-of-stock');
    
    if (sizeName && sizeName.length > 0 && !isDisabled) {
      sizes.push(sizeName);
    }
  });
  
  console.log(`🎨 Direct extraction - Colors: ${colors.length}, Sizes: ${sizes.length}`);
  
  // Build variants
  if (colors.length > 0 && sizes.length > 0) {
    // Multi-variant product
    colors.forEach(color => {
      sizes.forEach(size => {
        variants.push({
          color: color,
          colorCode: getColorCode(color),
          size: size,
          inStock: true
        });
      });
    });
  } else if (colors.length > 0) {
    // Color variants only
    colors.forEach(color => {
      variants.push({
        color: color,
        colorCode: getColorCode(color),
        size: 'Standart',
        inStock: true
      });
    });
  } else if (sizes.length > 0) {
    // Size variants only
    sizes.forEach(size => {
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