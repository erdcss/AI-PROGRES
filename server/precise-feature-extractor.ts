/**
 * Precise Feature Extractor
 * En doğru ürün özelliklerini çıkarmak için optimize edilmiş sistem
 */

import * as cheerio from 'cheerio';

interface ProductFeature {
  key: string;
  value: string;
  confidence: number;
  source: string;
}

interface PreciseExtractionResult {
  success: boolean;
  url: string;
  features: ProductFeature[];
  extractionMethod: string;
  processingTime: number;
  htmlSize: number;
  error?: string;
}

export async function preciseFeatureExtraction(url: string): Promise<PreciseExtractionResult> {
  const startTime = Date.now();
  console.log(`🎯 Precise feature extraction starting: ${url}`);
  
  try {
    // HTTP request with proper headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const htmlContent = await response.text();
    const $ = cheerio.load(htmlContent);
    const features: ProductFeature[] = [];
    
    console.log('\n🎯 PRECISE FEATURE EXTRACTION (Clean Scraper Based):\n');
    
    // Use Clean Scraper for maximum accuracy
    // Manual extraction produces irrelevant features like "kumaş kaplı sandalyeler" for Stanley thermos
    console.log('🔧 Using Clean Scraper method for accurate feature detection...');
    
    try {
      const { enhancedTrendyolScraper } = await import('./enhanced-trendyol-scraper');
      const cleanResult = await enhancedTrendyolScraper(url);
      
      if (cleanResult.success && cleanResult.features) {
        console.log(`✅ Clean Scraper found ${cleanResult.features.length} accurate features`);
        
        // Convert to PreciseFeature format with high confidence
        cleanResult.features.forEach(feature => {
          features.push({
            key: feature.key,
            value: feature.value,
            confidence: 0.95, // High confidence for Clean Scraper
            source: 'clean-scraper-precise'
          });
        });
      } else {
        console.log('⚠️ Clean Scraper failed, using fallback methods...');
        
        // Fallback to targeted extraction only if Clean Scraper fails
        extractFromAttributeTables($, features);
        extractFromDetailSections($, features);
      }
    } catch (error) {
      console.log(`⚠️ Clean Scraper import failed: ${error.message}, using fallback...`);
      extractFromAttributeTables($, features);
    }
    
    // Clean and deduplicate features
    const cleanFeatures = cleanAndDeduplicateFeatures(features);
    
    const processingTime = Date.now() - startTime;
    console.log(`\n✅ Precise extraction completed: ${cleanFeatures.length} accurate features (${processingTime}ms)`);
    
    return {
      success: true,
      url: url,
      features: cleanFeatures,
      extractionMethod: 'precise-targeted',
      processingTime: processingTime,
      htmlSize: htmlContent.length
    };
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ Precise extraction error:', error);
    
    return {
      success: false,
      url: url,
      features: [],
      extractionMethod: 'precise-targeted',
      processingTime: processingTime,
      htmlSize: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function extractFromJsonLD($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  $('script[type="application/ld+json"]').each((i, element) => {
    try {
      const jsonContent = $(element).html();
      if (jsonContent) {
        const data = JSON.parse(jsonContent);
        
        if (data['@type'] === 'Product' || data.product) {
          const product = data.product || data;
          
          // Extract product properties
          if (product.additionalProperty) {
            product.additionalProperty.forEach((prop: any) => {
              if (prop.name && prop.value) {
                features.push({
                  key: prop.name,
                  value: prop.value,
                  confidence: 0.95,
                  source: 'JSON-LD Schema'
                });
                console.log(`   ✅ JSON-LD: ${prop.name} = ${prop.value}`);
              }
            });
          }
          
          // Extract material information
          if (product.material) {
            features.push({
              key: 'Materyal',
              value: product.material,
              confidence: 0.95,
              source: 'JSON-LD Schema'
            });
            console.log(`   ✅ JSON-LD: Materyal = ${product.material}`);
          }
          
          // Extract color
          if (product.color) {
            features.push({
              key: 'Renk',
              value: product.color,
              confidence: 0.95,
              source: 'JSON-LD Schema'
            });
            console.log(`   ✅ JSON-LD: Renk = ${product.color}`);
          }
          
          // Extract size
          if (product.size) {
            features.push({
              key: 'Beden',
              value: product.size,
              confidence: 0.95,
              source: 'JSON-LD Schema'
            });
            console.log(`   ✅ JSON-LD: Beden = ${product.size}`);
          }
        }
      }
    } catch (e) {
      // Skip invalid JSON
    }
  });
}

function extractFromTrendyolScripts($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  $('script').each((i, element) => {
    const scriptContent = $(element).html() || '';
    
    // Look for Trendyol product data patterns
    const patterns = [
      /"productDetail":\s*\{([^}]+)\}/g,
      /"attributes":\s*\[([^\]]+)\]/g,
      /"specifications":\s*\{([^}]+)\}/g,
      /"features":\s*\[([^\]]+)\]/g
    ];
    
    patterns.forEach((pattern, idx) => {
      let match;
      while ((match = pattern.exec(scriptContent)) !== null) {
        try {
          const dataStr = `{${match[1]}}`;
          // Try to extract key-value pairs from the matched data
          const keyValueMatches = dataStr.match(/"([^"]+)":\s*"([^"]+)"/g);
          
          if (keyValueMatches) {
            keyValueMatches.forEach(kvMatch => {
              const kvParts = kvMatch.match(/"([^"]+)":\s*"([^"]+)"/);
              if (kvParts && kvParts[1] && kvParts[2]) {
                const key = kvParts[1];
                const value = kvParts[2];
                
                // Filter out non-product attributes
                if (isValidProductAttribute(key, value)) {
                  features.push({
                    key: key,
                    value: value,
                    confidence: 0.9,
                    source: 'Trendyol Script'
                  });
                  console.log(`   ✅ Trendyol Script: ${key} = ${value}`);
                }
              }
            });
          }
        } catch (e) {
          // Skip invalid data
        }
      }
    });
  });
}

function extractFromAttributeTables($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  const tableSelectors = [
    '.pr-in-dt-pr-attr-table tr',
    '.product-detail-attributes .attr-item',
    '.product-features .feature-row',
    '.detail-attr-item',
    '.product-spec-table tr'
  ];
  
  tableSelectors.forEach(selector => {
    $(selector).each((i, element) => {
      const $element = $(element);
      
      // Try different table structures
      const cells = $element.find('td, th, .attr-key, .attr-value, .label, .value');
      
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        
        if (key && value && isValidProductAttribute(key, value)) {
          features.push({
            key: key,
            value: value,
            confidence: 0.85,
            source: 'Attribute Table'
          });
          console.log(`   ✅ Table: ${key} = ${value}`);
        }
      } else if ($element.text().includes(':')) {
        // Handle single cell with colon separator
        const text = $element.text().trim();
        const colonIndex = text.indexOf(':');
        if (colonIndex > 0) {
          const key = text.substring(0, colonIndex).trim();
          const value = text.substring(colonIndex + 1).trim();
          
          if (key && value && isValidProductAttribute(key, value)) {
            features.push({
              key: key,
              value: value,
              confidence: 0.8,
              source: 'Attribute Table'
            });
            console.log(`   ✅ Table: ${key} = ${value}`);
          }
        }
      }
    });
  });
}

function extractFromDetailSections($: cheerio.CheerioAPI, features: ProductFeature[]): void {
  const detailSelectors = [
    '.product-detail-info',
    '.product-description',
    '.product-specifications',
    '.product-features'
  ];
  
  detailSelectors.forEach(selector => {
    $(selector).each((i, element) => {
      const text = $(element).text();
      
      // Extract Turkish product attributes
      const turkishPatterns = [
        /Materyal[:\s]+([^,\n.;]+)/gi,
        /Kumaş[:\s]+([^,\n.;]+)/gi,
        /Renk[:\s]+([^,\n.;]+)/gi,
        /Boyut[:\s]+([^,\n.;]+)/gi,
        /Ölçü[:\s]+([^,\n.;]+)/gi,
        /Kapasıte[:\s]+([^,\n.;]+)/gi,
        /Hacim[:\s]+([^,\n.;]+)/gi,
        /Ağırlık[:\s]+([^,\n.;]+)/gi,
        /Model[:\s]+([^,\n.;]+)/gi,
        /Seri[:\s]+([^,\n.;]+)/gi
      ];
      
      turkishPatterns.forEach((pattern, idx) => {
        let match;
        while ((match = pattern.exec(text)) !== null) {
          const key = match[0].split(/[:\s]/)[0];
          const value = match[1].trim();
          
          if (value && value.length > 1 && value.length < 100) {
            features.push({
              key: key,
              value: value,
              confidence: 0.75,
              source: 'Detail Section'
            });
            console.log(`   ✅ Detail: ${key} = ${value}`);
          }
        }
      });
    });
  });
}

function isValidProductAttribute(key: string, value: string): boolean {
  // Filter out invalid attributes
  const invalidKeys = [
    'id', 'class', 'style', 'src', 'href', 'alt', 'title', 'data-',
    'gtm', 'analytics', 'track', 'click', 'event', 'pixel',
    'facebook', 'google', 'meta', 'og:', 'twitter:',
    'script', 'function', 'var', 'const', 'let', 'return',
    'undefined', 'null', 'true', 'false'
  ];
  
  const invalidValues = [
    'undefined', 'null', 'true', 'false', '', ' ',
    'function', 'object', 'string', 'number', 'boolean',
    'www.', 'http', '.com', '.tr', '@', 'javascript:'
  ];
  
  // Check key
  const lowerKey = key.toLowerCase();
  if (invalidKeys.some(invalid => lowerKey.includes(invalid))) {
    return false;
  }
  
  // Check value
  const lowerValue = value.toLowerCase();
  if (invalidValues.some(invalid => lowerValue.includes(invalid))) {
    return false;
  }
  
  // Check length constraints
  if (key.length < 2 || key.length > 50 || value.length < 1 || value.length > 200) {
    return false;
  }
  
  // Check for meaningful content
  if (/^[^a-zA-ZğüşöçıİĞÜŞÖÇ]+$/.test(value)) {
    return false; // Only symbols/numbers
  }
  
  return true;
}

function cleanAndDeduplicateFeatures(features: ProductFeature[]): ProductFeature[] {
  const seen = new Map<string, ProductFeature>();
  
  features.forEach(feature => {
    const key = `${feature.key.toLowerCase()}-${feature.value.toLowerCase()}`;
    
    if (!seen.has(key) || seen.get(key)!.confidence < feature.confidence) {
      seen.set(key, feature);
    }
  });
  
  return Array.from(seen.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20); // Top 20 most confident features
}