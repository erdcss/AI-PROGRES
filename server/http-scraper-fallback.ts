/**
 * Railway-safe Trendyol scraper — axios + cheerio, no browser required.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchTrendyolProductByUrl } from './trendyol-product-api';
import {
  buildTrendyolPriceObject,
  normalizeTrendyolPriceValue,
  parseTurkishPriceText,
} from './trendyol-price-utils';
import { normalizeTrendyolImages } from './trendyol-image-utils';
import { extractProductImages } from './trendyol-image-extractor';
import { tryGoogleCache, tryWaybackMachine, tryProxyServices } from './alternative-data-sources';
import {
  EMPTY_TRENDYOL_VARIANTS,
  sanitizeTrendyolVariants,
} from '@shared/trendyol-variant-utils';
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
  if (typeof raw === 'number' && raw > 0) {
    return normalizeTrendyolPriceValue(raw);
  }
  if (typeof raw === 'string') {
    return parseTurkishPriceText(raw);
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
      images: normalizeTrendyolImages(
        (product.images || [])
          .map((img: any) => img.url || img.src || img.path || img.link || (typeof img === 'string' ? img : ''))
          .filter(Boolean),
      ),
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
      images: normalizeTrendyolImages(
        (product.images || product.media?.images || [])
          .map((img: any) => img.url || img.src || img.path || img.link || (typeof img === 'string' ? img : ''))
          .filter(Boolean),
      ),
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
      variants: sanitizeTrendyolVariants(
        apiProduct.variants?.length ? { allVariants: apiProduct.variants } : undefined,
      ),
      features: [],
      tags: [],
      description: apiProduct.description,
      category: apiProduct.category || 'Genel',
    },
  };
}

function parseHtmlProduct(html: string, url: string, $: cheerio.CheerioAPI) {
  const fromLd = extractFromJsonLd($);
  const fromState = extractFromProductState(html);
  const fromNext = extractFromNextData(html);
  const fromMeta = extractFromMeta($);
  const fromExtractor = extractProductImages(html, $).images;

  let title = fromLd.title || fromState.title || fromNext.title || fromMeta.title || '';
  if (isInvalidTrendyolTitle(title)) {
    title = titleFromTrendyolUrl(url) || '';
  }
  const brand = fromLd.brand || fromState.brand || fromNext.brand || brandFromTrendyolUrl(url) || 'Marka';
  const price = fromLd.price || fromState.price || fromNext.price || { original: 0, withProfit: 0, currency: 'TRY' };
  const images = normalizeTrendyolImages([
    ...(fromLd.images || []),
    ...(fromState.images || []),
    ...(fromNext.images || []),
    ...(fromMeta.images || []),
    ...fromExtractor,
  ]);

  return {
    title,
    brand,
    price,
    images,
    description: fromLd.description || fromNext.description || '',
    category: fromNext.category || 'Genel',
  };
}

export async function fetchTrendyolHtml(url: string): Promise<{ html: string; source: string } | null> {
  const headerSets = [
    {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
      Referer: 'https://www.trendyol.com/',
    },
    {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      Referer: 'https://www.google.com/',
    },
  ];

  for (const headers of headerSets) {
    try {
      const response = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,
        headers: { ...headers, 'Cache-Control': 'no-cache' },
        validateStatus: (s) => s < 500,
      });

      const html = String(response.data || '');
      if (response.status !== 403 && response.status !== 429 && html.length >= 5000) {
        return { html, source: 'direct' };
      }
    } catch {
      /* try next */
    }
  }

  const cache = await tryGoogleCache(url);
  if (cache?.html && cache.html.length >= 500) {
    return { html: cache.html, source: 'google-cache' };
  }

  const proxy = await tryProxyServices(url);
  if (proxy?.html && proxy.html.length >= 500) {
    return { html: proxy.html, source: 'proxy-referer' };
  }

  const wayback = await tryWaybackMachine(url);
  if (wayback?.html && wayback.html.length >= 500) {
    return { html: wayback.html, source: 'wayback' };
  }

  return null;
}

export async function scrapeTrendyolHttpFallback(url: string): Promise<HttpScrapeResult> {
  if (!url.includes('trendyol.com')) {
    return { success: false, error: 'URL geçersiz — sadece Trendyol URL desteklenir', step: 'validate_url' };
  }

  const apiProduct = await fetchTrendyolProductByUrl(url);
  // Fiyat var ama görsel yoksa HTML parse et — deploy'da API sık sık sadece fiyat döner
  if (apiProduct && apiProduct.price.original > 0 && apiProduct.images.length > 0) {
    return apiProductToResult(apiProduct, 'trendyol_api');
  }

  try {
    const fetched = await fetchTrendyolHtml(url);
    if (!fetched) {
      if (apiProduct && apiProduct.price.original > 0) {
        return apiProductToResult(apiProduct, 'trendyol_api_partial');
      }
      return {
        success: false,
        error: 'Trendyol sayfası engelledi — lütfen birkaç dakika sonra tekrar deneyin',
        step: 'fetch_blocked',
      };
    }

    const { html, source } = fetched;
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
    const parsed = parseHtmlProduct(html, url, $);
    let { title, brand, price, images, description, category } = parsed;

    if (apiProduct) {
      if (apiProduct.price.original > 0 && price.original <= 0) {
        price = apiProduct.price;
      }
      if ((!title || isInvalidTrendyolTitle(title)) && apiProduct.title) {
        title = apiProduct.title;
      }
      if ((!brand || brand === 'Marka') && apiProduct.brand) {
        brand = apiProduct.brand;
      }
      images = normalizeTrendyolImages([...(apiProduct.images || []), ...images]);
    }

    if (isInvalidTrendyolTitle(title) || !title || title.length < 3) {
      title = titleFromTrendyolUrl(url) || title || '';
    }

    if ((!title || isInvalidTrendyolTitle(title) || title.length < 3) && price.original <= 0 && images.length === 0) {
      return {
        success: false,
        error: 'Ürün bilgisi bulunamadı — sayfa yapısı tanınmadı',
        step: 'parse_title',
        details: `Kaynak: ${source}`,
      };
    }

    if (price.original <= 0 && images.length === 0) {
      if (apiProduct && apiProduct.price.original > 0) {
        return apiProductToResult(apiProduct, 'trendyol_api_partial');
      }
      return {
        success: false,
        error: 'Görsel ve fiyat parse edilemedi',
        step: 'parse_price_images',
        details: `Kaynak: ${source}`,
      };
    }

    if (price.original <= 0) {
      const priceText = $('.prc-dsc, [class*="price"], .product-price').first().text();
      const parsedPrice = parseTurkishPriceText(priceText);
      if (parsedPrice > 0) {
        price.original = parsedPrice;
        price.withProfit = Math.round(parsedPrice * 1.1 * 100) / 100;
      }
    }

    if (price.original > 0) {
      const normalized = buildTrendyolPriceObject(price.original, 0.1);
      price.original = normalized.original;
      price.withProfit = normalized.withProfit;
    }

    return {
      success: true,
      step: source === 'direct' ? 'http_fallback_complete' : `http_fallback_${source}`,
      product: {
        title,
        brand,
        price,
        images,
        variants: EMPTY_TRENDYOL_VARIANTS,
        features: [],
        tags: [],
        description,
        category,
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
