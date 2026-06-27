/**
 * Trendyol cloud-safe scrape pipeline.
 * Sıra: API → Direct HTML → HTML parse → görseller → (eksikse) scenario
 */
import { puppeteerAllowed, isCloudRuntime } from "@shared/deploy-runtime";
import {
  logScrapeDiagnostics,
  resolveEffectiveScrapeMode,
  ScrapeStageTimeoutError,
  withStageTimeout,
  type ScrapeDiagnostics,
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

const DIRECT_HTML_TIMEOUT_MS = 25_000;
const IMAGE_FETCH_TIMEOUT_MS = 30_000;
const SCENARIO_TIMEOUT_MS = 90_000;

function hasCoreProductData(result: any): boolean {
  if (!result) return false;
  const hasTitle = isValidTrendyolProductTitle(
    resolveProductTitle(result.sourceUrl || "", result.title),
  );
  const hasPrice = Boolean(result.price?.original && result.price.original > 0);
  const hasImages = filterValidProductImages(result.images || []).length > 0;
  return hasTitle && hasPrice && hasImages;
}

function needsScenarioEnrichment(result: any): boolean {
  if (!result) return true;
  if (!hasCoreProductData(result)) return true;
  const hasVariants = hasRealTrendyolVariants(result.variants);
  return !hasVariants;
}

export async function runTrendyolScrapePipeline(
  url: string,
  selectedScrapeMode?: SelectedScrapeMode,
): Promise<{ result: any; diagnostics: ScrapeDiagnostics }> {
  const modes = resolveEffectiveScrapeMode(selectedScrapeMode);
  const diagnostics: ScrapeDiagnostics = {
    selectedScrapeMode: modes.selected,
    effectiveScrapeMode: modes.effective,
    isCloudRuntime: isCloudRuntime(),
    puppeteerAllowed: puppeteerAllowed(),
    directHtmlStarted: false,
    directHtmlSuccess: false,
  };
  logScrapeDiagnostics(diagnostics);

  let result: any = null;

  const convertApiProduct = (apiProduct: any) => ({
    success: true,
    title: resolveProductTitle(url, apiProduct.title),
    brand: apiProduct.brand || brandFromTrendyolUrl(url) || "Marka",
    category: apiProduct.category || "Genel",
    description: apiProduct.description || "",
    price: apiProduct.price,
    images: filterValidProductImages(apiProduct.images),
    variants: apiProduct.variants,
    features: [],
    tags: [],
    extractionMethod: "trendyol-api",
    scenario: "trendyol-api",
    confidence: 90,
    sourceUrl: url,
  });

  // 1) Trendyol API
  console.log("⚡ [1/5] Trendyol API...");
  const apiProduct = await fetchTrendyolProductByUrl(url);
  if (apiProduct && (apiProduct.price.original > 0 || apiProduct.images.length > 0)) {
    console.log(`✅ Trendyol API: "${apiProduct.title}" — ${apiProduct.price.original} TL`);
    result = convertApiProduct(apiProduct);
  }

  if (!result) {
    result = {
      success: true,
      title: resolveProductTitle(url, null),
      brand: brandFromTrendyolUrl(url) || "Marka",
      price: { original: 0, withProfit: 0, currency: "TRY" },
      images: [],
      sourceUrl: url,
    };
  }

  // 2) Direct HTML — Safari UA
  diagnostics.directHtmlStarted = true;
  let directHtml: string | null = null;
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
      console.log(`✅ [2/5] Direct HTML: ${directHtml!.length} bytes`);
    }
  } catch (err) {
    if (err instanceof ScrapeStageTimeoutError) throw err;
    console.log(`⚠️ [2/5] Direct HTML failed: ${err instanceof Error ? err.message : err}`);
  }

  // 3) HTML / JSON-LD / product state parse
  console.log("⚡ [3/5] HTML/JSON-LD parse...");
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
        `✅ HTML extractor (${htmlProduct.htmlSource}): ${htmlProduct.images.length} görsel, fiyat=${htmlProduct.price.original}`,
      );
    }
  } catch (err) {
    console.log(`⚠️ [3/5] HTML parse failed: ${err instanceof Error ? err.message : err}`);
  }

  // 4) fetchTrendyolProductImages — eksik görseller
  const apiHasImages = filterValidProductImages(result?.images || []).length > 0;
  if (!apiHasImages) {
    console.log("⚡ [4/5] fetchTrendyolProductImages...");
    try {
      const { fetchTrendyolProductImages } = await import("./trendyol-image-fetcher");
      const directImages = await withStageTimeout(
        () => fetchTrendyolProductImages(url),
        IMAGE_FETCH_TIMEOUT_MS,
        "image-proxy-timeout",
      );
      if (directImages.length > 0) {
        result.images = directImages;
        console.log(`✅ [4/5] Görsel: ${directImages.length} adet`);
      }
    } catch (err) {
      if (err instanceof ScrapeStageTimeoutError) throw err;
      console.log(`⚠️ [4/5] Görsel fetch failed: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    console.log("⚡ [4/5] Görseller mevcut — image fetch atlandı");
  }

  result.title = resolveProductTitle(url, result.title);

  // 5) Scenario — yalnızca eksik veri + Puppeteer izinli
  const scenarioNeeded = needsScenarioEnrichment(result);
  if (!scenarioNeeded) {
    diagnostics.scenarioSkippedReason = "sufficient-data";
    logScrapeDiagnostics(diagnostics);
    return { result, diagnostics };
  }

  if (!puppeteerAllowed()) {
    diagnostics.scenarioSkippedReason = "puppeteer-disabled-in-cloud";
    logScrapeDiagnostics(diagnostics);
    console.log("☁️ Scenario atlandı: puppeteer-disabled-in-cloud");
    return { result, diagnostics };
  }

  if (modes.effective === "direct-html" || modes.effective === "auto-fast") {
    const missingOnlyVariants =
      hasCoreProductData(result) && !hasRealTrendyolVariants(result.variants);
    if (modes.effective === "auto-fast" && !missingOnlyVariants && hasCoreProductData(result)) {
      diagnostics.scenarioSkippedReason = "auto-fast-core-data-present";
      logScrapeDiagnostics(diagnostics);
      return { result, diagnostics };
    }
  }

  console.log("⚡ [5/5] Scenario scrape (eksik veri)...");
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
      console.log("✅ [5/5] Scenario scrape merged");
    } else if (!hasCoreProductData(result)) {
      throw new ScrapeStageTimeoutError("scenario-timeout", "Scenario scrape returned insufficient data");
    }
  } catch (err) {
    if (err instanceof ScrapeStageTimeoutError) throw err;
    if (hasCoreProductData(result)) {
      console.log(`⚠️ [5/5] Scenario enrich skipped: ${err instanceof Error ? err.message : err}`);
      diagnostics.scenarioSkippedReason = "scenario-failed-keeping-partial";
    } else if (apiProduct) {
      result = convertApiProduct(apiProduct);
      diagnostics.scenarioSkippedReason = "scenario-failed-api-fallback";
    } else {
      throw err;
    }
  }

  logScrapeDiagnostics(diagnostics);
  return { result, diagnostics };
}
