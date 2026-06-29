import { fetchTrendyolProductByUrl } from './trendyol-product-api';
import {
  brandFromTrendyolUrl,
  cleanTrendyolDisplayTitle,
  isValidTrendyolProductTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';
import {
  buildTrendyolPriceObject,
  normalizeTrendyolPriceValue,
  pickPlausibleTrendyolPrice,
} from './trendyol-price-utils';
import {
  mergeTrendyolImageLists,
  normalizeTrendyolImages,
  filterValidProductImages,
} from './trendyol-image-utils';
import {
  hasRealTrendyolVariants,
  sanitizeTrendyolVariants,
} from '@shared/trendyol-variant-utils';

import { isBlockedTrendyolTitle } from '@shared/trendyol-bot-detection';

const PLACEHOLDER_TITLES = new Set([
  'Trendyol Ürünü',
  'Trendyol',
  'Product',
  'trendyol.com',
  'Ürün',
  'Ürün Yüklenemedi',
  'Welcome to Trendyol',
]);

export function resolveProductTitle(url: string, title?: string | null): string {
  const t = cleanTrendyolDisplayTitle(String(title || "").trim());
  if (t && isValidTrendyolProductTitle(t) && !PLACEHOLDER_TITLES.has(t)) {
    return t;
  }
  return titleFromTrendyolUrl(url) || t || 'Ürün Bilgisi Alınamadı';
}

function needsPrice(price: unknown): boolean {
  if (!price || typeof price !== 'object') return true;
  const original = (price as { original?: number }).original;
  return !original || original <= 0;
}

function normalizeImages(images: unknown): string[] {
  return normalizeTrendyolImages(images);
}

function hasValidImages(images: unknown): boolean {
  return filterValidProductImages(images).length > 0;
}

export function hasUsableTrendyolResult(result: any): boolean {
  if (!result) return false;
  const title = resolveProductTitle(result.sourceUrl || result.url || '', result.title);
  const hasTitle = isValidTrendyolProductTitle(title) && !PLACEHOLDER_TITLES.has(title);
  const hasPrice = !needsPrice(result.price);
  const hasImages = hasValidImages(result.images);
  return hasTitle && (hasPrice || hasImages);
}

/** Scrape sonrası başlık/fiyat/görsel düzelt; sahte placeholder kullanma */
export async function enrichTrendyolResult(url: string, result: any): Promise<any> {
  if (!result) return result;

  result.sourceUrl = result.sourceUrl || url;

  // Local Agent veya pipeline'dan gelen tam veri — cloud'da tekrar direct fetch yapma
  if (result._fromLocalAgent || result._sourceAccessStrategy === "local_agent") {
    result.title = resolveProductTitle(url, result.title);
    if (hasUsableTrendyolResult(result)) {
      return result;
    }
  }

  const titleWasPlaceholder =
    PLACEHOLDER_TITLES.has(String(result.title || '').trim()) ||
    isBlockedTrendyolTitle(result.title) ||
    !isValidTrendyolProductTitle(result.title);

  result.title = resolveProductTitle(url, result.title);

  const { isCloudRuntime } = await import('@shared/deploy-runtime');
  if (isCloudRuntime()) {
    const missingImagesAfterFirstPass = normalizeImages(result.images).length === 0;
    if (missingImagesAfterFirstPass || titleWasPlaceholder) {
      const { extractTrendyolProductFromHtml } = await import('./trendyol-html-extractor');
      const htmlProduct = await extractTrendyolProductFromHtml(url);
      if (htmlProduct) {
        result.title = resolveProductTitle(url, htmlProduct.title || result.title);
        if (htmlProduct.images.length > 0) result.images = htmlProduct.images;
        if (hasRealTrendyolVariants(htmlProduct.variants)) result.variants = htmlProduct.variants;
        if (needsPrice(result.price) && htmlProduct.price.original > 0) result.price = htmlProduct.price;
      }
    }
    result.title = resolveProductTitle(url, result.title);
  }

  const missingPrice = needsPrice(result.price);
  const missingImages = !hasValidImages(result.images);
  const wasBlocked = result.blocked === true;

  if (missingPrice || missingImages || titleWasPlaceholder || wasBlocked) {
    const alreadyFromBrowser =
      !wasBlocked &&
      (String(result.extractionMethod || '').includes('scenario') ||
        result._priceSource === 'scenario-scrape');

    if (!alreadyFromBrowser) {
      const { scrapeTrendyolHttpFallback } = await import('./http-scraper-fallback');
      const http = await scrapeTrendyolHttpFallback(url);
      if (http.success && http.product) {
        const p = http.product;
        if (missingPrice && p.price.original > 0) {
          result.price = p.price;
          result._priceSource = 'http-fallback';
        }
        if (missingImages && p.images.length > 0) {
          result.images = p.images;
        }
        if (!isValidTrendyolProductTitle(result.title) || PLACEHOLDER_TITLES.has(String(result.title || ''))) {
          result.title = resolveProductTitle(url, p.title);
        }
        if (p.brand && (!result.brand || result.brand === 'Bilinmiyor' || result.brand === 'Marka')) {
          result.brand = p.brand;
        }
        if (p.description && !result.description) result.description = p.description;
        if (p.category && !result.category) result.category = p.category;
      } else {
        const api = await fetchTrendyolProductByUrl(url);
        if (api) {
          if (missingPrice && api.price.original > 0) {
            result.price = api.price;
            result._priceSource = 'trendyol-api';
          }
          if (missingImages && api.images.length > 0) result.images = api.images;
          if (!isValidTrendyolProductTitle(result.title)) result.title = resolveProductTitle(url, api.title);
          if (api.brand && (!result.brand || result.brand === 'Bilinmiyor')) result.brand = api.brand;
        }
      }
    }

    let stillMissingPrice = needsPrice(result.price);
    let stillMissingImages = !hasValidImages(result.images);
    const missingVariants = !hasRealTrendyolVariants(result.variants);

    if (stillMissingPrice || stillMissingImages || missingVariants) {
      const { extractTrendyolProductFromHtml } = await import('./trendyol-html-extractor');
      const htmlProduct = await extractTrendyolProductFromHtml(url);
      if (htmlProduct) {
        console.log(
          `📄 HTML extractor (${htmlProduct.htmlSource}): price=${htmlProduct.price.original}, images=${htmlProduct.images.length}`,
        );
        if (stillMissingPrice && htmlProduct.price.original > 0) {
          result.price = htmlProduct.price;
          result._priceSource = 'html-extractor';
          stillMissingPrice = false;
        }
        if (stillMissingImages && htmlProduct.images.length > 0) {
          result.images = htmlProduct.images;
          stillMissingImages = false;
        }
        if (missingVariants && hasRealTrendyolVariants(htmlProduct.variants)) {
          result.variants = htmlProduct.variants;
        }
        if (!isValidTrendyolProductTitle(result.title)) {
          result.title = resolveProductTitle(url, htmlProduct.title);
        }
        if (htmlProduct.brand && (!result.brand || result.brand === 'Bilinmiyor')) {
          result.brand = htmlProduct.brand;
        }
        if (htmlProduct.description && !result.description) result.description = htmlProduct.description;
        if (htmlProduct.category && !result.category) result.category = htmlProduct.category;
      }
    }

    if (stillMissingImages) {
      const { fetchTrendyolProductImages } = await import('./trendyol-image-fetcher');
      const fetchedImages = await fetchTrendyolProductImages(url);
      if (fetchedImages.length > 0) {
        result.images = fetchedImages;
        stillMissingImages = false;
      }
    }

    stillMissingPrice = needsPrice(result.price);
    stillMissingImages = !hasValidImages(result.images);

    const { isCloudRuntime } = await import('@shared/deploy-runtime');
    const skipPuppeteerOnCloud =
      isCloudRuntime() &&
      !stillMissingPrice &&
      !stillMissingImages;

    const needsVariantsOnly =
      !stillMissingPrice &&
      !stillMissingImages &&
      missingVariants &&
      isValidTrendyolProductTitle(result.title);

    if ((stillMissingPrice || stillMissingImages || needsVariantsOnly) && !alreadyFromBrowser && !result._puppeteerEnrichAttempted && !skipPuppeteerOnCloud) {
      result._puppeteerEnrichAttempted = true;
      try {
        console.log('🎭 enrich: HTTP/API yetersiz — Puppeteer scenario scrape deneniyor...');
        const { scenarioBasedScrape } = await import('./scenario-based-scraper');
        const scraped = await scenarioBasedScrape(url);
        if (scraped?.title && isValidTrendyolProductTitle(scraped.title)) {
          if (stillMissingPrice && scraped.price?.original > 0) {
            result.price = scraped.price;
            result._priceSource = 'scenario-scrape';
          }
          if (stillMissingImages && scraped.images?.length > 0) {
            result.images = scraped.images;
          }
          result.title = scraped.title;
          if (scraped.brand) result.brand = scraped.brand;
          if (scraped.description) result.description = scraped.description;
          if (scraped.features?.length) result.features = scraped.features;
          if (scraped.variants) result.variants = scraped.variants;
          result.extractionMethod = result.extractionMethod || 'scenario-scrape-enrich';
          result.scenario = scraped.scenario;
        }
      } catch (puppeteerErr: any) {
        console.log(`⚠️ enrich puppeteer fallback: ${puppeteerErr.message}`);
      }
    }
  }

  result.title = resolveProductTitle(url, result.title);

  if (!result.brand || result.brand === 'Bilinmiyor') {
    result.brand = brandFromTrendyolUrl(url) || result.brand || 'Marka';
  }

  result.images = filterValidProductImages(result.images);

  if (normalizeImages(result.images).length === 0) {
    const { fetchTrendyolProductImages } = await import('./trendyol-image-fetcher');
    const finalImages = await fetchTrendyolProductImages(url);
    if (finalImages.length > 0) {
      result.images = finalImages;
      console.log(`🖼️ Final görsel garantisi: ${finalImages.length} adet`);
    }
  }

  const normalizedOriginal = normalizeTrendyolPriceValue(result.price);
  if (normalizedOriginal > 0) {
    result.price = buildTrendyolPriceObject(normalizedOriginal);
  }

  const hasTitle = isValidTrendyolProductTitle(result.title) && !PLACEHOLDER_TITLES.has(String(result.title || ''));
  const hasPrice = !needsPrice(result.price);
  const hasImages = normalizeImages(result.images).length > 0;
  result.success = hasTitle && (hasPrice || hasImages);
  if (hasTitle && !hasPrice && !hasImages) {
    result.partial = true;
  }
  if (!result.success && !result.message) {
    result.message =
      needsPrice(result.price) && result.images.length === 0
        ? 'Ürün bilgisi alınamadı — Trendyol API ve sayfa parse başarısız'
        : needsPrice(result.price)
          ? 'Fiyat alınamadı — lütfen tekrar deneyin'
          : 'Ürün verisi eksik';
  }

  result.variants = sanitizeTrendyolVariants(result.variants, {
    productTitle: result.title,
  });

  return result;
}

export function mergeApiWithScrape(apiResult: any, scrapeResult: any): any {
  const merged = { ...apiResult };
  const scrapeVariants = scrapeResult?.variants;
  if (
    scrapeVariants &&
    typeof scrapeVariants === 'object' &&
    Array.isArray(scrapeVariants.allVariants) &&
    scrapeVariants.allVariants.length > 0
  ) {
    const sanitized = sanitizeTrendyolVariants(scrapeVariants, {
      productTitle: merged.title || apiResult.title,
    });
    if (hasRealTrendyolVariants(sanitized)) {
      merged.variants = sanitized;
      merged.extractionMethod = `${apiResult.extractionMethod || 'trendyol-api'}+variants`;
    }
  }
  if (scrapeResult?.features?.length) merged.features = scrapeResult.features;
  if (scrapeResult?.tags?.length) merged.tags = scrapeResult.tags;

  merged.images = mergeTrendyolImageLists(apiResult?.images, scrapeResult?.images);

  const apiPrice = normalizeTrendyolPriceValue(apiResult?.price);
  const scrapePrice = normalizeTrendyolPriceValue(scrapeResult?.price);
  const bestPrice = pickPlausibleTrendyolPrice(apiPrice, scrapePrice);
  if (bestPrice > 0) {
    merged.price = buildTrendyolPriceObject(bestPrice);
  }

  return merged;
}
