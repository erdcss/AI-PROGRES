/**
 * Cloud-safe Trendyol görsel çekme — Puppeteer gerektirmez.
 */
import * as cheerio from 'cheerio';
import { fetchTrendyolProductByUrl } from './trendyol-product-api';
import { extractProductImages } from './trendyol-image-extractor';
import { mergeTrendyolImageLists, normalizeTrendyolImages } from './trendyol-image-utils';
import { fetchTrendyolHtml } from './http-scraper-fallback';
import { tryMobileAPI, tryProxyServices } from './alternative-data-sources';

function extractImagesFromRawHtml(html: string): string[] {
  const found: string[] = [];

  for (const match of html.matchAll(/https?:\/\/cdn\.(?:dsmcdn|trendyol)\.com\/[^\s"'<>\\]+/gi)) {
    found.push(match[0]);
  }

  for (const match of html.matchAll(/"(\/ty\d+\/[^"]+\.(?:jpg|jpeg|png|webp|JPG|JPEG|PNG|WEBP))"/gi)) {
    found.push(match[1]);
  }

  for (const match of html.matchAll(/\\\/ty\d+\\\/prod\\\/[^"\\]+\\\.(?:jpg|jpeg|png|webp)/gi)) {
    found.push(match[0].replace(/\\/g, ''));
  }

  return normalizeTrendyolImages(found);
}

function extractImagesFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const fromExtractor = extractProductImages(html, $).images;
  const fromRegex = extractImagesFromRawHtml(html);
  return mergeTrendyolImageLists(fromExtractor, fromRegex);
}

async function fetchImagesFromAlternativeSources(url: string): Promise<string[]> {
  const mobile = await tryMobileAPI(url);
  const mobileImages = normalizeTrendyolImages(mobile?.images || []);
  if (mobileImages.length > 0) {
    return mobileImages;
  }

  const proxy = await tryProxyServices(url);
  if (proxy?.html) {
    return extractImagesFromHtml(String(proxy.html));
  }

  return [];
}

/** Deploy ortamında eksik görselleri HTML/cache/API ile tamamlar */
export async function fetchTrendyolProductImages(url: string): Promise<string[]> {
  const api = await fetchTrendyolProductByUrl(url);
  if (api?.images?.length) {
    return api.images;
  }

  const fetched = await fetchTrendyolHtml(url);
  if (fetched?.html) {
    const images = extractImagesFromHtml(fetched.html);
    if (images.length > 0) {
      return mergeTrendyolImageLists(api?.images, images);
    }
  }

  const altImages = await fetchImagesFromAlternativeSources(url);
  return mergeTrendyolImageLists(api?.images, altImages);
}
