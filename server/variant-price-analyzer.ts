/**
 * Varyant Fiyat Analiz Sistemi
 * Renk ve beden bazlı fiyat farklılıklarını tespit eder
 */

import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface VariantPrice {
  color: string;
  size?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  currency: string;
  url?: string;
  available: boolean;
}

export interface PriceAnalysis {
  variants: VariantPrice[];
  priceRange: {
    min: number;
    max: number;
    difference: number;
  };
  pricingStrategy: 'uniform' | 'color_based' | 'size_based' | 'complex';
  colorPricing: Record<string, number>;
  sizePricing: Record<string, number>;
  aiAnalysis?: {
    strategy: string;
    reasoning: string;
    recommendations: string[];
  };
}

/**
 * Varyant fiyatlarını çıkarır
 */
export async function analyzeVariantPricing(htmlContent: string, $: cheerio.CheerioAPI): Promise<PriceAnalysis> {
  console.log('💰 Varyant fiyat analizi başlatılıyor...');
  
  const variants: VariantPrice[] = [];
  const colorPricing: Record<string, number> = {};
  const sizePricing: Record<string, number> = {};
  
  // Method 1: Script data extraction
  extractPricesFromScripts(htmlContent, variants);
  
  // Method 2: DOM-based price extraction
  extractPricesFromDOM($, variants);
  
  // Method 3: Merchant data extraction
  extractPricesFromMerchants(htmlContent, variants);
  
  // Clean and deduplicate variants
  const cleanVariants = deduplicateVariants(variants);
  
  // Analyze pricing patterns
  const priceAnalysis = analyzePricingPatterns(cleanVariants, colorPricing, sizePricing);
  
  // AI-powered pricing analysis
  const aiAnalysis = await analyzePricingWithAI(cleanVariants);
  
  console.log(`✅ ${cleanVariants.length} varyant fiyatı analiz edildi:`);
  console.log(`   💰 Fiyat aralığı: ${priceAnalysis.priceRange.min} - ${priceAnalysis.priceRange.max} TL`);
  console.log(`   📊 Fiyat stratejisi: ${priceAnalysis.pricingStrategy}`);
  console.log(`   🎨 Renk fiyatları: ${JSON.stringify(colorPricing)}`);
  
  return {
    variants: cleanVariants,
    priceRange: priceAnalysis.priceRange,
    pricingStrategy: priceAnalysis.pricingStrategy,
    colorPricing,
    sizePricing,
    aiAnalysis
  };
}

/**
 * Script verilerinden fiyat çıkarma
 */
function extractPricesFromScripts(htmlContent: string, variants: VariantPrice[]) {
  // Product detail state
  const productDetailMatch = htmlContent.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/);
  if (productDetailMatch) {
    try {
      const productState = JSON.parse(productDetailMatch[1]);
      
      // Variants with pricing
      if (productState.product?.variants) {
        productState.product.variants.forEach((variant: any) => {
          if (variant.price) {
            variants.push({
              color: variant.color || variant.colorName || '',
              size: variant.size,
              price: parseFloat(variant.price) || 0,
              originalPrice: variant.originalPrice ? parseFloat(variant.originalPrice) : undefined,
              currency: 'TL',
              available: variant.isAvailable !== false,
              url: variant.url
            });
          }
        });
      }
      
      // Merchant pricing data
      if (productState.product?.merchants) {
        productState.product.merchants.forEach((merchant: any) => {
          if (merchant.price && merchant.url) {
            const colorMatch = merchant.url.match(/renk=([^&]+)/);
            const sizeMatch = merchant.url.match(/beden=([^&]+)/);
            
            variants.push({
              color: colorMatch ? decodeURIComponent(colorMatch[1]) : '',
              size: sizeMatch ? decodeURIComponent(sizeMatch[1]) : undefined,
              price: parseFloat(merchant.price) || 0,
              currency: 'TL',
              available: merchant.isAvailable !== false,
              url: merchant.url
            });
          }
        });
      }
      
    } catch (e) {
      console.log('Script fiyat çıkarma hatası:', e.message);
    }
  }
  
  // Merchant arrays
  const merchantMatches = htmlContent.matchAll(/"merchants":\s*\[([^\]]+)\]/g);
  for (const match of merchantMatches) {
    try {
      const merchantsData = JSON.parse(`[${match[1]}]`);
      merchantsData.forEach((merchant: any) => {
        if (merchant.price && merchant.url) {
          const colorMatch = merchant.url.match(/renk=([^&]+)/);
          const sizeMatch = merchant.url.match(/beden=([^&]+)/);
          
          variants.push({
            color: colorMatch ? decodeURIComponent(colorMatch[1]) : 'Default',
            size: sizeMatch ? decodeURIComponent(sizeMatch[1]) : undefined,
            price: parseFloat(merchant.price) || 0,
            originalPrice: merchant.originalPrice ? parseFloat(merchant.originalPrice) : undefined,
            currency: 'TL',
            available: merchant.isAvailable !== false,
            url: merchant.url
          });
        }
      });
    } catch (e) {}
  }
}

/**
 * DOM elementlerinden fiyat çıkarma
 */
function extractPricesFromDOM($: cheerio.CheerioAPI, variants: VariantPrice[]) {
  // Price elements with variant data
  $('.variant-price, .color-price, [data-price]').each((i, elem) => {
    const $elem = $(elem);
    const price = extractPriceFromElement($elem);
    const color = $elem.attr('data-color') || $elem.closest('[data-color]').attr('data-color') || 'Default';
    const size = $elem.attr('data-size') || $elem.closest('[data-size]').attr('data-size');
    
    if (price > 0) {
      variants.push({
        color,
        size,
        price,
        currency: 'TL',
        available: !$elem.hasClass('disabled')
      });
    }
  });
  
  // Main price with current variant
  const mainPrice = $('.price-current, .current-price, .product-price').first();
  if (mainPrice.length > 0) {
    const price = extractPriceFromElement(mainPrice);
    const selectedColor = $('.color-option.selected, .variant-color.active').attr('data-color') || 'Default';
    const selectedSize = $('.size-option.selected, .variant-size.active').attr('data-size');
    
    if (price > 0) {
      variants.push({
        color: selectedColor,
        size: selectedSize,
        price,
        currency: 'TL',
        available: true
      });
    }
  }
}

/**
 * Merchant verilerinden fiyat çıkarma
 */
function extractPricesFromMerchants(htmlContent: string, variants: VariantPrice[]) {
  // Extract structured merchant pricing
  const merchantRegex = /"price":\s*"?(\d+(?:\.\d+)?)"?[^}]*"url":\s*"([^"]+)"/g;
  let match;
  
  while ((match = merchantRegex.exec(htmlContent)) !== null) {
    const price = parseFloat(match[1]);
    const url = match[2];
    
    if (price > 0) {
      const colorMatch = url.match(/renk=([^&]+)/);
      const sizeMatch = url.match(/beden=([^&]+)/);
      
      variants.push({
        color: colorMatch ? decodeURIComponent(colorMatch[1]) : 'Default',
        size: sizeMatch ? decodeURIComponent(sizeMatch[1]) : undefined,
        price,
        currency: 'TL',
        available: true,
        url
      });
    }
  }
}

/**
 * Element'ten fiyat çıkarma
 */
function extractPriceFromElement($elem: cheerio.Cheerio<cheerio.Element>): number {
  const text = $elem.text().trim();
  const priceMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  return priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : 0;
}

/**
 * Varyantları temizle ve tekrarları kaldır
 */
function deduplicateVariants(variants: VariantPrice[]): VariantPrice[] {
  const variantMap = new Map<string, VariantPrice>();
  
  variants.forEach(variant => {
    if (variant.price > 0) {
      const key = `${variant.color}-${variant.size || 'default'}`;
      const existing = variantMap.get(key);
      
      if (!existing || variant.price > existing.price) {
        variantMap.set(key, variant);
      }
    }
  });
  
  return Array.from(variantMap.values());
}

/**
 * Fiyatlandırma desenlerini analiz et
 */
function analyzePricingPatterns(variants: VariantPrice[], colorPricing: Record<string, number>, sizePricing: Record<string, number>) {
  const prices = variants.map(v => v.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  // Color-based pricing analysis
  variants.forEach(variant => {
    if (!colorPricing[variant.color] || variant.price > colorPricing[variant.color]) {
      colorPricing[variant.color] = variant.price;
    }
  });
  
  // Size-based pricing analysis
  variants.forEach(variant => {
    if (variant.size) {
      if (!sizePricing[variant.size] || variant.price > sizePricing[variant.size]) {
        sizePricing[variant.size] = variant.price;
      }
    }
  });
  
  // Determine pricing strategy
  let pricingStrategy: 'uniform' | 'color_based' | 'size_based' | 'complex' = 'uniform';
  
  const colorPrices = Object.values(colorPricing);
  const sizePrices = Object.values(sizePricing);
  
  if (colorPrices.length > 1 && Math.max(...colorPrices) > Math.min(...colorPrices)) {
    if (sizePrices.length > 1 && Math.max(...sizePrices) > Math.min(...sizePrices)) {
      pricingStrategy = 'complex';
    } else {
      pricingStrategy = 'color_based';
    }
  } else if (sizePrices.length > 1 && Math.max(...sizePrices) > Math.min(...sizePrices)) {
    pricingStrategy = 'size_based';
  }
  
  return {
    priceRange: {
      min: minPrice,
      max: maxPrice,
      difference: maxPrice - minPrice
    },
    pricingStrategy
  };
}

/**
 * AI ile fiyatlandırma analizi
 */
async function analyzePricingWithAI(variants: VariantPrice[]): Promise<any> {
  try {
    if (!process.env.ANTHROPIC_API_KEY || variants.length === 0) {
      return null;
    }
    
    console.log('🤖 AI ile fiyatlandırma stratejisi analizi...');
    
    const variantData = variants.map(v => `${v.color} ${v.size || ''}: ${v.price} TL`).join(', ');
    
    const prompt = `Bu ürün varyantlarının fiyatlandırma stratejisini analiz et:

Varyantlar: ${variantData}

Analiz et:
1. Fiyat stratejisi (renk bazlı, beden bazlı, karma)
2. Fiyat farklılıklarının nedeni
3. E-ticaret için öneriler

JSON formatında döndür:
{
  "strategy": "strateji açıklaması",
  "reasoning": "fiyat farklılıklarının nedeni",
  "recommendations": ["öneri1", "öneri2"]
}`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = JSON.parse(response.content[0].text);
    console.log(`✅ AI fiyat analizi tamamlandı: ${analysis.strategy}`);
    
    return analysis;
    
  } catch (error) {
    console.log(`⚠️ AI fiyat analizi hatası: ${error.message}`);
    return null;
  }
}