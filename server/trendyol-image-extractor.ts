/**
 * Trendyol ürün görsel çıkarımı.
 * Yalnız ürün state/structured data/ürün galerisi CDN kaynakları kabul edilir.
 */

import * as cheerio from 'cheerio';
import { filterValidProductImages } from './trendyol-image-utils';

export interface ImageExtractionResult {
  images: string[];
  variantImages: Record<string, string[]>;
  totalFound: number;
}

function pushValid(target: string[], values: unknown) {
  for (const url of filterValidProductImages(Array.isArray(values) ? values : [values])) {
    if (!target.includes(url)) target.push(url);
  }
}

function rawImageValue(img: any): unknown {
  if (typeof img === 'string') return img;
  if (!img || typeof img !== 'object') return null;
  return img.url || img.src || img.path || img.link || img.imageUrl || null;
}

/** Ana ürün görsellerini çıkarır. */
export function extractProductImages(htmlContent: string, $: cheerio.CheerioAPI): ImageExtractionResult {
  const images: string[] = [];
  const variantImages: Record<string, string[]> = {};

  console.log('🎯 Güvenli ürün galerisi görsel çıkarımı başlatılıyor...');

  // 1) Trendyol product state — en güvenilir kaynak.
  const initialStatePattern = /window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*({.*?});/s;
  const initialStateMatch = htmlContent.match(initialStatePattern);
  if (initialStateMatch) {
    try {
      const state = JSON.parse(initialStateMatch[1]);
      const product = state?.product || state?.productDetail || state;

      if (Array.isArray(product?.images)) {
        pushValid(images, product.images.map(rawImageValue).filter(Boolean));
      }

      if (Array.isArray(product?.variants)) {
        for (const variant of product.variants) {
          const colorKey = String(variant?.color || variant?.colorName || 'default');
          if (!Array.isArray(variant?.images)) continue;
          const valid = filterValidProductImages(
            variant.images.map(rawImageValue).filter(Boolean),
          );
          if (valid.length === 0) continue;
          variantImages[colorKey] = [...new Set(valid)];
          pushValid(images, valid);
        }
      }
    } catch (error) {
      console.warn('Initial State görsel parse hatası:', error);
    }
  }

  // 2) Product JSON-LD. Sadece Product nesnelerinin image alanı alınır.
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() || '';
      const parsed = JSON.parse(raw);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        const type = Array.isArray(node?.['@type']) ? node['@type'].join(' ') : node?.['@type'];
        if (!/product/i.test(String(type || ''))) continue;
        const imageList = Array.isArray(node?.image) ? node.image : node?.image ? [node.image] : [];
        pushValid(images, imageList);
      }
    } catch {
      // Structured data bozuksa sessizce atla.
    }
  });

  // 3) Sayfanın ana ürün OG görseli.
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim();
  if (ogImage) pushValid(images, [ogImage]);

  // 4) Sadece bilinen ürün galerisi yollarını tara. QC_ENRICHMENT, açıklama içi
  // bakım/yıkama ikonları ve genel IMG tag'leri bu aşamada özellikle taranmaz.
  const strictProductPatterns = [
    /https:\/\/cdn\.dsmcdn\.com\/(?:mnresize\/\d+\/\d+\/)?ty\d+\/prod\/(?:QC|QC_PREP|PIM)\/[^"'\s<>]+(?:\.(?:jpg|jpeg|png|webp|avif))?/gi,
    /https:\/\/cdn\.dsmcdn\.com\/(?:mnresize\/\d+\/\d+\/)?ty\d+\/product\/media\/[^"'\s<>]+(?:\.(?:jpg|jpeg|png|webp|avif))?/gi,
  ];
  for (const pattern of strictProductPatterns) {
    pushValid(images, htmlContent.match(pattern) || []);
  }

  const uniqueImages = [...new Set(filterValidProductImages(images))];
  for (const [color, urls] of Object.entries(variantImages)) {
    variantImages[color] = [...new Set(filterValidProductImages(urls))];
  }

  console.log(`🖼️ TOPLAM ${uniqueImages.length} doğrulanmış ürün galerisi görseli çıkarıldı`);

  return {
    images: uniqueImages,
    variantImages,
    totalFound: uniqueImages.length,
  };
}
