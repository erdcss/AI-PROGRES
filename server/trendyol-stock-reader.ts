/**
 * Trendyol Real Stock Reader
 * @deprecated Use trendyol-variant-stock-normalizer.ts — kept for backward compatibility
 */

import * as cheerio from 'cheerio';
import {
  normalizeTrendyolVariantStock,
  logTrendyolStockResult,
  type TrendyolVariantStockResult,
} from './trendyol-variant-stock-normalizer';

export interface TrendyolStockData {
  stockMatrix: Record<string, string[]>;
  outOfStockVariants: string[];
  totalVariants: number;
  inStockVariants: number;
}

function toLegacyStockData(result: TrendyolVariantStockResult): TrendyolStockData {
  const stockMatrix: Record<string, string[]> = {};
  for (const v of result.availableVariants) {
    const colorKey = v.color.toLowerCase();
    if (!stockMatrix[colorKey]) stockMatrix[colorKey] = [];
    if (v.size) stockMatrix[colorKey].push(v.size);
  }
  return {
    stockMatrix,
    outOfStockVariants: result.outOfStockVariants.map((v) => v.key),
    totalVariants: result.variants.length,
    inStockVariants: result.availableVariants.length,
  };
}

/**
 * Reads actual stock data from Trendyol's product page DOM
 */
export function readTrendyolRealStock($: cheerio.CheerioAPI, html?: string): TrendyolStockData {
  const htmlContent = html || $.root().html() || '';
  const result = normalizeTrendyolVariantStock({ html: htmlContent, $ });
  logTrendyolStockResult('inline-html', result);
  return toLegacyStockData(result);
}

/**
 * Converts Trendyol stock data to the format expected by Shopify export
 */
export function convertToShopifyStockFormat(stockData: TrendyolStockData): {
  stockMap: Record<string, boolean>;
  colorSizeMatrix: Record<string, string[]>;
} {
  const stockMap: Record<string, boolean> = {};
  
  // Create stock map with all combinations
  Object.entries(stockData.stockMatrix).forEach(([color, availableSizes]) => {
    // Mark available combinations as true
    availableSizes.forEach(size => {
      stockMap[`${color}-${size}`] = true;
    });
  });
  
  // Mark out-of-stock combinations as false
  stockData.outOfStockVariants.forEach(variantKey => {
    stockMap[variantKey] = false;
  });
  
  console.log('🔄 Shopify formatına dönüştürüldü:');
  Object.entries(stockMap).forEach(([key, inStock]) => {
    console.log(`   ${key}: ${inStock ? 'STOKTA' : 'STOKTA YOK'}`);
  });
  
  return {
    stockMap,
    colorSizeMatrix: stockData.stockMatrix
  };
}