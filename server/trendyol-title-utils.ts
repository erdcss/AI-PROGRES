const INVALID_TITLE_EXACT = new Set([
  'Yüklenemiyor',
  'Ürün Bilgisi Alınamadı',
  'Ürün Yüklenemedi',
  'Ürün Bilgisi',
  'trendyol.com',
  'Product',
  'Trendyol Ürünü',
  'slicing attribute product',
  'Slicing Attribute Product',
  'Ürün',
  'Marka',
  'Welcome to Trendyol',
  'Access Denied',
  "Online Alışveriş Sitesi, Türkiye'nin Trend Yolu",
  "Online Alışveriş Sitesi | Türkiye'nin Trend Yolu",
]);

const INVALID_TITLE_PATTERNS = [
  /online alışveriş/i,
  /türkiye'?nin trend yolu/i,
  /trend yolu/i,
  /^trendyol\s*[|–-]/i,
  /^trendyol$/i,
  /^welcome to trendyol/i,
  /access denied/i,
  /captcha/i,
  /checking your browser/i,
  /slicing attribute/i,
  /^ürün$/i,
  /^marka$/i,
];

/**
 * Trendyol ürün ID'si URL path sonundaki `-p-{id}` kalıbından alınır.
 * `edp-50-ml-p-971347342` gibi slug'larda `/p-(\d+)/` yanlışlıkla `50` yakalar.
 */
export function extractTrendyolProductId(url: string): string | null {
  if (!url) return null;
  const canonical =
    url.match(/-p-(\d{5,})(?:[/?#]|$)/i) ||
    url.match(/\/p-(\d{5,})(?:[/?#]|$)/i);
  if (canonical?.[1]) return canonical[1];

  // Son çare: path içindeki son -p-{digits} (kısa ml/ölçü sayıları elenir)
  const all = Array.from(url.matchAll(/-p-(\d+)/gi));
  for (let i = all.length - 1; i >= 0; i--) {
    const id = all[i]?.[1];
    if (id && id.length >= 5) return id;
  }
  return null;
}

export function isInvalidTrendyolTitle(title: string | undefined | null): boolean {
  if (!title || title.trim().length < 3) return true;
  const t = title.trim();
  if (INVALID_TITLE_EXACT.has(t)) return true;
  return INVALID_TITLE_PATTERNS.some((pattern) => pattern.test(t));
}

export function isValidTrendyolProductTitle(title: string | undefined | null): boolean {
  return !isInvalidTrendyolTitle(title);
}

function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toLocaleUpperCase('tr-TR') + word.slice(1);
}

export function titleFromTrendyolUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/([^/]+)-p-\d+\/?$/i);
    if (!match?.[1]) return null;
    const slug = match[1];
    if (slug.length < 5) return null;
    return slug
      .split('-')
      .filter(Boolean)
      .map(capitalizeWord)
      .join(' ');
  } catch {
    return null;
  }
}

export function cleanTrendyolDisplayTitle(title: string): string {
  return title
    .replace(/\s*[-–|]\s*Fiyatı,?\s*Yorumları.*$/i, "")
    .replace(/\s*[-–|]\s*Trendyol\.com.*$/i, "")
    .replace(/\s*[-–|]\s*Trendyol\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trendyol URL path parçaları — marka slug'ı değildir */
const RESERVED_TRENDYOL_PATH_SEGMENTS = new Set([
  "brand",
  "butik",
  "boutique",
  "sr",
  "x",
  "kampanya",
  "flas-urunler",
  "kategori",
  "category",
  "magaza",
  "satici",
  "en",
  "en-",
]);

export function brandFromTrendyolUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    if (parts.length < 2 || !/-p-\d+$/i.test(parts[parts.length - 1])) {
      return null;
    }
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i].toLowerCase();
      if (RESERVED_TRENDYOL_PATH_SEGMENTS.has(seg)) continue;
      if (seg.length < 2) continue;
      const candidate = parts[i]
        .split("-")
        .filter(Boolean)
        .map(capitalizeWord)
        .join(" ");
      if (isValidExportBrandName(candidate)) return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

const INVALID_EXPORT_BRAND_EXACT = new Set([
  "marka",
  "brand",
  "bilinmiyor",
  "bilinmeyen",
  "bilinmeyen marka",
  "unknown",
  "generic",
  "trendyol",
  "trendyol.com",
  "n/a",
  "na",
  "yok",
  "kategori",
  "category",
  "ürün",
  "urun",
  "product",
]);

export function isValidExportBrandName(
  brand: string | null | undefined,
  ctx?: { title?: string; category?: string },
): boolean {
  const b = String(brand || "").trim();
  if (b.length < 2 || b.length > 80) return false;
  const lower = b.toLocaleLowerCase("tr-TR");
  if (INVALID_EXPORT_BRAND_EXACT.has(lower)) return false;
  if (/trendyol/i.test(b)) return false;
  if (/^\d+$/.test(b)) return false;
  if (ctx?.title && lower === ctx.title.trim().toLocaleLowerCase("tr-TR")) return false;
  if (ctx?.category && lower === ctx.category.trim().toLocaleLowerCase("tr-TR")) {
    return false;
  }
  return true;
}

function readBrandField(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const name = (raw as { name?: unknown }).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

/** Ürün özelliklerinden Marka / Brand satırını okur */
export function extractBrandFromProductFeatures(features: unknown): string | null {
  if (!Array.isArray(features)) return null;
  for (const item of features) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const key = String(row.key ?? row.name ?? "").trim().toLocaleLowerCase("tr-TR");
    if (key !== "marka" && key !== "brand") continue;
    const value = String(row.value ?? "").trim();
    if (isValidExportBrandName(value)) return value;
  }
  return null;
}

export type ExportBrandSource =
  | "features"
  | "productInfo"
  | "product"
  | "canonicalProduct"
  | "root"
  | "url";

/** CSV Vendor / MARKT-GO brand — placeholder veya kategori karışmasını engeller */
export function resolveExportBrand(input: {
  layers: Array<{ key: ExportBrandSource | string; data: Record<string, unknown> }>;
  sourceUrl?: string;
  features?: unknown;
  title?: string;
  category?: string;
}): { brand: string; source: ExportBrandSource | null } {
  const title = String(input.title || "").trim();
  const category = String(input.category || "").trim();
  const ctx = { title, category: category || undefined };

  const featureList =
    input.features ??
    input.layers.find((l) => Array.isArray(l.data.features))?.data.features;
  const fromFeatures = extractBrandFromProductFeatures(featureList);
  if (fromFeatures) return { brand: fromFeatures, source: "features" };

  for (const layer of input.layers) {
    const candidate = readBrandField(layer.data.brand);
    if (candidate && isValidExportBrandName(candidate, ctx)) {
      return {
        brand: candidate,
        source: (layer.key as ExportBrandSource) || "root",
      };
    }
  }

  const fromUrl = input.sourceUrl ? brandFromTrendyolUrl(input.sourceUrl) : null;
  if (fromUrl && isValidExportBrandName(fromUrl, ctx)) {
    return { brand: fromUrl, source: "url" };
  }

  return { brand: "", source: null };
}
