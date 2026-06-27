/**
 * Cloud-safe Trendyol görsel çekme — Puppeteer gerektirmez.
 */
import * as cheerio from 'cheerio';
import { fetchTrendyolProductByUrl, fetchTrendyolImagesFromApi } from './trendyol-product-api';
import {
  filterValidProductImages,
  mergeTrendyolImageLists,
} from './trendyol-image-utils';
import { extractProductImagesFromHtmlRegex } from '@shared/trendyol-bot-detection';
import { extractProductImages } from './trendyol-image-extractor';
import { fetchTrendyolDirectHtmlRaw } from './trendyol-direct-html';

function parseImagesFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const fromExtractor = extractProductImages(html, $).images;
  const fromRegex = extractProductImagesFromHtmlRegex(html);
  return filterValidProductImages(mergeTrendyolImageLists(fromExtractor, fromRegex));
}

/** Deploy ortamında eksik görselleri HTML/API ile tamamlar */
export async function fetchTrendyolProductImages(url: string): Promise<string[]> {
  // 1) Doğrudan HTML — scenario scraper'ın çalışan yolu (cache'den önce)
  const direct = await fetchTrendyolDirectHtmlRaw(url);
  if (direct?.html) {
    const directImages = parseImagesFromHtml(direct.html);
    if (directImages.length > 0) {
      console.log(`🖼️ Direct HTML görsel: ${directImages.length} adet`);
      return directImages;
    }
  }

  // 2) API (fiyat endpoint'i dahil deep scan)
  const apiProduct = await fetchTrendyolProductByUrl(url);
  const apiImages = filterValidProductImages(apiProduct?.images || []);
  if (apiImages.length > 0) return apiImages;

  const apiOnlyImages = await fetchTrendyolImagesFromApi(url);
  if (apiOnlyImages.length > 0) {
    console.log(`🖼️ API deep scan: ${apiOnlyImages.length} görsel`);
    return apiOnlyImages;
  }

  // 3) HTML extractor (cache/wayback — cloud'da genelde kapalı)
  const { extractTrendyolProductFromHtml } = await import('./trendyol-html-extractor');
  const htmlProduct = await extractTrendyolProductFromHtml(url);
  if (htmlProduct?.images?.length) return htmlProduct.images;

  return [];
}
