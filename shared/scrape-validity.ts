/** Bot sayfası, sahte başlık ve geçersiz fiyat kontrolleri — scrape + tracking ortak */

export const INVALID_TRACKING_TITLES = [
  "trendyol.com",
  "welcome to trendyol",
  "online alışveriş sitesi, türkiye'nin trend yolu",
  "extraction hatası",
  "access denied",
  "online alisveris sitesi, turkiye'nin trend yolu",
] as const;

export const BOT_PAGE_MARKERS = [
  "access denied",
  "captcha",
  "welcome to trendyol",
  "robot",
  "bot detection",
  "cf-challenge",
  "just a moment",
  "please verify",
  "trendyol.com",
] as const;

export type TrackingValidationResult = {
  valid: boolean;
  reason?: string;
  priceValid: boolean;
  priceSource?: string;
};

function normalizeTitle(title: unknown): string {
  return String(title ?? "").trim();
}

export function isInvalidTrackingTitle(title: unknown): boolean {
  const t = normalizeTitle(title).toLowerCase();
  if (!t || t.length < 2) return true;
  return INVALID_TRACKING_TITLES.some((bad) => t === bad || t.includes(bad));
}

export function containsBotPageMarker(text: unknown): boolean {
  const hay = String(text ?? "").toLowerCase();
  if (!hay) return false;
  return BOT_PAGE_MARKERS.some((m) => hay.includes(m));
}

export function isFallbackFakePrice(price: unknown): boolean {
  if (!price || typeof price !== "object") return false;
  const p = price as Record<string, unknown>;
  const original = Number(p.original ?? 0);
  const method = String(p.method ?? p.priceSource ?? "").toUpperCase();
  if (method.includes("EXTRACTION_FAILED") || method.includes("FALLBACK")) {
    return true;
  }
  if (original === 100 && method.includes("FALLBACK")) return true;
  return false;
}

export function parseSourcePrice(price: unknown): number {
  if (typeof price === "number" && price > 0) return price;
  if (typeof price === "string") {
    const n = Number.parseFloat(price.replace(/[^\d.,]/g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  if (price && typeof price === "object") {
    const p = price as Record<string, unknown>;
    for (const key of ["original", "withProfit", "amount", "value"]) {
      const n = Number(p[key]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

export function validateTrackingSourceData(input: {
  title?: unknown;
  price?: unknown;
  images?: unknown;
  titleSource?: unknown;
  htmlSnippet?: unknown;
  priceSource?: unknown;
  success?: unknown;
}): TrackingValidationResult {
  const title = normalizeTitle(input.title);
  const priceSource = String(
    input.priceSource ??
      (input.price && typeof input.price === "object"
        ? (input.price as Record<string, unknown>).method ??
          (input.price as Record<string, unknown>).priceSource
        : "") ??
      "",
  ).toUpperCase();

  if (isInvalidTrackingTitle(title)) {
    return { valid: false, reason: "invalid_title", priceValid: false, priceSource };
  }

  if (containsBotPageMarker(title) || containsBotPageMarker(input.htmlSnippet)) {
    return { valid: false, reason: "bot_or_blocked_page", priceValid: false, priceSource };
  }

  if (priceSource.includes("EXTRACTION_FAILED") || priceSource.includes("NO_PRICE_FOUND")) {
    return { valid: false, reason: "price_extraction_failed", priceValid: false, priceSource };
  }

  if (isFallbackFakePrice(input.price)) {
    return { valid: false, reason: "fallback_fake_price", priceValid: false, priceSource };
  }

  const priceValue = parseSourcePrice(input.price);
  const images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  const titleSource = String(input.titleSource ?? "");

  if (titleSource === "url-slug" && priceValue <= 0 && images.length === 0) {
    return { valid: false, reason: "slug_only_no_data", priceValid: false, priceSource };
  }

  if (priceValue <= 0) {
    return { valid: false, reason: "no_valid_price", priceValid: false, priceSource: priceSource || "NO_PRICE_FOUND" };
  }

  if (images.length === 0 && priceValue === 100) {
    return { valid: false, reason: "suspicious_default_price", priceValid: false, priceSource };
  }

  return { valid: true, priceValid: true, priceSource: priceSource || "extracted" };
}

export function noPriceResult(currency = "TRY") {
  return {
    original: 0,
    withProfit: 0,
    currency,
    formatted: "0 TL",
    profitFormatted: "0 TL",
    priceValid: false,
    priceSource: "NO_PRICE_FOUND" as const,
    method: "NO_PRICE_FOUND",
  };
}
