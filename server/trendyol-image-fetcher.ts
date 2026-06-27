/**
 * Cloud-safe Trendyol görsel çekme — Puppeteer gerektirmez.
 */
import { fetchTrendyolProductByUrl } from './trendyol-product-api';
import { mergeTrendyolImageLists } from './trendyol-image-utils';

/** Deploy ortamında eksik görselleri HTML/cache/API ile tamamlar */
export async function fetchTrendyolProductImages(url: string): Promise<string[]> {
  const api = await fetchTrendyolProductByUrl(url);
  if (api?.images?.length) {
    return api.images;
  }

  const { extractTrendyolProductFromHtml } = await import('./trendyol-html-extractor');
  const htmlProduct = await extractTrendyolProductFromHtml(url);
  if (htmlProduct?.images?.length) {
    return htmlProduct.images;
  }

  return mergeTrendyolImageLists(api?.images, []);
}
