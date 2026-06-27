import { isCloudRuntime, puppeteerAllowed } from "./deploy-runtime";

export type ScrapeStageErrorCode =
  | "api-timeout"
  | "api-error"
  | "direct-html-timeout"
  | "direct-html-error"
  | "html-parse-timeout"
  | "html-parse-error"
  | "puppeteer-disabled-in-cloud"
  | "scenario-timeout"
  | "scenario-error"
  | "image-proxy-timeout"
  | "image-proxy-error"
  | "image-fallback-timeout"
  | "image-fallback-error"
  | "pipeline-global-timeout"
  | "extraction-failed";

export type FinalSuccessReason =
  | "api-only"
  | "api-plus-images"
  | "partial-timeout"
  | "no-data-extraction-failed";

export type SelectedScrapeMode =
  | "auto-fast"
  | "direct-html"
  | "scenario"
  | "browser"
  | "puppeteer"
  | "internal-browser"
  | string;

export type EffectiveScrapeMode = "auto-fast" | "direct-html" | "scenario";

export type ScrapeDiagnostics = {
  selectedScrapeMode: string;
  effectiveScrapeMode: string;
  isCloudRuntime: boolean;
  puppeteerAllowed: boolean;
  apiStarted: boolean;
  apiSuccess: boolean;
  directHtmlStarted: boolean;
  directHtmlSuccess: boolean;
  directHtmlError?: string;
  htmlParseStarted: boolean;
  htmlParseSkippedReason?: string;
  htmlParseSuccess: boolean;
  htmlParseError?: string;
  htmlParseDurationMs?: number;
  imageFetcherStarted: boolean;
  imageFetcherSuccess: boolean;
  imageFetcherError?: string;
  imageFallbackStarted: boolean;
  imageFallbackSuccess: boolean;
  scenarioSkippedReason?: string;
  stageErrors: ScrapeStageErrorCode[];
  finalSuccessReason?: FinalSuccessReason | string;
  partialSuccess?: boolean;
  pipelineDurationMs?: number;
};

export type PipelineOutcome = {
  result: Record<string, unknown> | null;
  diagnostics: ScrapeDiagnostics;
  success: boolean;
  partialSuccess: boolean;
};

const BROWSER_MODES = new Set([
  "browser",
  "puppeteer",
  "scenario",
  "chromium",
  "internal-browser",
  "dahili-tarayici",
]);

export class ScrapeStageTimeoutError extends Error {
  readonly code: ScrapeStageErrorCode;

  constructor(code: ScrapeStageErrorCode, message?: string) {
    super(message || code);
    this.name = "ScrapeStageTimeoutError";
    this.code = code;
  }
}

export function resolveEffectiveScrapeMode(
  selected: SelectedScrapeMode | undefined,
): { selected: string; effective: EffectiveScrapeMode } {
  const normalized = String(selected || "auto-fast").trim().toLowerCase();
  const selectedLabel = normalized || "auto-fast";

  if (!isCloudRuntime() || puppeteerAllowed()) {
    if (normalized === "direct-html") {
      return { selected: selectedLabel, effective: "direct-html" };
    }
    if (normalized === "scenario") {
      return { selected: selectedLabel, effective: "scenario" };
    }
    return { selected: selectedLabel, effective: "auto-fast" };
  }

  if (BROWSER_MODES.has(normalized)) {
    return { selected: selectedLabel, effective: "auto-fast" };
  }

  if (normalized === "direct-html") {
    return { selected: selectedLabel, effective: "direct-html" };
  }

  return { selected: selectedLabel, effective: "auto-fast" };
}

export function logScrapeDiagnostics(diagnostics: ScrapeDiagnostics): void {
  console.log(
    JSON.stringify({
      event: "scrape-diagnostics",
      selectedScrapeMode: diagnostics.selectedScrapeMode,
      effectiveScrapeMode: diagnostics.effectiveScrapeMode,
      isCloudRuntime: diagnostics.isCloudRuntime,
      puppeteerAllowed: diagnostics.puppeteerAllowed,
      apiStarted: diagnostics.apiStarted,
      apiSuccess: diagnostics.apiSuccess,
      directHtmlStarted: diagnostics.directHtmlStarted,
      directHtmlSuccess: diagnostics.directHtmlSuccess,
      directHtmlError: diagnostics.directHtmlError ?? null,
      htmlParseStarted: diagnostics.htmlParseStarted,
      htmlParseSkippedReason: diagnostics.htmlParseSkippedReason ?? null,
      htmlParseSuccess: diagnostics.htmlParseSuccess,
      htmlParseError: diagnostics.htmlParseError ?? null,
      htmlParseDurationMs: diagnostics.htmlParseDurationMs ?? null,
      imageFetcherStarted: diagnostics.imageFetcherStarted,
      imageFetcherSuccess: diagnostics.imageFetcherSuccess,
      imageFetcherError: diagnostics.imageFetcherError ?? null,
      imageFallbackStarted: diagnostics.imageFallbackStarted,
      imageFallbackSuccess: diagnostics.imageFallbackSuccess,
      scenarioSkippedReason: diagnostics.scenarioSkippedReason ?? null,
      stageErrors: diagnostics.stageErrors,
      finalSuccessReason: diagnostics.finalSuccessReason ?? null,
      partialSuccess: diagnostics.partialSuccess ?? false,
      pipelineDurationMs: diagnostics.pipelineDurationMs ?? null,
    }),
  );
}

export function createStageTimeout(ms: number, code: ScrapeStageErrorCode): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new ScrapeStageTimeoutError(code)), ms);
  });
}

export async function withStageTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  code: ScrapeStageErrorCode,
): Promise<T> {
  return Promise.race([fn(), createStageTimeout(ms, code)]);
}

export function scrapeCapabilitiesPayload() {
  const cloud = isCloudRuntime();
  const puppeteerOk = puppeteerAllowed();
  return {
    isCloudRuntime: cloud,
    puppeteerAllowed: puppeteerOk,
    browserUiEnabled: puppeteerOk,
    defaultScrapeMode: "auto-fast",
    pipelineEndpoint: "/api/trendyol-scrape",
  };
}

export function formatScrapeError(error: unknown): {
  message: string;
  code?: ScrapeStageErrorCode;
} {
  if (error instanceof ScrapeStageTimeoutError) {
    return { message: error.code, code: error.code };
  }
  if (error instanceof Error && error.message === "extraction-failed") {
    return { message: "extraction-failed", code: "extraction-failed" };
  }
  if (error instanceof Error && error.message === "TIMEOUT") {
    return { message: "scenario-timeout", code: "scenario-timeout" };
  }
  return {
    message: error instanceof Error ? error.message : "Bilinmeyen scrape hatası",
  };
}

export function hasMinimumScrapeData(fields: {
  hasTitle: boolean;
  hasPrice: boolean;
  hasImages: boolean;
}): boolean {
  return fields.hasTitle || fields.hasPrice || fields.hasImages;
}

export function isCompleteScrapeData(fields: {
  hasTitle: boolean;
  hasPrice: boolean;
  hasImages: boolean;
}): boolean {
  return fields.hasTitle && fields.hasPrice && fields.hasImages;
}

export function computeFinalSuccessReason(input: {
  fields: { hasTitle: boolean; hasPrice: boolean; hasImages: boolean };
  apiSuccess: boolean;
  stageErrors: ScrapeStageErrorCode[];
  minimum: boolean;
  complete: boolean;
}): FinalSuccessReason {
  const { fields, apiSuccess, stageErrors, minimum, complete } = input;
  if (!minimum) return "no-data-extraction-failed";

  const hadTimeout = stageErrors.some(
    (e) => e.includes("timeout") || e === "pipeline-global-timeout",
  );

  if (hadTimeout || (!complete && minimum)) {
    return "partial-timeout";
  }

  if (apiSuccess && fields.hasImages) {
    return "api-plus-images";
  }

  if (apiSuccess) {
    return "api-only";
  }

  if (fields.hasImages) {
    return "api-plus-images";
  }

  return complete ? "api-plus-images" : "partial-timeout";
}
