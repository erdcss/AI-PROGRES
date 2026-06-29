import {
  isValidTrendyolProductTitle,
  titleFromTrendyolUrl,
} from "./trendyol-title-utils";
import { filterValidProductImages } from "./trendyol-image-utils";
import { resolveProductTitle } from "./trendyol-result-normalizer";

export type TitleSource = "api" | "html" | "url-slug" | "unknown";

export type FinalSuccessReason =
  | "title-only-slug-no-data"
  | "api-title-only"
  | "title-price-no-images"
  | "full-data"
  | "no-usable-data"
  | "partial-timeout"
  | "gateway-html-success"
  | "gateway-full-data"
  | "gateway-no-data"
  | "gateway-not-configured"
  | "gateway-provider-failed"
  | "source-access-internal-provider-unavailable"
  | "source-access-provider-failed"
  | "source-access-no-usable-data"
  | "local-agent-success"
  | "local-agent-full-data"
  | "local-agent-failed"
  | "gateway-data-invalid";

export type ScrapeQuality = {
  titleSource: TitleSource;
  hasValidPrice: boolean;
  hasImages: boolean;
  hasRealTitle: boolean;
  usableForCsv: boolean;
  usableForShopify: boolean;
  blockedForExport: boolean;
  previewOk: boolean;
  jobSuccess: boolean;
  partialSuccess: boolean;
  finalSuccessReason: FinalSuccessReason;
  warnings: string[];
};

function parsePrice(original: unknown): number {
  if (typeof original === "number" && original > 0) return original;
  if (original && typeof original === "object") {
    const p = original as { original?: number; withProfit?: number };
    if (typeof p.original === "number" && p.original > 0) return p.original;
    if (typeof p.withProfit === "number" && p.withProfit > 0) return p.withProfit;
  }
  return 0;
}

function isValidSourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** CSV export eligibility — titleSource url-slug alone must not block export */
export function isCsvExportable(
  url: string,
  result: Record<string, unknown>,
  opts: {
    title?: string;
    titleSource?: TitleSource;
    hasValidPrice?: boolean;
    hasImages?: boolean;
  } = {},
): { exportable: boolean; warnings: string[] } {
  const title = String(opts.title ?? result.title ?? "").trim();
  const titleSource =
    opts.titleSource ??
    detectTitleSource(url, title, false, false);
  const hasValidPrice = opts.hasValidPrice ?? parsePrice(result.price) > 0;
  const hasImages =
    opts.hasImages ?? filterValidProductImages(result.images).length > 0;
  const sourceUrl = String(result.sourceUrl ?? result.url ?? url).trim();

  const warnings: string[] = [];
  if (titleSource === "url-slug") {
    warnings.push("title_from_url_slug_review_recommended");
  }

  const exportable =
    title.length >= 8 &&
    hasValidPrice &&
    hasImages &&
    isValidSourceUrl(sourceUrl || url);

  return { exportable, warnings };
}

export function detectTitleSource(
  url: string,
  rawTitle: unknown,
  apiSuccess: boolean,
  htmlParseSuccess: boolean,
): TitleSource {
  const title = String(rawTitle ?? "").trim();
  const slugTitle = titleFromTrendyolUrl(url);
  const normalizedSlug = slugTitle?.trim().toLowerCase() ?? "";
  const normalizedTitle = title.toLowerCase();

  if (apiSuccess && isValidTrendyolProductTitle(title) && normalizedTitle !== normalizedSlug) {
    return "api";
  }
  if (htmlParseSuccess && isValidTrendyolProductTitle(title) && normalizedTitle !== normalizedSlug) {
    return "html";
  }
  if (slugTitle && normalizedTitle === normalizedSlug) {
    return "url-slug";
  }
  if (slugTitle && title.length > 0 && !isValidTrendyolProductTitle(title)) {
    return "url-slug";
  }
  return "unknown";
}

export function evaluateScrapeQuality(
  url: string,
  result: Record<string, unknown>,
  opts: {
    apiSuccess?: boolean;
    htmlParseSuccess?: boolean;
    gatewayHtmlSuccess?: boolean;
    gatewayError?: string;
    gatewaySkippedReason?: string;
    stageErrors?: string[];
  } = {},
): ScrapeQuality {
  const apiSuccess = opts.apiSuccess === true;
  const htmlParseSuccess = opts.htmlParseSuccess === true;
  const gatewayHtmlSuccess = opts.gatewayHtmlSuccess === true;
  const stageErrors = opts.stageErrors ?? [];

  const title = resolveProductTitle(url, result.title as string | undefined);
  const titleSource = detectTitleSource(url, title, apiSuccess, htmlParseSuccess);
  const hasValidPrice = parsePrice(result.price) > 0;
  const hasImages = filterValidProductImages(result.images).length > 0;
  const hasRealTitle =
    titleSource !== "url-slug" && isValidTrendyolProductTitle(title);

  const csvCheck = isCsvExportable(url, result, {
    title,
    titleSource,
    hasValidPrice,
    hasImages,
  });
  const usableForCsv = csvCheck.exportable;
  const warnings = csvCheck.warnings;

  const usableForShopify =
    hasValidPrice && titleSource !== "url-slug" && isValidTrendyolProductTitle(title);

  const blockedForExport = !usableForCsv;

  const slugOnlyNoData =
    titleSource === "url-slug" && !hasValidPrice && !hasImages;

  const previewOk = !slugOnlyNoData && (hasValidPrice || hasImages || hasRealTitle);
  const jobSuccess = usableForCsv || previewOk;
  const hadTimeout = stageErrors.some((e) => e.includes("timeout"));

  let finalSuccessReason: FinalSuccessReason = "no-usable-data";

  if (
    stageErrors.includes("source-access-internal-provider-unavailable") ||
    opts.gatewaySkippedReason === "source-access-internal-provider-unavailable"
  ) {
    finalSuccessReason = "source-access-internal-provider-unavailable";
  } else if (
    stageErrors.includes("source-access-provider-failed") ||
    opts.gatewayError === "source-access-provider-failed" ||
    opts.gatewaySkippedReason === "source-access-provider-failed"
  ) {
    finalSuccessReason = "source-access-provider-failed";
  } else if (
    stageErrors.includes("gateway-settings-table-missing") ||
    opts.gatewaySkippedReason === "gateway-settings-table-missing"
  ) {
    finalSuccessReason = "source-access-internal-provider-unavailable";
  } else if (
    stageErrors.includes("gateway-not-configured") ||
    opts.gatewaySkippedReason === "gateway-not-configured"
  ) {
    finalSuccessReason = "source-access-internal-provider-unavailable";
  } else if (
    stageErrors.includes("gateway-provider-failed") ||
    opts.gatewayError === "gateway-provider-failed"
  ) {
    finalSuccessReason = "source-access-provider-failed";
  } else if (
    stageErrors.includes("local-agent-failed") ||
    opts.gatewayError === "local-agent-failed" ||
    opts.gatewaySkippedReason === "local-agent-failed"
  ) {
    finalSuccessReason = "local-agent-failed";
  } else if (slugOnlyNoData) {
    finalSuccessReason = "title-only-slug-no-data";
  } else if (hasValidPrice && hasImages && hasRealTitle) {
    const preset = String(result.finalSuccessReason ?? "");
    finalSuccessReason = hadTimeout
      ? "partial-timeout"
      : preset === "local-agent-full-data"
        ? "local-agent-full-data"
        : gatewayHtmlSuccess
          ? "gateway-full-data"
          : htmlParseSuccess
            ? "full-data"
            : "full-data";
  } else if (hasValidPrice && hasImages && titleSource === "url-slug") {
    finalSuccessReason = hadTimeout ? "partial-timeout" : "full-data";
  } else if (hasValidPrice && hasRealTitle && !hasImages) {
    finalSuccessReason = hadTimeout ? "partial-timeout" : "title-price-no-images";
  } else if ((apiSuccess || hasRealTitle) && !hasValidPrice && !hasImages) {
    finalSuccessReason = "api-title-only";
  } else if (usableForCsv && hadTimeout) {
    finalSuccessReason = "partial-timeout";
  } else if (usableForCsv) {
    finalSuccessReason = hasValidPrice ? "title-price-no-images" : "api-title-only";
  }

  const partialSuccess = previewOk && (!usableForCsv || titleSource === "url-slug");

  return {
    titleSource,
    hasValidPrice,
    hasImages,
    hasRealTitle,
    usableForCsv,
    usableForShopify,
    blockedForExport,
    previewOk,
    jobSuccess,
    partialSuccess,
    finalSuccessReason,
    warnings,
  };
}
