/**
 * Railway-safe Trendyol scraper — axios + cheerio, no browser required.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchTrendyolProductByUrl } from './trendyol-product-api';
import {
  brandFromTrendyolUrl,
  isInvalidTrendyolTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';

export interface HttpScrapeResult {
  success: boolean;
  product?: {
    title: string;
    brand: string;
    price: { original: number; withProfit: number; currency: string };
    images: string[];
    variants: {
      colors: string[];
      sizes: string[];
      allVariants: Array<{ color: string; size: string; inStock: boolean }>;
    };
    features: Array<{ key: string; value: string }>;
    tags: string[];
    description: string;
    category: string;
  };
  error?: string;
  step?: string;
  details?: string;
}

function parsePrice(raw: unknown): number {
  if (typeof raw === 'number' && raw > 0) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function extractFromJsonLd($: cheerio.CheerioAPI): Partial<HttpScrapeResult['product']> {
  const out: Partial<HttpScrapeResult['product']> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        if (item['@type'] === 'Product' || item['@type'] === 'ProductGroup') {
          if (item.name) out.title = String(item.name).trim();
          if (item.brand?.name) out.brand = String(item.brand.name).trim();
          else if (typeof item.brand === 'string') out.brand = item.brand;
          if (item.description) out.description = String(item.description).trim();
          const offers = item.offers || (Array.isArray(item.hasVariant) ? item.hasVariant[0]?.offers : null);
          const offer = Array.isArray(offers) ? offers[0] : offers;
          if (offer?.price) {
            const original = parsePrice(offer.price);
            out.price = {
              original,
              withProfit: Math.round(original * 1.1 * 100) / 100,
              currency: offer.priceCurrency || 'TRY',
            };
          }
          if (item.image) {
            const imgs = Array.isArray(item.image) ? item.image : [item.image];
            out.images = imgs.map((i: string | { url?: string }) =>
              typeof i === 'string' ? i : i.url || ''
            ).filter(Boolean);
          }
        }
      }
    } catch {
      /* skip malformed JSON-LD */
    }
  });
  return out;
}

function extractFromProductState(html: string): Partial<HttpScrapeResult['product']> {
  const stateMatch = html.match(/__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
  if (!stateMatch?.[1]) return {};
  try {
    const state = JSON.parse(stateMatch[1]);
    const product = state?.product;
    if (!product) return {};
    const original = parsePrice(
      product.price?.sellingPrice?.value ?? product.price?.discountedPrice?.value
    );
    return {
      title: product.name || product.title,
      brand: product.brand?.name || product.brand,
      price:
        original > 0
          ? { original, withProfit: Math.round(original * 1.1 * 100) / 100, currency: 'TRY' }
          : undefined,
      images: (product.images || [])
        .map((img: any) => img.url || img.src || (typeof img === 'string' ? img : ''))
        .filter(Boolean),
      description: product.description || '',
      category: product.category?.name || product.categoryName || '',
    };
  } catch {
    return {};
  }
}

function extractFromNextData(html: string): Partial<HttpScrapeResult['product']> {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return {};
  try {
    const data = JSON.parse(match[1]);
    const product =
      data?.props?.pageProps?.product ||
      data?.props?.pageProps?.initialState?.product ||
      data?.props?.pageProps?.initialState?.productDetail?.product ||
      data?.props?.pageProps?.initialData?.product;
    if (!product) return {};
    const original = parsePrice(product.price?.sellingPrice?.value ?? product.price?.discountedPrice?.value);
    return {
      title: product.name || product.title,
      brand: product.brand?.name || product.brand,
      price: original > 0
        ? { original, withProfit: Math.round(original * 1.1 * 100) / 100, currency: 'TRY' }
        : undefined,
      images: (product.images || product.media?.images || [])
        .map((img: any) => img.url || img.src || (typeof img === 'string' ? img : ''))
        .filter(Boolean),
      description: product.description || '',
      category: product.category?.name || product.categoryName || '',
    };
  } catch {
    return {};
  }
}

function extractFromMeta($: cheerio.CheerioAPI): Partial<HttpScrapeResult['product']> {
  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim();
  const images: string[] = [];
  const ogImg = $('meta[property="og:image"]').attr('content');
  if (ogImg) images.push(ogImg);
  return { title: title || undefined, images: images.length ? images : undefined };
}

function apiProductToResult(
  apiProduct: Awaited<ReturnType<typeof fetchTrendyolProductByUrl>>,
  step: string
): HttpScrapeResult {
  if (!apiProduct) {
    return { success: false, error: 'API sonucu boş', step };
  }
  return {
    success: true,
    step,
    product: {
      title: apiProduct.title,
      brand: apiProduct.brand,
      price: apiProduct.price,
      images: apiProduct.images,
      variants: {
        colors: ['Standart'],
        sizes: ['Tek Beden'],
        allVariants: [{ color: 'Standart', size: 'Tek Beden', inStock: true }],
      },
      features: [],
      tags: [],
      description: apiProduct.description,
      category: apiProduct.category || 'Genel',
    },
  };
}

export async function scrapeTrendyolHttpFallback(url: string): Promise<HttpScrapeResult> {
  if (!url.includes('trendyol.com')) {
    return { success: false, error: 'URL geçersiz — sadece Trendyol URL desteklenir', step: 'validate_url' };
  }

  const apiProduct = await fetchTrendyolProductByUrl(url);
  if (apiProduct) {
    return apiProductToResult(apiProduct, 'trendyol_api');
  }

  try {
    const response = await axios.get(url, {
      timeout: 25000,
      maxRedirects: 5,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'tr-TR,tr;q=0.9',
      },
      validateStatus: (s) => s < 500,
    });

    if (response.status === 403 || response.status === 429) {
      return {
        success: false,
        error: 'Trendyol sayfası engelledi — lütfen birkaç dakika sonra tekrar deneyin',
        step: 'fetch_blocked',
        details: `HTTP ${response.status}`,
      };
    }

    const html = String(response.data || '');
    if (html.length < 500) {
      return { success: false, error: 'Trendyol yanıtı boş', step: 'fetch_empty' };
    }

    const blocked =
      html.includes('captcha') ||
      html.includes('Access Denied') ||
      (html.includes('trendyol.com') && html.length < 3000 && !html.includes('product'));
    if (blocked) {
      return {
        success: false,
        error: 'Trendyol bot koruması tespit edildi',
        step: 'blocked_page',
      };
    }

    const $ = cheerio.load(html);
    const fromLd = extractFromJsonLd($);
    const fromState = extractFromProductState(html);
    const fromNext = extractFromNextData(html);
    const fromMeta = extractFromMeta($);

    let title = fromLd.title || fromState.title || fromNext.title || fromMeta.title || '';
    if (isInvalidTrendyolTitle(title)) {
      title = titleFromTrendyolUrl(url) || '';
    }
    const brand = fromLd.brand || fromState.brand || fromNext.brand || brandFromTrendyolUrl(url) || 'Marka';
    const price = fromLd.price || fromState.price || fromNext.price || { original: 0, withProfit: 0, currency: 'TRY' };
    const images = [
      ...new Set([
        ...(fromLd.images || []),
        ...(fromState.images || []),
        ...(fromNext.images || []),
        ...(fromMeta.images || []),
      ]),
    ];

    if (isInvalidTrendyolTitle(title) || !title || title.length < 3) {
      return {
        success: false,
        error: 'Ürün bilgisi bulunamadı — sayfa yapısı tanınmadı',
        step: 'parse_title',
        details: 'JSON-LD, __PRODUCT_DETAIL__, __NEXT_DATA__ ve meta tag parse başarısız',
      };
    }

    if (price.original <= 0 && images.length === 0) {
      return {
        success: false,
        error: 'Görsel ve fiyat parse edilemedi',
        step: 'parse_price_images',
      };
    }

    if (price.original <= 0) {
      const priceText = $('.prc-dsc, [class*="price"], .product-price').first().text();
      const parsed = parsePrice(priceText);
      if (parsed > 0) {
        price.original = parsed;
        price.withProfit = Math.round(parsed * 1.1 * 100) / 100;
      }
    }

    return {
      success: true,
      step: 'http_fallback_complete',
      product: {
        title,
        brand,
        price,
        images,
        variants: {
          colors: ['Standart'],
          sizes: ['Tek Beden'],
          allVariants: [{ color: 'Standart', size: 'Tek Beden', inStock: true }],
        },
        features: [],
        tags: [],
        description: fromLd.description || fromNext.description || '',
        category: fromNext.category || 'Genel',
      },
    };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('ENOTFOUND') || msg.includes('timeout')) {
      return { success: false, error: 'Trendyol sayfasına bağlanılamadı', step: 'network_error', details: msg };
    }
    return { success: false, error: 'Ürün çekme başarısız', step: 'unknown_error', details: msg };
  }
}
