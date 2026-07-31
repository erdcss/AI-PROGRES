/**
 * Browser Worker — güvenli sayfa tanılama (HTML/cookie/token loglanmaz).
 */

export type PageBlockReason =
  | "empty-body"
  | "empty-document"
  | "about-blank"
  | "access-denied"
  | "cloudflare-challenge"
  | "bot-challenge"
  | "captcha"
  | "redirect-off-product"
  | "product-redirect"
  | "navigation-error"
  | "javascript-shell"
  | "resource-interception"
  | "intercepted-document"
  | "http-forbidden"
  | "http-error"
  | "upstream-556"
  | "unknown-blocked-response"
  | null;

export type PageContentClass =
  | "empty-body"
  | "empty-document"
  | "about-blank"
  | "access-denied"
  | "cloudflare-challenge"
  | "bot-challenge"
  | "captcha"
  | "redirect"
  | "product-redirect"
  | "navigation-error"
  | "javascript-shell"
  | "resource-interception"
  | "intercepted-document"
  | "upstream-556"
  | "product-html"
  | "unknown-thin"
  | "unknown-blocked-response"
  | "unknown";

export type SafePageDiagnostics = {
  navigationStatus: number | null;
  navigationStatusText: string | null;
  finalUrlHost: string | null;
  finalUrlPathname: string | null;
  contentType: string | null;
  serverHeader: string | null;
  titleLength: number;
  htmlBytes: number;
  bodyTextLength: number;
  challengeBlocked: boolean;
  blockReason: PageBlockReason;
  contentClass: PageContentClass;
  hasRawProductJson: boolean;
  hasProductStateJson: boolean;
  hasJsonLdProduct: boolean;
  hasGallerySelectorHint: boolean;
  isProductPath: boolean;
  isUsableProductHtml: boolean;
  retryAttempt?: number;
  elapsedMs?: number;
};

const EMPTY_DOC_RE = /^<html>\s*<head>\s*<\/head>\s*<body>\s*<\/body>\s*<\/html>$/i;
const CHALLENGE_RE =
  /cf-browser-verification|cf-challenge|challenge-platform|just a moment|attention required|cloudflare|turnstile|captcha|hcaptcha|recaptcha|access denied|erişim engell|bot.?detect|security check/i;
const CAPTCHA_RE = /\bcaptcha\b|hcaptcha|recaptcha|g-recaptcha/i;
const ACCESS_DENIED_RE = /access denied|403 forbidden|permission denied|erişim reddedildi|erişim engell/i;
const PRODUCT_STATE_MARKER = "__PRODUCT_DETAIL_APP_INITIAL_STATE__";
const JSON_LD_PRODUCT_RE = /"@type"\s*:\s*"Product"/i;
const GALLERY_HINT_RE =
  /data-testid=["'][^"']*gallery|gallery-container|product-slide|slick-slide|product-image-container/i;

export function byteLengthUtf8(text: string): number {
  return Buffer.byteLength(text || "", "utf8");
}

export function isEmptyHtmlDocument(html: string): boolean {
  const trimmed = (html || "").trim();
  if (!trimmed) return true;
  if (EMPTY_DOC_RE.test(trimmed)) return true;
  // Playwright boş sayfa varyantları
  if (trimmed.length <= 45 && /<html[\s>]/i.test(trimmed) && /<body[^>]*>\s*<\/body>/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function extractSafeUrlParts(finalUrl: string | null | undefined): {
  host: string | null;
  pathname: string | null;
  isProductPath: boolean;
  isAboutBlank: boolean;
} {
  const raw = String(finalUrl || "").trim();
  if (!raw || raw === "about:blank") {
    return { host: null, pathname: null, isProductPath: false, isAboutBlank: true };
  }
  try {
    const u = new URL(raw);
    const isProductPath = /\/[^/]*-p-\d{5,}/i.test(u.pathname) || /\/p-\d{5,}/i.test(u.pathname);
    return {
      host: u.hostname || null,
      pathname: u.pathname || null,
      isProductPath,
      isAboutBlank: u.protocol === "about:",
    };
  } catch {
    return { host: null, pathname: null, isProductPath: false, isAboutBlank: false };
  }
}

export function classifyPageContent(input: {
  html: string;
  finalUrl?: string | null;
  navigationStatus?: number | null;
  navigationStatusText?: string | null;
  title?: string | null;
  bodyText?: string | null;
  contentType?: string | null;
  serverHeader?: string | null;
  hasRawProductJson?: boolean;
  retryAttempt?: number;
  elapsedMs?: number;
}): SafePageDiagnostics {
  const html = input.html || "";
  const htmlBytes = byteLengthUtf8(html);
  const title = String(input.title || "");
  const bodyText = String(input.bodyText || "");
  const urlParts = extractSafeUrlParts(input.finalUrl);
  const status = input.navigationStatus ?? null;
  const sample = `${title}\n${bodyText}\n${html.slice(0, 2500)}`;

  const hasProductStateJson = html.includes(PRODUCT_STATE_MARKER);
  const hasJsonLdProduct = JSON_LD_PRODUCT_RE.test(html);
  const hasGallerySelectorHint = GALLERY_HINT_RE.test(html);
  const hasRawProductJson = input.hasRawProductJson === true;

  let contentClass: PageContentClass = "unknown";
  let blockReason: PageBlockReason = null;

  if (urlParts.isAboutBlank) {
    contentClass = "about-blank";
    blockReason = "about-blank";
  } else if (status === 556) {
    contentClass = "upstream-556";
    blockReason = "upstream-556";
  } else if (isEmptyHtmlDocument(html) || htmlBytes <= 45) {
    contentClass = htmlBytes === 39 || htmlBytes <= 45 ? "empty-document" : "empty-body";
    blockReason = contentClass === "empty-document" ? "empty-document" : "empty-body";
  } else if (status === 403 || ACCESS_DENIED_RE.test(sample)) {
    contentClass = "access-denied";
    blockReason = status === 403 ? "http-forbidden" : "access-denied";
  } else if (CAPTCHA_RE.test(sample) && !hasProductStateJson) {
    contentClass = "captcha";
    blockReason = "captcha";
  } else if (CHALLENGE_RE.test(sample) && !hasProductStateJson) {
    contentClass = /bot/i.test(sample) ? "bot-challenge" : "cloudflare-challenge";
    blockReason = contentClass === "bot-challenge" ? "bot-challenge" : "cloudflare-challenge";
  } else if (status && status >= 400) {
    contentClass = "navigation-error";
    blockReason = "http-error";
  } else if (
    input.finalUrl &&
    !urlParts.isProductPath &&
    /trendyol\.com/i.test(urlParts.host || "")
  ) {
    contentClass = "product-redirect";
    blockReason = "product-redirect";
  } else if (
    htmlBytes < 1500 &&
    /<div id=["']root["'][^>]*>\s*<\/div>/i.test(html) &&
    !hasProductStateJson
  ) {
    contentClass = "javascript-shell";
    blockReason = "javascript-shell";
  } else if (hasProductStateJson || hasJsonLdProduct || (htmlBytes > 5000 && urlParts.isProductPath)) {
    contentClass = "product-html";
    blockReason = null;
  } else if (htmlBytes < 500) {
    contentClass = "unknown-thin";
    blockReason = "empty-document";
  } else if (!hasProductStateJson && !hasJsonLdProduct) {
    contentClass = "unknown-blocked-response";
    blockReason = "unknown-blocked-response";
  }

  const challengeBlocked =
    blockReason === "cloudflare-challenge" ||
    blockReason === "bot-challenge" ||
    blockReason === "captcha" ||
    blockReason === "access-denied" ||
    blockReason === "http-forbidden" ||
    blockReason === "upstream-556" ||
    blockReason === "empty-document" ||
    blockReason === "empty-body" ||
    blockReason === "about-blank" ||
    blockReason === "unknown-blocked-response";

  const isUsableProductHtml =
    contentClass === "product-html" &&
    htmlBytes >= 500 &&
    (hasProductStateJson || hasJsonLdProduct || hasGallerySelectorHint || hasRawProductJson);

  return {
    navigationStatus: status,
    navigationStatusText: input.navigationStatusText || null,
    finalUrlHost: urlParts.host,
    finalUrlPathname: urlParts.pathname,
    contentType: input.contentType || null,
    serverHeader: input.serverHeader || null,
    titleLength: title.length,
    htmlBytes,
    bodyTextLength: bodyText.trim().length,
    challengeBlocked,
    blockReason,
    contentClass,
    hasRawProductJson,
    hasProductStateJson,
    hasJsonLdProduct,
    hasGallerySelectorHint,
    isProductPath: urlParts.isProductPath,
    isUsableProductHtml,
    retryAttempt: input.retryAttempt,
    elapsedMs: input.elapsedMs,
  };
}

export function shouldRetryNavigation(diag: SafePageDiagnostics): boolean {
  if (diag.isUsableProductHtml) return false;
  return (
    diag.contentClass === "empty-body" ||
    diag.contentClass === "empty-document" ||
    diag.contentClass === "about-blank" ||
    diag.contentClass === "javascript-shell" ||
    diag.contentClass === "unknown-thin" ||
    diag.contentClass === "cloudflare-challenge" ||
    diag.contentClass === "bot-challenge" ||
    diag.blockReason === "empty-body" ||
    diag.blockReason === "empty-document"
  );
}

export function workerErrorCategoryFromDiagnostics(
  diag: SafePageDiagnostics,
): "blocked" | "navigation" | "timeout" | "unknown" {
  if (
    diag.challengeBlocked ||
    diag.blockReason === "upstream-556" ||
    diag.blockReason === "empty-document" ||
    diag.blockReason === "empty-body" ||
    diag.blockReason === "about-blank" ||
    diag.blockReason === "unknown-blocked-response" ||
    diag.contentClass === "empty-document" ||
    diag.contentClass === "empty-body" ||
    diag.contentClass === "about-blank" ||
    diag.contentClass === "unknown-thin" ||
    diag.contentClass === "unknown-blocked-response" ||
    diag.contentClass === "access-denied" ||
    diag.contentClass === "cloudflare-challenge" ||
    diag.contentClass === "bot-challenge" ||
    diag.contentClass === "captcha" ||
    diag.contentClass === "upstream-556" ||
    (diag.htmlBytes > 0 && diag.htmlBytes <= 45 && !diag.isUsableProductHtml)
  ) {
    return "blocked";
  }
  if (
    diag.blockReason === "redirect-off-product" ||
    diag.blockReason === "product-redirect" ||
    diag.blockReason === "navigation-error" ||
    diag.blockReason === "http-error"
  ) {
    return "navigation";
  }
  if (diag.blockReason === "javascript-shell" || diag.contentClass === "javascript-shell") {
    return "timeout";
  }
  return "unknown";
}
