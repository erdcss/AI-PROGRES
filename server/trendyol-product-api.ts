/**
 * Trendyol public product APIs — no browser required.
 */
import axios from 'axios';
import {
  brandFromTrendyolUrl,
  extractTrendyolProductId,
  isValidTrendyolProductTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';

export interface TrendyolApiProduct {
  title: string;
  brand: string;
  price: { original: number; withProfit: number; currency: string };
  images: string[];
  description: string;
  category: string;
}

function normalizeApiPrice(raw: unknown): number {
  if (typeof raw === 'number' && raw > 0) {
    if (raw >= 10000) return Math.round((raw / 100) * 100) / 100;
    return Math.round(raw * 100) / 100;
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
    const n = parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return 0;
}

function extractImages(data: any): string[] {
  const urls: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === 'string' && u.startsWith('http')) urls.push(u);
    else if (u && typeof u === 'object') {
      const o = u as Record<string, string>;
      if (o.url) urls.push(o.url);
      else if (o.imageUrl) urls.push(o.imageUrl);
      else if (o.src) urls.push(o.src);
    }
  };
  for (const img of data?.images || data?.productImages || data?.media?.images || []) {
    push(img);
  }
  return [...new Set(urls)];
}

function parseProductPayload(data: any, url: string): TrendyolApiProduct | null {
  const root = data?.result || data?.product || data?.products?.[0] || data;
  if (!root || typeof root !== 'object') return null;

  let title = String(root.name || root.title || root.productName || '').trim();
  if (!isValidTrendyolProductTitle(title)) {
    title = titleFromTrendyolUrl(url) || title;
  }
  if (!isValidTrendyolProductTitle(title)) return null;

  const brand =
    String(root.brand?.name || root.brandName || root.brand || '').trim() ||
    brandFromTrendyolUrl(url) ||
    'Marka';

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
  if (original <= 0 && images.length === 0) return null;

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
  };
}

const API_ENDPOINTS = (productId: string) => [
  `https://public-mdc.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://public.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
  `https://cdn.dsmcdn.com/products/${productId}/product.json`,
  `https://public.trendyol.com/discovery-web-productgw-service/api/price/${productId}`,
];

export async function fetchTrendyolProductByUrl(url: string): Promise<TrendyolApiProduct | null> {
  const productId = extractTrendyolProductId(url);
  if (!productId) return null;

  const endpoints = API_ENDPOINTS(productId);
  const results = await Promise.allSettled(
    endpoints.map((endpoint) =>
      axios.get(endpoint, {
        timeout: 8000,
        headers: {
          'User-Agent': 'TrendyolMobiOS/4.2.1 (iPhone; iOS 17.0; tr_TR)',
          Accept: 'application/json',
          'Accept-Language': 'tr-TR,tr;q=0.9',
          'X-Requested-With': 'XMLHttpRequest',
        },
        validateStatus: (s) => s < 500,
      })
    )
  );

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const parsed = parseProductPayload(result.value.data, url);
    if (parsed) return parsed;
  }

  return null;
}
