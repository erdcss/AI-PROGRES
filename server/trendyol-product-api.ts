import axios from 'axios';
import {
  extractOriginalTrendyolPriceFromProduct,
  normalizeTrendyolKurus,
  parseTurkishPriceText,
} from './trendyol-price-utils';
import { normalizeTrendyolImages, filterValidProductImages, deepExtractImagesFromJson, mergeTrendyolImageLists } from './trendyol-image-utils';
import {
  brandFromTrendyolUrl,
  extractTrendyolProductId,
  isValidTrendyolProductTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';
import { isBlockedTrendyolTitle } from '@shared/trendyol-bot-detection';
import {
  resolveTrendyolVariants,
  unwrapTrendyolApiProductRoot,
} from './trendyol-variant-resolver';
import type { SanitizedVariants } from '@shared/trendyol-variant-utils';
import { pickRicherTrendyolVariants, variantRichnessScore } from '@shared/trendyol-variant-utils';
import {
  classifyTrendyolBlock,
  type BlockSignal,
} from './trendyol-block-guard';
import { trendyolAnti429Gate, withTrendyolRateLimit } from './trendyol-anti-429';

let lastApiBlockSignal: BlockSignal | null = null;

export function consumeLastTrendyolApiBlockSignal(): BlockSignal | null {
  const s = lastApiBlockSignal;
  lastApiBlockSignal = null;
  return s;
}

export interface TrendyolApiProduct {
  title: string;
  brand: string;
  price: { original: number; withProfit: number; currency: string };
  images: string[];
  description: string;
  category: string;
  variants?: SanitizedVariants;
  rawProduct?: Record<string, unknown>;
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
    const fromProduct = extractOriginalTrendyolPriceFromProduct({ price: raw, ...raw as object });
    if (fromProduct > 0) return fromProduct;
    const obj = raw as Record<string, unknown>;
    if (typeof obj.value === 'number') return normalizeApiPrice(obj.value);
    if (typeof obj.originalPrice === 'number') return normalizeApiPrice(obj.originalPrice);
    if (typeof obj.sellingPrice === 'number') return normalizeApiPrice(obj.sellingPrice);
    if (typeof obj.discountedPrice === 'number') return normalizeApiPrice(obj.discountedPrice);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function parseProductPayload(data: any, url: string): TrendyolApiProduct | null {
  const root = unwrapTrendyolApiProductRoot(data);
  if (!root) return null;

  let title = String(root.name || root.title || root.productName || '').trim();
  if (isBlockedTrendyolTitle(title) || !isValidTrendyolProductTitle(title)) {
    title = titleFromTrendyolUrl(url) || title;
  }

  const original = extractOriginalTrendyolPriceFromProduct(root);

  const images = extractImages(root);

  const urlTitle = titleFromTrendyolUrl(url);
  if ((!isValidTrendyolProductTitle(title) || isBlockedTrendyolTitle(title)) && urlTitle && original > 0) {
    title = urlTitle;
  }
  if (!isValidTrendyolProductTitle(title) && original <= 0 && images.length === 0) {
    return null;
  }

  const brandObj = asRecord(root.brand);
  const categoryObj = asRecord(root.category);

  const brand =
    readString(brandObj.name) ||
    readString(root.brandName) ||
    readString(root.brand) ||
    brandFromTrendyolUrl(url) ||
    "Marka";

  // Fiyat endpoint'i sadece fiyat dönebilir
  if (original <= 0 && images.length === 0 && !root.name && !root.title) {
    return null;
  }

  const resolvedVariants = resolveTrendyolVariants({
    product: root,
    url,
    productTitle: title,
  });

  return {
    title,
    brand,
    price: {
      original: original > 0 ? original : 0,
      withProfit: original > 0 ? Math.round(original * 1.1 * 100) / 100 : 0,
      currency: 'TRY',
    },
    images: filterValidProductImages(images),
    description: String(root.description || root.content || '').trim(),
    category:
      readString(categoryObj.name) ||
      readString(root.categoryName) ||
      readString(root.category),
    variants: resolvedVariants,
    rawProduct: root,
  };
}

function parsePriceOnlyPayload(data: any, url: string, base: TrendyolApiProduct): TrendyolApiProduct | null {
  const root = data?.result || data;
  const original = extractOriginalTrendyolPriceFromProduct(root) || normalizeApiPrice(root?.price ?? root);
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

// Yalnızca DNS'te çözülen host'lar — public-mdc/public/mdc/mobile-api.trendyol.com
// artık ENOTFOUND döndürüyor ve her denemede saniyelerce boşa DNS beklemesine yol açıyordu.
const API_ENDPOINTS = (productId: string) => [
  `https://apigw.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
  `https://apigw.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
  `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
  `https://apigw.trendyol.com/discovery-web-productgw-service/api/price/${productId}`,
];

/** Tüm API endpoint'lerinden görsel topla — deploy'da fiyat endpoint'i görsel içerebilir */
export async function fetchTrendyolImagesFromApi(url: string): Promise<string[]> {
  const productId = extractTrendyolProductId(url);
  if (!productId) return [];

  const headers = API_HEADERS(productId, url);
  const fastEndpoints = [
    `https://apigw.trendyol.com/discovery-web-productgw-service/api/productDetail/${productId}`,
    `https://apigw.trendyol.com/discovery-web-productdetailgw-service/api/productDetail/${productId}`,
    `https://api.trendyol.com/webmobileapi/v1/product/${productId}`,
    `https://apigw.trendyol.com/discovery-web-productgw-service/api/price/${productId}`,
  ];
  const collected: unknown[] = [];
  const timeoutMs = Number(process.env.TRENDYOL_API_TIMEOUT_MS) || 4_000;

  for (const endpoint of fastEndpoints) {
    const fetched = await fetchTrendyolApiEndpoint(endpoint, headers, timeoutMs);
    if (!fetched) continue;
    const { status, data } = fetched;
    if (status === 403 || status === 429 || status >= 500) continue;

    const parsed = parseProductPayload(data, url);
    if (parsed?.images?.length) collected.push(...parsed.images);
    collected.push(...deepExtractImagesFromJson(data));
    if (filterValidProductImages(collected).length >= 3) break;
  }

  return filterValidProductImages(collected);
}

/** Tek endpoint — sıralı deneme (paralel 4 istek ban riskini artırıyordu) */
async function fetchTrendyolApiEndpoint(
  endpoint: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; data: unknown; contentType: string } | null> {
  try {
    const response = await withTrendyolRateLimit(`api:${endpoint.split("/").slice(-2).join("/")}`, () =>
      axios.get(endpoint, {
        timeout: timeoutMs,
        headers,
        validateStatus: (s) => s < 500,
      }),
    );
    if (response.status === 429) {
      trendyolAnti429Gate.reportRateLimit(`api-status-${response.status}`);
    } else if (response.status >= 200 && response.status < 300) {
      trendyolAnti429Gate.reportSuccess();
    }
    return {
      status: response.status,
      data: response.data,
      contentType: String(response.headers?.['content-type'] ?? 'unknown'),
    };
  } catch (reason: unknown) {
    const err = reason as {
      message?: string;
      response?: { status?: number; headers?: Record<string, unknown>; data?: unknown };
    };
    const httpStatus = Number(err?.response?.status) || 0;
    if (httpStatus === 429) {
      trendyolAnti429Gate.reportRateLimit(`api-error-${httpStatus}`);
    }
    const contentType = String(
      err?.response?.headers?.['content-type'] ??
        (httpStatus === 556 ? 'upstream-556' : 'network-error'),
    );
    const bodyPreview = String(
      err?.message ??
        (typeof err?.response?.data === 'string'
          ? err.response.data
          : JSON.stringify(err?.response?.data ?? err ?? '')),
    ).slice(0, 500);
    return { status: httpStatus, data: bodyPreview, contentType };
  }
}

function scoreTrendyolApiProduct(parsed: TrendyolApiProduct): number {
  let score = variantRichnessScore(parsed.variants);
  if (parsed.price.original > 0) score += 50;
  score += Math.min(parsed.images.length, 20);
  if (parsed.rawProduct?.slicedAttributes) score += 25;
  return score;
}

export async function fetchTrendyolProductByUrl(url: string): Promise<TrendyolApiProduct | null> {
  const productId = extractTrendyolProductId(url);
  if (!productId) return null;

  const slugTitle = titleFromTrendyolUrl(url);
  let bestPartial: TrendyolApiProduct | null = null;
  const parsedList: TrendyolApiProduct[] = [];

  const endpoints = API_ENDPOINTS(productId);
  const headers = API_HEADERS(productId, url);
  const timeoutMs = Number(process.env.TRENDYOL_API_TIMEOUT_MS) || 4_000;

  const debugSamples: Array<{
    endpoint: string;
    status: number;
    contentType: string;
    bodyPreview: string;
  }> = [];

  for (const endpoint of endpoints) {
    const fetched = await fetchTrendyolApiEndpoint(endpoint, headers, timeoutMs);
    if (!fetched) continue;

    const { status, data, contentType } = fetched;
    const bodyPreview =
      typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data ?? {}).slice(0, 500);

    if (status === 403 || status === 429 || status >= 500) {
      debugSamples.push({ endpoint, status, contentType, bodyPreview });
      if (status === 403 || status === 429 || status === 556) break;
      continue;
    }

    let parsed: TrendyolApiProduct | null = null;
    try {
      parsed = parseProductPayload(data, url);
    } catch {
      debugSamples.push({ endpoint, status, contentType, bodyPreview });
      continue;
    }

    if (parsed) {
      parsedList.push(parsed);
      if (!bestPartial || parsed.price.original > bestPartial.price.original) {
        bestPartial = parsed;
      }
      // Tam ürün (fiyat + görsel + varyant) — kalan endpoint'lere gerek yok
      if (
        parsed.price.original > 0 &&
        parsed.images.length > 0 &&
        variantRichnessScore(parsed.variants) >= 10
      ) {
        break;
      }
    } else if (slugTitle && bestPartial && bestPartial.price.original <= 0) {
      const priceOnly = parsePriceOnlyPayload(data, url, bestPartial);
      if (priceOnly) bestPartial = priceOnly;
    } else if (!parsed && (status === 200 || status === 204)) {
      debugSamples.push({ endpoint, status, contentType, bodyPreview });
    }
  }

  if (parsedList.length === 0) {
    if (bestPartial && (bestPartial.price.original > 0 || bestPartial.images.length > 0)) {
      return bestPartial;
    }
    if (debugSamples.length > 0) {
      const blocked556 = debugSamples.some(
        (s) => s.status === 556 || /status code 556/i.test(s.bodyPreview),
      );
      const sample = debugSamples[0];
      lastApiBlockSignal = classifyTrendyolBlock({
        source: 'api',
        httpStatus: sample?.status,
        bodyPreview: debugSamples.map((s) => s.bodyPreview).join(' | ').slice(0, 800),
        contentClass: blocked556 ? 'upstream-556' : undefined,
      });
      console.warn('[Trendyol API] api-null-response debug:', {
        productId,
        boutiqueId: new URL(url).searchParams.get('boutiqueId'),
        merchantId: new URL(url).searchParams.get('merchantId'),
        upstreamBlocked: blocked556 ? 'upstream-556' : undefined,
        samples: debugSamples.slice(0, 4),
      });
    }
    return null;
  }

  const title =
    parsedList.find((p) => isValidTrendyolProductTitle(p.title))?.title ||
    slugTitle ||
    parsedList[0].title;

  const variantCandidates: SanitizedVariants[] = parsedList
    .map((p) => p.variants)
    .filter((v): v is SanitizedVariants => Boolean(v));

  for (const parsed of parsedList) {
    if (parsed.rawProduct) {
      variantCandidates.push(
        resolveTrendyolVariants({
          product: parsed.rawProduct,
          url,
          productTitle: title,
        }),
      );
    }
  }

  const mergedVariants = pickRicherTrendyolVariants(...variantCandidates);

  const base =
    parsedList.reduce((best, cur) =>
      scoreTrendyolApiProduct(cur) > scoreTrendyolApiProduct(best) ? cur : best,
    ) ?? parsedList[0];

  return {
    ...base,
    title: resolveProductTitleFromApi(title, base.title),
    variants: mergedVariants,
    rawProduct: base.rawProduct,
  };
}

function resolveProductTitleFromApi(preferred: string, fallback: string): string {
  if (isValidTrendyolProductTitle(preferred) && !isBlockedTrendyolTitle(preferred)) {
    return preferred;
  }
  return fallback;
}
