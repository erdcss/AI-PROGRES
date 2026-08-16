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
import { evaluateScrapeQuality, assessTrendyolVariantGaps } from "./scrape-quality";
import { hasRealTrendyolVariants } from "@shared/trendyol-variant-utils";
import { buildStockAnalysisFromVariants } from "./trendyol-html-enrichment";
import { fetchTrendyolProductByUrl, consumeLastTrendyolApiBlockSignal } from "./trendyol-product-api";
import {
  brandFromTrendyolUrl,
  isValidTrendyolProductTitle,
} from "./trendyol-title-utils";
import { filterValidProductImages } from "./trendyol-image-utils";
import { mergeApiWithScrape, resolveProductTitle } from "./trendyol-result-normalizer";
import { scenarioBasedScrape } from "./scenario-based-scraper";
import { getScrapeEnvironmentPolicy } from "./services/scrape-environment.service";
import { resolveChromiumPath } from "./puppeteer-config";
import {
  classifyTrendyolBlock,
  formatCircuitOpenUserMessage,
  getTrendyolBlockStatus,
  isTrendyolCircuitOpen,
  mapBlockSignalToStageError,
  recordTrendyolBlock,
  recordTrendyolSuccess,
  shouldSkipDirectHtmlAfterBlock,
  waitTrendyolBlockBackoff,
  type BlockSignal,
} from "./trendyol-block-guard";
import { consumeLastDirectHtmlBlockSignal } from "./trendyol-direct-html";

function stageTimeouts(policy = getScrapeEnvironmentPolicy()) {
  return {
    api: policy.apiTimeoutMs,
    directHtml: policy.directHtmlTimeoutMs,
    htmlParse: 4_000,
    imageFetcher: policy.imageFetcherTimeoutMs,
    imageFallback: policy.imageFallbackTimeoutMs,
    scenario: policy.isCloud ? 0 : policy.scenarioTimeoutMs,
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

function applyBrowserWorkerToResult(
  result: any,
  url: string,
  access: {
    html: string | null;
    rawProductJson: Record<string, unknown> | null;
    durationMs: number;
    colorSiblingCandidates?: unknown[];
    colorFamilyMembers?: unknown[];
  },
  diagnostics: ScrapeDiagnostics,
) {
  result._fromBrowserWorker = true;
  result._sourceAccessStrategy = "browser_worker";
  diagnostics.gatewayHtmlSuccess = Boolean(access.html && access.html.length >= 500);
  diagnostics.gatewayImageSuccess = diagnostics.gatewayImageSuccess ?? false;
  diagnostics.gatewayProviderType = "browser_worker";
  diagnostics.gatewayDurationMs = access.durationMs;
  diagnostics.browserWorkerSucceeded = true;
  if (access.rawProductJson) {
    result._browserWorkerRawProduct = access.rawProductJson;
  }
  if (Array.isArray(access.colorSiblingCandidates)) {
    result._colorSiblingCandidates = access.colorSiblingCandidates;
  }
  if (Array.isArray(access.colorFamilyMembers)) {
    result._colorFamilyMembers = access.colorFamilyMembers;
  }
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

function notePipelineBlock(
  diagnostics: ScrapeDiagnostics,
  signal: BlockSignal | null,
): void {
  if (!signal) return;
  const code = mapBlockSignalToStageError(signal);
  pushStageError(diagnostics, code);
  recordTrendyolBlock(signal);
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

  if (diagnostics.imageFetcherSkippedReason === "local-puppeteer-preferred") {
    const recovered: string[] = [];
    for (const code of ["image-proxy-timeout", "image-proxy-error", "image-fallback-timeout", "image-fallback-error", "direct-html-timeout"]) {
      if (diagnostics.stageErrors.includes(code as never)) {
        recovered.push(code);
      }
    }
    if (recovered.length) {
      diagnostics.recoveredStageErrors = recovered;
      diagnostics.stageErrors = diagnostics.stageErrors.filter((c) => !recovered.includes(c));
    }
  }

  const hasCoreData =
    filterValidProductImages(result?.images || []).length > 0 &&
    (result?.price?.original > 0 || result?.title);
  if (hasCoreData) {
    const recovered: string[] = [...(diagnostics.recoveredStageErrors || [])];
    for (const code of diagnostics.stageErrors) {
      if (
        code === "image-proxy-timeout" ||
        code === "image-fallback-timeout" ||
        code === "direct-html-timeout"
      ) {
        recovered.push(code);
      }
    }
    if (recovered.length) {
      diagnostics.recoveredStageErrors = [...new Set(recovered)];
      diagnostics.stageErrors = diagnostics.stageErrors.filter((c) => !recovered.includes(c));
    }
  }

  result.recoveredStageErrors = diagnostics.recoveredStageErrors;

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
    preferBrowserWorker: policy.preferBrowserWorker,
    localAgentSucceeded: diagnostics.localAgentSucceeded,
    browserWorkerSucceeded: diagnostics.browserWorkerSucceeded,
    htmlUnavailable:
      !diagnostics.htmlParseSuccess &&
      !diagnostics.gatewayHtmlSuccess &&
      !diagnostics.directHtmlSuccess,
  });

  diagnostics.finalSuccessReason = quality.finalSuccessReason;
  diagnostics.partialSuccess = quality.partialSuccess;

  if (quality.jobSuccess) {
    recordTrendyolSuccess();
  }

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
    console.warn("[scrape-quality] rejected", {
      hasTitle: quality.hasRealTitle,
      hasValidPrice: quality.hasValidPrice,
      hasImages: quality.hasImages,
      imageCount: filterValidProductImages(result.images).length,
      variantCount: Array.isArray((result as any).variants?.sizes)
        ? (result as any).variants.sizes.length
        : Array.isArray((result as any).variants)
          ? (result as any).variants.length
          : 0,
      finalSuccessReason: quality.finalSuccessReason,
      stageErrors: diagnostics.stageErrors,
      rejectionCodes: [
        !quality.hasValidPrice ? "missing-price" : null,
        !quality.hasImages ? "missing-images" : null,
        !quality.hasRealTitle ? "missing-or-slug-title" : null,
        quality.finalSuccessReason,
      ].filter(Boolean),
    });
    console.error(
      "❌ Scrape pipeline provider özeti:",
      JSON.stringify({
        stageErrors: diagnostics.stageErrors,
        apiError: diagnostics.apiError,
        directHtmlError: diagnostics.directHtmlError,
        gatewayError: diagnostics.gatewayError,
        gatewayProviderType: diagnostics.gatewayProviderType,
        imageFetcherError: diagnostics.imageFetcherError,
        imageFallbackError: diagnostics.imageFallbackError,
        scenarioSkippedReason: diagnostics.scenarioSkippedReason,
        finalSuccessReason: quality.finalSuccessReason,
        pipelineDurationMs: diagnostics.pipelineDurationMs,
      }),
    );
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
  variantOpts?: {
    html?: string | null;
    rawProduct?: Record<string, unknown> | null;
    scrapeMode?: SelectedScrapeMode;
  },
): Promise<PipelineOutcome> {
  const { applyFullVariantScrapeToResult } = await import("./trendyol-variant-probe");
  const policy = getScrapeEnvironmentPolicy();
  const autoFast = (variantOpts?.scrapeMode || "auto-fast") === "auto-fast";

  await applyFullVariantScrapeToResult(url, result, {
    html: variantOpts?.html ?? result.htmlContent ?? null,
    mode: String(result.scrapeMode ?? "auto-fast"),
    browserWorkerEnabled: policy.browserWorkerConfigured && policy.browserWorkerHealthy,
  });

  const { ensureTrendyolVariantsOnResult } = await import("./trendyol-result-normalizer");
  await ensureTrendyolVariantsOnResult(url, result, variantOpts);

  // Renk ailesi: Browser Worker üyeleri veya adaylardan merge (≥2 productId)
  try {
    const {
      mergeColorFamilyIntoScrapeResult,
      normalizeColorSiblingUrl,
      buildColorFamilyStatus,
    } = await import("./trendyol-color-family");
    const rootId =
      normalizeColorSiblingUrl(url)?.productId ||
      String(result.sourceProductId || "").replace(/\D/g, "");
    let members = Array.isArray(result._colorFamilyMembers)
      ? result._colorFamilyMembers
      : [];
    let candidates = Array.isArray(result._colorSiblingCandidates)
      ? result._colorSiblingCandidates
      : [];

    // BW adayları productId/görsel içerip renk adını içermeyebilir. Bu nedenle
    // aday sayısı yeterli olsa bile HTML ve product state ile her zaman zenginleştir.
    const {
      extractColorSiblingCandidatesFromHtml,
      extractColorSiblingCandidatesFromProduct,
      mergeColorSiblingCandidates,
      finalizeColorSiblingCandidateList,
    } = await import("./trendyol-color-family");
    const fromHtml = variantOpts?.html
      ? extractColorSiblingCandidatesFromHtml(variantOpts.html)
      : [];
    let rawProduct =
      variantOpts?.rawProduct ??
      (result._browserWorkerRawProduct as Record<string, unknown> | undefined) ??
      null;
    if (!rawProduct && variantOpts?.html) {
      try {
        const { getTrendyolProductFromHtml } = await import("./trendyol-product-state");
        rawProduct = getTrendyolProductFromHtml(variantOpts.html);
      } catch {
        rawProduct = null;
      }
    }
    const fromProduct = extractColorSiblingCandidatesFromProduct(rawProduct, url);
    candidates = finalizeColorSiblingCandidateList(
      mergeColorSiblingCandidates(candidates, fromHtml, fromProduct),
      url,
    );
    result._colorSiblingCandidates = candidates;
    console.log(
      `[ColorFamily] candidates enriched=${candidates.length} named=${candidates.filter((c) => Boolean(c.color)).length}`,
    );

    if (rootId && candidates.length >= 2 && members.length < 2) {
      // Hız: adaylarda renk+görsel varsa soft birleştir — API/HTML kardeş çekimi ~30-60s yiyordu
      const {
        buildSoftColorFamilyMembersFromCandidates,
        extractImagesByColorFromProduct,
        mergeImagesByColorMaps,
      } = await import("./trendyol-color-family");
      const rootColor =
        (Array.isArray(result.variants?.colors) && result.variants.colors[0]) ||
        (typeof result.color === "string" ? result.color : "") ||
        "";
      const soft = buildSoftColorFamilyMembersFromCandidates({
        candidates,
        rootProductId: rootId,
        rootColor,
        rootImages: Array.isArray(result.images) ? (result.images as string[]) : [],
        rootVariants: result.variants as
          | import("@shared/trendyol-variant-utils").SanitizedVariants
          | null
          | undefined,
      });
      const okSoft = soft.filter((m) => m.ok);
      const softDistinctColors = new Set(
        okSoft.map((m) => (m.color || "").trim().toLowerCase()).filter(Boolean),
      ).size;

      if (okSoft.length >= 2 && softDistinctColors >= 1) {
        members = soft;
        result._colorFamilyMembers = soft;
        console.log(
          `[ColorFamily] soft-first members=${okSoft.length}/${soft.length} colors=${[
            ...new Set(okSoft.map((m) => m.color)),
          ].join(",")}`,
        );
      } else if (!autoFast) {
        const { fetchColorFamilyMembersViaApi } = await import("./trendyol-color-family");
        const apiMembers = await fetchColorFamilyMembersViaApi(candidates, rootId);
        const okApi = apiMembers.filter((m) => m.ok);
        if (okApi.length >= 2) {
          members = apiMembers;
          result._colorFamilyMembers = apiMembers;
          console.log(
            `[ColorFamily] API fallback members=${okApi.length}/${apiMembers.length}`,
          );
        } else if (okSoft.length >= 2) {
          members = soft;
          result._colorFamilyMembers = soft;
          console.log(
            `[ColorFamily] soft-candidate members=${okSoft.length}/${soft.length} colors=${okSoft
              .map((m) => m.color)
              .join(",")}`,
          );
        }
      }

      const rawProduct =
        variantOpts?.rawProduct ??
        (result._browserWorkerRawProduct as Record<string, unknown> | undefined) ??
        null;
      const fromProduct = extractImagesByColorFromProduct(rawProduct);
      const fromCandidates: Record<string, string[]> = {};
      for (const c of candidates) {
        if (!c.color) continue;
        const imgs = c.images?.length ? c.images : c.image ? [c.image] : [];
        if (!imgs.length) continue;
        fromCandidates[c.color] = imgs;
      }
      const mergedMap = mergeImagesByColorMaps(
        result.imagesByColor as Record<string, string[]> | undefined,
        fromProduct,
        fromCandidates,
      );
      if (Object.keys(mergedMap).length) {
        result.imagesByColor = mergedMap;
      }
    }

    if (rootId && members.length >= 2) {
      mergeColorFamilyIntoScrapeResult({
        result,
        rootUrl: url,
        rootProductId: rootId,
        rootHtml: variantOpts?.html ?? undefined,
        rootRawProduct:
          variantOpts?.rawProduct ??
          (result._browserWorkerRawProduct as Record<string, unknown> | undefined) ??
          null,
        members,
        candidates,
      });
    } else {
      // Color family uygulanmadı — yine de colorImages / aday görsellerini renge bağla
      try {
        const {
          extractImagesByColorFromProduct,
          mergeImagesByColorMaps,
          attachVariantImagesFromColorMap,
        } = await import("./trendyol-color-family");
        const rawProduct =
          variantOpts?.rawProduct ??
          (result._browserWorkerRawProduct as Record<string, unknown> | undefined) ??
          null;
        const fromProduct = extractImagesByColorFromProduct(rawProduct);
        const fromCandidates: Record<string, string[]> = {};
        for (const c of candidates) {
          if (!c.color) continue;
          const imgs = c.images?.length ? c.images : c.image ? [c.image] : [];
          if (!imgs.length) continue;
          fromCandidates[c.color] = imgs;
        }
        const mergedMap = mergeImagesByColorMaps(
          result.imagesByColor as Record<string, string[]> | undefined,
          fromProduct,
          fromCandidates,
        );
        if (Object.keys(mergedMap).length) {
          result.imagesByColor = mergedMap;
          // Tek renk varyant + çok renk görsel → görselleri mevcut renge bağla veya yabancıları at
          attachVariantImagesFromColorMap(result, mergedMap);
        }
      } catch {
        /* soft */
      }

      if (!result.colorFamilyStatus) {
        // Aynı sayfada çok renk olabilir; kardeş productId yoksa not_applicable
        const variantColors = Array.isArray(result.variants?.colors)
          ? result.variants.colors
          : [];
        result.colorFamilyStatus = buildColorFamilyStatus({
          attempted: Boolean(candidates.length || members.length),
          rootProductId: rootId || undefined,
          candidates,
          members,
          colors: variantColors,
        });
        // Çok renkli ama kardeş URL yok → mesajı netleştir
        if (
          result.colorFamilyStatus.state === "not_applicable" &&
          variantColors.length >= 2
        ) {
          result.colorFamilyStatus = {
            ...result.colorFamilyStatus,
            colorCount: variantColors.length,
            colors: variantColors,
            message:
              "Aynı ürün sayfasında birden fazla renk var; bağlantılı ayrı productId bulunmadı.",
          };
        }
      }
    }
  } catch (err) {
    console.warn(
      `[ColorFamily] merge soft-fail: ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      const { buildColorFamilyStatus } = await import("./trendyol-color-family");
      if (!result.colorFamilyStatus) {
        result.colorFamilyStatus = buildColorFamilyStatus({
          attempted: true,
          candidates: Array.isArray(result._colorSiblingCandidates)
            ? result._colorSiblingCandidates
            : [],
          members: Array.isArray(result._colorFamilyMembers)
            ? result._colorFamilyMembers
            : [],
          mergeError: err instanceof Error ? err.message : String(err),
        });
      }
    } catch {
      // ignore nested
    }
  }

  // Renk/slicer → mediaGroupKey / featuredImage (varyant sırası ≠ görsel sırası)
  try {
    const { applyTrendyolVariantMediaToScrapeResult } = await import(
      "./trendyol-variant-media-resolver"
    );
    const html =
      typeof variantOpts?.html === "string" ? variantOpts.html : null;
    const resolution = applyTrendyolVariantMediaToScrapeResult(result, { html });
    if (resolution?.variantMediaGroups?.length) {
      console.log(
        `[VariantMedia] driving=${resolution.mediaDrivingOption || "null"} groups=${resolution.variantMediaGroups.length} contentId=${resolution.productContentId ?? "-"}`,
      );
      for (const g of resolution.variantMediaGroups) {
        console.log(
          `[VariantMedia] ${g.key} value=${g.optionValue} images=${g.images.length} featured=${g.featuredImage ? "yes" : "no"}`,
        );
      }
    }
  } catch (err) {
    console.warn(
      `[VariantMedia] soft-fail: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return finalizeOutcome(result, url, diagnostics, pipelineStart, forcedGlobalTimeout);
}

export async function runTrendyolScrapePipeline(
  url: string,
  selectedScrapeMode?: SelectedScrapeMode,
): Promise<PipelineOutcome> {
  const modes = resolveEffectiveScrapeMode(selectedScrapeMode);
  const diagnostics = createDiagnostics(modes);
  const pipelineStart = Date.now();

  if (isTrendyolCircuitOpen()) {
    const status = getTrendyolBlockStatus();
    pushStageError(diagnostics, "trendyol-circuit-open");
    diagnostics.apiError = "trendyol-circuit-open";
    diagnostics.scenarioSkippedReason = "trendyol-circuit-open";
    diagnostics.pipelineDurationMs = 0;
    const message = formatCircuitOpenUserMessage(status);
    logScrapeDiagnostics(diagnostics);
    console.warn("[TRENDYOL_BLOCK] scrape rejected — circuit open", status);
    const result = {
      ...emptyResult(url),
      success: false,
      partialSuccess: false,
      previewOk: false,
      usableForCsv: false,
      usableForShopify: false,
      blockedForExport: true,
      stageErrors: diagnostics.stageErrors,
      scrapeDiagnostics: diagnostics,
      deployUserMessage: message,
      message,
      error: message,
    };
    return {
      result,
      diagnostics,
      success: false,
      partialSuccess: false,
    };
  }

  const policy = getScrapeEnvironmentPolicy();
  const globalDeadline = pipelineStart + policy.globalTimeoutMs;
  const STAGE_TIMEOUT = stageTimeouts(policy);

  const isPastDeadline = () => Date.now() >= globalDeadline;
  const remainingMs = () => Math.max(500, globalDeadline - Date.now());

  logScrapeDiagnostics(diagnostics);

  let result: any = emptyResult(url);
  let apiProduct: Awaited<ReturnType<typeof fetchTrendyolProductByUrl>> = null;
  let directHtml: string | null = null;
  let forcedGlobalTimeout = false;
  let skipHeavyStages = false;
  let confirmedBlock: BlockSignal | null = null;

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

  // ── Cloud: sıralı provider zinciri (BW → API → HTML → Local Agent fallback) ──
  const skipInternalSourceAccess = process.env.LOCAL_SCRAPE_AGENT_MODE === "true";

  if (policy.isCloud && !skipInternalSourceAccess && !isPastDeadline()) {
    const providers = policy.selectedProviders;
    console.log(`⚡ [cloud] Provider zinciri: ${providers.join(" → ")}`);

    if (providers.includes("browser_worker") && policy.preferBrowserWorker) {
      diagnostics.gatewayStarted = true;
      const correlationId = `scrape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      // Trendyol sayfası (auto-fast): ana ürün yeter; renk ailesi kardeş crawl canlıda 45–90s ekliyor.
      const includeColorFamily =
        modes.effective !== "auto-fast" && remainingMs() >= 70_000;
      const bwBudgetMs = Math.min(
        includeColorFamily
          ? Math.max(policy.browserWorkerTimeoutMs, 100_000)
          : Math.max(35_000, Math.min(policy.browserWorkerTimeoutMs || 45_000, 55_000)),
        remainingMs(),
      );
      console.log("⚡ [1] Browser Worker (primary)...", {
        correlationId,
        includeColorFamily,
        bwBudgetMs,
        remainingMs: remainingMs(),
      });
      try {
        const {
          scrapeTrendyolWithBrowserWorker,
        } = await import("./services/browser-worker-client.service");
        const bw = await withStageTimeout(
          () =>
            scrapeTrendyolWithBrowserWorker(url, {
              includeColorFamily,
              includeSiblingHtml: false,
              correlationId,
              clientTimeoutMs: Math.max(5_000, bwBudgetMs - 1_000),
            }),
          bwBudgetMs,
          "browser-worker-timeout",
        );

        const usableHtml = Boolean(bw.html && bw.html.length >= 500);
        const usableRaw = Boolean(
          bw.rawProductJson && Object.keys(bw.rawProductJson).length > 0,
        );

        if (bw.success && (usableHtml || usableRaw)) {
          if (usableHtml) {
            directHtml = bw.html;
            diagnostics.directHtmlSuccess = true;
          }
          applyBrowserWorkerToResult(result, url, bw, diagnostics);
          if (bw.rawProductJson) {
            apiProduct = apiProduct
              ? { ...apiProduct, rawProduct: bw.rawProductJson }
              : ({ rawProduct: bw.rawProductJson } as typeof apiProduct);
          }
          // BW HTML'i hemen parse et — aksi halde needsCoreData yanlışlıkla API'yi atlıyordu
          // ve parse başarısız olunca "Kaynak veri doğrulanamadı" oluşuyordu.
          if (directHtml && directHtml.length >= 500 && !isCompleteScrapeData(evaluateFields(result, url))) {
            try {
              const { parseTrendyolProductFromHtmlContent } = await import(
                "./trendyol-html-extractor"
              );
              const htmlProduct = await withStageTimeout(
                () =>
                  parseTrendyolProductFromHtmlContent(
                    directHtml!,
                    url,
                    "browser-worker",
                  ),
                Math.min(STAGE_TIMEOUT.htmlParse, remainingMs()),
                "html-parse-timeout",
              );
              if (htmlProduct) {
                applyHtmlProduct(htmlProduct);
                diagnostics.htmlParseSuccess = true;
                diagnostics.htmlParseStarted = true;
              }
            } catch (err) {
              console.warn(
                "⚠️ BW HTML erken parse soft-fail:",
                err instanceof Error ? err.message : err,
              );
            }
          }
          console.log(
            `✅ Browser Worker (${bw.durationMs}ms): HTML ${bw.html?.length ?? 0} bytes raw=${usableRaw} colorFamily=${bw.colorFamilyMembers?.length ?? 0} fields=${JSON.stringify(evaluateFields(result, url))}`,
            { correlationId },
          );
        } else {
          diagnostics.browserWorkerSucceeded = false;
          const errCode = (bw.stageError ?? "browser-worker-failed") as ScrapeStageErrorCode;
          diagnostics.gatewayError = errCode;
          pushStageError(diagnostics, errCode);
          const bwBlock = classifyTrendyolBlock({
            source: "browser_worker",
            httpStatus: bw.status,
            html: bw.html,
            contentClass: undefined,
            errorCategory: bw.errorCategory,
            errorMessage: bw.error,
          });
          if (bwBlock || errCode === "browser-worker-blocked") {
            const signal =
              bwBlock ||
              ({
                kind: "bot-challenge" as const,
                source: "browser_worker" as const,
                detail: bw.error,
              } satisfies BlockSignal);
            confirmedBlock = signal;
            notePipelineBlock(diagnostics, signal);
            await waitTrendyolBlockBackoff();
          }
          console.warn(
            `⚠️ Browser Worker [${bw.errorCategory ?? "unknown"}]: ${bw.error ?? errCode}`,
            { correlationId },
          );
        }
      } catch (err) {
        diagnostics.browserWorkerSucceeded = false;
        const code: ScrapeStageErrorCode =
          err instanceof ScrapeStageTimeoutError
            ? "browser-worker-timeout"
            : "browser-worker-failed";
        pushStageError(diagnostics, code);
        diagnostics.gatewayError = code;
        console.warn(`⚠️ Browser Worker soft-fail (${code})`, { correlationId });
      }
    }

    // Yalnızca gerçekten title+price+images doluysa API/HTML'i atla.
    // Ham BW HTML/raw var diye atlamak canlıda extraction-failed üretiyordu.
    const needsCoreData = () => !isCompleteScrapeData(evaluateFields(result, url));

    if (needsCoreData() && !isPastDeadline()) {
      diagnostics.apiStarted = true;
      const apiStart = Date.now();
      console.log("⚡ [2] Trendyol API...");
      try {
        apiProduct = await withStageTimeout(
          () => fetchTrendyolProductByUrl(url),
          Math.min(policy.apiTimeoutMs, remainingMs()),
          "api-timeout",
        );
        diagnostics.apiDurationMs = Date.now() - apiStart;
        if (apiProduct && (apiProduct.price.original > 0 || apiProduct.images.length > 0)) {
          result = convertApiProduct(apiProduct);
          diagnostics.apiSuccess = true;
          console.log(`✅ Trendyol API (${diagnostics.apiDurationMs}ms)`);
        } else {
          diagnostics.apiSuccess = false;
          diagnostics.apiError = apiProduct ? "api-empty-payload" : "api-null-response";
          console.warn(`⚠️ Trendyol API boş: ${diagnostics.apiError}`);
          const apiBlock = consumeLastTrendyolApiBlockSignal();
          if (apiBlock) {
            confirmedBlock = apiBlock;
            notePipelineBlock(diagnostics, apiBlock);
          }
        }
      } catch (err) {
        diagnostics.apiDurationMs = Date.now() - apiStart;
        const code: ScrapeStageErrorCode =
          err instanceof ScrapeStageTimeoutError ? err.code : "api-error";
        pushStageError(diagnostics, code);
        diagnostics.apiError = code;
        diagnostics.apiSuccess = false;
        const apiBlock = consumeLastTrendyolApiBlockSignal();
        if (apiBlock) {
          confirmedBlock = apiBlock;
          notePipelineBlock(diagnostics, apiBlock);
        }
      }
    }

    if (
      needsCoreData() &&
      !directHtml &&
      !isPastDeadline() &&
      !shouldSkipDirectHtmlAfterBlock(confirmedBlock)
    ) {
      diagnostics.directHtmlStarted = true;
      console.log("⚡ [3] Direct HTML...");
      try {
        const { fetchTrendyolDirectHtmlRaw } = await import("./trendyol-direct-html");
        const directRaw = await withStageTimeout(
          () => fetchTrendyolDirectHtmlRaw(url, policy.directHtmlRetries),
          Math.min(policy.directHtmlTimeoutMs, remainingMs()),
          "direct-html-timeout",
        );
        directHtml = directRaw?.html ?? null;
        diagnostics.directHtmlSuccess = Boolean(directHtml && directHtml.length > 5000);
        if (diagnostics.directHtmlSuccess) {
          console.log(`✅ Direct HTML: ${directHtml!.length} bytes`);
        } else {
          pushStageError(diagnostics, "direct-html-error");
          diagnostics.directHtmlError = "direct-html-error";
          const htmlBlock = consumeLastDirectHtmlBlockSignal();
          if (htmlBlock) {
            confirmedBlock = htmlBlock;
            notePipelineBlock(diagnostics, htmlBlock);
          }
        }
      } catch (err) {
        const code: ScrapeStageErrorCode =
          err instanceof ScrapeStageTimeoutError ? err.code : "direct-html-error";
        pushStageError(diagnostics, code);
        diagnostics.directHtmlError = code;
        console.warn(`⚠️ Direct HTML soft-fail (${code})`);
        const htmlBlock = consumeLastDirectHtmlBlockSignal();
        if (htmlBlock) {
          confirmedBlock = htmlBlock;
          notePipelineBlock(diagnostics, htmlBlock);
        }
      }
    } else if (shouldSkipDirectHtmlAfterBlock(confirmedBlock)) {
      diagnostics.directHtmlSkippedReason = "trendyol-block-skip-html";
      console.warn("⚡ [3] Direct HTML atlandı (confirmed WAF/ban — hammer yok)");
    }

    if (
      needsCoreData() &&
      policy.localAgentHealthy &&
      providers.includes("local_agent") &&
      !isPastDeadline()
    ) {
      diagnostics.gatewayStarted = true;
      console.log("⚡ [4] Local Agent (son fallback)...");
      try {
        const { callLocalScrapeAgent } = await import("./services/local-agent-client.service");
        const access = await withStageTimeout(
          () => callLocalScrapeAgent(url),
          Math.min(policy.localAgentTimeoutMs, remainingMs()),
          "direct-html-timeout",
        );
        diagnostics.gatewayDurationMs = access.durationMs;
        if (access.agentSuccess) {
          diagnostics.localAgentSucceeded = true;
          applyAgentAccessToResult(result, url, access, diagnostics);
          console.log(`✅ Local Agent fallback (${access.durationMs}ms)`);
        } else {
          diagnostics.localAgentSucceeded = false;
          const errCode = (access.stageError ?? "local-agent-failed") as ScrapeStageErrorCode;
          diagnostics.gatewayError = errCode;
          pushStageError(diagnostics, errCode);
          console.warn(`⚠️ Local Agent fallback başarısız: ${access.error ?? errCode}`);
        }
      } catch (err) {
        diagnostics.localAgentSucceeded = false;
        pushStageError(diagnostics, "local-agent-failed");
        diagnostics.gatewayError = "local-agent-failed";
        console.warn("⚠️ Local Agent fallback timeout/hata");
      }
    }

    diagnostics.directHtmlSkippedReason = "cloud-provider-chain";
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
        const apiBlock = consumeLastTrendyolApiBlockSignal();
        if (apiBlock) {
          confirmedBlock = apiBlock;
          notePipelineBlock(diagnostics, apiBlock);
        }
      }
    } else {
      const err = apiSettled.reason;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "api-error";
      pushStageError(diagnostics, code);
      diagnostics.apiSuccess = false;
      diagnostics.apiError = code;
      console.warn(`⚠️ [1/6] API soft-fail (${code}, ${diagnostics.apiDurationMs}ms)`);
      const apiBlock = consumeLastTrendyolApiBlockSignal();
      if (apiBlock) {
        confirmedBlock = apiBlock;
        notePipelineBlock(diagnostics, apiBlock);
      }
    }

    if (htmlSettled.status === "fulfilled") {
      directHtml = htmlSettled.value;
      diagnostics.directHtmlSuccess = Boolean(directHtml && directHtml.length > 5000);
      if (diagnostics.directHtmlSuccess) {
        console.log(`✅ [2/6] Direct HTML: ${directHtml!.length} bytes (${diagnostics.apiDurationMs}ms)`);
      } else {
        console.warn("⚠️ [2/6] Direct HTML: ürün verisi içeren HTML alınamadı");
        const htmlBlock = consumeLastDirectHtmlBlockSignal();
        if (htmlBlock) {
          confirmedBlock = htmlBlock;
          notePipelineBlock(diagnostics, htmlBlock);
        }
      }
    } else {
      const err = htmlSettled.reason;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "direct-html-error";
      pushStageError(diagnostics, code);
      diagnostics.directHtmlError = code;
      console.warn(`⚠️ [2/6] Direct HTML soft-fail (${code})`);
      const htmlBlock = consumeLastDirectHtmlBlockSignal();
      if (htmlBlock) {
        confirmedBlock = htmlBlock;
        notePipelineBlock(diagnostics, htmlBlock);
      }
    }
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 2b) Otomatik kaynak erişim (internal provider registry) ──
  const htmlReadyBeforeGateway = Boolean(directHtml && directHtml.length >= 500);
  const { hasAnyInternalProvider } = await import("./config/source-access.config");
  const internalProviderConfigured = hasAnyInternalProvider();

  if (
    !skipInternalSourceAccess &&
    !policy.isCloud &&
    !policy.preferLocalAgent &&
    !policy.preferBrowserWorker &&
    !htmlReadyBeforeGateway &&
    !isPastDeadline() &&
    !forcedGlobalTimeout
  ) {
    if (!internalProviderConfigured) {
      diagnostics.gatewaySkippedReason = "no-internal-provider-configured";
      console.info("ℹ️ [SA] Internal provider yok — local Puppeteer fallback kullanılacak");
    } else {
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
      if (access.strategy === "browser_worker" && access.htmlSuccess) {
        diagnostics.gatewayHtmlSuccess = true;
        diagnostics.browserWorkerSucceeded = true;
        result._fromBrowserWorker = true;
        result._sourceAccessStrategy = "browser_worker";
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

  const chromiumReady = resolveChromiumPath().exists;
  const fieldsAfterHtmlParse = evaluateFields(result, url);
  // Local: API/HTML henüz yoksa senaryo (Puppeteer) önce gelsin — görsel timeout bütçeyi yemesin
  const localPreferPuppeteerFirst =
    !policy.isCloud &&
    policy.puppeteerAllowed &&
    chromiumReady &&
    !diagnostics.apiSuccess &&
    (!hasMinimumScrapeData(fieldsAfterHtmlParse) ||
      (!diagnostics.htmlParseSuccess && !diagnostics.directHtmlSuccess));

  let scenarioStageCompleted = false;

  const runScenarioStage = async (stageLabel: string): Promise<void> => {
    if (scenarioStageCompleted) return;

    const fieldsBeforeScenario = evaluateFields(result, url);
    const { applySparseApparelPolicy } = await import("./trendyol-variant-probe");
    applySparseApparelPolicy(result, url);
    const variantGaps = assessTrendyolVariantGaps(url, (result ?? {}) as Record<string, unknown>);
    const missingVariantOrFeatureData =
      !hasRealTrendyolVariants(result?.variants) ||
      !(Array.isArray(result?.features) && result.features.length > 0);
    const coreDataFromHtml =
      diagnostics.htmlParseSuccess &&
      fieldsBeforeScenario.hasTitle &&
      fieldsBeforeScenario.hasPrice &&
      fieldsBeforeScenario.hasImages &&
      !missingVariantOrFeatureData &&
      !variantGaps.likelyIncomplete &&
      !result?.requiresFullVariantScrape;

    const scenarioNeeded =
      !skipHeavyStages &&
      !coreDataFromHtml &&
      !forcedGlobalTimeout &&
      !isPastDeadline() &&
      (!hasMinimumScrapeData(fieldsBeforeScenario) ||
        !isCompleteScrapeData(fieldsBeforeScenario) ||
        variantGaps.likelyIncomplete ||
        result?.requiresFullVariantScrape === true);

    scenarioStageCompleted = true;

    if (!scenarioNeeded) {
      diagnostics.scenarioSkippedReason = coreDataFromHtml
        ? "html-parse-complete"
        : forcedGlobalTimeout
          ? "global-timeout"
          : "sufficient-data";
      return;
    }
    if (!puppeteerAllowed()) {
      diagnostics.scenarioSkippedReason = "puppeteer-disabled-in-cloud";
      // Browser Worker zaten denendiyse yerel Puppeteer kapalı mesajı kullanıcıya yanıltıcı olur.
      const browserWorkerAlreadyTried =
        diagnostics.browserWorkerSucceeded === true ||
        diagnostics.browserWorkerSucceeded === false ||
        (diagnostics.stageErrors || []).some((e) => String(e).startsWith("browser-worker-"));
      if (!hasMinimumScrapeData(fieldsBeforeScenario) && !browserWorkerAlreadyTried) {
        pushStageError(diagnostics, "puppeteer-disabled-in-cloud");
      }
      console.info(`ℹ️ [${stageLabel}] Scenario atlandı (cloud): puppeteer-disabled-in-cloud`);
      return;
    }

    // Local: eksik fiyat/görsel için Puppeteer'dan önce Browser Worker dene (daha stabil)
    if (
      !policy.isCloud &&
      policy.browserWorkerConfigured &&
      policy.browserWorkerHealthy &&
      !diagnostics.browserWorkerSucceeded &&
      !isCompleteScrapeData(fieldsBeforeScenario) &&
      !isPastDeadline()
    ) {
      try {
        const {
          scrapeTrendyolWithBrowserWorker,
        } = await import("./services/browser-worker-client.service");
        const bwBudgetMs = Math.min(
          Math.max(25_000, Math.min(policy.browserWorkerTimeoutMs || 45_000, 55_000)),
          remainingMs(),
        );
        console.log(`⚡ [${stageLabel}] Local Browser Worker (pre-scenario)...`);
        const bw = await withStageTimeout(
          () =>
            scrapeTrendyolWithBrowserWorker(url, {
              includeColorFamily: false,
              includeSiblingHtml: false,
              clientTimeoutMs: Math.max(5_000, bwBudgetMs - 1_000),
            }),
          bwBudgetMs,
          "browser-worker-timeout",
        );
        if (bw.success && (bw.html || bw.rawProductJson)) {
          applyBrowserWorkerToResult(result, url, bw, diagnostics);
          if (bw.html && bw.html.length >= 500) {
            directHtml = bw.html;
            diagnostics.directHtmlSuccess = true;
            try {
              const { parseTrendyolProductFromHtmlContent } = await import(
                "./trendyol-html-extractor"
              );
              const htmlProduct = await parseTrendyolProductFromHtmlContent(
                bw.html,
                url,
                "browser-worker",
              );
              if (htmlProduct) {
                applyHtmlProduct(htmlProduct);
                diagnostics.htmlParseSuccess = true;
              }
            } catch {
              /* soft-fail */
            }
          }
          if (bw.rawProductJson) {
            try {
              const { extractOriginalTrendyolPriceFromProduct, buildTrendyolPriceObject } =
                await import("./trendyol-price-utils");
              const priceVal = extractOriginalTrendyolPriceFromProduct(bw.rawProductJson);
              if (priceVal > 0 && (!result.price?.original || result.price.original <= 0)) {
                result.price = buildTrendyolPriceObject(priceVal);
              }
            } catch {
              /* soft-fail */
            }
          }
        } else {
          diagnostics.browserWorkerSucceeded = false;
        }
      } catch (err) {
        diagnostics.browserWorkerSucceeded = false;
        console.warn(
          `⚠️ [${stageLabel}] Local Browser Worker soft-fail:`,
          err instanceof Error ? err.message : String(err),
        );
      }
      const afterBw = evaluateFields(result, url);
      if (isCompleteScrapeData(afterBw)) {
        diagnostics.scenarioSkippedReason = "browser-worker-complete";
        return;
      }
      if (
        modes.effective === "auto-fast" &&
        afterBw.hasTitle &&
        afterBw.hasPrice &&
        afterBw.hasImages
      ) {
        diagnostics.scenarioSkippedReason = "auto-fast-after-browser-worker";
        return;
      }
    }

    if (
      modes.effective === "auto-fast" &&
      isCompleteScrapeData(evaluateFields(result, url))
    ) {
      diagnostics.scenarioSkippedReason = "auto-fast-core-data-present";
      return;
    }
    if (
      modes.effective === "auto-fast" &&
      hasMinimumScrapeData(fieldsBeforeScenario) &&
      hasRealTrendyolVariants(result?.variants) &&
      !variantGaps.likelyIncomplete &&
      !result?.requiresFullVariantScrape
    ) {
      diagnostics.scenarioSkippedReason = "auto-fast-core-data-present";
      return;
    }
    if (isPastDeadline() || forcedGlobalTimeout) return;

    console.log(`⚡ [${stageLabel}] Scenario scrape (eksik veri)...`);
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
      const htmlForIdCheck =
        typeof scrapeResult?.htmlContent === "string" ? scrapeResult.htmlContent : "";
      let productIdMatches = true;
      if (htmlForIdCheck.length >= 500) {
        const { htmlProductIdMatchesUrl } = await import("./trendyol-puppeteer-html-merge");
        productIdMatches = htmlProductIdMatchesUrl(htmlForIdCheck, url);
        if (!productIdMatches) {
          console.warn(
            `⚠️ [${stageLabel}] Scenario HTML productId URL ile eşleşmiyor — merge reddedildi`,
          );
        }
      }
      const scrapeHasValidData =
        productIdMatches &&
        scrapeHasValidTitle &&
        (scrapeResult?.price?.original > 0 || (scrapeResult?.images?.length ?? 0) > 0);

      if (scrapeResult && scrapeResult.success !== false && scrapeHasValidData) {
        result = mergeApiWithScrape(result, scrapeResult);
        if (scrapeResult.htmlContent && typeof scrapeResult.htmlContent === "string") {
          directHtml = scrapeResult.htmlContent;
        }
        console.log(`✅ [${stageLabel}] Scenario scrape merged`);
      } else if (
        scrapeResult &&
        productIdMatches &&
        scrapeHasValidTitle &&
        (scrapeResult?.price?.original > 0 || (scrapeResult?.images?.length ?? 0) > 0)
      ) {
        result = mergeApiWithScrape(result, scrapeResult);
        console.log(`✅ [${stageLabel}] Scenario scrape merged (partial core data)`);
      } else {
        const { classifyScenarioFailure } = await import("./scenario-error-utils");
        const failure = classifyScenarioFailure(
          new Error(productIdMatches ? "scenario-insufficient-data" : "scenario-product-id-mismatch"),
        );
        diagnostics.scenarioErrorDetail = failure;
        pushStageError(diagnostics, failure.code === "unknown-scenario-error" ? "scenario-error" : failure.code);
        diagnostics.scenarioSkippedReason = productIdMatches
          ? "scenario-insufficient-data"
          : "scenario-product-id-mismatch";
        console.warn(`⚠️ [${stageLabel}] Scenario returned insufficient data`, failure);
      }
    } catch (err) {
      const { classifyScenarioFailure } = await import("./scenario-error-utils");
      const failure = classifyScenarioFailure(err);
      diagnostics.scenarioErrorDetail = failure;
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : failure.code;
      pushStageError(diagnostics, code);
      diagnostics.scenarioSkippedReason = "scenario-failed-keeping-partial";
      console.error(`⚠️ [${stageLabel}] Scenario soft-fail (${code})`, {
        message: failure.message,
        chromiumSource: failure.chromiumSource,
        executableExists: failure.executableExists,
        platform: failure.platform,
      });
      if (apiProduct && !hasMinimumScrapeData(fieldsBeforeScenario)) {
        result = convertApiProduct(apiProduct);
      }
    }
  };

  if (localPreferPuppeteerFirst && !skipHeavyStages && !forcedGlobalTimeout && !isPastDeadline()) {
    await runScenarioStage("3b/6");
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 4) fetchTrendyolProductImages ──
  const hasImagesBeforeFetch = filterValidProductImages(result?.images || []).length > 0;
  const fieldSnapshot = evaluateFields(result, url);
  const skipImageDownloadNoCore =
    !fieldSnapshot.hasTitle &&
    !fieldSnapshot.hasPrice &&
    !diagnostics.htmlParseSuccess &&
    !diagnostics.directHtmlSuccess &&
    !diagnostics.browserWorkerSucceeded &&
    !diagnostics.apiSuccess;
  const skipImageDownloadStages =
    skipImageDownloadNoCore ||
    (policy.isCloud &&
      (hasImagesBeforeFetch || (fieldSnapshot.hasTitle && fieldSnapshot.hasPrice))) ||
    (localPreferPuppeteerFirst && !hasImagesBeforeFetch);

  if (localPreferPuppeteerFirst && !hasImagesBeforeFetch) {
    diagnostics.imageFetcherSkippedReason = "local-puppeteer-preferred";
  } else if (skipImageDownloadNoCore) {
    diagnostics.imageFetcherSkippedReason = "no-core-product-data";
  }

  if (
    !skipHeavyStages &&
    !skipImageDownloadStages &&
    !hasImagesBeforeFetch &&
    !isPastDeadline() &&
    !forcedGlobalTimeout
  ) {
    diagnostics.imageFetcherStarted = true;
    console.log("⚡ [4/6] fetchTrendyolProductImages...");
    try {
      const { fetchTrendyolProductImages } = await import("./trendyol-image-fetcher");
      const directImages = await withStageTimeout(
        () =>
          fetchTrendyolProductImages(url, {
            skipNetworkRetries: !diagnostics.apiSuccess && !diagnostics.directHtmlSuccess,
            cachedHtml: directHtml,
          }),
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
    console.log("⚡ [4/6] Görseller mevcut — indirme atlandı");
  } else if (skipImageDownloadNoCore) {
    console.log("⚡ [4/6] Görsel indirme atlandı (çekirdek ürün verisi yok — süre tasarrufu)");
  } else if (skipImageDownloadStages) {
    console.log("⚡ [4/6] Görsel indirme atlandı (local Puppeteer öncelikli veya yeterli veri)");
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 5) Alternatif görsel fallback ──
  const stillNoImages = filterValidProductImages(result?.images || []).length === 0;
  const fieldsBeforeImageFallback = evaluateFields(result, url);
  const skipImageFallbackNoCore =
    !fieldsBeforeImageFallback.hasTitle &&
    !fieldsBeforeImageFallback.hasPrice &&
    !diagnostics.htmlParseSuccess &&
    !diagnostics.directHtmlSuccess &&
    !diagnostics.browserWorkerSucceeded;

  if (
    !skipHeavyStages &&
    stillNoImages &&
    !skipImageFallbackNoCore &&
    !isPastDeadline() &&
    !forcedGlobalTimeout
  ) {
    diagnostics.imageFallbackStarted = true;
    console.log("⚡ [5/6] Alternatif görsel fallback...");
    try {
      await withStageTimeout(
        async () => {
          if (!diagnostics.apiSuccess) {
            const { parseTrendyolCoreFromHtml } = await import("./trendyol-puppeteer-html-merge");
            const htmlSource = directHtml || (typeof result.htmlContent === "string" ? result.htmlContent : null);
            if (htmlSource) {
              const parsed = parseTrendyolCoreFromHtml(htmlSource, url, "post-scenario-html");
              if (parsed?.images?.length) {
                result.images = filterValidProductImages(parsed.images);
                diagnostics.imageFallbackSuccess = true;
                console.log(`✅ [5/6] HTML parser görsel: ${result.images.length} adet`);
                return;
              }
            }
          }
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
        Math.min(
          localPreferPuppeteerFirst ? 12_000 : STAGE_TIMEOUT.imageFallback,
          remainingMs(),
        ),
        "image-fallback-timeout",
      );
    } catch (err) {
      const code: ScrapeStageErrorCode =
        err instanceof ScrapeStageTimeoutError ? err.code : "image-fallback-error";
      pushStageError(diagnostics, code);
      diagnostics.imageFallbackError = code;
      console.warn(`⚠️ [5/6] Image fallback soft-fail (${code})`);
    }
  } else if (skipImageFallbackNoCore && stillNoImages) {
    diagnostics.imageFallbackStarted = false;
    console.log("⚡ [5/6] Görsel fallback atlandı (çekirdek ürün verisi yok — süre tasarrufu)");
  } else if (!stillNoImages) {
    console.log("⚡ [5/6] Görsel fallback atlandı");
  }

  if (isPastDeadline()) forcedGlobalTimeout = true;

  // ── 6) Scenario — cloud veya local'de erken çalışmadıysa ──
  if (!localPreferPuppeteerFirst) {
    await runScenarioStage("6/6");
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
      rawProduct:
        apiProduct?.rawProduct ??
        (result._browserWorkerRawProduct as Record<string, unknown> | undefined) ??
        null,
      scrapeMode: modes.effective,
    },
  );
}
