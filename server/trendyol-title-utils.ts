const INVALID_TITLE_EXACT = new Set([
  'Yüklenemiyor',
  'Ürün Bilgisi Alınamadı',
  'Ürün Yüklenemedi',
  'Ürün Bilgisi',
  'trendyol.com',
  'Product',
  'Trendyol Ürünü',
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
  /just a moment/i,
];

export function extractTrendyolProductId(url: string): string | null {
  const match = url.match(/p-(\d+)/i);
  return match ? match[1] : null;
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

export function brandFromTrendyolUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    if (parts.length >= 2 && /-p-\d+$/i.test(parts[parts.length - 1])) {
      return parts[0]
        .split('-')
        .filter(Boolean)
        .map(capitalizeWord)
        .join(' ');
    }
    return null;
  } catch {
    return null;
  }
}
