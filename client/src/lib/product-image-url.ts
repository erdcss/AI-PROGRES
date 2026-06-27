import {
  filterValidProductImages,
  mergeTrendyolImageLists,
  prioritizeProductImagesForPreview,
} from "@shared/trendyol-product-images";

const TRENDYOL_CDN_HOSTS = ["cdn.dsmcdn.com", "cdn.trendyol.com"];

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((cell) => cell.replace(/^"|"$/g, "").trim());
}

/** Shopify CSV içindeki Product image URL sütunundan görselleri çıkarır */
export function extractImagesFromCsv(csvContent: string): string[] {
  if (!csvContent?.trim()) return [];

  const lines = csvContent.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]);
  const urlIndex = headers.findIndex((header) => {
    const normalized = header.toLowerCase();
    return (
      normalized.includes("product image url") ||
      normalized === "image src" ||
      normalized.includes("variant image url")
    );
  });

  if (urlIndex === -1) return [];

  const seen = new Set<string>();
  const urls: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const url = row[urlIndex]?.trim();
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

/** Önizleme kartı için ham görsel kaynakları (scrape + CSV yedek) */
export function getPreviewImageSources(input: {
  images?: unknown;
  csvContent?: string;
}): string[] {
  const normalizedInputs = Array.isArray(input.images)
    ? input.images
        .map((item) => resolveOriginalImageUrl(item) || extractImageUrlFromUnknown(item))
        .filter((url): url is string => Boolean(url))
    : [];

  const fromScrape = filterValidProductImages(normalizedInputs);
  const fromCsv = filterValidProductImages(extractImagesFromCsv(input.csvContent ?? ""));
  return prioritizeProductImagesForPreview(mergeTrendyolImageLists(fromScrape, fromCsv));
}

function unwrapProxiedUrl(url: string): string | null {
  if (!isAlreadyProxied(url)) return null;
  try {
    const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
    const inner = new URLSearchParams(query).get("url");
    if (inner) return normalizeHttpUrl(decodeURIComponent(inner));
  } catch {
    /* ignore */
  }
  return null;
}

/** Ham scrape görsel değerinden URL çıkarır */
export function extractImageUrlFromUnknown(raw: unknown): string | null {
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

function normalizeHttpUrl(url: string): string | null {
  let normalized = url.trim();
  if (!normalized) return null;

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith("/ty") || normalized.startsWith("/mnresize/")) {
    normalized = `https://cdn.dsmcdn.com${normalized}`;
  } else if (normalized.startsWith("/")) {
    normalized = `https://cdn.dsmcdn.com${normalized}`;
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

function isAlreadyProxied(url: string): boolean {
  return (
    url.startsWith("/api/image-proxy") ||
    url.includes("/api/image-proxy?url=")
  );
}

function toProxiedPath(url: string): string {
  if (url.startsWith("/api/image-proxy")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/api/image-proxy") {
      return `/api/image-proxy${parsed.search}`;
    }
  } catch {
    /* relative path */
  }
  return url;
}

/** Önizleme için görsel URL — tarayıcıda doğrudan CDN (proxy değil) */
export function resolvePreviewImageUrl(raw: unknown): string | null {
  const extracted = extractImageUrlFromUnknown(raw);
  if (!extracted) return null;

  const unwrapped = unwrapProxiedUrl(extracted);
  if (unwrapped) return unwrapped;

  return normalizeHttpUrl(extracted);
}

/** Proxy yedek URL — CDN hotlink engellenirse kullanılır */
export function resolvePreviewProxyUrl(raw: unknown): string | null {
  const direct = resolvePreviewImageUrl(raw);
  if (!direct) return null;
  if (isTrendyolCdnUrl(direct)) {
    return `/api/image-proxy?url=${encodeURIComponent(direct)}`;
  }
  return null;
}

export function resolvePreviewImageUrls(images: unknown): string[] {
  const sources = Array.isArray(images)
    ? filterValidProductImages(images)
    : [];

  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const item of sources) {
    const url = resolvePreviewImageUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    resolved.push(url);
  }

  return resolved;
}

/** Önizleme için filtrelenmiş + proxy'lenmiş görsel listesi */
export function resolvePreviewImagesForEntry(input: {
  images?: unknown;
  csvContent?: string;
}): { sources: string[]; urls: string[] } {
  const sources = getPreviewImageSources(input);
  const urls = resolvePreviewImageUrls(sources);
  return { sources, urls };
}

/** CSV/Shopify için orijinal CDN URL (proxy değil) */
export function resolveOriginalImageUrl(raw: unknown): string | null {
  const extracted = extractImageUrlFromUnknown(raw);
  if (!extracted) return null;
  return unwrapProxiedUrl(extracted) ?? normalizeHttpUrl(extracted);
}
