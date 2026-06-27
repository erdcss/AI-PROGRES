/**
 * Trendyol ürün verisi — HTML kaynaklarından birleşik çıkarım (Puppeteer gerektirmez).
 */
import * as cheerio from 'cheerio';
import { fetchTrendyolHtml } from './http-scraper-fallback';
import { extractProductImages } from './trendyol-image-extractor';
import { mergeTrendyolImageLists, normalizeTrendyolImages, filterValidProductImages } from './trendyol-image-utils';
import {
  buildTrendyolPriceObject,
  normalizeTrendyolKurus,
  parseTurkishPriceText,
} from './trendyol-price-utils';
import {
  brandFromTrendyolUrl,
  isInvalidTrendyolTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';
import {
  buildVariantsFromSlicing,
  parseSlicingAttributesFromHtml,
} from './trendyol-slicing-parser';
import {
  EMPTY_TRENDYOL_VARIANTS,
  sanitizeTrendyolVariants,
} from '@shared/trendyol-variant-utils';

export interface HtmlExtractedProduct {
  title: string;
  brand: string;
  price: { original: number; withProfit: number; currency: string };
  images: string[];
  description: string;
  category: string;
  variants: ReturnType<typeof sanitizeTrendyolVariants>;
  htmlSource: string;
}

function parsePriceFromJsonLd($: cheerio.CheerioAPI): number {
  let found = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const ld = JSON.parse($(el).html() || '{}');
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        const offers = item.offers || item.hasVariant?.[0]?.offers;
        const offer = Array.isArray(offers) ? offers[0] : offers;
        const p = parseTurkishPriceText(String(offer?.price ?? ''));
        if (p > 0) found = p;
      }
    } catch {
      /* skip */
    }
  });
  return found;
}

function parseFromProductState(html: string): {
  title?: string;
  brand?: string;
  price?: number;
  images?: string[];
  description?: string;
  category?: string;
} {
  const match = html.match(/__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({[\s\S]*?});/);
  if (!match?.[1]) return {};
  try {
    const state = JSON.parse(match[1]);
    const product = state?.product;
    if (!product) return {};
    const rawPrice =
      product.price?.discountedPrice?.value ??
      product.price?.sellingPrice?.value ??
      product.price?.originalPrice?.value;
    const price =
      typeof rawPrice === 'number' && rawPrice > 0
        ? normalizeTrendyolKurus(rawPrice, 'api')
        : undefined;
    return {
      title: product.name || product.title,
      brand: product.brand?.name || product.brand,
      price,
      images: normalizeTrendyolImages(
        (product.images || [])
          .map((img: unknown) => {
            if (typeof img === 'string') return img;
            if (img && typeof img === 'object') {
              const r = img as Record<string, unknown>;
              return r.url || r.src || r.path || r.link || r.imageUrl || '';
            }
            return '';
          })
          .filter(Boolean),
      ),
      description: product.description || '',
      category: product.category?.name || product.categoryName || '',
    };
  } catch {
    return {};
  }
}

function parseFromNextData(html: string): Partial<HtmlExtractedProduct> {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return {};
  try {
    const data = JSON.parse(match[1]);
    const product =
      data?.props?.pageProps?.product ||
      data?.props?.pageProps?.initialState?.product ||
      data?.props?.pageProps?.initialState?.productDetail?.product;
    if (!product) return {};
    const rawPrice =
      product.price?.discountedPrice?.value ??
      product.price?.sellingPrice?.value ??
      product.price?.originalPrice?.value;
    const normalized =
      typeof rawPrice === 'number' && rawPrice > 0
        ? normalizeTrendyolKurus(rawPrice, 'api')
        : 0;
    return {
      title: product.name || product.title,
      brand: String(product.brand?.name || product.brand || '').trim(),
      price: normalized > 0 ? buildTrendyolPriceObject(normalized) : undefined,
      images: normalizeTrendyolImages(product.images || product.media?.images || []),
      description: product.description || '',
      category: product.category?.name || product.categoryName || '',
    };
  } catch {
    return {};
  }
}

function buildVariantsFromHtml(html: string, $: cheerio.CheerioAPI, title: string) {
  const slicing = parseSlicingAttributesFromHtml(html);
  const built = buildVariantsFromSlicing($, html);
  const hasRealOptions =
    slicing.colors.length > 0 ||
    slicing.sizes.length > 0 ||
    built.length > 0;

  if (!hasRealOptions) {
    return EMPTY_TRENDYOL_VARIANTS;
  }

  return sanitizeTrendyolVariants(
    {
      allVariants: built.map((v) => ({
        color: v.color,
        colorCode: v.colorCode,
        size: v.size,
        inStock: v.inStock,
      })),
    },
    { productTitle: title },
  );
}

/** HTML + cache kaynaklarından tam ürün verisi çıkarır */
export async function extractTrendyolProductFromHtml(url: string): Promise<HtmlExtractedProduct | null> {
  const fetched = await fetchTrendyolHtml(url);
  if (!fetched?.html || fetched.html.length < 500) return null;

  const { html, source } = fetched;
  const $ = cheerio.load(html);
  const fromState = parseFromProductState(html);
  const fromNext = parseFromNextData(html);
  const fromExtractor = extractProductImages(html, $).images;
  const fromLdPrice = parsePriceFromJsonLd($);

  let title =
    fromState.title ||
    fromNext.title ||
    $('meta[property="og:title"]').attr('content') ||
    $('h1').first().text().trim() ||
    '';
  if (isInvalidTrendyolTitle(title)) {
    title = titleFromTrendyolUrl(url) || title;
  }
  if (!title || title.length < 3) return null;

  const brand =
    fromState.brand ||
    fromNext.brand ||
    brandFromTrendyolUrl(url) ||
    'Marka';

  let original =
    fromState.price ||
    fromNext.price?.original ||
    fromLdPrice ||
    parseTurkishPriceText($('.prc-dsc, [data-testid="price-current-price"], .price').first().text());

  if (original <= 0) {
    const priceMatch = html.match(/"discountedPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
    if (priceMatch) original = normalizeTrendyolKurus(parseInt(priceMatch[1], 10), 'api');
  }
  if (original <= 0) {
    const sellingMatch = html.match(/"sellingPrice"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
    if (sellingMatch) original = normalizeTrendyolKurus(parseInt(sellingMatch[1], 10), 'api');
  }

  const images = filterValidProductImages(
    mergeTrendyolImageLists(fromState.images, fromNext.images, fromExtractor),
  );

  const variants = buildVariantsFromHtml(html, $, title);

  if (original <= 0 && images.length === 0) return null;

  return {
    title,
    brand,
    price: original > 0 ? buildTrendyolPriceObject(original) : { original: 0, withProfit: 0, currency: 'TRY' },
    images,
    description: fromState.description || fromNext.description || '',
    category: fromState.category || fromNext.category || 'Genel',
    variants,
    htmlSource: source,
  };
}
