import os from "os";
import { isCloudRuntime, puppeteerAllowed } from "@shared/deploy-runtime";
import { ensureEnvLoaded } from "./env-bootstrap";
import { hasAnyInternalProvider } from "./config/source-access.config";
import { isBrowserWorkerConfigured } from "./services/browser-worker-client.service";
import { isLocalAgentConfigured } from "./services/local-agent-client.service";
import { resolveChromiumPath } from "./puppeteer-config";

export function logLocalScrapeBoot(): void {
  const chromium = resolveChromiumPath();
  const payload = {
    envLoaded: ensureEnvLoaded(),
    platform: os.platform(),
    isCloudRuntime: isCloudRuntime(),
    puppeteerAllowed: puppeteerAllowed(),
    chromiumResolved: Boolean(chromium.path),
    chromiumExists: chromium.exists,
    chromiumSource: chromium.source,
    internalProviderConfigured: hasAnyInternalProvider(),
    localAgentConfigured: isLocalAgentConfigured(),
    browserWorkerConfigured: isBrowserWorkerConfigured(),
    localPuppeteerReady: !isCloudRuntime() && puppeteerAllowed() && chromium.exists,
  };

  console.info("[LOCAL_SCRAPE_BOOT]", JSON.stringify(payload, null, 0));
}
