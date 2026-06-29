import { isCloudRuntime, puppeteerAllowed } from "@shared/deploy-runtime";
import { isLocalAgentConfigured } from "./local-agent-client.service";

export type ScrapeEnvironmentPolicy = {
  isCloud: boolean;
  localAgentConfigured: boolean;
  /** Cloud + agent → Railway direct erişim yerine agent kullan */
  preferLocalAgent: boolean;
  globalTimeoutMs: number;
  directHtmlTimeoutMs: number;
  directHtmlRetries: number;
  apiTimeoutMs: number;
  sourceAccessTimeoutMs: number;
  scrapeJobMaxMs: number;
  puppeteerAllowed: boolean;
};

/** Local vs canlı ortam farklarını tek noktadan yönet */
export function getScrapeEnvironmentPolicy(): ScrapeEnvironmentPolicy {
  const isCloud = isCloudRuntime();
  const localAgentConfigured = isLocalAgentConfigured();
  const preferLocalAgent = isCloud && localAgentConfigured;

  if (preferLocalAgent) {
    return {
      isCloud,
      localAgentConfigured,
      preferLocalAgent: true,
      globalTimeoutMs: 95_000,
      directHtmlTimeoutMs: 8_000,
      directHtmlRetries: 1,
      apiTimeoutMs: 8_000,
      sourceAccessTimeoutMs: 70_000,
      scrapeJobMaxMs: 95_000,
      puppeteerAllowed: puppeteerAllowed(),
    };
  }

  if (isCloud) {
    return {
      isCloud,
      localAgentConfigured,
      preferLocalAgent: false,
      globalTimeoutMs: 60_000,
      directHtmlTimeoutMs: 28_000,
      directHtmlRetries: 2,
      apiTimeoutMs: 10_000,
      sourceAccessTimeoutMs: 25_000,
      scrapeJobMaxMs: 65_000,
      puppeteerAllowed: puppeteerAllowed(),
    };
  }

  return {
    isCloud: false,
    localAgentConfigured,
    preferLocalAgent: false,
    globalTimeoutMs: 90_000,
    directHtmlTimeoutMs: 22_000,
    directHtmlRetries: 4,
    apiTimeoutMs: 10_000,
    sourceAccessTimeoutMs: 25_000,
    scrapeJobMaxMs: 90_000,
    puppeteerAllowed: true,
  };
}

export function logScrapeEnvironmentPolicy(): void {
  const p = getScrapeEnvironmentPolicy();
  console.info("🔧 Scrape ortam politikası:", {
    isCloud: p.isCloud,
    localAgentConfigured: p.localAgentConfigured,
    preferLocalAgent: p.preferLocalAgent,
    globalTimeoutMs: p.globalTimeoutMs,
    directHtmlTimeoutMs: p.directHtmlTimeoutMs,
  });
}
