import { isCloudRuntime, puppeteerAllowed } from "./deploy-runtime";

export type ScrapeStageErrorCode =
  | "api-timeout"
  | "api-error"
  | "api-null-response"
  | "api-empty-payload"
  | "api-json-parse-failed"
  | "direct-html-timeout"
  | "direct-html-error"
  | "html-parse-timeout"
  | "html-parse-error"
  | "puppeteer-disabled-in-cloud"
  | "scenario-timeout"
  | "scenario-error"
  | "chromium-not-found"
  | "chromium-launch-failed"
  | "navigation-timeout"
  | "trendyol-blocked"
  | "page-empty"
  | "unknown-scenario-error"
  | "image-proxy-timeout"
  | "image-proxy-error"
  | "image-fallback-timeout"
  | "image-fallback-error"
  | "pipeline-global-timeout"
  | "extraction-failed"
  | "scraping-provider-error"
  | "gateway-not-configured"
  | "gateway-provider-failed"
  | "gateway-settings-table-missing"
  | "source-access-direct-timeout"
  | "source-access-internal-provider-unavailable"
  | "source-access-provider-failed"
  | "source-access-no-usable-data"
  | "local-agent-failed"
  | "browser-worker-failed"
  | "browser-worker-not-configured"
  | "browser-worker-unhealthy";

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
  apiError?: string;
  apiDurationMs?: number;
  directHtmlStarted: boolean;
  directHtmlSuccess: boolean;
  directHtmlError?: string;
  directHtmlSkippedReason?: string | null;
  htmlParseStarted: boolean;
  htmlParseSkippedReason?: string;
  htmlParseSuccess: boolean;
  htmlParseError?: string;
  htmlParseDurationMs?: number;
  imageFetcherStarted: boolean;
  imageFetcherSuccess: boolean;
  imageFetcherError?: string;
  imageFetcherSkippedReason?: string;
  imageFallbackStarted: boolean;
  imageFallbackSuccess: boolean;
  imageFallbackError?: string;
  imageFallbackSkippedReason?: string;
  gatewayStarted?: boolean;
  gatewayProviderType?: string;
  gatewayHtmlSuccess?: boolean;
  gatewayImageSuccess?: boolean;
  gatewayError?: string;
  gatewayDurationMs?: number;
  gatewaySkippedReason?: string;
  localAgentSucceeded?: boolean;
  browserWorkerSucceeded?: boolean;
  scenarioSkippedReason?: string;
  scenarioErrorDetail?: {
    code: string;
    name: string;
    message: string;
    executablePath: string | null;
    executableExists: boolean;
    chromiumSource: string;
    platform: string;
    puppeteerAllowed: boolean;
    isCloudRuntime: boolean;
    isTimeout: boolean;
    isLaunchFailure: boolean;
    isNavigationFailure: boolean;
  };
  stageErrors: ScrapeStageErrorCode[];
  finalSuccessReason?: FinalSuccessReason | string;
  partialSuccess?: boolean;
  pipelineDurationMs?: number;
  recoveredStageErrors?: string[];
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
      apiError: diagnostics.apiError ?? null,
      apiDurationMs: diagnostics.apiDurationMs ?? null,
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
      imageFallbackError: diagnostics.imageFallbackError ?? null,
      gatewayStarted: diagnostics.gatewayStarted ?? false,
      gatewayProviderType: diagnostics.gatewayProviderType ?? null,
      gatewayHtmlSuccess: diagnostics.gatewayHtmlSuccess ?? false,
      gatewayImageSuccess: diagnostics.gatewayImageSuccess ?? false,
      gatewayError: diagnostics.gatewayError ?? null,
      gatewayDurationMs: diagnostics.gatewayDurationMs ?? null,
      gatewaySkippedReason: diagnostics.gatewaySkippedReason ?? null,
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

export function formatScrapeDeployUserMessage(diagnostics: ScrapeDiagnostics): string {
  const errors = diagnostics.stageErrors ?? [];
  const cloud = diagnostics.isCloudRuntime;
  const reason = diagnostics.finalSuccessReason ?? "no-usable-data";

  const sourceAccessFailed =
    errors.some((e) => e.startsWith("source-access-")) ||
    reason.startsWith("source-access-") ||
    diagnostics.gatewayError?.startsWith("source-access-");

  if (sourceAccessFailed || errors.includes("gateway-provider-failed") || errors.includes("gateway-not-configured")) {
    return cloud
      ? "Kaynak site geçici olarak yanıt vermedi veya sunucu erişimi engellendi. Program alternatif kaynak erişim yollarını denedi ancak geçerli ürün verisi alınamadı."
      : "Kaynak siteye erişim sağlanamadı veya ürün verisi doğrulanamadı. Program alternatif erişim yollarını denedi ancak geçerli fiyat, görsel veya başlık bulunamadı.";
  }

  if (errors.length === 0 && !diagnostics.apiSuccess) {
    return cloud
      ? "Kaynak site geçici olarak yanıt vermedi veya sunucu erişimi engellendi."
      : "Trendyol'dan ürün verisi alınamadı.";
  }

  const timeoutLike = errors.some((e) =>
    ["direct-html-timeout", "api-timeout", "image-proxy-timeout", "image-fallback-timeout", "pipeline-global-timeout", "source-access-direct-timeout"].includes(e),
  );
  const puppeteerOff = errors.includes("puppeteer-disabled-in-cloud") || diagnostics.scenarioSkippedReason?.includes("puppeteer");

  const parts: string[] = [];

  if (cloud && timeoutLike) {
    parts.push(
      "Kaynak site geçici olarak yanıt vermedi veya sunucu erişimi engellenmiş olabilir.",
    );
  }

  if (puppeteerOff) {
    parts.push("Cloud ortamında tarayıcı tabanlı çekim kapalı.");
  }

  if (errors.includes("api-timeout") || errors.includes("api-error")) {
    parts.push("API yanıt vermedi.");
  }
  if (errors.includes("direct-html-timeout") || errors.includes("direct-html-error") || errors.includes("source-access-direct-timeout")) {
    parts.push("Ürün sayfası HTML'i alınamadı.");
  }
  if (errors.includes("image-proxy-timeout") || errors.includes("image-fallback-timeout")) {
    parts.push("Görseller alınamadı.");
  }
  if (errors.includes("source-access-internal-provider-unavailable") || errors.includes("source-access-provider-failed")) {
    parts.push("Alternatif erişim başarısız.");
  }

  if (reason === "gateway-data-invalid" || reason === "source-access-no-usable-data") {
    parts.push("Kaynak veri doğrulanamadı (fiyat, başlık veya görsel eksik).");
  } else if (reason === "no-usable-data" || reason === "title-only-slug-no-data") {
    parts.push("Geçerli fiyat, başlık veya görsel bulunamadı.");
  }

  if (parts.length === 0) {
    return "Ürün verisi çekilemedi. Lütfen daha sonra tekrar deneyin.";
  }

  return parts.join(" ");
}

export function formatStageErrorsForUser(stageErrors: ScrapeStageErrorCode[]): string {
  const labels: Record<string, string> = {
    "api-timeout": "Trendyol API zaman aşımı",
    "api-error": "Trendyol API yanıtı alınamadı veya işlenemedi",
    "api-null-response": "Trendyol API boş yanıt",
    "api-empty-payload": "Trendyol API eksik veri",
    "api-json-parse-failed": "Trendyol API JSON ayrıştırma hatası",
    "direct-html-timeout": "Sayfa HTML zaman aşımı",
    "direct-html-error": "Sayfa HTML alınamadı",
    "html-parse-timeout": "HTML ayrıştırma zaman aşımı",
    "html-parse-error": "HTML ayrıştırma hatası",
    "puppeteer-disabled-in-cloud": "Cloud'da Puppeteer kapalı",
    "image-proxy-timeout": "Görsel proxy zaman aşımı",
    "image-proxy-error": "Görsel proxy hatası",
    "image-fallback-timeout": "Görsel yedek zaman aşımı",
    "image-fallback-error": "Görsel yedek hatası",
    "pipeline-global-timeout": "Toplam pipeline zaman aşımı",
    "extraction-failed": "Veri çıkarma başarısız",
    "gateway-not-configured": "Gateway ayarlanmamış",
    "gateway-provider-failed": "Gateway sağlayıcı başarısız",
    "gateway-settings-table-missing": "Kaynak erişim ayar tablosu hazır değil",
    "source-access-direct-timeout": "Kaynak HTML zaman aşımı",
    "source-access-internal-provider-unavailable": "Alternatif erişim kullanılamıyor",
    "source-access-provider-failed": "Alternatif erişim başarısız",
    "source-access-no-usable-data": "Geçerli ürün verisi yok",
    "local-agent-failed": "Yerel agent başarısız",
    "browser-worker-failed": "Tarayıcı Worker başarısız",
    "browser-worker-not-configured": "Tarayıcı Worker yapılandırılmamış",
    "browser-worker-unhealthy": "Tarayıcı Worker sağlıksız",
    "scenario-timeout": "Senaryo zaman aşımı",
    "scenario-error": "Senaryo hatası",
    "chromium-not-found": "Chromium bulunamadı — PUPPETEER_EXECUTABLE_PATH veya puppeteer browsers install chrome",
    "chromium-launch-failed": "Chromium başlatılamadı",
    "navigation-timeout": "Sayfa yükleme zaman aşımı",
    "trendyol-blocked": "Trendyol erişimi engellendi",
    "page-empty": "Sayfa boş veya ürün verisi yok",
    "unknown-scenario-error": "Bilinmeyen senaryo hatası",
    "scraping-provider-error": "Harici sağlayıcı hatası",
  };
  return stageErrors.map((e) => labels[e] || e).join("; ");
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
