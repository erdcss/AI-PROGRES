const TRENDYOL_CDN_HOSTS = ["cdn.dsmcdn.com", "cdn.trendyol.com"];

/** Ham scrape görsel değerinden URL çıkarır */
export function extractImageUrlFromUnknown(raw: unknown): string | null {
  if (!raw) return null;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["url", "src", "imageUrl", "image", "href"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return null;
}

function normalizeHttpUrl(url: string): string | null {
  let normalized = url.trim();
  if (!normalized) return null;

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  }

  if (normalized.startsWith("http://")) {
    normalized = normalized.replace(/^http:\/\//, "https://");
  }

  if (!normalized.startsWith("https://")) {
    return null;
  }

  return normalized;
}

function isTrendyolCdnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return TRENDYOL_CDN_HOSTS.some((cdnHost) => host === cdnHost || host.endsWith(`.${cdnHost}`));
  } catch {
    return TRENDYOL_CDN_HOSTS.some((cdnHost) => url.includes(cdnHost));
  }
}

/** Önizleme için görsel URL — Trendyol CDN ise sunucu proxy kullanır */
export function resolvePreviewImageUrl(raw: unknown): string | null {
  const extracted = extractImageUrlFromUnknown(raw);
  if (!extracted) return null;

  const normalized = normalizeHttpUrl(extracted);
  if (!normalized) return null;

  if (isTrendyolCdnUrl(normalized)) {
    return `/api/image-proxy?url=${encodeURIComponent(normalized)}`;
  }

  return normalized;
}

export function resolvePreviewImageUrls(images: unknown): string[] {
  if (!Array.isArray(images)) return [];

  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const item of images) {
    const url = resolvePreviewImageUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    resolved.push(url);
  }

  return resolved;
}

/** CSV/Shopify için orijinal CDN URL (proxy değil) */
export function resolveOriginalImageUrl(raw: unknown): string | null {
  const extracted = extractImageUrlFromUnknown(raw);
  if (!extracted) return null;
  return normalizeHttpUrl(extracted);
}
