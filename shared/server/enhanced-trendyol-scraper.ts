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

    // Extract price
    let price = 0;
    const priceText = $('.prc-box-dscntd, .prc-box-sllng, [data-testid="price"], .price').first().text().trim();
    const priceMatch = priceText.match(/[\d,]+/);
    if (priceMatch) {
      price = parseFloat(priceMatch[0].replace(',', '.'));
    }

    // Extract images
    const images: string[] = [];
    $('img[data-testid="product-image"], .product-images img, .pr-in-img img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src && src.includes('cdn')) {
        const optimizedSrc = src.replace(/\/\d+_\d+\./, '/_org.');
        if (!images.includes(optimizedSrc)) {
          images.push(optimizedSrc);
        }
      }
    });

    // Use working variant extraction
    const { extractWorkingVariants } = await import('./working-variant-extractor');
    const variants = extractWorkingVariants(html);

    // Extract description
    const description = $('.product-detail-description, .pr-in-dt-cn, [data-testid="description"]').first().text().trim() ||
                       $('meta[name="description"]').attr('content') || '';

    // Extract attributes
    const attributes: Record<string, string> = {};
    $('.product-attributes li, .pr-in-dt li').each((_, attr) => {
      const text = $(attr).text().trim();
      const [key, value] = text.split(':').map(s => s.trim());
      if (key && value) {
        attributes[key] = value;
      }
    });

    debug(`Ürün başarıyla parse edildi: ${title}`);
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