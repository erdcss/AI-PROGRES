import { fetchTrendyolProductByUrl } from './trendyol-product-api';
import {
  brandFromTrendyolUrl,
  isValidTrendyolProductTitle,
  titleFromTrendyolUrl,
} from './trendyol-title-utils';

const PLACEHOLDER_TITLES = new Set([
  'Trendyol Ürünü',
  'Trendyol',
  'Product',
  'trendyol.com',
  'Ürün',
  'Ürün Yüklenemedi',
]);

export function resolveProductTitle(url: string, title?: string | null): string {
  const t = String(title || '').trim();
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
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === 'string') return img;
      if (img && typeof img === 'object' && 'url' in img) return String((img as { url: string }).url);
      return '';
    })
    .filter((u) => u.startsWith('http'));
}

export function hasUsableTrendyolResult(result: any): boolean {
  if (!result) return false;
  const title = resolveProductTitle(result.sourceUrl || result.url || '', result.title);
  const hasTitle = isValidTrendyolProductTitle(title) && !PLACEHOLDER_TITLES.has(title);
  const hasPrice = !needsPrice(result.price);
  const hasImages = normalizeImages(result.images).length > 0;
  return hasTitle && (hasPrice || hasImages);
}

/** Scrape sonrası başlık/fiyat/görsel düzelt; sahte placeholder kullanma */
export async function enrichTrendyolResult(url: string, result: any): Promise<any> {
  if (!result) return result;

  result.sourceUrl = result.sourceUrl || url;

  const titleWasPlaceholder =
    PLACEHOLDER_TITLES.has(String(result.title || '').trim()) ||
    !isValidTrendyolProductTitle(result.title);

  if (titleWasPlaceholder && !result._priceSource && !result.extractionMethod?.includes('scenario')) {
    result.price = { original: 0, withProfit: 0, currency: 'TRY' };
  }

  result.title = resolveProductTitle(url, result.title);

  const missingPrice = needsPrice(result.price);
  const missingImages = normalizeImages(result.images).length === 0;

  if (missingPrice || missingImages || titleWasPlaceholder) {
    const alreadyFromBrowser =
      String(result.extractionMethod || '').includes('scenario') ||
      result._priceSource === 'scenario-scrape';

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

    const stillMissingPrice = needsPrice(result.price);
    const stillMissingImages = normalizeImages(result.images).length === 0;
    if ((stillMissingPrice || stillMissingImages) && !alreadyFromBrowser && !result._puppeteerEnrichAttempted) {
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

  result.images = normalizeImages(result.images);

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
    merged.variants = scrapeVariants;
    merged.extractionMethod = `${apiResult.extractionMethod || 'trendyol-api'}+variants`;
  }
  if (scrapeResult?.features?.length) merged.features = scrapeResult.features;
  if (scrapeResult?.tags?.length) merged.tags = scrapeResult.tags;
  return merged;
}
