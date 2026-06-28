import {
  validateTrackingSourceData,
  noPriceResult,
  parseSourcePrice,
} from "@shared/scrape-validity";

/** scenarioBasedScrape ve legacy scrape çıktılarına güvenlik kapısı uygular */
export function applyScrapeSafetyGate<T extends Record<string, unknown>>(result: T): T {
  const priceObj =
    result.price && typeof result.price === "object"
      ? (result.price as Record<string, unknown>)
      : {};

  const validation = validateTrackingSourceData({
    title: result.title,
    price: result.price,
    images: result.images,
    titleSource: result.titleSource,
    priceSource: priceObj.method ?? priceObj.priceSource,
    success: result.success,
  });

  if (validation.valid) {
    return {
      ...result,
      success: true,
      priceValid: true,
      priceSource: validation.priceSource,
    } as T;
  }

  const safePrice = noPriceResult(String(priceObj.currency ?? "TRY"));

  return {
    ...result,
    success: false,
    partialSuccess: false,
    price: safePrice,
    priceValid: false,
    priceSource: "NO_PRICE_FOUND",
    blockedForExport: true,
    usableForCsv: false,
    usableForShopify: false,
    invalidReason: validation.reason,
    scrapeBlocked: true,
  } as T;
}

export function isUsableScrapeForTracking(result: Record<string, unknown>): boolean {
  const priceObj =
    result.price && typeof result.price === "object"
      ? (result.price as Record<string, unknown>)
      : {};

  return validateTrackingSourceData({
    title: result.title,
    price: result.price,
    images: result.images,
    titleSource: result.titleSource,
    priceSource: priceObj.method ?? priceObj.priceSource,
    success: result.success,
  }).valid;
}

export { validateTrackingSourceData, parseSourcePrice, noPriceResult };
