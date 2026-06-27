import {
  filterValidProductImages,
  mergeTrendyolImageLists,
  normalizeTrendyolImages,
  optimizeTrendyolImageUrl,
} from "@shared/trendyol-product-images";

export {
  filterValidProductImages,
  mergeTrendyolImageLists,
  normalizeTrendyolImages,
  optimizeTrendyolImageUrl,
};

/** JSON ağacında gizli CDN görsel URL'lerini bulur (API kısmi yanıtlar) */
export function deepExtractImagesFromJson(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  const found: string[] = [];

  if (typeof value === "string") {
    if (/cdn\.dsmcdn\.com\/ty\d+/i.test(value) || /^\/ty\d+\//.test(value)) {
      found.push(value);
    }
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) found.push(...deepExtractImagesFromJson(item, depth + 1));
    return found;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of ["images", "imageUrl", "image", "url", "src", "path", "gallery", "medias"]) {
      if (obj[key] != null) found.push(...deepExtractImagesFromJson(obj[key], depth + 1));
    }
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && /cdn\.dsmcdn\.com|\/ty\d+\/prod\//.test(v)) {
        found.push(v);
      }
    }
  }
  return found;
}
