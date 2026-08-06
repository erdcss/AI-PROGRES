/**
 * Trendyol 429 / rate-limit sayfa tespiti (paylaşılan).
 * Örn. büyük "429" + "Aradığın içeriğe şu an ulaşılamıyor"
 */

const RATE_LIMIT_HTML_PATTERNS = [
  /arad[ıi][gğ][ıi]n içeri[gğ]e [şs]u an ula[şs][ıi]lam[ıi]yor/i,
  /ula[şs][ıi]lam[ıi]yor/i,
  /too\s*many\s*requests/i,
  /çok fazla istek/i,
  /rate\s*limit/i,
  /error\s*429/i,
  /http\s*429/i,
  />\s*429\s*</,
  /<title[^>]*>\s*429\b/i,
];

const PRODUCT_MARKERS = [
  "__PRODUCT_DETAIL_APP_INITIAL_STATE__",
  "__NEXT_DATA__",
  '"discountedPrice"',
];

function hasProductMarkers(html: string): boolean {
  return PRODUCT_MARKERS.some((m) => html.includes(m));
}

/** Trendyol soft-429 / rate-limit HTML sayfası mı? */
export function isTrendyolRateLimitHtml(html: string | null | undefined): boolean {
  if (!html || html.length < 80) return false;
  // Gerçek ürün sayfasında yanlış pozitif olmasın
  if (hasProductMarkers(html) && html.length > 80_000) return false;

  const hits = RATE_LIMIT_HTML_PATTERNS.filter((p) => p.test(html)).length;
  if (hits >= 2) return true;
  if (hits === 1 && html.length < 120_000) return true;

  // Büyük "429" sayfası: kısa/orta HTML + 429 metni + ürün marker yok
  if (
    !hasProductMarkers(html) &&
    html.length < 100_000 &&
    (/>\s*429\s*</.test(html) || /<h1[^>]*>\s*429\b/i.test(html))
  ) {
    return true;
  }

  return false;
}

export function isTrendyolRateLimitStatus(status: number | null | undefined): boolean {
  return status === 429;
}

export function describeTrendyolRateLimit(): string {
  return "Trendyol 429 — çok fazla istek. Bir süre bekleyip tekrar denenecek.";
}

/** Exponential backoff + jitter (ms) */
export function trendyolBackoffMs(attempt: number, opts?: { baseMs?: number; maxMs?: number }): number {
  const base = opts?.baseMs ?? 2500;
  const max = opts?.maxMs ?? 90_000;
  const exp = Math.min(max, base * Math.pow(2, Math.max(0, attempt)));
  const jitter = Math.floor(Math.random() * Math.min(2000, exp * 0.25));
  return Math.min(max, exp + jitter);
}
