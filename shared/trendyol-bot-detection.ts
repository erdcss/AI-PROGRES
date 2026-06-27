/** Trendyol bot / WAF sayfalarını tespit eder (deploy IP engeli) */

const BLOCKED_TITLE_EXACT = new Set([
  'welcome to trendyol',
  'access denied',
  'just a moment...',
  'attention required',
  '403 forbidden',
  '404 not found',
  'please wait',
  'checking your browser',
  'trendyol.com',
  'trendyol',
]);

const BLOCKED_TITLE_PATTERNS = [
  /^welcome to trendyol/i,
  /^hoş geldiniz/i,
  /access denied/i,
  /captcha/i,
  /cloudflare/i,
  /please enable javascript/i,
  /checking your browser/i,
  /bot detection/i,
  /online alışveriş sitesi/i,
  /türkiye'?nin trend yolu/i,
];

export function isBlockedTrendyolTitle(title: string | undefined | null): boolean {
  if (!title || title.trim().length < 3) return true;
  const t = title.trim().toLowerCase();
  if (BLOCKED_TITLE_EXACT.has(t)) return true;
  return BLOCKED_TITLE_PATTERNS.some((p) => p.test(title.trim()));
}

export function isBlockedTrendyolHtml(html: string): boolean {
  if (!html || html.length < 200) return true;

  const hasProductMarkers =
    html.includes('__PRODUCT_DETAIL_APP_INITIAL_STATE__') ||
    html.includes('__NEXT_DATA__') ||
    (html.includes('"discountedPrice"') && html.includes('"images"')) ||
    (html.includes('cdn.dsmcdn.com/ty') && html.includes('/prod/'));

  if (hasProductMarkers) return false;

  const blockedSignals = [
    /welcome to trendyol/i,
    /access denied/i,
    /cf-browser-verification/i,
    /challenge-platform/i,
    /captcha/i,
    /"statusCode"\s*:\s*403/,
  ];

  if (blockedSignals.some((p) => p.test(html)) && html.length < 50000) {
    return true;
  }

  return html.length < 3000 && !html.includes('cdn.dsmcdn.com');
}

/** HTML içinden CDN ürün görsellerini regex ile çıkarır (cache/bot sayfası parçaları) */
export function extractProductImagesFromHtmlRegex(html: string): string[] {
  const found: string[] = [];

  for (const match of html.matchAll(
    /https?:\/\/cdn\.dsmcdn\.com\/ty\d+\/prod\/QC_PREP\/[^\s"'<>\\]+?\.(?:jpg|jpeg|png|webp)/gi,
  )) {
    found.push(match[0]);
  }

  for (const match of html.matchAll(
    /https?:\/\/cdn\.dsmcdn\.com\/ty\d+\/(?:prod|product|media)\/[^\s"'<>\\]+?\.(?:jpg|jpeg|png|webp)/gi,
  )) {
    found.push(match[0]);
  }

  for (const match of html.matchAll(
    /"(\/ty\d+\/(?:prod|product|media)\/[^"]+\.(?:jpg|jpeg|png|webp))"/gi,
  )) {
    found.push(match[1]);
  }

  for (const match of html.matchAll(
    /"imageUrl"\s*:\s*"(https:\\\/\\\/cdn\.dsmcdn\.com[^"]+)"/gi,
  )) {
    found.push(match[1].replace(/\\\//g, '/'));
  }

  for (const match of html.matchAll(
    /"imageUrl"\s*:\s*"(https:\/\/cdn\.dsmcdn\.com[^"]+)"/gi,
  )) {
    found.push(match[1]);
  }

  for (const match of html.matchAll(
    /"(https:\/\/cdn\.dsmcdn\.com\/ty\d+[^"]+\.(?:jpg|jpeg|png|webp))"/gi,
  )) {
    found.push(match[1]);
  }

  for (const match of html.matchAll(
    /\\\/ty\d+\\\/(?:prod|product|media)\\\/[^"\\]+\\\.(?:jpg|jpeg|png|webp)/gi,
  )) {
    found.push(match[0].replace(/\\/g, ''));
  }

  return found;
}
