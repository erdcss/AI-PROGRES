import os from "os";
import { isCloudRuntime, puppeteerAllowed } from "@shared/deploy-runtime";
import type { ScrapeStageErrorCode } from "@shared/scrape-runtime";
import { resolveChromiumPath } from "./puppeteer-config";

export type ScenarioErrorDetail = {
  code: ScrapeStageErrorCode;
  name: string;
  message: string;
  executablePath: string | null;
  executableExists: boolean;
  chromiumSource: string;
  platform: NodeJS.Platform;
  puppeteerAllowed: boolean;
  isCloudRuntime: boolean;
  isTimeout: boolean;
  isLaunchFailure: boolean;
  isNavigationFailure: boolean;
};

function readErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "unknown error");
}

function readErrorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  return "Error";
}

export function classifyScenarioFailure(err: unknown): ScenarioErrorDetail {
  const chromium = resolveChromiumPath();
  const message = readErrorMessage(err);
  const name = readErrorName(err);
  const lower = message.toLowerCase();

  let code: ScrapeStageErrorCode = "unknown-scenario-error";

  if (!chromium.path || !chromium.exists) {
    code = "chromium-not-found";
  } else if (
    lower.includes("failed to launch") ||
    lower.includes("browser process") ||
    lower.includes("spawn")
  ) {
    code = "chromium-launch-failed";
  } else if (
    lower.includes("navigation timeout") ||
    lower.includes("timeout") ||
    name === "TimeoutError"
  ) {
    code = "navigation-timeout";
  } else if (
    lower.includes("blocked") ||
    lower.includes("access denied") ||
    lower.includes("captcha") ||
    lower.includes("403")
  ) {
    code = "trendyol-blocked";
  } else if (
    lower.includes("empty") ||
    lower.includes("no html") ||
    lower.includes("insufficient data")
  ) {
    code = "page-empty";
  } else if (name === "ScrapeStageTimeoutError" || lower.includes("scenario-timeout")) {
    code = "scenario-timeout";
  }

  return {
    code,
    name,
    message: message.slice(0, 500),
    executablePath: chromium.path ?? null,
    executableExists: chromium.exists,
    chromiumSource: chromium.source,
    platform: os.platform(),
    puppeteerAllowed: puppeteerAllowed(),
    isCloudRuntime: isCloudRuntime(),
    isTimeout: code === "navigation-timeout" || code === "scenario-timeout",
    isLaunchFailure: code === "chromium-launch-failed" || code === "chromium-not-found",
    isNavigationFailure: code === "navigation-timeout" || code === "trendyol-blocked",
  };
}
