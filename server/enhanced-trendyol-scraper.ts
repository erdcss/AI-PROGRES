/**
 * Enhanced Trendyol Scraper with Real Stock Detection
 * Handles current Trendyol protection mechanisms and extracts authentic stock data
 */

import puppeteer from 'puppeteer';
import { execSync } from 'child_process';
import * as cheerio from 'cheerio';

const debug = (message: string) => console.log(`[ENHANCED-SCRAPER] ${message}`);

export interface TrendyolProductData {
  title: string;
  brand: string;
  price: number;
  images: string[];
  variants: {
    colors: string[];
    sizes: string[];
    stockMap: Record<string, boolean>;
  };
  description: string;
  attributes: Record<string, string>;
}

/**
 * Enhanced scraping with multiple fallback strategies
 */
export async function scrapeWithEnhancedMethod(url: string): Promise<TrendyolProductData | null> {
  debug(`Enhanced scraping başlatılıyor: ${url}`);
  
  // Strategy 1: Try desktop version with advanced headers
  const desktopData = await tryDesktopScraping(url);
  if (desktopData) {
    debug('Desktop scraping başarılı');
    return desktopData;
  }

  // Strategy 2: Try mobile version with different approach
  const mobileData = await tryMobileScraping(url);
  if (mobileData) {
    debug('Mobile scraping başarılı');
    return mobileData;
  }

  // Strategy 3: Try alternative endpoints
  const altData = await tryAlternativeEndpoints(url);
  if (altData) {
    debug('Alternative endpoint başarılı');
    return altData;
  }

  debug('Tüm scraping stratejileri başarısız oldu');
  return null;
}

/**
 * Desktop scraping with advanced stealth techniques
 */
async function tryDesktopScraping(url: string): Promise<TrendyolProductData | null> {
  let browser = null;
  
  try {
    debug('Desktop scraping deneniyor...');
    
    let executablePath;
    try {
      executablePath = execSync('which chromium-browser || which chromium || which google-chrome', { encoding: 'utf8' }).trim();
    } catch (error) {
      debug('Chromium bulunamadı');
    }

    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-extensions',
        '--no-first-run',
        '--disable-default-apps',
        '--window-size=1366,768'
      ]
    });

    const page = await browser.newPage();
    
    // Advanced stealth configuration
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://www.google.com/',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'cross-site',
      'Cache-Control': 'max-age=0'
    });

    // Navigate to Trendyol homepage first
    await page.goto('https://www.trendyol.com', { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Navigate to product page
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    const content = await page.content();
    debug(`Desktop content alındı: ${content.length} bytes`);

    if (content.length > 10000) {
      return await parseProductData(content, url);
    }

    return null;

  } catch (error) {
    debug(`Desktop scraping hatası: ${error}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Mobile scraping approach
 */
async function tryMobileScraping(url: string): Promise<TrendyolProductData | null> {
  let browser = null;
  
  try {
    debug('Mobile scraping deneniyor...');
    
    let executablePath;
    try {
      executablePath = execSync('which chromium-browser || which chromium || which google-chrome', { encoding: 'utf8' }).trim();
    } catch (error) {
      debug('Chromium bulunamadı');
    }

    browser = await puppeteer.launch({
      headless: true,
      executablePath: executablePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    await page.setViewport({ width: 375, height: 667, isMobile: true });

    const mobileUrl = url.replace('www.trendyol.com', 'm.trendyol.com');
    
    await page.goto(mobileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const content = await page.content();
    debug(`Mobile content alındı: ${content.length} bytes`);

    if (content.length > 5000) {
      return await parseProductData(content, url);
    }

    return null;

  } catch (error) {
    debug(`Mobile scraping hatası: ${error}`);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Try alternative endpoints and APIs
 */
async function tryAlternativeEndpoints(url: string): Promise<TrendyolProductData | null> {
  debug('Alternative endpoints deneniyor...');
  
  const productId = url.match(/p-(\d+)/)?.[1];
  if (!productId) return null;

  // Try different endpoint approaches
  const endpoints = [
    `https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
    `https://cdn-dynamic.trendyol.com/p/${productId}/data.json`,
    `https://api.trendyol.com/products/${productId}`,
    `https://www.trendyol.com/api/v2/product/${productId}`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.trendyol.com/',
          'Origin': 'https://www.trendyol.com'
        }
      });

      if (response.ok) {
        const data = await response.json();
        debug(`API endpoint başarılı: ${endpoint}`);
        return parseApiData(data);
      }
    } catch (error) {
      debug(`Endpoint başarısız: ${endpoint}`);
    }
  }

  return null;
}

/**
 * Parse product data from HTML content
 */
async function parseProductData(html: string, url: string): Promise<TrendyolProductData | null> {
  try {
    const $ = cheerio.load(html);
    console.log(`🔍 Parsing product data from ${html.length} bytes of HTML`);
    
    // Extract basic product info
    const title = $('h1.pr-new-br, h1[data-testid="product-title"], .product-title h1').first().text().trim() ||
                  $('title').text().replace(' - Trendyol', '').trim();
    
    if (!title || title === 'This page has been gone') {
      debug('Ürün bulunamadı veya silinmiş');
      return null;
    }

    const brand = $('.product-brand, .pr-new-br a, [data-testid="brand-name"]').first().text().trim() ||
                  url.split('/')[3] || 'Unknown';

    // Extract price using enhanced multi-method approach
    let price = 0;
    
    // Method 1: Standard price selectors
    const priceSelectors = [
      '.prc-box-dscntd',
      '.prc-box-sllng', 
      '[data-testid="price"]',
      '.price',
      '.product-price-container .price',
      '.pr-bx-w .prc-slg',
      '.discount-price',
      '.current-price',
      '.sale-price'
    ];
    
    for (const selector of priceSelectors) {
      const priceElement = $(selector).first();
      if (priceElement.length) {
        const priceText = priceElement.text().trim();
        const priceMatch = priceText.match(/[\d.,]+/);
        if (priceMatch) {
          const cleanPrice = priceMatch[0].replace(/[.,](\d{1,2})$/, '.$1').replace(/[.,]/g, '');
          const parsedPrice = parseFloat(cleanPrice) / (cleanPrice.length > 4 ? 100 : 1);
          if (parsedPrice > 0) {
            price = parsedPrice;
            debug(`Price found with ${selector}: ${price} TL`);
            break;
          }
        }
      }
    }
    
    // Method 2: JSON-based price extraction if standard method fails
    if (price === 0) {
      const scriptTags = $('script:contains("price"), script:contains("currentPrice"), script:contains("originalPrice")');
      scriptTags.each((_, script) => {
        const content = $(script).html();
        if (content && price === 0) {
          // Look for price patterns in JSON
          const pricePatterns = [
            /"price":\s*(\d+(?:\.\d+)?)/,
            /"currentPrice":\s*(\d+(?:\.\d+)?)/,
            /"originalPrice":\s*(\d+(?:\.\d+)?)/,
            /"sellingPrice":\s*(\d+(?:\.\d+)?)/
          ];
          
          for (const pattern of pricePatterns) {
            const match = content.match(pattern);
            if (match) {
              const foundPrice = parseFloat(match[1]);
              if (foundPrice > 0) {
                price = foundPrice;
                debug(`Price found in JSON: ${price} TL`);
                break;
              }
            }
          }
        }
      });
    }
    
    // Method 3: Meta tag price extraction
    if (price === 0) {
      const metaPrice = $('meta[property="product:price:amount"], meta[name="price"]').attr('content');
      if (metaPrice) {
        const parsedMetaPrice = parseFloat(metaPrice);
        if (parsedMetaPrice > 0) {
          price = parsedMetaPrice;
          debug(`Price found in meta tag: ${price} TL`);
        }
      }
    }

    // Extract images using enhanced multi-method approach
    const images: string[] = [];
    const uniqueImages = new Set<string>();
    
    // Method 1: Standard image selectors
    $('img[data-testid="product-image"], .product-images img, .pr-in-img img, .gallery-image img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src && src.includes('cdn.dsmcdn.com')) {
        // Convert to high quality version
        const highQualitySrc = src.replace(/(_\d+x\d+|_mnr|_thumb|_small)/g, '').replace(/\.jpg$/, '_org_zoom.jpg');
        uniqueImages.add(highQualitySrc);
      }
    });
    
    // Method 2: Extract from JSON data in script tags
    const scriptTags = $('script:contains("images"), script:contains("gallery"), script:contains("cdn.dsmcdn.com")');
    scriptTags.each((_, script) => {
      const content = $(script).html();
      if (content) {
        // Extract CDN image URLs
        const imagePattern = /https:\/\/cdn\.dsmcdn\.com[^"'\s]*\.jpg/g;
        const matches = content.match(imagePattern);
        if (matches) {
          matches.forEach(url => {
            // Filter out unwanted image types and convert to high quality
            if (!url.includes('icon') && !url.includes('logo') && !url.includes('badge') && !url.includes('thumb')) {
              const highQualityUrl = url.replace(/(_\d+x\d+|_mnr|_thumb|_small)/g, '').replace(/\.jpg$/, '_org_zoom.jpg');
              uniqueImages.add(highQualityUrl);
            }
          });
        }
      }
    });
    
    // Convert Set to Array and limit to 7 main product images
    images.push(...Array.from(uniqueImages).slice(0, 7));
    
    debug(`Images extracted: ${images.length} high-quality images`);

    // Use working variant extraction
    const { extractWorkingVariants } = await import('./working-variant-extractor');
    const variants = extractWorkingVariants(html);

    // Extract description
    const description = $('.product-detail-description, .pr-in-dt-cn, [data-testid="description"]').first().text().trim() ||
                       $('meta[name="description"]').attr('content') || '';

    // Extract attributes using enhanced feature extraction
    const attributes: Record<string, string> = {};
    
    // Method 1: Standard attribute extraction
    $('.product-attributes li, .pr-in-dt li').each((_, attr) => {
      const text = $(attr).text().trim();
      const [key, value] = text.split(':').map(s => s.trim());
      if (key && value) {
        attributes[key] = value;
      }
    });
    
    // Method 2: Enhanced JSON-based feature extraction
    try {
      const scriptTags = $('script[type="application/ld+json"], script:contains("productDetail"), script:contains("attributes")');
      scriptTags.each((_, script) => {
        const content = $(script).html();
        if (content) {
          try {
            // Look for attribute patterns in JSON
            const attributeMatches = content.match(/"attributes":\s*\[(.*?)\]/s);
            if (attributeMatches) {
              const attributeText = attributeMatches[1];
              // Extract key-value pairs from attribute JSON
              const keyValuePattern = /"key":\s*{[^}]*"name":\s*"([^"]+)"[^}]*},\s*"value":\s*{[^}]*"name":\s*"([^"]+)"/g;
              let match;
              while ((match = keyValuePattern.exec(attributeText)) !== null) {
                const [, key, value] = match;
                if (key && value && key !== 'undefined' && value !== 'undefined') {
                  attributes[key] = value;
                  debug(`Enhanced feature found: ${key} = ${value}`);
                }
              }
            }
          } catch (jsonError) {
            // Ignore JSON parsing errors
          }
        }
      });
      
      // Method 3: Extract features from product description patterns
      const descriptionText = $('.product-detail-description, .pr-in-dt-cn').text();
      if (descriptionText) {
        // Look for material patterns
        const materialPatterns = [
          /Materyal[:\s]*([^.\n]+)/i,
          /Kumaş[:\s]*([^.\n]+)/i,
          /Material[:\s]*([^.\n]+)/i,
          /Fabric[:\s]*([^.\n]+)/i,
          /(%\d+\s*[A-Za-zğüşıöçĞÜŞIÖÇ]+)/g
        ];
        
        materialPatterns.forEach(pattern => {
          const matches = descriptionText.match(pattern);
          if (matches) {
            matches.forEach(match => {
              if (match.includes('%')) {
                attributes['Materyal Bileşeni'] = match.trim();
              } else {
                attributes['Kumaş Tipi'] = match.replace(/^[^:]*:\s*/, '').trim();
              }
            });
          }
        });
      }
      
    } catch (enhancedError) {
      debug(`Enhanced feature extraction error: ${enhancedError}`);
    }

    debug(`Ürün başarıyla parse edildi: ${title}`);
    debug(`Price extracted: ${price} TL`);
    debug(`Images extracted: ${images.length} images`);
    debug(`Attributes extracted: ${Object.keys(attributes).length} features`);
    debug(`Variants: ${variants.colors.length} renk, ${variants.sizes.length} beden`);
    debug(`Stock map entries: ${Object.keys(variants.stockMap).length}`);

    return {
      title,
      brand,
      price,
      images,
      variants,
      description,
      attributes
    };

  } catch (error) {
    debug(`Parse hatası: ${error}`);
    return null;
  }
}

/**
 * Extract real stock data from DOM with enhanced selectors
 */
function extractRealStockData($: cheerio.CheerioAPI) {
  const colors: string[] = [];
  const sizes: string[] = [];
  const stockMap: Record<string, boolean> = {};

  // Enhanced color extraction with multiple selectors
  const colorSelectors = [
    '.pr-in-cn img', '.color-variants img', '[data-testid="color"] img',
    '.variants-wrapper .color-option img', '.product-variants .color img',
    '.variant-attribute[data-attribute-name="renk"] img',
    '.variant-attribute[data-attribute-name="Renk"] img'
  ];

  colorSelectors.forEach(selector => {
    $(selector).each((_, img) => {
      const alt = $(img).attr('alt')?.trim();
      if (alt && alt !== 'Varsayılan' && alt !== 'Default' && !colors.includes(alt)) {
        colors.push(alt);
        debug(`Color found: ${alt}`);
      }
    });
  });

  // Enhanced size extraction with multiple selectors
  const sizeSelectors = [
    '.pr-in-sz button', '.size-variants button', '[data-testid="size"] button',
    '.variants-wrapper .size-option button', '.product-variants .size button',
    '.variant-attribute[data-attribute-name="beden"] button',
    '.variant-attribute[data-attribute-name="Beden"] button'
  ];

  sizeSelectors.forEach(selector => {
    $(selector).each((_, btn) => {
      const size = $(btn).text().trim();
      if (size && size !== 'Standart' && size !== 'Standard' && 
          (size.match(/^(XS|S|M|L|XL|XXL|2XL|3XL|\d+)$/i) || size.length <= 4) && 
          !sizes.includes(size)) {
        sizes.push(size);
        debug(`Size found: ${size}`);
      }
    });
  });

  // Try to extract from JSON-LD data if available
  $('script[type="application/ld+json"]').each((_, script) => {
    try {
      const jsonData = JSON.parse($(script).html() || '{}');
      if (jsonData.offers && Array.isArray(jsonData.offers)) {
        jsonData.offers.forEach((offer: any) => {
          if (offer.additionalProperty) {
            offer.additionalProperty.forEach((prop: any) => {
              if (prop.name === 'color' || prop.name === 'renk') {
                const color = prop.value?.trim();
                if (color && !colors.includes(color)) {
                  colors.push(color);
                  debug(`JSON-LD Color: ${color}`);
                }
              }
              if (prop.name === 'size' || prop.name === 'beden') {
                const size = prop.value?.trim();
                if (size && !sizes.includes(size)) {
                  sizes.push(size);
                  debug(`JSON-LD Size: ${size}`);
                }
              }
            });
          }
        });
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  });

  // Try to extract from window.__PRODUCT_DETAIL_APP_INITIAL_STATE__
  const scriptContent = $('script').map((_, script) => $(script).html()).get().join(' ');
  const productStateMatch = scriptContent.match(/__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  
  if (productStateMatch) {
    try {
      const productState = JSON.parse(productStateMatch[1]);
      const product = productState.product;
      
      if (product && product.variants) {
        product.variants.forEach((variant: any) => {
          if (variant.attributeType === 'color' || variant.attributeType === 'renk') {
            const color = variant.attributeValue?.trim();
            if (color && !colors.includes(color)) {
              colors.push(color);
              debug(`State Color: ${color}`);
            }
          }
          if (variant.attributeType === 'size' || variant.attributeType === 'beden') {
            const size = variant.attributeValue?.trim();
            if (size && !sizes.includes(size)) {
              sizes.push(size);
              debug(`State Size: ${size}`);
            }
          }
        });
      }
    } catch (e) {
      debug(`State parse error: ${e}`);
    }
  }

  // Create stock map for all combinations
  if (colors.length > 0 && sizes.length > 0) {
    colors.forEach(color => {
      sizes.forEach(size => {
        const variantKey = `${color}-${size}`;
        stockMap[variantKey] = true; // Default to in stock
      });
    });
  } else if (colors.length > 0) {
    colors.forEach(color => {
      stockMap[color] = true;
    });
  } else if (sizes.length > 0) {
    sizes.forEach(size => {
      stockMap[size] = true;
    });
  }

  debug(`Final variants: ${colors.length} colors, ${sizes.length} sizes`);
  return { colors, sizes, stockMap };
}

/**
 * Parse API response data
 */
function parseApiData(data: any): TrendyolProductData | null {
  try {
    // Handle different API response structures
    const product = data.result || data.product || data;
    
    if (!product || !product.name) {
      return null;
    }

    const variants = {
      colors: [] as string[],
      sizes: [] as string[],
      stockMap: {} as Record<string, boolean>
    };

    // Extract variants from API data
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach((variant: any) => {
        if (variant.attributeType === 'color' && variant.attributeValue) {
          variants.colors.push(variant.attributeValue);
        }
        if (variant.attributeType === 'size' && variant.attributeValue) {
          variants.sizes.push(variant.attributeValue);
        }
      });
    }

    return {
      title: product.name,
      brand: product.brand?.name || 'Unknown',
      price: product.price?.originalPrice || product.price?.value || 0,
      images: product.images?.map((img: any) => img.url?.replace(/\/\d+_\d+\./, '/_org.')) || [],
      variants,
      description: product.description || '',
      attributes: product.attributes || {}
    };

  } catch (error) {
    debug(`API parse hatası: ${error}`);
    return null;
  }
}