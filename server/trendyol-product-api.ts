import axios from 'axios';
import {
  normalizeTrendyolKurus,
  parseTurkishPriceText,
} from './trendyol-price-utils';
import { normalizeTrendyolImages } from './trendyol-image-utils';
import {
  brandFromTrendyolUrl,
  extractTrendyolProductId,
  isValidTrendyolProductTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';
import { isBlockedTrendyolTitle } from '@shared/trendyol-bot-detection';

export interface TrendyolApiProduct {
  title: string;
  brand: string;
  price: { original: number; withProfit: number; currency: string };
  images: string[];
  description: string;
  category: string;
  variants?: any[];
}

const API_HEADERS = (productId: string, url: string) => ({
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Trendyol/4.2.1',
  Accept: 'application/json',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'X-Device-Type': 'mobile',
  Referer: `https://www.trendyol.com/`,
  Origin: 'https://www.trendyol.com',
});

function normalizeApiPrice(raw: unknown): number {
  if (typeof raw === 'number' && raw > 0) {
    return normalizeTrendyolKurus(raw, 'api');
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.value === 'number') return normalizeApiPrice(obj.value);
    if (typeof obj.discountedPrice === 'number') return normalizeApiPrice(obj.discountedPrice);
    if (typeof obj.originalPrice === 'number') return normalizeApiPrice(obj.originalPrice);
    if (typeof obj.sellingPrice === 'number') return normalizeApiPrice(obj.sellingPrice);
    if (obj.sellingPrice) return normalizeApiPrice(obj.sellingPrice);
    if (obj.discountedPrice) return normalizeApiPrice(obj.discountedPrice);
    if (obj.originalPrice) return normalizeApiPrice(obj.originalPrice);
  }
  if (typeof raw === 'string') {
    return parseTurkishPriceText(raw);
  }
  return 0;
}

function extractImages(data: any): string[] {
  const combined: unknown[] = [];
  const roots = [
    data,
    data?.result,
    data?.product,
    data?.products?.[0],
  ].filter(Boolean);

  for (const root of roots) {
    for (const list of [
      root?.images,
      root?.productImages,
      root?.media?.images,
      root?.galleryImages,
      root?.imageUrls,
      root?.content?.images,
      root?.gallery,
      root?.medias,
    ]) {
      if (Array.isArray(list)) combined.push(...list);
    }
    if (root?.imageUrl) combined.push(root.imageUrl);
    if (root?.thumbnail) combined.push(root.thumbnail);
    if (root?.thumbnailUrl) combined.push(root.thumbnailUrl);
    if (Array.isArray(root?.variants)) {
      for (const variant of root.variants) {
        if (Array.isArray(variant?.images)) combined.push(...variant.images);
        if (variant?.image) combined.push(variant.image);
        if (variant?.imageUrl) combined.push(variant.imageUrl);
      }
    }
  }

  return normalizeTrendyolImages(combined);
}

function parseProductPayload(data: any, url: string): TrendyolApiProduct | null {
  const root = data?.result || data?.product || data?.products?.[0] || data;
  if (!root || typeof root !== 'object') return null;

  let title = String(root.name || root.title || root.productName || '').trim();
  if (isBlockedTrendyolTitle(title) || !isValidTrendyolProductTitle(title)) {
    title = titleFromTrendyolUrl(url) || title;
  }

  const original = normalizeApiPrice(
    root.price?.discountedPrice?.value ??
      root.price?.sellingPrice?.value ??
      root.price?.originalPrice?.value ??
      root.price?.discountedPrice ??
      root.price?.sellingPrice ??
      root.price?.originalPrice ??
      root.priceInfo?.discountedPrice ??
      root.priceInfo?.price ??
      root.originalPrice ??
      root.price
  );

  const images = extractImages(root);

  const urlTitle = titleFromTrendyolUrl(url);
  if ((!isValidTrendyolProductTitle(title) || isBlockedTrendyolTitle(title)) && urlTitle && original > 0) {
    title = urlTitle;
  }
  if (!isValidTrendyolProductTitle(title) && original <= 0 && images.length === 0) {
    return null;
  }

  const brand =
    String(root.brand?.name || root.brandName || root.brand || '').trim() ||
    brandFromTrendyolUrl(url) ||
    'Marka';

  // Fiyat endpoint'i sadece fiyat dönebilir
  if (original <= 0 && images.length === 0 && !root.name && !root.title) {
    return null;
  }

  return {
    title,
    brand,
    price: {
      original: original > 0 ? original : 0,
      withProfit: original > 0 ? Math.round(original * 1.1 * 100) / 100 : 0,
      currency: 'TRY',
    },
    images,
    description: String(root.description || root.content || '').trim(),
    category: String(root.category?.name || root.categoryName || root.category || '').trim(),
    variants: root.variants || root.allVariants || undefined,
  };
}

function parsePriceOnlyPayload(data: any, url: string, base: TrendyolApiProduct): TrendyolApiProduct | null {
  const root = data?.result || data;
  const original = normalizeApiPrice(
    root?.discountedPrice?.value ??
      root?.sellingPrice?.value ??
      root?.originalPrice?.value ??
      root?.price ??
      root
  );
  if (original <= 0) return null;
  return {
    ...base,
    price: {
      original,
      withProfit: Math.round(original * 1.1 * 100) / 100,
      currency: 'TRY',
    },
  };
}

const API_ENDPOINTS = (productId: string) => [
  `https://apigw.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://apigw.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://public-mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://public-mdc.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://public.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
  `https://mobile-api.trendyol.com/api/v1/product/${productId}`,
  `https://public.trendyol.com/discovery-web-productgw-service/api/price/${productId}`,
];

export async function fetchTrendyolProductByUrl(url: string): Promise<TrendyolApiProduct | null> {
  const productId = extractTrendyolProductId(url);
  if (!productId) return null;

  const slugTitle = titleFromTrendyolUrl(url);
  const slugBrand = brandFromTrendyolUrl(url);
  let bestPartial: TrendyolApiProduct | null = null;

  const endpoints = API_ENDPOINTS(productId);
  const headers = API_HEADERS(productId, url);

  const results = await Promise.allSettled(
    endpoints.map((endpoint) =>
      axios.get(endpoint, {
        timeout: 10000,
        headers,
        validateStatus: (s) => s < 500,
      })
    )
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const status = result.value.status;
    if (status === 403 || status === 429 || status >= 500) continue;

    const parsed = parseProductPayload(result.value.data, url);
    if (parsed && parsed.price.original > 0 && parsed.images.length > 0) {
      return parsed;
    }
    if (parsed && (!bestPartial || parsed.price.original > bestPartial.price.original)) {
      bestPartial = parsed;
    }

    if (slugTitle && bestPartial && bestPartial.price.original <= 0) {
      const priceOnly = parsePriceOnlyPayload(result.value.data, url, bestPartial);
      if (priceOnly) bestPartial = priceOnly;
    }
  }

  if (bestPartial && (bestPartial.price.original > 0 || bestPartial.images.length > 0)) {
    return bestPartial;
  }

  return null;
}
