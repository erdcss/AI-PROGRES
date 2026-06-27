import { isCloudRuntime, puppeteerAllowed } from "./deploy-runtime";

export type ScrapeStageErrorCode =
  | "direct-html-timeout"
  | "puppeteer-disabled-in-cloud"
  | "scenario-timeout"
  | "image-proxy-timeout";

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
  directHtmlStarted: boolean;
  directHtmlSuccess: boolean;
  scenarioSkippedReason?: string;
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
      directHtmlStarted: diagnostics.directHtmlStarted,
      directHtmlSuccess: diagnostics.directHtmlSuccess,
      scenarioSkippedReason: diagnostics.scenarioSkippedReason ?? null,
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
    defaultScrapeMode: cloud ? "auto-fast" : "auto-fast",
  };
}

export function formatScrapeError(error: unknown): {
  message: string;
  code?: ScrapeStageErrorCode;
} {
  if (error instanceof ScrapeStageTimeoutError) {
    return { message: error.code, code: error.code };
  }
  if (error instanceof Error && error.message === "puppeteer-disabled-in-cloud") {
    return { message: "puppeteer-disabled-in-cloud", code: "puppeteer-disabled-in-cloud" };
  }
  if (error instanceof Error && error.message === "TIMEOUT") {
    return { message: "scenario-timeout", code: "scenario-timeout" };
  }
  return {
    message: error instanceof Error ? error.message : "Bilinmeyen scrape hatası",
  };
}
