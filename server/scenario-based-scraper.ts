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
    
    // If no variants found, try direct extraction methods
    if (variants.length === 0) {
      console.log('🔄 No variants from scenario extraction, trying direct methods...');
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
  console.log('🖼️ ENHANCED IMAGE EXTRACTION - Extracting ALL product images...');
  
  // Method 1: Comprehensive CDN regex extraction
  const cdnPatterns = [
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpeg/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.png/g,
    /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.webp/g
  ];
  
  const cdnImages: string[] = [];
  cdnPatterns.forEach(pattern => {
    const matches = htmlContent.match(pattern) || [];
    cdnImages.push(...matches);
  });
  
  console.log(`🔍 CDN patterns found ${cdnImages.length} total images`);
  
  // Method 2: Comprehensive DOM extraction
  const domImages: string[] = [];
  const allImageSelectors = [
    // Product gallery selectors
    'img[src*="cdn.dsmcdn.com"]',
    'img[data-src*="cdn.dsmcdn.com"]',
    'img[data-original*="cdn.dsmcdn.com"]',
    'img[data-lazy*="cdn.dsmcdn.com"]',
    'img[data-zoom*="cdn.dsmcdn.com"]',
    
    // Style and background selectors
    '[style*="cdn.dsmcdn.com"]',
    '[data-background*="cdn.dsmcdn.com"]',
    
    // Variant and color images
    '.variant-image img',
    '.color-variant img',
    '.size-variant img',
    
    // Product gallery specific
    '.product-gallery img',
    '.gallery-item img',
    '.product-photos img',
    '.image-gallery img',
    
    // Thumbnail galleries
    '.thumbnail-gallery img',
    '.product-thumbs img',
    '.thumb-gallery img',
    
    // Modern Trendyol selectors
    '[data-testid*="image"] img',
    '[data-testid*="gallery"] img',
    '[data-testid*="photo"] img'
  ];
  
  allImageSelectors.forEach(selector => {
    $(selector).each((_, el) => {
      const $el = $(el);
      
      // Extract from various attributes
      const sources = [
        $el.attr('src'),
        $el.attr('data-src'),
        $el.attr('data-original'),
        $el.attr('data-lazy'),
        $el.attr('data-zoom'),
        $el.attr('data-background')
      ];
      
      sources.forEach(src => {
        if (src && src.includes('cdn.dsmcdn.com')) {
          domImages.push(src);
        }
      });
      
      // Extract from style attributes
      const style = $el.attr('style') || '';
      const backgroundMatches = style.match(/url\(['"]?(https:\/\/cdn\.dsmcdn\.com[^'"]*\.(jpg|jpeg|png|webp))/g);
      if (backgroundMatches) {
        backgroundMatches.forEach(match => {
          const urlMatch = match.match(/https:\/\/cdn\.dsmcdn\.com[^'"]*\.(jpg|jpeg|png|webp)/);
          if (urlMatch) {
            domImages.push(urlMatch[0]);
          }
        });
      }
    });
  });
  
  console.log(`🖼️ DOM extraction found ${domImages.length} images`);
  
  // Method 3: Enhanced JSON-LD extraction
  const jsonImages: string[] = [];
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      
      // Extract from image field
      if (jsonData.image) {
        const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image];
        images.forEach(img => {
          if (typeof img === 'string' && img.includes('cdn.dsmcdn.com')) {
            jsonImages.push(img);
          } else if (typeof img === 'object' && img.url && img.url.includes('cdn.dsmcdn.com')) {
            jsonImages.push(img.url);
          }
        });
      }
      
      // Extract from product variants
      if (jsonData.hasVariant) {
        jsonData.hasVariant.forEach((variant: any) => {
          if (variant.image) {
            const variantImages = Array.isArray(variant.image) ? variant.image : [variant.image];
            variantImages.forEach(img => {
              if (typeof img === 'string' && img.includes('cdn.dsmcdn.com')) {
                jsonImages.push(img);
              }
            });
          }
        });
      }
      
      // Extract from offers
      if (jsonData.offers && jsonData.offers.image) {
        const offerImages = Array.isArray(jsonData.offers.image) ? jsonData.offers.image : [jsonData.offers.image];
        offerImages.forEach(img => {
          if (typeof img === 'string' && img.includes('cdn.dsmcdn.com')) {
            jsonImages.push(img);
          }
        });
      }
      
    } catch (e) {
      // Continue
    }
  });
  
  console.log(`📋 JSON-LD extraction found ${jsonImages.length} images`);
  
  // Method 4: Pattern variations discovery
  const patternImages: string[] = [];
  const baseImages = [...new Set([...cdnImages, ...domImages, ...jsonImages])];
  
  baseImages.forEach(img => {
    if (img.includes('_org_zoom.jpg')) {
      // Generate all possible variations
      const base = img.replace('_org_zoom.jpg', '');
      const variations = [
        base + '_org_zoom.jpg',
        base + '.jpg',
        base + '_org.jpg',
        base + '_zoom.jpg',
        base + '_large.jpg',
        base + '_medium.jpg'
      ];
      
      variations.forEach(variation => {
        if (!patternImages.includes(variation)) {
          patternImages.push(variation);
        }
      });
    }
  });
  
  console.log(`🔄 Pattern discovery generated ${patternImages.length} variations`);
  
  // Combine all methods
  const allImages = [...cdnImages, ...domImages, ...jsonImages, ...patternImages];
  const uniqueImages = [...new Set(allImages)]
    .filter(img => {
      // Enhanced filtering for product images only
      if (!img.includes('cdn.dsmcdn.com')) return false;
      if (!img.includes('prod/') && !img.includes('ty')) return false;
      
      // Exclude non-product images
      const excludePatterns = [
        '_thumb',
        '_small',
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
        'common',
        'web/'
      ];
      
      for (const pattern of excludePatterns) {
        if (img.toLowerCase().includes(pattern)) {
          return false;
        }
      }
      
      return true;
    })
    .map(img => {
      // Optimize for high quality
      let optimized = img;
      
      // Ensure high resolution
      if (!optimized.includes('_org_zoom') && !optimized.includes('mnresize')) {
        optimized = optimized.replace(/\.(jpg|jpeg)$/, '_org_zoom.$1');
      }
      
      // Ensure HTTPS
      optimized = optimized.replace(/^http:/, 'https:');
      
      return optimized;
    });
  
  console.log(`✅ FINAL IMAGE EXTRACTION: ${uniqueImages.length} unique high-quality product images`);
  
  // Return more images for comprehensive coverage
  return uniqueImages.slice(0, 25); // Increased from 15 to 25 images
}

async function extractFeaturesAdvanced($: cheerio.CheerioAPI, htmlContent: string, url: string): Promise<Array<{key: string, value: string}>> {
  console.log('🎯 SIMPLIFIED feature extraction starting (server-safe)...');
  
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
  
  // Simplified server-safe feature extraction (avoiding problematic functions)
  console.log('✅ Using simplified server-safe feature extraction approach');
  
  // Remove duplicates and clean up
  const uniqueFeatures = features.filter((feature, index, self) => 
    index === self.findIndex(f => f.key === feature.key)
  );
  
  console.log(`✅ COMPREHENSIVE feature extraction found ${uniqueFeatures.length} unique features`);
  return uniqueFeatures.slice(0, 50); // Increased limit to 50 comprehensive features
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
  
  // Basic tags
  tags.add('import');
  tags.add('trendyol');
  tags.add('otomatik');
  
  // Brand-based tags
  if (brand && brand !== 'Brand') {
    tags.add(brand.toLowerCase().replace(/\s+/g, '-'));
    tags.add(`marka-${brand.toLowerCase().replace(/\s+/g, '-')}`);
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
  
  // Material-based tags
  const materialKeywords = ['pamuk', 'cotton', 'polyester', 'elastan', 'spandex', 'lycra', 'viskon', 'ipek', 'yün', 'keten', 'denim', 'jean'];
  features.forEach(feature => {
    if (feature.key.includes('Malzeme') || feature.key.includes('Material') || feature.key.includes('Kumaş')) {
      materialKeywords.forEach(keyword => {
        if (feature.value.toLowerCase().includes(keyword)) {
          tags.add(`malzeme-${keyword}`);
        }
      });
    }
  });
  
  // Size-based tags
  const sizeKeywords = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl', 'tek-beden', 'standart'];
  features.forEach(feature => {
    if (feature.key.includes('Beden') || feature.key.includes('Size')) {
      sizeKeywords.forEach(size => {
        if (feature.value.toLowerCase().includes(size)) {
          tags.add(`beden-${size}`);
        }
      });
    }
  });
  
  // Enhanced color-based tags from title
  const colorKeywords = ['beyaz', 'siyah', 'mavi', 'kırmızı', 'yeşil', 'sarı', 'mor', 'pembe', 'gri', 'kahve', 'turuncu', 'lacivert', 'krem', 'bej', 'bordo', 'füme', 'ekru', 'vizon', 'mint', 'pudra'];
  colorKeywords.forEach(color => {
    if (titleLower.includes(color)) {
      tags.add(`renk-${color}`);
      tags.add(color); // Add color as standalone tag
    }
  });
  
  // Season-based tags
  const seasonKeywords = ['yaz', 'kış', 'sonbahar', 'ilkbahar', 'summer', 'winter', 'autumn', 'spring'];
  seasonKeywords.forEach(season => {
    if (titleLower.includes(season) || features.some(f => f.value.toLowerCase().includes(season))) {
      tags.add(`sezon-${season}`);
    }
  });
  
  // Gender-based tags
  const genderKeywords = ['kadın', 'erkek', 'unisex', 'woman', 'man', 'women', 'men', 'bayan', 'bay'];
  genderKeywords.forEach(gender => {
    if (titleLower.includes(gender) || urlLower.includes(gender)) {
      tags.add(`cinsiyet-${gender}`);
    }
  });
  
  // Style-based tags
  const styleKeywords = ['casual', 'formal', 'spor', 'klasik', 'modern', 'vintage', 'retro', 'minimalist', 'boho', 'chic'];
  styleKeywords.forEach(style => {
    if (titleLower.includes(style)) {
      tags.add(`stil-${style}`);
    }
  });
  
  // Usage-based tags
  const usageKeywords = ['günlük', 'iş', 'parti', 'düğün', 'tatil', 'plaj', 'okul', 'ofis', 'ev', 'spor'];
  usageKeywords.forEach(usage => {
    if (titleLower.includes(usage)) {
      tags.add(`kullanim-${usage}`);
    }
  });
  
  console.log(`🏷️ Generated ${tags.size} enhanced category-based tags`);
  return Array.from(tags);
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