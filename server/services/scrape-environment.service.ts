import { puppeteerAllowed } from "@shared/deploy-runtime";
import {
  getScrapeProviderSnapshot,
  type ScrapeProviderId,
} from "./scrape-provider.service";

export type ScrapeEnvironmentPolicy = {
  isCloud: boolean;
  browserWorkerConfigured: boolean;
  browserWorkerHealthy: boolean;
  localAgentConfigured: boolean;
  localAgentHealthy: boolean;
  localAgentEphemeral: boolean;
  selectedProviders: ScrapeProviderId[];
  fatal: boolean;
  warnings: string[];
  /** Cloud + sağlıklı Browser Worker */
  preferBrowserWorker: boolean;
  /** Production'da asla primary değil — yalnızca fallback zincirinde */
  preferLocalAgent: boolean;
  globalTimeoutMs: number;
  directHtmlTimeoutMs: number;
  directHtmlRetries: number;
  apiTimeoutMs: number;
  sourceAccessTimeoutMs: number;
  browserWorkerTimeoutMs: number;
  localAgentTimeoutMs: number;
  imageFetcherTimeoutMs: number;
  imageFallbackTimeoutMs: number;
  scrapeJobMaxMs: number;
  puppeteerAllowed: boolean;
};

/** Local vs canlı ortam farklarını tek noktadan yönet */
export function getScrapeEnvironmentPolicy(): ScrapeEnvironmentPolicy {
  const snap = getScrapeProviderSnapshot();
  const preferBrowserWorker = snap.isCloudRuntime && snap.browserWorkerHealthy;

  return {
    isCloud: snap.isCloudRuntime,
    browserWorkerConfigured: snap.browserWorkerConfigured,
    browserWorkerHealthy: snap.browserWorkerHealthy,
    localAgentConfigured: snap.localAgentConfigured,
    localAgentHealthy: snap.localAgentHealthy,
    localAgentEphemeral: snap.localAgentEphemeral,
    selectedProviders: snap.selectedProviders,
    fatal: snap.fatal,
    warnings: snap.warnings,
    preferBrowserWorker,
    preferLocalAgent: false,
    globalTimeoutMs: snap.globalTimeoutMs,
    directHtmlTimeoutMs: snap.directHtmlTimeoutMs,
    directHtmlRetries: snap.directHtmlRetries,
    apiTimeoutMs: snap.apiTimeoutMs,
    sourceAccessTimeoutMs: snap.localAgentTimeoutMs,
    browserWorkerTimeoutMs: snap.browserWorkerTimeoutMs,
    localAgentTimeoutMs: snap.localAgentTimeoutMs,
    imageFetcherTimeoutMs: snap.imageFetcherTimeoutMs,
    imageFallbackTimeoutMs: snap.imageFallbackTimeoutMs,
    scrapeJobMaxMs: snap.scrapeJobMaxMs,
    puppeteerAllowed: puppeteerAllowed(),
  };
}

export function logScrapeEnvironmentPolicy(): void {
  const p = getScrapeEnvironmentPolicy();
  console.info("🔧 Scrape ortam politikası:", {
    isCloud: p.isCloud,
    browserWorkerConfigured: p.browserWorkerConfigured,
    browserWorkerHealthy: p.browserWorkerHealthy,
    localAgentConfigured: p.localAgentConfigured,
    localAgentHealthy: p.localAgentHealthy,
    selectedProviders: p.selectedProviders,
    preferBrowserWorker: p.preferBrowserWorker,
    preferLocalAgent: p.preferLocalAgent,
    globalTimeoutMs: p.globalTimeoutMs,
    fatal: p.fatal,
    warnings: p.warnings,
  });
}
