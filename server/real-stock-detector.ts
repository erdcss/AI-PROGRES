/**
 * Real Trendyol Stock Detection System
 * Gerçek stok durumunu tespit eden gelişmiş sistem
 */

import * as cheerio from 'cheerio';
import { getTrendyolProductFromState, parseTrendyolProductDetailState } from './trendyol-product-state';
import {
  buildVariantMatrixFromSlicingData,
  buildVariantsFromSlicing,
  extractSizesWithStockFromDom,
  parseSlicingAttributesFromProduct,
  parseSkuComboVariantsFromProduct,
} from './trendyol-slicing-parser';

export interface RealVariant {
  color: string;
  colorCode: string;
  size: string;
  inStock: boolean;
  method: string;
}

function mergeSlicingFromProduct(product: Record<string, unknown>) {
  const sources = [product];
  const ml = product.merchantListing;
  if (ml && typeof ml === 'object') sources.push(ml as Record<string, unknown>);

  const colors: Array<{ name: string; inStock: boolean }> = [];
  const sizes: Array<{ name: string; inStock: boolean }> = [];

  const mergeOption = (
    list: Array<{ name: string; inStock: boolean }>,
    entry: { name: string; inStock: boolean },
  ) => {
    const key = entry.name.toLowerCase();
    const existing = list.find((x) => x.name.toLowerCase() === key);
    if (existing) {
      existing.inStock = existing.inStock || entry.inStock;
      return;
    }
    list.push(entry);
  };

  for (const source of sources) {
    const parsed = parseSlicingAttributesFromProduct(source);
    for (const c of parsed.colors) mergeOption(colors, c);
    for (const s of parsed.sizes) mergeOption(sizes, s);
  }

  return { colors, sizes };
}

function variantsFromProductState(
  product: Record<string, unknown>,
  method: string,
): RealVariant[] {
  const slicing = mergeSlicingFromProduct(product);
  const skuVariants = parseSkuComboVariantsFromProduct(product);
  const matrix = buildVariantMatrixFromSlicingData(slicing, skuVariants);
  if (matrix.length === 0) return [];

  return matrix.map((v) => ({
    color: v.color,
    colorCode: v.colorCode || '',
    size: v.size,
    inStock: v.inStock,
    method,
  }));
}

/**
 * Trendyol sayfasından gerçek stok durumunu tespit eder
 */
export function detectRealStockStatus($: cheerio.CheerioAPI, htmlContent: string): RealVariant[] {
  console.log('🔍 REAL STOCK DETECTION başlatılıyor...');

  const product = getTrendyolProductFromState(htmlContent);
  if (product) {
    const fromState = variantsFromProductState(product, 'slicedAttributes+sku');
    if (fromState.length > 0) {
      const inStock = fromState.filter((v) => v.inStock).length;
      console.log(
        `✅ REAL STOCK (state): ${fromState.length} kombinasyon, ${inStock} stokta, ${fromState.length - inStock} tükendi`,
      );
      return fromState;
    }
  }

  const state = parseTrendyolProductDetailState(htmlContent);
  const stateProduct = state?.product;
  if (stateProduct && typeof stateProduct === 'object') {
    const fromNested = variantsFromProductState(stateProduct as Record<string, unknown>, 'state.product');
    if (fromNested.length > 0) return fromNested;
  }

  const slicingVariants = buildVariantsFromSlicing($, htmlContent);
  if (slicingVariants.length > 0) {
    const mapped = slicingVariants.map((v) => ({
      color: v.color,
      colorCode: v.colorCode || '',
      size: v.size,
      inStock: v.inStock,
      method: 'buildVariantsFromSlicing',
    }));
    console.log(
      `✅ REAL STOCK (slicing): ${mapped.length} kombinasyon, ${mapped.filter((v) => v.inStock).length} stokta`,
    );
    return mapped;
  }

  const domSizes = extractSizesWithStockFromDom($);
  if (domSizes.length > 0) {
    const defaultColor =
      String(product?.color ?? product?.renk ?? $('meta[name="puppeteer-current-color"]').attr('content') ?? '').trim() ||
      'Varsayılan';
    const mapped = domSizes.map((s) => ({
      color: defaultColor === 'Varsayılan' ? '' : defaultColor,
      colorCode: '',
      size: s.name,
      inStock: s.inStock,
      method: 'DOM slicing sizes',
    }));
    console.log(`✅ REAL STOCK (DOM): ${mapped.length} beden`);
    return mapped;
  }

  console.log('ℹ️ Varyant bulunamadı — tek ürün olarak bırakılıyor');
  return [];
}

/**
 * Legacy format'a çevir (geriye uyumluluk için)
 */
export function convertToLegacyFormat(realVariants: RealVariant[]) {
  const uniqueColors = [...new Set(realVariants.map((v) => v.color).filter(Boolean))];
  const uniqueSizes = [...new Set(realVariants.map((v) => v.size).filter(Boolean))];

  const allVariants = realVariants.map((variant) => ({
    color: variant.color,
    colorCode: variant.colorCode,
    size: variant.size,
    inStock: variant.inStock,
  }));

  console.log(
    `🔄 convertToLegacyFormat: ${uniqueColors.length} colors, ${uniqueSizes.length} sizes, ${allVariants.length} total variants`,
  );

  return {
    colors: uniqueColors,
    sizes: uniqueSizes,
    allVariants,
  };
}
