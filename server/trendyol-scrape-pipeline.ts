/**
 * Trendyol cloud-safe scrape pipeline.
 * Stage hataları pipeline'ı durdurmaz; yalnızca hiç veri yoksa fail.
 */
import { puppeteerAllowed, isCloudRuntime } from "@shared/deploy-runtime";
import {
  hasMinimumScrapeData,
  isCompleteScrapeData,
  logScrapeDiagnostics,
  resolveEffectiveScrapeMode,
  ScrapeStageTimeoutError,
  withStageTimeout,
  type PipelineOutcome,
  type ScrapeDiagnostics,
  type ScrapeStageErrorCode,
  type SelectedScrapeMode,
} from "@shared/scrape-runtime";
import { hasRealTrendyolVariants } from "@shared/trendyol-variant-utils";
import { fetchTrendyolProductByUrl } from "./trendyol-product-api";
import {
  brandFromTrendyolUrl,
  isValidTrendyolProductTitle,
} from "./trendyol-title-utils";
import { filterValidProductImages } from "./trendyol-image-utils";
import { mergeApiWithScrape, resolveProductTitle } from "./trendyol-result-normalizer";
import { scenarioBasedScrape } from "./scenario-based-scraper";

const DIRECT_HTML_TIMEOUT_MS = 20_000;
const IMAGE_FETCH_TIMEOUT_MS = 25_000;
const SCENARIO_TIMEOUT_MS = 90_000;

function evaluateFields(result: any, url: string) {
  const title = resolveProductTitle(url, result?.title);
  const hasTitle = isValidTrendyolProductTitle(title) || title.length > 3;
  const hasPrice = Boolean(result?.price?.original && result.price.original > 0);
  const hasImages = filterValidProductImages(result?.images || []).length > 0;
  return { hasTitle, hasPrice, hasImages, title };
}

function pushStageError(
  diagnostics: ScrapeDiagnostics,
  code: ScrapeStageErrorCode,
): void {
  if (!diagnostics.stageErrors.includes(code)) {
    diagnostics.stageErrors.push(code);
  }
}

function recordStageFailure(
  diagnostics: ScrapeDiagnostics,
  code: ScrapeStageErrorCode,
  field: "directHtmlError" | "imageFetcherError",
): void {
  pushStageError(diagnostics, code);
  diagnostics[field] = code;
}

function needsScenarioEnrichment(result: any, url: string): boolean {
  const fields = evaluateFields(result, url);
  if (!hasMinimumScrapeData(fields)) return true;
  if (!isCompleteScrapeData(fields)) return true;
  return !hasRealTrendyolVariants(result?.variants);
}

function emptyResult(url: string) {
  return {
    success: true,
    title: resolveProductTitle(url, null),
    brand: brandFromTrendyolUrl(url) || "Marka",
    price: { original: 0, withProfit: 0, currency: "TRY" },
    images: [] as string[],
    sourceUrl: url,
  };
}

export async function runTrendyolScrapePipeline(
  url: string,
  selectedScrapeMode?: SelectedScrapeMode,
): Promise<PipelineOutcome> {
  const modes = resolveEffectiveScrapeMode(selectedScrapeMode);
  const diagnostics: ScrapeDiagnostics = {
    selectedScrapeMode: modes.selected,
    effectiveScrapeMode: modes.effective,
    isCloudRuntime: isCloudRuntime(),
    puppeteerAllowed: puppeteerAllowed(),
    apiStarted: false,
    apiSuccess: false,
    directHtmlStarted: false,
    directHtmlSuccess: false,
    imageFetcherStarted: false,
    imageFetcherSuccess: false,
    imageFallbackStarted: false,
    imageFallbackSuccess: false,
    stageErrors: [],
  };
  logScrapeDiagnostics(diagnostics);

  let result: any = emptyResult(url);
  let apiProduct: Awaited<ReturnType<typeof fetchTrendyolProductByUrl>> = null;

  const convertApiProduct = (api: NonNullable<typeof apiProduct>) => ({
    success: true,
    title: resolveProductTitle(url, api.title),
    brand: api.brand || brandFromTrendyolUrl(url) || "Marka",
    category: api.category || "Genel",
    description: api.description || "",
    price: api.price,
    images: filterValidProductImages(api.images),
    variants: api.variants,
    features: [],
    tags: [],
    extractionMethod: "trendyol-api",
    scenario: "trendyol-api",
    confidence: 90,
    sourceUrl: url,
  });

  // 1) Trendyol API
  diagnostics.apiStarted = true;
  console.log("⚡ [1/6] Trendyol API...");
  try {
    apiProduct = await fetchTrendyolProductByUrl(url);
    if (apiProduct && (apiProduct.price.original > 0 || apiProduct.images.length > 0)) {
      result = convertApiProduct(apiProduct);
      diagnostics.apiSuccess = true;
      console.log(`✅ Trendyol API: "${apiProduct.title}" — ${apiProduct.price.original} TL`);
    }
  } catch (err) {
    console.log(`⚠️ [1/6] API failed: ${err instanceof Error ? err.message : err}`);
  }

  // 2) Direct HTML — Safari UA (soft fail)
  diagnostics.directHtmlStarted = true;
  let directHtml: string | null = null;
  console.log("⚡ [2/6] Direct HTML (Safari UA)...");
  try {
    const { fetchTrendyolDirectHtmlRaw } = await import("./trendyol-direct-html");
    const directRaw = await withStageTimeout(
      () => fetchTrendyolDirectHtmlRaw(url),
      DIRECT_HTML_TIMEOUT_MS,
      "direct-html-timeout",
    );
    directHtml = directRaw?.html ?? null;
    diagnostics.directHtmlSuccess = Boolean(directHtml && directHtml.length > 5000);
    if (diagnostics.directHtmlSuccess) {
      console.log(`✅ [2/6] Direct HTML: ${directHtml!.length} bytes`);
    }
  } catch (err) {
    const code: ScrapeStageErrorCode =
      err instanceof ScrapeStageTimeoutError ? err.code : "direct-html-error";
    recordStageFailure(diagnostics, code, "directHtmlError");
    console.warn(`⚠️ [2/6] Direct HTML soft-fail (${code}), devam ediliyor`);
  }

  // 3) HTML / JSON-LD / productState parse
  console.log("⚡ [3/6] HTML/JSON-LD parse...");
  try {
    const { extractTrendyolProductFromHtml } = await import("./trendyol-html-extractor");
    const htmlProduct = await extractTrendyolProductFromHtml(url);
    if (htmlProduct) {
      result.title = resolveProductTitle(url, htmlProduct.title || result.title);
      if (filterValidProductImages(result.images).length === 0 && htmlProduct.images.length > 0) {
        result.images = htmlProduct.images;
      }
      if (hasRealTrendyolVariants(htmlProduct.variants)) {
        result.variants = htmlProduct.variants;
      }
      if ((!result.price?.original || result.price.original <= 0) && htmlProduct.price.original > 0) {
        result.price = htmlProduct.price;
      }
      if (htmlProduct.description && !result.description) {
        result.description = htmlProduct.description;
      }
      console.log(
        `✅ [3/6] HTML extractor (${htmlProduct.htmlSource}): ${htmlProduct.images.length} görsel, fiyat=${htmlProduct.price.original}`,
      );
    }
  } catch (err) {
    console.warn(`⚠️ [3/6] HTML parse failed: ${err instanceof Error ? err.message : err}`);
  }

  // 4) fetchTrendyolProductImages
  const hasImagesBeforeFetch = filterValidProductImages(result?.images || []).length > 0;
  if (!hasImagesBeforeFetch) {
    diagnostics.imageFetcherStarted = true;
    console.log("⚡ [4/6] fetchTrendyolProductImages...");
    try {
      const { fetchTrendyolProductImages } = await import("./trendyol-image-fetcher");
      const directImages = await withStageTimeout(
        () => fetchTrendyolProductImages(url),
        IMAGE_FETCH_TIMEOUT_MS,
        "image-proxy-timeout",
      );
      if (directImages.length > 0) {
        result.images = directImages;
        diagnostics.imageFetcherSuccess = true;
        console.log(`✅ [4/6] Görsel: ${directImages.length} adet`);
      }
    } catch (err) {
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "image-proxy-error";
      recordStageFailure(diagnostics, code, "imageFetcherError");
      console.warn(`⚠️ [4/6] Image fetch soft-fail (${code}), devam ediliyor`);
    }
  } else {
    console.log("⚡ [4/6] Görseller mevcut — image fetch atlandı");
  }

  // 5) Cache / alternatif görsel fallback
  const stillNoImages = filterValidProductImages(result?.images || []).length === 0;
  if (stillNoImages) {
    diagnostics.imageFallbackStarted = true;
    console.log("⚡ [5/6] Alternatif görsel fallback...");
    try {
      const { fetchTrendyolImagesFromApi } = await import("./trendyol-product-api");
      const apiImages = await fetchTrendyolImagesFromApi(url);
      if (apiImages.length > 0) {
        result.images = apiImages;
        diagnostics.imageFallbackSuccess = true;
        console.log(`✅ [5/6] API deep scan: ${apiImages.length} görsel`);
      } else {
        const { scrapeTrendyolHttpFallback } = await import("./http-scraper-fallback");
        const http = await scrapeTrendyolHttpFallback(url);
        if (http.success && http.product?.images?.length) {
          result.images = http.product.images;
          diagnostics.imageFallbackSuccess = true;
          console.log(`✅ [5/6] HTTP fallback görsel: ${http.product.images.length} adet`);
        }
      }
    } catch (err) {
      pushStageError(diagnostics, "image-fallback-error");
      console.warn(`⚠️ [5/6] Image fallback failed: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.log("⚡ [5/6] Görsel fallback atlandı");
  }

  result.title = resolveProductTitle(url, result.title);
  let fields = evaluateFields(result, url);

  // 6) Scenario — cloud'da yalnızca ENABLE_PUPPETEER_IN_CLOUD=true ise
  const scenarioNeeded = needsScenarioEnrichment(result, url);
  if (!scenarioNeeded) {
    diagnostics.scenarioSkippedReason = "sufficient-data";
  } else if (!puppeteerAllowed()) {
    diagnostics.scenarioSkippedReason = "puppeteer-disabled-in-cloud";
    console.info("ℹ️ Scenario atlandı (cloud): puppeteer-disabled-in-cloud");
  } else if (
    modes.effective === "auto-fast" &&
    hasMinimumScrapeData(fields) &&
    hasRealTrendyolVariants(result.variants)
  ) {
    diagnostics.scenarioSkippedReason = "auto-fast-core-data-present";
  } else {
    console.log("⚡ [6/6] Scenario scrape (eksik veri)...");
    try {
      const scrapeResult = await withStageTimeout(
        () => scenarioBasedScrape(url, { allowPuppeteer: true }),
        SCENARIO_TIMEOUT_MS,
        "scenario-timeout",
      );

      const scrapeHasValidTitle =
        scrapeResult?.title &&
        isValidTrendyolProductTitle(scrapeResult.title) &&
        scrapeResult.title.length > 5;
      const scrapeHasValidData =
        scrapeHasValidTitle &&
        (scrapeResult?.price?.original > 0 || (scrapeResult?.images?.length ?? 0) > 0);

      if (scrapeResult && scrapeResult.success !== false && scrapeHasValidData) {
        result = mergeApiWithScrape(result, scrapeResult);
        console.log("✅ [6/6] Scenario scrape merged");
      } else if (!hasMinimumScrapeData(fields)) {
        pushStageError(diagnostics, "scenario-error");
        diagnostics.scenarioSkippedReason = "scenario-insufficient-data";
        console.warn("⚠️ [6/6] Scenario returned insufficient data");
      }
    } catch (err) {
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "scenario-error";
      pushStageError(diagnostics, code);
      diagnostics.scenarioSkippedReason = "scenario-failed-keeping-partial";
      console.warn(`⚠️ [6/6] Scenario soft-fail (${code})`);
      if (apiProduct && !hasMinimumScrapeData(fields)) {
        result = convertApiProduct(apiProduct);
      }
    }
  }

  result.title = resolveProductTitle(url, result.title);
  fields = evaluateFields(result, url);

  const minimum = hasMinimumScrapeData(fields);
  const complete = isCompleteScrapeData(fields);
  const partialSuccess = minimum && (!complete || diagnostics.stageErrors.length > 0);

  if (!minimum) {
    diagnostics.finalSuccessReason = "no-data";
    diagnostics.partialSuccess = false;
    logScrapeDiagnostics(diagnostics);
    return {
      result: {
        ...result,
        success: false,
        partialSuccess: false,
        stageErrors: diagnostics.stageErrors,
      },
      diagnostics,
      success: false,
      partialSuccess: false,
    };
  }

  diagnostics.finalSuccessReason = complete
    ? diagnostics.stageErrors.length > 0
      ? "complete-with-stage-warnings"
      : "complete"
    : "partial-data";
  diagnostics.partialSuccess = partialSuccess;

  const finalResult = {
    ...result,
    success: true,
    partialSuccess,
    stageErrors: diagnostics.stageErrors,
    scrapeDiagnostics: diagnostics,
  };

  logScrapeDiagnostics(diagnostics);
  return {
    result: finalResult,
    diagnostics,
    success: true,
    partialSuccess,
  };
}
