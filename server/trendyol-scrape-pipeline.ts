/**
 * Trendyol cloud-safe scrape pipeline.
 * Stage hataları pipeline'ı durdurmaz; global deadline sonrası partial döner.
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
import { evaluateScrapeQuality } from "./scrape-quality";
import { hasRealTrendyolVariants } from "@shared/trendyol-variant-utils";
import { buildStockAnalysisFromVariants } from "./trendyol-html-enrichment";
import { fetchTrendyolProductByUrl } from "./trendyol-product-api";
import {
  brandFromTrendyolUrl,
  isValidTrendyolProductTitle,
} from "./trendyol-title-utils";
import { filterValidProductImages } from "./trendyol-image-utils";
import { mergeApiWithScrape, resolveProductTitle } from "./trendyol-result-normalizer";
import { scenarioBasedScrape } from "./scenario-based-scraper";
import { getScrapeEnvironmentPolicy } from "./services/scrape-environment.service";

const STAGE_TIMEOUT_BASE = {
  api: 10_000,
  directHtml: 22_000,
  htmlParse: 4_000,
  imageFetcher: 18_000,
  imageFallback: 12_000,
  scenario: 75_000,
} as const;

function stageTimeouts(policy = getScrapeEnvironmentPolicy()) {
  return {
    ...STAGE_TIMEOUT_BASE,
    api: policy.apiTimeoutMs,
    directHtml: policy.directHtmlTimeoutMs,
    imageFetcher: policy.isCloud ? 22_000 : STAGE_TIMEOUT_BASE.imageFetcher,
  };
}

function applyAgentAccessToResult(
  result: any,
  url: string,
  access: {
    title?: string;
    price?: number;
    images: string[];
    variants?: unknown;
    finalSuccessReason?: string;
    htmlSuccess: boolean;
    imageSuccess: boolean;
  },
  diagnostics: ScrapeDiagnostics,
) {
  if (access.title) result.title = resolveProductTitle(url, access.title);
  if (access.price && access.price > 0) {
    result.price = { original: access.price, withProfit: access.price, currency: "TRY" };
  }
  if (access.images.length > 0) {
    result.images = access.images;
  }
  if (access.variants) {
    result.variants = access.variants;
  }
  result._fromLocalAgent = true;
  result._sourceAccessStrategy = "local_agent";
  if (access.finalSuccessReason) {
    result.finalSuccessReason = access.finalSuccessReason;
  }
  diagnostics.gatewayHtmlSuccess = access.htmlSuccess;
  diagnostics.gatewayImageSuccess = access.imageSuccess;
  diagnostics.gatewayProviderType = "local_agent";
}

function evaluateFields(result: any, url: string) {
  const title = resolveProductTitle(url, result?.title);
  const hasTitle = isValidTrendyolProductTitle(title) || title.length > 3;
  const hasPrice = Boolean(result?.price?.original && result.price.original > 0);
  const hasImages = filterValidProductImages(result?.images || []).length > 0;
  return { hasTitle, hasPrice, hasImages, title };
}

function pushStageError(diagnostics: ScrapeDiagnostics, code: ScrapeStageErrorCode): void {
  if (!diagnostics.stageErrors.includes(code)) {
    diagnostics.stageErrors.push(code);
  }
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

function createDiagnostics(modes: { selected: string; effective: string }): ScrapeDiagnostics {
  return {
    selectedScrapeMode: modes.selected,
    effectiveScrapeMode: modes.effective,
    isCloudRuntime: isCloudRuntime(),
    puppeteerAllowed: puppeteerAllowed(),
    apiStarted: false,
    apiSuccess: false,
    directHtmlStarted: false,
    directHtmlSuccess: false,
    htmlParseStarted: false,
    htmlParseSuccess: false,
    imageFetcherStarted: false,
    imageFetcherSuccess: false,
    imageFallbackStarted: false,
    imageFallbackSuccess: false,
    stageErrors: [],
  };
}

function finalizeOutcome(
  result: any,
  url: string,
  diagnostics: ScrapeDiagnostics,
  pipelineStart: number,
  forcedGlobalTimeout = false,
): PipelineOutcome {
  if (forcedGlobalTimeout) {
    pushStageError(diagnostics, "pipeline-global-timeout");
    diagnostics.scenarioSkippedReason =
      diagnostics.scenarioSkippedReason || "global-timeout";
  }

  diagnostics.pipelineDurationMs = Date.now() - pipelineStart;
  result.title = resolveProductTitle(url, result.title);

  const policy = getScrapeEnvironmentPolicy();
  const quality = evaluateScrapeQuality(url, result, {
    apiSuccess: diagnostics.apiSuccess,
    htmlParseSuccess: diagnostics.htmlParseSuccess,
    gatewayHtmlSuccess: diagnostics.gatewayHtmlSuccess,
    gatewayError: diagnostics.gatewayError,
    gatewaySkippedReason: diagnostics.gatewaySkippedReason,
    stageErrors: diagnostics.stageErrors,
    preferLocalAgent: policy.preferLocalAgent,
    localAgentSucceeded: diagnostics.localAgentSucceeded,
    htmlUnavailable:
      !diagnostics.htmlParseSuccess &&
      !diagnostics.gatewayHtmlSuccess &&
      !diagnostics.directHtmlSuccess,
  });

  diagnostics.finalSuccessReason = quality.finalSuccessReason;
  diagnostics.partialSuccess = quality.partialSuccess;

  const finalResult = {
    ...result,
    success: quality.jobSuccess,
    partialSuccess: quality.partialSuccess,
    titleSource: quality.titleSource,
    usableForCsv: quality.usableForCsv,
    usableForShopify: quality.usableForShopify,
    blockedForExport: quality.blockedForExport,
    previewOk: quality.previewOk,
    warnings: quality.warnings,
    stageErrors: diagnostics.stageErrors,
    scrapeDiagnostics: diagnostics,
  };

  logScrapeDiagnostics(diagnostics);

  if (!quality.jobSuccess) {
    if (quality.previewOk) {
      return {
        result: {
          ...finalResult,
          success: false,
          partialSuccess: true,
        },
        diagnostics,
        success: false,
        partialSuccess: true,
      };
    }
    return {
      result: { ...finalResult, success: false, partialSuccess: false },
      diagnostics,
      success: false,
      partialSuccess: false,
    };
  }

  return {
    result: {
      ...finalResult,
      partialSuccess: quality.partialSuccess || !quality.hasImages,
    },
    diagnostics,
    success: true,
    partialSuccess: quality.partialSuccess,
  };
}

async function finalizeTrendyolPipelineWithVariants(
  url: string,
  result: any,
  diagnostics: ScrapeDiagnostics,
  pipelineStart: number,
  forcedGlobalTimeout: boolean,
  variantOpts?: { html?: string | null; rawProduct?: Record<string, unknown> | null },
): Promise<PipelineOutcome> {
  const { ensureTrendyolVariantsOnResult } = await import("./trendyol-result-normalizer");
  await ensureTrendyolVariantsOnResult(url, result, variantOpts);
  return finalizeOutcome(result, url, diagnostics, pipelineStart, forcedGlobalTimeout);
}

export async function runTrendyolScrapePipeline(
  url: string,
  selectedScrapeMode?: SelectedScrapeMode,
): Promise<PipelineOutcome> {
  const policy = getScrapeEnvironmentPolicy();
  const pipelineStart = Date.now();
  const globalDeadline = pipelineStart + policy.globalTimeoutMs;
  const modes = resolveEffectiveScrapeMode(selectedScrapeMode);
  const diagnostics = createDiagnostics(modes);
  const STAGE_TIMEOUT = stageTimeouts(policy);

  const isPastDeadline = () => Date.now() >= globalDeadline;
  const remainingMs = () => Math.max(500, globalDeadline - Date.now());

  logScrapeDiagnostics(diagnostics);

  let result: any = emptyResult(url);
  let apiProduct: Awaited<ReturnType<typeof fetchTrendyolProductByUrl>> = null;
  let directHtml: string | null = null;
  let forcedGlobalTimeout = false;
  let skipHeavyStages = false;

  const convertApiProduct = (api: NonNullable<typeof apiProduct>) => ({
    success: true,
    title: resolveProductTitle(url, api.title),
    brand: api.brand || brandFromTrendyolUrl(url) || "Marka",
    category: api.category || "Genel",
    description: api.description || "",
    price: api.price,
    images: filterValidProductImages(api.images),
    variants: api.variants,
    stockAnalysis: api.variants
      ? buildStockAnalysisFromVariants(api.variants) ?? undefined
      : undefined,
    features: [],
    tags: [],
    extractionMethod: "trendyol-api",
    scenario: "trendyol-api",
    confidence: 90,
    sourceUrl: url,
  });

  const applyHtmlProduct = (htmlProduct: NonNullable<Awaited<ReturnType<typeof import("./trendyol-html-extractor").parseTrendyolProductFromHtmlContent>>>) => {
    result.title = resolveProductTitle(url, htmlProduct.title || result.title);
    if (filterValidProductImages(result.images).length === 0 && htmlProduct.images.length > 0) {
      result.images = htmlProduct.images;
    }
    if (hasRealTrendyolVariants(htmlProduct.variants)) {
      result.variants = htmlProduct.variants;
    }
    if (htmlProduct.features?.length) {
      result.features = htmlProduct.features;
    }
    if (htmlProduct.stockAnalysis) {
      result.stockAnalysis = htmlProduct.stockAnalysis;
    }
    if ((!result.price?.original || result.price.original <= 0) && htmlProduct.price.original > 0) {
      result.price = htmlProduct.price;
    }
    if (htmlProduct.description && !result.description) {
      result.description = htmlProduct.description;
    }
  };

  // ── Cloud + Local Agent: API ve agent paralel (direct HTML atlanır) ──
  const skipInternalSourceAccess = process.env.LOCAL_SCRAPE_AGENT_MODE === "true";

  if (policy.preferLocalAgent && !skipInternalSourceAccess && !isPastDeadline()) {
    diagnostics.apiStarted = true;
    diagnostics.gatewayStarted = true;
    const parallelStart = Date.now();
    console.log("⚡ [1/6] Cloud+Agent: Trendyol API + Local Scrape Agent (paralel)...");

    const [apiSettled, agentSettled] = await Promise.allSettled([
      withStageTimeout(
        () => fetchTrendyolProductByUrl(url),
        Math.min(policy.apiTimeoutMs, remainingMs()),
        "api-timeout",
      ),
      withStageTimeout(
        async () => {
          const { callLocalScrapeAgent } = await import("./services/local-agent-client.service");
          return callLocalScrapeAgent(url);
        },
        Math.min(policy.sourceAccessTimeoutMs, remainingMs()),
        "direct-html-timeout",
      ),
    ]);

    diagnostics.apiDurationMs = Date.now() - parallelStart;

    if (apiSettled.status === "fulfilled") {
      apiProduct = apiSettled.value;
      if (apiProduct && (apiProduct.price.original > 0 || apiProduct.images.length > 0)) {
        result = convertApiProduct(apiProduct);
        diagnostics.apiSuccess = true;
        console.log(`✅ [1/6] Trendyol API (${diagnostics.apiDurationMs}ms)`);
      } else {
        diagnostics.apiSuccess = false;
        diagnostics.apiError = apiProduct ? "api-empty-payload" : "api-null-response";
      }
    } else {
      const err = apiSettled.reason;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "api-error";
      pushStageError(diagnostics, code);
      diagnostics.apiError = code;
    }

    if (agentSettled.status === "fulfilled" && agentSettled.value.agentSuccess) {
      const access = agentSettled.value;
      diagnostics.gatewayDurationMs = access.durationMs;
      diagnostics.localAgentSucceeded = true;
      applyAgentAccessToResult(result, url, access, diagnostics);
      console.log(
        `✅ Local Agent başarılı (${access.durationMs}ms): "${result.title}" — ${result.price?.original} TL, ${access.images.length} görsel`,
      );

      const fields = evaluateFields(result, url);
      if (isCompleteScrapeData(fields)) {
        return finalizeTrendyolPipelineWithVariants(
          url,
          result,
          diagnostics,
          pipelineStart,
          forcedGlobalTimeout,
          {
            html: access.html || directHtml,
            rawProduct: apiProduct?.rawProduct ?? null,
          },
        );
      }
    } else if (agentSettled.status === "fulfilled") {
      const access = agentSettled.value;
      diagnostics.gatewayDurationMs = access.durationMs;
      diagnostics.localAgentSucceeded = false;
      const errCode = (access.stageError ?? "local-agent-failed") as ScrapeStageErrorCode;
      diagnostics.gatewayError = errCode;
      pushStageError(diagnostics, errCode);
      const category = access.errorCategory ?? "unknown";
      console.warn(
        `⚠️ Local Agent başarısız [${category}]: ${access.error ?? errCode}`,
      );
    } else {
      diagnostics.localAgentSucceeded = false;
      pushStageError(diagnostics, "local-agent-failed");
      diagnostics.gatewayError = "local-agent-failed";
      console.warn("⚠️ Local Agent başarısız: istek tamamlanamadı");
    }

    diagnostics.directHtmlSkippedReason = "cloud-agent-mode";
  } else if (!isPastDeadline()) {
    diagnostics.apiStarted = true;
    diagnostics.directHtmlStarted = true;
    const apiStart = Date.now();
    console.log("⚡ [1-2/6] Trendyol API + Direct HTML (paralel)...");

    const htmlRetries = policy.directHtmlRetries;

    const [apiSettled, htmlSettled] = await Promise.allSettled([
      withStageTimeout(
        () => fetchTrendyolProductByUrl(url),
        Math.min(STAGE_TIMEOUT.api, remainingMs()),
        "api-timeout",
      ),
      (async () => {
        const { fetchTrendyolDirectHtmlRaw } = await import("./trendyol-direct-html");
        const directRaw = await withStageTimeout(
          () => fetchTrendyolDirectHtmlRaw(url, htmlRetries),
          Math.min(STAGE_TIMEOUT.directHtml, remainingMs()),
          "direct-html-timeout",
        );
        return directRaw?.html ?? null;
      })(),
    ]);

    diagnostics.apiDurationMs = Date.now() - apiStart;

    if (apiSettled.status === "fulfilled") {
      apiProduct = apiSettled.value;
      if (apiProduct && (apiProduct.price.original > 0 || apiProduct.images.length > 0)) {
        result = convertApiProduct(apiProduct);
        diagnostics.apiSuccess = true;
        console.log(
          `✅ [1/6] Trendyol API başarılı (${diagnostics.apiDurationMs}ms): "${apiProduct.title}" — ${apiProduct.price.original} TL`,
        );
      } else {
        diagnostics.apiSuccess = false;
        diagnostics.apiError = apiProduct ? "api-empty-payload" : "api-null-response";
        console.warn(
          `⚠️ [1/6] Trendyol API boş yanıt (${diagnostics.apiDurationMs}ms): apiSuccess=false, apiError=${diagnostics.apiError}`,
        );
      }
    } else {
      const err = apiSettled.reason;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "api-error";
      pushStageError(diagnostics, code);
      diagnostics.apiSuccess = false;
      diagnostics.apiError = code;
      console.warn(`⚠️ [1/6] API soft-fail (${code}, ${diagnostics.apiDurationMs}ms)`);
    }

    if (htmlSettled.status === "fulfilled") {
      directHtml = htmlSettled.value;
      diagnostics.directHtmlSuccess = Boolean(directHtml && directHtml.length > 5000);
      if (diagnostics.directHtmlSuccess) {
        console.log(`✅ [2/6] Direct HTML: ${directHtml!.length} bytes (${diagnostics.apiDurationMs}ms)`);
      } else {
        console.warn("⚠️ [2/6] Direct HTML: ürün verisi içeren HTML alınamadı");
      }
    } else {
      const err = htmlSettled.reason;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "direct-html-error";
      pushStageError(diagnostics, code);
      diagnostics.directHtmlError = code;
      console.warn(`⚠️ [2/6] Direct HTML soft-fail (${code})`);
    }
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 2b) Otomatik kaynak erişim (internal provider registry) ──
  const htmlReadyBeforeGateway = Boolean(directHtml && directHtml.length >= 500);

  if (
    !skipInternalSourceAccess &&
    !policy.preferLocalAgent &&
    !htmlReadyBeforeGateway &&
    !isPastDeadline() &&
    !forcedGlobalTimeout
  ) {
    diagnostics.gatewayStarted = true;
    const gwStart = Date.now();
    try {
      if (
        !diagnostics.directHtmlSuccess &&
        (diagnostics.directHtmlError === "direct-html-timeout" ||
          diagnostics.stageErrors.includes("direct-html-timeout"))
      ) {
        pushStageError(diagnostics, "source-access-direct-timeout");
      }

      const { tryInternalSourceAccess } = await import("./services/source-access-manager.service");
      const sourceAccessTimeout = policy.sourceAccessTimeoutMs;

      const access = await withStageTimeout(
        () => tryInternalSourceAccess(url),
        Math.min(sourceAccessTimeout, remainingMs()),
        "direct-html-timeout",
      );

      diagnostics.gatewayDurationMs = Date.now() - gwStart;
      diagnostics.gatewayProviderType = access.strategy;
      diagnostics.gatewayHtmlSuccess = access.htmlSuccess;
      diagnostics.gatewayImageSuccess = access.imageSuccess;

      if (access.html && access.html.length >= 500) {
        directHtml = access.html;
        diagnostics.directHtmlSuccess = true;
      }
      if (access.images.length > 0 && filterValidProductImages(result?.images || []).length === 0) {
        result.images = access.images;
      }
      if (access.title && (!result.title || result.title.length < 4)) {
        result.title = resolveProductTitle(url, access.title);
      }
      if (access.price && access.price > 0 && (!result.price?.original || result.price.original <= 0)) {
        result.price = { original: access.price, withProfit: access.price, currency: "TRY" };
      }
      if (access.variants && !hasRealTrendyolVariants(result?.variants)) {
        result.variants = access.variants;
      }
      if (access.finalSuccessReason) {
        result.finalSuccessReason = access.finalSuccessReason;
      }
      if (access.strategy === "local_agent" && (access.htmlSuccess || access.imageSuccess)) {
        diagnostics.gatewayHtmlSuccess = true;
        result._fromLocalAgent = true;
        result._sourceAccessStrategy = "local_agent";
      }

      if (!access.htmlSuccess && !access.imageSuccess) {
        const errCode = (access.stageError ||
          access.reason ||
          "source-access-provider-failed") as ScrapeStageErrorCode;
        diagnostics.gatewaySkippedReason = errCode;
        diagnostics.gatewayError = errCode;
        pushStageError(diagnostics, errCode);
        if (isCloudRuntime()) skipHeavyStages = true;
        console.warn(`⚠️ [SA] Kaynak erişim başarısız: ${access.error ?? errCode}`);
      } else {
        console.log(
          `✅ [SA] Kaynak erişim (${access.strategy}, ${diagnostics.gatewayDurationMs}ms): html=${access.htmlSuccess}, images=${access.images.length}`,
        );
      }
    } catch (err) {
      diagnostics.gatewayDurationMs = Date.now() - gwStart;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError
          ? "source-access-direct-timeout"
          : "source-access-provider-failed";
      diagnostics.gatewayError = code;
      diagnostics.gatewaySkippedReason = code;
      pushStageError(diagnostics, code);
      if (isCloudRuntime()) skipHeavyStages = true;
      console.warn(`⚠️ [SA] Kaynak erişim soft-fail (${code})`);
    }
  }

  // ── 3) HTML parse — yalnızca mevcut HTML, ağ yok ──
  if (!isPastDeadline() && !forcedGlobalTimeout) {
    const htmlReady = Boolean(directHtml && directHtml.length >= 500);
    if (!htmlReady) {
      diagnostics.htmlParseSkippedReason = directHtml
        ? "html-too-short"
        : diagnostics.directHtmlError
          ? "direct-html-unavailable"
          : "no-html-available";
      console.log(`⚡ [3/6] HTML parse skipped: ${diagnostics.htmlParseSkippedReason}`);
    } else {
      diagnostics.htmlParseStarted = true;
      const parseStart = Date.now();
      console.log("⚡ [3/6] HTML/JSON-LD parse (local only)...");
      try {
        const { parseTrendyolProductFromHtmlContent } = await import("./trendyol-html-extractor");
        const htmlProduct = await withStageTimeout(
          async () =>
            parseTrendyolProductFromHtmlContent(directHtml!, url, "direct-html"),
          Math.min(STAGE_TIMEOUT.htmlParse, remainingMs()),
          "html-parse-timeout",
        );
        diagnostics.htmlParseDurationMs = Date.now() - parseStart;
        if (htmlProduct) {
          applyHtmlProduct(htmlProduct);
          diagnostics.htmlParseSuccess = true;
          console.log(
            `✅ [3/6] HTML parse (${htmlProduct.htmlSource}): ${htmlProduct.images.length} görsel, fiyat=${htmlProduct.price.original} (${diagnostics.htmlParseDurationMs}ms)`,
          );
        } else {
          diagnostics.htmlParseError = "html-parse-empty";
          console.warn("⚠️ [3/6] HTML parse: veri çıkarılamadı");
        }
      } catch (err) {
        diagnostics.htmlParseDurationMs = Date.now() - parseStart;
        const code: ScrapeStageErrorCode =
          err instanceof ScrapeStageTimeoutError ? err.code : "html-parse-error";
        pushStageError(diagnostics, code);
        diagnostics.htmlParseError = code;
        console.warn(`⚠️ [3/6] HTML parse soft-fail (${code})`);
      }
    }
  } else if (forcedGlobalTimeout) {
    diagnostics.htmlParseSkippedReason = "global-deadline";
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 4) fetchTrendyolProductImages ──
  const hasImagesBeforeFetch = filterValidProductImages(result?.images || []).length > 0;
  if (!skipHeavyStages && !hasImagesBeforeFetch && !isPastDeadline() && !forcedGlobalTimeout) {
    diagnostics.imageFetcherStarted = true;
    console.log("⚡ [4/6] fetchTrendyolProductImages...");
    try {
      const { fetchTrendyolProductImages } = await import("./trendyol-image-fetcher");
      const directImages = await withStageTimeout(
        () => fetchTrendyolProductImages(url),
        Math.min(STAGE_TIMEOUT.imageFetcher, remainingMs()),
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
      pushStageError(diagnostics, code);
      diagnostics.imageFetcherError = code;
      console.warn(`⚠️ [4/6] Image fetch soft-fail (${code})`);
    }
  } else if (hasImagesBeforeFetch) {
    console.log("⚡ [4/6] Görseller mevcut — image fetch atlandı");
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 5) Alternatif görsel fallback ──
  const stillNoImages = filterValidProductImages(result?.images || []).length === 0;
  if (!skipHeavyStages && stillNoImages && !isPastDeadline() && !forcedGlobalTimeout) {
    diagnostics.imageFallbackStarted = true;
    console.log("⚡ [5/6] Alternatif görsel fallback...");
    try {
      await withStageTimeout(
        async () => {
          const { fetchTrendyolImagesFromApi } = await import("./trendyol-product-api");
          const apiImages = await fetchTrendyolImagesFromApi(url);
          if (apiImages.length > 0) {
            result.images = apiImages;
            diagnostics.imageFallbackSuccess = true;
            console.log(`✅ [5/6] API deep scan: ${apiImages.length} görsel`);
            return;
          }
          const { scrapeTrendyolHttpFallback } = await import("./http-scraper-fallback");
          const http = await scrapeTrendyolHttpFallback(url);
          if (http.success && http.product?.images?.length) {
            result.images = http.product.images;
            diagnostics.imageFallbackSuccess = true;
            console.log(`✅ [5/6] HTTP fallback görsel: ${http.product.images.length} adet`);
          }
        },
        Math.min(STAGE_TIMEOUT.imageFallback, remainingMs()),
        "image-fallback-timeout",
      );
    } catch (err) {
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "image-fallback-error";
      pushStageError(diagnostics, code);
      diagnostics.imageFallbackError = code;
      console.warn(`⚠️ [5/6] Image fallback soft-fail (${code})`);
    }
  } else if (!stillNoImages) {
    console.log("⚡ [5/6] Görsel fallback atlandı");
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 6) Scenario — yalnızca eksik veri + Puppeteer izinliyse ──
  const fieldsBeforeScenario = evaluateFields(result, url);
  const missingVariantOrFeatureData =
    !hasRealTrendyolVariants(result?.variants) ||
    !(Array.isArray(result?.features) && result.features.length > 0);
  const coreDataFromHtml =
    diagnostics.htmlParseSuccess &&
    fieldsBeforeScenario.hasTitle &&
    fieldsBeforeScenario.hasPrice &&
    fieldsBeforeScenario.hasImages &&
    !missingVariantOrFeatureData;

  const scenarioNeeded =
    !skipHeavyStages &&
    !coreDataFromHtml &&
    !forcedGlobalTimeout &&
    !isPastDeadline() &&
    (!hasMinimumScrapeData(fieldsBeforeScenario) ||
      !isCompleteScrapeData(fieldsBeforeScenario));

  if (!scenarioNeeded) {
    diagnostics.scenarioSkippedReason = coreDataFromHtml
      ? "html-parse-complete"
      : forcedGlobalTimeout
        ? "global-timeout"
        : "sufficient-data";
  } else if (!puppeteerAllowed()) {
    diagnostics.scenarioSkippedReason = "puppeteer-disabled-in-cloud";
    pushStageError(diagnostics, "puppeteer-disabled-in-cloud");
    console.info("ℹ️ [6/6] Scenario atlandı (cloud): puppeteer-disabled-in-cloud");
  } else if (
    modes.effective === "auto-fast" &&
    hasMinimumScrapeData(fieldsBeforeScenario) &&
    hasRealTrendyolVariants(result?.variants)
  ) {
    diagnostics.scenarioSkippedReason = "auto-fast-core-data-present";
  } else if (!isPastDeadline() && !forcedGlobalTimeout) {
    console.log("⚡ [6/6] Scenario scrape (eksik veri)...");
    try {
      const scrapeResult = await withStageTimeout(
        () => scenarioBasedScrape(url, { allowPuppeteer: true }),
        Math.min(STAGE_TIMEOUT.scenario, remainingMs()),
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
      } else {
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
      if (apiProduct && !hasMinimumScrapeData(fieldsBeforeScenario)) {
        result = convertApiProduct(apiProduct);
      }
    }
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  return finalizeTrendyolPipelineWithVariants(
    url,
    result,
    diagnostics,
    pipelineStart,
    forcedGlobalTimeout,
    {
      html: directHtml,
      rawProduct: apiProduct?.rawProduct ?? null,
    },
  );
}
