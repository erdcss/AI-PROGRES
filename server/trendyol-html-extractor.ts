/**
 * Trendyol ürün verisi — HTML kaynaklarından birleşik çıkarım (Puppeteer gerektirmez).
 */
import * as cheerio from 'cheerio';
import { fetchTrendyolHtml } from './http-scraper-fallback';
import { extractProductImages } from './trendyol-image-extractor';
import { mergeTrendyolImageLists, normalizeTrendyolImages, filterValidProductImages } from './trendyol-image-utils';
import {
  buildTrendyolPriceObject,
  extractOriginalTrendyolPriceFromProduct,
  normalizeTrendyolKurus,
  parseTurkishPriceText,
  resolveTrendyolOriginalListPrice,
} from './trendyol-price-utils';
import { getTrendyolProductFromState } from './trendyol-product-state';
import {
  brandFromTrendyolUrl,
  cleanTrendyolDisplayTitle,
  isInvalidTrendyolTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';
import {
  resolveTrendyolVariantBundle,
} from './trendyol-variant-resolver';
import {
  extractTrendyolEnrichmentFeatures,
  buildStockAnalysisFromVariants,
  type TrendyolStockAnalysis,
} from './trendyol-html-enrichment';
import type { SanitizedVariants } from '@shared/trendyol-variant-utils';
import {
  extractProductImagesFromHtmlRegex,
  isBlockedTrendyolHtml,
  isBlockedTrendyolTitle,
} from '@shared/trendyol-bot-detection';

export interface HtmlExtractedProduct {
  title: string;
  brand: string;
  price: { original: number; withProfit: number; currency: string };
  images: string[];
  description: string;
  category: string;
  variants: SanitizedVariants;
  features: Array<{ key: string; value: string }>;
  stockAnalysis: TrendyolStockAnalysis | null;
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
  const product = getTrendyolProductFromState(html);
  if (!product) return {};

  const price = extractOriginalTrendyolPriceFromProduct(product) || undefined;
  return {
    title: String(product.name || product.title || '').trim() || undefined,
    brand: String((product.brand as { name?: string })?.name || product.brand || '').trim() || undefined,
    price,
    images: normalizeTrendyolImages(
      ((product.images as unknown[]) || [])
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
    description: String(
      product.description ||
        product.contentDescription ||
        product.productDescription ||
        product.info ||
        "",
    ).trim(),
    category: String((product.category as { name?: string })?.name || product.categoryName || '').trim(),
  };
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
    const normalized = extractOriginalTrendyolPriceFromProduct(product);
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

function buildVariantsFromHtml(html: string, $: cheerio.CheerioAPI, title: string, url: string) {
  const { variants, stockAnalysis } = resolveTrendyolVariantBundle({
    html,
    url,
    productTitle: title,
  });
  return { variants, stockAnalysis };
}

/** Mevcut HTML string'inden parse — ağ isteği yapmaz */
export function parseTrendyolProductFromHtmlContent(
  html: string,
  url: string,
  source = "inline-html",
): HtmlExtractedProduct | null {
  if (!html || html.length < 500) return null;

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
  title = cleanTrendyolDisplayTitle(title);
  if (isInvalidTrendyolTitle(title) || isBlockedTrendyolTitle(title)) {
    title = titleFromTrendyolUrl(url) || title;
  }
  if (!title || title.length < 3 || isBlockedTrendyolTitle(title)) {
    title = titleFromTrendyolUrl(url) || '';
  }
  if (!title || title.length < 3) return null;

  const brand =
    fromState.brand ||
    fromNext.brand ||
    brandFromTrendyolUrl(url) ||
    'Marka';

  let original = resolveTrendyolOriginalListPrice({
    html,
    product: getTrendyolProductFromState(html),
    jsonLdPrice: fromLdPrice,
    domPrice: (() => {
      const nodes = $(
        ".prc-org, .original-price, .price-original, .prc-dsc, [data-testid=\"price-current-price\"], .product-price-container, .price",
      );
      const vals: number[] = [];
      nodes.each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (!text) return;
        const cleaned = text
          .replace(/sepette\s*[\d.,]+\s*tl/gi, " ")
          .replace(/sepette\s*\d+\s*tl\s*indirim/gi, " ");
        const v = parseTurkishPriceText(cleaned) || parseTurkishPriceText(text);
        if (v >= 29 && v <= 500_000) vals.push(v);
      });
      if (vals.length === 0) return 0;
      vals.sort((a, b) => b - a);
      return vals[0];
    })(),
  });

  if (original <= 0) {
    original = fromState.price || fromNext.price?.original || 0;
  }

  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || '';
  const regexImages = extractProductImagesFromHtmlRegex(html);
  const images = filterValidProductImages(
    mergeTrendyolImageLists(ogImage ? [ogImage] : [], fromState.images, fromNext.images, fromExtractor, regexImages),
  );

  const { variants, stockAnalysis: variantStock } = buildVariantsFromHtml(html, $, title, url);
  const features = extractTrendyolEnrichmentFeatures(html, $);
  const stockAnalysis = variantStock ?? buildStockAnalysisFromVariants(variants);

  const blockedPage = isBlockedTrendyolHtml(html);
  if (original <= 0 && images.length === 0) return null;
  if (blockedPage && images.length === 0) return null;

  return {
    title,
    brand,
    price: original > 0 ? buildTrendyolPriceObject(original) : { original: 0, withProfit: 0, currency: 'TRY' },
    images,
    description: fromState.description || fromNext.description || '',
    category: fromState.category || fromNext.category || 'Genel',
    variants,
    features,
    stockAnalysis,
    htmlSource: source,
  };
}

/** HTML + cache kaynaklarından tam ürün verisi çıkarır (ağ isteği yapar) */
export async function extractTrendyolProductFromHtml(url: string): Promise<HtmlExtractedProduct | null> {
  const fetched = await fetchTrendyolHtml(url);
  if (!fetched?.html || fetched.html.length < 500) return null;
  return parseTrendyolProductFromHtmlContent(fetched.html, url, fetched.source);
}
