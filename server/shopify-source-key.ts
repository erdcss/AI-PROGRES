import { extractTrendyolProductId } from "./trendyol-title-utils";

export interface TrendyolSourceIdentity {
  sourcePlatform: "trendyol";
  sourceProductId: string;
  sourceUrl: string;
  sourceKey: string;
}

/** Trendyol URL'yi normalize eder */
export function normalizeTrendyolUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    parsed.search = "";
    let path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.host}${path}`;
  } catch {
    return url.trim().split("?")[0].replace(/\/+$/, "");
  }
}

export interface ResolvedSourceIds {
  urlProductId: string | null;
  parsedProductId: string | null;
  selectedSourceProductId: string;
  sourceKey: string;
}

/** URL p-{id} öncelikli; scraped id sadece fallback */
export function resolveTrendyolSourceIds(
  sourceUrl: string,
  scrapedId?: string | number | null,
): ResolvedSourceIds {
  const urlProductId = extractTrendyolProductId(sourceUrl);
  const parsedRaw = scrapedId != null ? String(scrapedId).replace(/\D/g, "") : "";
  const parsedProductId = parsedRaw.length > 0 ? parsedRaw : null;
  const selectedSourceProductId =
    urlProductId || parsedProductId || `unknown-${Date.now()}`;

  console.log(
    `[SourceId] urlProductId=${urlProductId ?? "null"} parsedProductId=${parsedProductId ?? "null"} selectedSourceProductId=${selectedSourceProductId}`,
  );

  return {
    urlProductId,
    parsedProductId,
    selectedSourceProductId,
    sourceKey: `trendyol:${selectedSourceProductId}`,
  };
}

/** Canonical source key: trendyol:{productId} */
export function buildTrendyolSourceIdentity(url: string): TrendyolSourceIdentity | null {
  const ids = resolveTrendyolSourceIds(url);
  if (!ids.urlProductId && !ids.parsedProductId) return null;

  const sourceUrl = normalizeTrendyolUrl(url);
  return {
    sourcePlatform: "trendyol",
    sourceProductId: ids.selectedSourceProductId,
    sourceUrl,
    sourceKey: ids.sourceKey,
  };
}

export function buildUploadLockKey(sourceKey: string): string {
  return `shopify-upload:${sourceKey}`;
}

/** SKU standardı: TY-{sourceProductId}-{color}-{size} */
export function buildCanonicalSku(
  sourceProductId: string,
  color: string,
  size: string,
): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 40) || "std";

  return `TY-${sourceProductId}-${norm(color)}-${norm(size)}`;
}

/** Handle: {brand}-{title}-{sourceProductId} */
export function buildCanonicalHandle(
  brand: string,
  title: string,
  sourceProductId: string,
): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");

  const brandPart = slug(brand || "urun").substring(0, 20);
  const titlePart = slug(title).substring(0, 40);
  return `${brandPart}-${titlePart}-${sourceProductId}`.substring(0, 100);
}
