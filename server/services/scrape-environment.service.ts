import { isCloudRuntime, puppeteerAllowed } from "@shared/deploy-runtime";
import { isBrowserWorkerConfigured } from "./browser-worker-client.service";
import { isLocalAgentConfigured } from "./local-agent-client.service";

export type ScrapeEnvironmentPolicy = {
  isCloud: boolean;
  browserWorkerConfigured: boolean;
  localAgentConfigured: boolean;
  /** Cloud + Browser Worker → production HTML/varyant yolu */
  preferBrowserWorker: boolean;
  /** Cloud + agent (dev fallback) → Railway direct erişim yerine agent kullan */
  preferLocalAgent: boolean;
  globalTimeoutMs: number;
  directHtmlTimeoutMs: number;
  directHtmlRetries: number;
  apiTimeoutMs: number;
  sourceAccessTimeoutMs: number;
  browserWorkerTimeoutMs: number;
  scrapeJobMaxMs: number;
  puppeteerAllowed: boolean;
};

/** Local vs canlı ortam farklarını tek noktadan yönet */
export function getScrapeEnvironmentPolicy(): ScrapeEnvironmentPolicy {
  const isCloud = isCloudRuntime();
  const browserWorkerConfigured = isBrowserWorkerConfigured();
  const localAgentConfigured = isLocalAgentConfigured();
  const preferBrowserWorker = isCloud && browserWorkerConfigured;
  const preferLocalAgent = isCloud && !browserWorkerConfigured && localAgentConfigured;

  if (preferBrowserWorker) {
    return {
      isCloud,
      browserWorkerConfigured,
      localAgentConfigured,
      preferBrowserWorker: true,
      preferLocalAgent: false,
      globalTimeoutMs: 110_000,
      directHtmlTimeoutMs: 6_000,
      directHtmlRetries: 0,
      apiTimeoutMs: 10_000,
      sourceAccessTimeoutMs: 25_000,
      browserWorkerTimeoutMs: 50_000,
      scrapeJobMaxMs: 110_000,
      puppeteerAllowed: puppeteerAllowed(),
    };
  }

  if (preferLocalAgent) {
    return {
      isCloud,
      browserWorkerConfigured,
      localAgentConfigured,
      preferBrowserWorker: false,
      preferLocalAgent: true,
      globalTimeoutMs: 95_000,
      directHtmlTimeoutMs: 8_000,
      directHtmlRetries: 1,
      apiTimeoutMs: 8_000,
      sourceAccessTimeoutMs: 70_000,
      browserWorkerTimeoutMs: 50_000,
      scrapeJobMaxMs: 95_000,
      puppeteerAllowed: puppeteerAllowed(),
    };
  }

  if (isCloud) {
    return {
      isCloud,
      browserWorkerConfigured,
      localAgentConfigured,
      preferBrowserWorker: false,
      preferLocalAgent: false,
      globalTimeoutMs: 60_000,
      directHtmlTimeoutMs: 28_000,
      directHtmlRetries: 2,
      apiTimeoutMs: 10_000,
      sourceAccessTimeoutMs: 25_000,
      browserWorkerTimeoutMs: 50_000,
      scrapeJobMaxMs: 65_000,
      puppeteerAllowed: puppeteerAllowed(),
    };
  }

  return {
    isCloud: false,
    browserWorkerConfigured,
    localAgentConfigured,
    preferBrowserWorker: false,
    preferLocalAgent: false,
    globalTimeoutMs: 90_000,
    directHtmlTimeoutMs: 22_000,
    directHtmlRetries: 4,
    apiTimeoutMs: 10_000,
    sourceAccessTimeoutMs: 25_000,
    browserWorkerTimeoutMs: 50_000,
    scrapeJobMaxMs: 180_000,
    puppeteerAllowed: true,
  };
}

export function logScrapeEnvironmentPolicy(): void {
  const p = getScrapeEnvironmentPolicy();
  console.info("🔧 Scrape ortam politikası:", {
    isCloud: p.isCloud,
    browserWorkerConfigured: p.browserWorkerConfigured,
    localAgentConfigured: p.localAgentConfigured,
    preferBrowserWorker: p.preferBrowserWorker,
    preferLocalAgent: p.preferLocalAgent,
    globalTimeoutMs: p.globalTimeoutMs,
  });
}
