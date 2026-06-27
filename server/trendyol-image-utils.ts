const CDN_HOSTS = ["cdn.dsmcdn.com", "cdn.trendyol.com"];

function extractRawImageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["url", "src", "imageUrl", "image", "href", "link", "path"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }
  return null;
}

function toAbsoluteCdnUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/ty") || trimmed.startsWith("/mnresize/")) {
    return `https://cdn.dsmcdn.com${trimmed}`;
  }

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return `https://cdn.dsmcdn.com${trimmed}`;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/^http:/, "https:");
  }

  return null;
}

export function optimizeTrendyolImageUrl(url: string): string | null {
  if (!url) return null;

  const optimized = toAbsoluteCdnUrl(url);
  if (!optimized) return null;
  if (!CDN_HOSTS.some((host) => optimized.includes(host))) return null;

  const exclude = ["/ui/", "/icon", "/logo", "/footer", "/brand/", "/web/", "/sfint/", ".svg"];
  if (exclude.some((pattern) => optimized.includes(pattern))) return null;

  return optimized.replace(/mnresize\/\d+\/\d+\//, "mnresize/1200/1800/");
}

export function normalizeTrendyolImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of images) {
    const raw = extractRawImageUrl(item);
    if (!raw) continue;

    const optimized = optimizeTrendyolImageUrl(raw);
    if (!optimized || seen.has(optimized)) continue;

    seen.add(optimized);
    result.push(optimized);
  }

  return result;
}

export function mergeTrendyolImageLists(...lists: unknown[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const url of normalizeTrendyolImages(list)) {
      if (seen.has(url)) continue;
      seen.add(url);
      merged.push(url);
    }
  }

  return merged;
}

/** JSON ağacında gizli CDN görsel URL'lerini bulur (API kısmi yanıtlar) */
export function deepExtractImagesFromJson(value: unknown, depth = 0): string[] {
  if (depth > 8 || value == null) return [];
  const found: string[] = [];

  if (typeof value === 'string') {
    if (/cdn\.dsmcdn\.com\/ty\d+/i.test(value) || /^\/ty\d+\//.test(value)) {
      found.push(value);
    }
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) found.push(...deepExtractImagesFromJson(item, depth + 1));
    return found;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['images', 'imageUrl', 'image', 'url', 'src', 'path', 'gallery', 'medias']) {
      if (obj[key] != null) found.push(...deepExtractImagesFromJson(obj[key], depth + 1));
    }
    for (const v of Object.values(obj)) {
      if (typeof v === 'string' && /cdn\.dsmcdn\.com|\/ty\d+\/prod\//.test(v)) {
        found.push(v);
      }
    }
  }
  return found;
}

/** Ürün görselleri — SVG, sfint ikonları ve CSS mask URL'lerini eler */
export function filterValidProductImages(images: unknown): string[] {
  return normalizeTrendyolImages(images).filter((img) => {
    if (
      img.includes("mask-image") ||
      img.includes("background-image") ||
      img.includes(".svg") ||
      img.includes("/sfint/") ||
      img.includes("data:")
    ) {
      return false;
    }
    const isProductCdn =
      /\/ty\d+\/(prod|product|media)\//i.test(img) ||
      /\/QC_|\/PIM_|QC_PREP|ENRICHMENT|org_zoom|_org_/i.test(img);
    if (!isProductCdn) return false;
    const path = img.split("?")[0];
    return /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(path) || /org_zoom/i.test(path);
  });
}
