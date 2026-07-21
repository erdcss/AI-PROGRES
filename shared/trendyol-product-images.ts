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
    // Uzantısız CDN, webp/avif ve query parametreli URL'leri koru
    return (
      /\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i.test(path) ||
      /org_zoom|_org_|\/prod\/|\/product\/|\/media\//i.test(path)
    );
  });
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

/** CDN 404 durumunda denenecek alternatif görsel URL'leri */
export function getTrendyolImageFallbackUrls(url: string): string[] {
  const normalized = url.trim().replace(/^http:/, "https:");
  if (!normalized.startsWith("https://")) return [];

  const variants: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: string | null | undefined) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    variants.push(candidate);
  };

  add(normalized);

  const pathMatch = normalized.match(/cdn\.dsmcdn\.com\/(.+)$/i);
  if (pathMatch) {
    const path = pathMatch[1].split("?")[0];
    const barePath = path.replace(/^mnresize\/\d+\/\d+\//, "");

    add(`https://cdn.dsmcdn.com/${barePath}`);
    add(`https://cdn.dsmcdn.com/mnresize/620/920/${barePath}`);
    add(`https://cdn.dsmcdn.com/mnresize/1200/1800/${barePath}`);

    if (barePath.includes("/prod/QC/")) {
      add(`https://cdn.dsmcdn.com/${barePath.replace("/prod/QC/", "/prod/QC_PREP/")}`);
      add(`https://cdn.dsmcdn.com/mnresize/620/920/${barePath.replace("/prod/QC/", "/prod/QC_PREP/")}`);
    }
    if (barePath.includes("/prod/QC_PREP/")) {
      add(`https://cdn.dsmcdn.com/${barePath.replace("/prod/QC_PREP/", "/prod/QC/")}`);
    }
  }

  return variants;
}

function imagePreviewDedupeKey(url: string): string {
  return url
    .replace(/mnresize\/\d+\/\d+\//, "")
    .replace(/\/ty\d+\//, "/")
    .split("?")[0];
}

/** Önizleme için org_zoom görselleri öne alır, tekrarları eler */
export function prioritizeProductImagesForPreview(images: string[]): string[] {
  const byKey = new Map<string, string>();

  for (const url of images) {
    const key = imagePreviewDedupeKey(url);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, url);
      continue;
    }
    const preferNew =
      (/1_org_zoom/i.test(url) && !/1_org_zoom/i.test(existing)) ||
      (/org_zoom/i.test(url) && !/org_zoom/i.test(existing));
    if (preferNew) byKey.set(key, url);
  }

  return [...byKey.values()].sort((a, b) => {
    const rank = (u: string) => {
      if (/1_org_zoom/i.test(u)) return 0;
      if (/org_zoom|_org_/i.test(u)) return 1;
      if (/mnresize/i.test(u)) return 3;
      return 2;
    };
    return rank(a) - rank(b);
  });
}
