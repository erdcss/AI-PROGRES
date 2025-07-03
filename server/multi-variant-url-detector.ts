import axios from 'axios';
import * as cheerio from 'cheerio';

// Create axios instance with retry logic
const axiosRetry = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

export interface VariantURL {
  url: string;
  color: string;
  productId: string;
  isMain: boolean;
  colorCode?: string;
}

export interface MultiVariantDiscovery {
  mainProduct: VariantURL;
  allVariants: VariantURL[];
  totalVariants: number;
  detectedColors: string[];
  baseProductInfo: {
    brand: string;
    baseTitle: string;
    merchantId: string;
    boutiqueId: string;
  };
}

/**
 * Discovers all color variant URLs for a given product
 * Analyzes the product page to find related color options with different URLs
 */
export async function discoverMultiVariantURLs(mainUrl: string): Promise<MultiVariantDiscovery> {
  console.log('🔍 Multi-variant URL discovery başlıyor...');
  console.log('📍 Ana URL:', mainUrl);
  
  try {
    // Extract base product info from URL
    const baseInfo = extractBaseProductInfo(mainUrl);
    console.log('📊 Base product info:', baseInfo);
    
    // Fetch the main product page
    const response = await axiosRetry.get(mainUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      },
      timeout: 30000
    });
    
    const $ = cheerio.load(response.data);
    const html = response.data;
    
    console.log('📄 HTML analizi:', `${(html.length / 1024).toFixed(1)}KB`);
    
    // Method 1: Look for color variant selectors in the page
    const colorVariants = await extractColorVariantsFromPage($, html, baseInfo);
    console.log('🎨 Detected color variants:', colorVariants.length);
    
    // Method 2: Pattern-based URL discovery
    const patternVariants = await discoverPatternBasedVariants(mainUrl, baseInfo);
    console.log('🔗 Pattern-based variants:', patternVariants.length);
    
    // Method 3: Script-based variant discovery
    const scriptVariants = await extractVariantsFromScripts(html, baseInfo);
    console.log('📜 Script-based variants:', scriptVariants.length);
    
    // Combine all discovered variants
    const allVariants = combineAndDeduplicateVariants(
      colorVariants,
      patternVariants,
      scriptVariants
    );
    
    const mainColor = extractColorFromURL(mainUrl);
    const mainVariant: VariantURL = {
      url: mainUrl,
      color: mainColor,
      productId: baseInfo.productId,
      isMain: true
    };
    
    const result: MultiVariantDiscovery = {
      mainProduct: mainVariant,
      allVariants: [mainVariant, ...allVariants],
      totalVariants: allVariants.length + 1,
      detectedColors: [mainColor, ...allVariants.map(v => v.color)],
      baseProductInfo: {
        brand: baseInfo.brand,
        baseTitle: baseInfo.baseTitle,
        merchantId: baseInfo.merchantId,
        boutiqueId: baseInfo.boutiqueId
      }
    };
    
    console.log('✅ Multi-variant discovery tamamlandı:');
    console.log('  📸 Toplam varyant:', result.totalVariants);
    console.log('  🎨 Tespit edilen renkler:', result.detectedColors.join(', '));
    
    return result;
    
  } catch (error) {
    console.error('❌ Multi-variant discovery hatası:', error);
    throw error;
  }
}

/**
 * Extract base product information from URL
 */
function extractBaseProductInfo(url: string) {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const params = new URLSearchParams(urlObj.search);
  
  // Extract product ID from path (e.g., p-682682444)
  const productIdMatch = url.match(/p-(\d+)/);
  const productId = productIdMatch ? productIdMatch[1] : '';
  
  // Extract brand from path
  const brand = pathParts[1] || '';
  
  // Extract base title (remove color words)
  const titlePart = pathParts[2] || '';
  const baseTitle = titlePart
    .replace(/-(sari|bordo|mavi|kirmizi|beyaz|siyah|yesil|mor|turuncu|pembe|gri|kahverengi)-/gi, '-')
    .replace(/kadin-/, '')
    .replace(/-p-\d+/, '');
  
  return {
    productId,
    brand,
    baseTitle,
    merchantId: params.get('merchantId') || '',
    boutiqueId: params.get('boutiqueId') || ''
  };
}

/**
 * Extract color variants from page selectors
 */
async function extractColorVariantsFromPage($: cheerio.CheerioAPI, html: string, baseInfo: any): Promise<VariantURL[]> {
  const variants: VariantURL[] = [];
  
  // Look for color selection elements
  const colorSelectors = [
    '.pr-in-dt-cl button', // Color buttons
    '.color-variant-item', // Color variant items
    '.product-color-option', // Color options
    '.variant-color-selector' // Variant selectors
  ];
  
  for (const selector of colorSelectors) {
    $(selector).each((i, element) => {
      const $element = $(element);
      const onClick = $element.attr('onclick');
      const href = $element.attr('href');
      const dataUrl = $element.data('url');
      
      if (href && href.includes('/p-')) {
        const color = extractColorFromURL(href);
        if (color) {
          variants.push({
            url: href.startsWith('http') ? href : `https://www.trendyol.com${href}`,
            color,
            productId: extractProductIdFromURL(href),
            isMain: false
          });
        }
      }
    });
  }
  
  return variants;
}

/**
 * Discover variants using URL pattern analysis
 */
async function discoverPatternBasedVariants(mainUrl: string, baseInfo: any): Promise<VariantURL[]> {
  const variants: VariantURL[] = [];
  
  // Common Turkish color names that might appear in URLs
  const colorNames = [
    'sari', 'bordo', 'mavi', 'indigo-mavi', 'kirmizi', 'beyaz', 'siyah', 
    'yesil', 'mor', 'turuncu', 'pembe', 'gri', 'kahverengi', 'lacivert',
    'acik-mavi', 'koyu-mavi', 'acik-pembe', 'koyu-pembe', 'acik-yesil',
    'koyu-yesil', 'acik-gri', 'koyu-gri', 'krem', 'bej', 'taba'
  ];
  
  const baseUrl = mainUrl.replace(/p-\d+/, '');
  const urlParts = new URL(mainUrl);
  
  // Skip pattern-based discovery for now to speed up processing
  // We'll focus on script-based and page-based discovery
  console.log('⚡ Skipping pattern-based discovery for speed optimization');
  
  // Instead, try to find color patterns in the current URL
  const currentColor = extractColorFromURL(mainUrl);
  if (currentColor && currentColor !== 'Bilinmeyen Renk') {
    console.log('🎨 Current color detected:', currentColor);
  }
  
  return variants;
}

/**
 * Extract variants from JavaScript code in the page
 */
async function extractVariantsFromScripts(html: string, baseInfo: any): Promise<VariantURL[]> {
  const variants: VariantURL[] = [];
  
  // Look for variant data in script tags
  const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gis);
  
  if (scriptMatches) {
    for (const script of scriptMatches) {
      // Look for variant URLs in JavaScript
      const urlMatches = script.match(/https:\/\/www\.trendyol\.com\/[^"'\s]+p-\d+[^"'\s]*/g);
      
      if (urlMatches) {
        for (const url of urlMatches) {
          const color = extractColorFromURL(url);
          if (color) {
            variants.push({
              url,
              color,
              productId: extractProductIdFromURL(url),
              isMain: false
            });
          }
        }
      }
    }
  }
  
  return variants;
}

/**
 * Combine and deduplicate variants from different sources
 */
function combineAndDeduplicateVariants(
  ...variantArrays: VariantURL[][]
): VariantURL[] {
  const allVariants = variantArrays.flat();
  const uniqueVariants = new Map<string, VariantURL>();
  
  for (const variant of allVariants) {
    const key = variant.productId || variant.url;
    if (!uniqueVariants.has(key)) {
      uniqueVariants.set(key, variant);
    }
  }
  
  return Array.from(uniqueVariants.values());
}

/**
 * Extract color from URL
 */
function extractColorFromURL(url: string): string {
  const colorMap: { [key: string]: string } = {
    'sari': 'Sarı',
    'bordo': 'Bordo',
    'mavi': 'Mavi',
    'indigo-mavi': 'İndigo Mavi',
    'kirmizi': 'Kırmızı',
    'beyaz': 'Beyaz',
    'siyah': 'Siyah',
    'yesil': 'Yeşil',
    'mor': 'Mor',
    'turuncu': 'Turuncu',
    'pembe': 'Pembe',
    'gri': 'Gri',
    'kahverengi': 'Kahverengi',
    'lacivert': 'Lacivert',
    'krem': 'Krem',
    'bej': 'Bej',
    'taba': 'Taba'
  };
  
  for (const [urlColor, displayColor] of Object.entries(colorMap)) {
    if (url.includes(urlColor)) {
      return displayColor;
    }
  }
  
  return 'Bilinmeyen Renk';
}

/**
 * Extract product ID from URL
 */
function extractProductIdFromURL(url: string): string {
  const match = url.match(/p-(\d+)/);
  return match ? match[1] : '';
}

/**
 * Validate if a URL is accessible
 */
async function validateURL(url: string): Promise<boolean> {
  try {
    const response = await axiosRetry.head(url, { timeout: 5000 });
    return response.status === 200;
  } catch {
    return false;
  }
}