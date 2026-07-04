import { isCloudRuntime, puppeteerAllowed } from "@shared/deploy-runtime";
import {
  getBrowserWorkerHealthStatus,
  isBrowserWorkerConfigured,
} from "./browser-worker-client.service";
import {
  extractSafeEndpointHost,
  getLocalAgentHealthStatus,
  isLocalAgentConfigured,
} from "./local-agent-client.service";

export type ScrapeProviderId =
  | "browser_worker"
  | "trendyol_api"
  | "direct_html"
  | "local_agent";

export type ScrapeProviderSnapshot = {
  isCloudRuntime: boolean;
  puppeteerAllowed: boolean;
  browserWorkerConfigured: boolean;
  browserWorkerHealthy: boolean;
  localAgentConfigured: boolean;
  localAgentHealthy: boolean;
  localAgentEphemeral: boolean;
  selectedProviders: ScrapeProviderId[];
  warnings: string[];
  fatal: boolean;
  globalTimeoutMs: number;
  scenarioTimeoutMs: number;
  puppeteerLaunchTimeoutMs: number;
  apiTimeoutMs: number;
  directHtmlTimeoutMs: number;
  browserWorkerTimeoutMs: number;
  localAgentTimeoutMs: number;
  localAgentHealthTimeoutMs: number;
  imageFetcherTimeoutMs: number;
  imageFallbackTimeoutMs: number;
  scrapeJobMaxMs: number;
  directHtmlRetries: number;
};

const DEFAULT_PRIORITY: ScrapeProviderId[] = [
  "browser_worker",
  "trendyol_api",
  "direct_html",
  "local_agent",
];

let cachedSnapshot: ScrapeProviderSnapshot | null = null;
let lastRefreshAt = 0;
const CACHE_TTL_MS = 60_000;

function resolveLocalAgentEndpoint(): string | null {
  return process.env.INTERNAL_LOCAL_AGENT_ENDPOINT?.trim() || null;
}

export function isEphemeralTunnelEndpoint(endpoint: string | null): boolean {
  if (!endpoint) return false;
  const host = extractSafeEndpointHost(endpoint) ?? endpoint.toLowerCase();
  return (
    host.includes("trycloudflare.com") ||
    host.includes("ngrok-free.app") ||
    host.includes("ngrok.io")
  );
}

function parseProviderPriority(): ScrapeProviderId[] {
  const raw = process.env.SCRAPE_PROVIDER_PRIORITY?.trim();
  if (!raw) return [...DEFAULT_PRIORITY];
  const allowed = new Set<ScrapeProviderId>(DEFAULT_PRIORITY);
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ScrapeProviderId => allowed.has(s as ScrapeProviderId));
  return parsed.length > 0 ? parsed : [...DEFAULT_PRIORITY];
}

function buildSelectedProviders(input: {
  priority: ScrapeProviderId[];
  isCloud: boolean;
  browserWorkerHealthy: boolean;
  browserWorkerConfigured: boolean;
  localAgentHealthy: boolean;
  localAgentConfigured: boolean;
  localAgentEphemeral: boolean;
}): ScrapeProviderId[] {
  const {
    priority,
    isCloud,
    browserWorkerHealthy,
    browserWorkerConfigured,
    localAgentHealthy,
    localAgentConfigured,
    localAgentEphemeral,
  } = input;

  const selected: ScrapeProviderId[] = [];

  for (const provider of priority) {
    if (provider === "browser_worker") {
      if (browserWorkerHealthy) selected.push(provider);
      continue;
    }
    if (provider === "local_agent") {
      continue;
    }
    selected.push(provider);
  }

  if (browserWorkerConfigured && browserWorkerHealthy && !selected.includes("browser_worker")) {
    selected.unshift("browser_worker");
  }

  const allowLocalAgentFallback =
    localAgentConfigured &&
    localAgentHealthy &&
    (!isCloud || !localAgentEphemeral);

  if (allowLocalAgentFallback && !selected.includes("local_agent")) {
    selected.push("local_agent");
  }

  return [...new Set(selected)];
}

function buildWarnings(input: {
  isCloud: boolean;
  browserWorkerConfigured: boolean;
  browserWorkerHealthy: boolean;
  localAgentConfigured: boolean;
  localAgentHealthy: boolean;
  localAgentEphemeral: boolean;
}): { warnings: string[]; fatal: boolean } {
  const warnings: string[] = [];
  let fatal = false;

  if (input.isCloud && input.localAgentConfigured && input.localAgentEphemeral) {
    warnings.push(
      "Local Agent trycloudflare/ngrok adresi production için önerilmez — Browser Worker kullanın.",
    );
  }

  if (input.isCloud && !input.browserWorkerHealthy && !input.localAgentHealthy) {
    warnings.push(
      "Production scraping has no healthy browser provider. Configure BROWSER_WORKER_URL/BROWSER_WORKER_TOKEN or deploy browser-worker service.",
    );
    if (!input.browserWorkerConfigured) {
      fatal = true;
      warnings.push(
        "Canlı ortamda tarayıcı tabanlı çekim için Browser Worker yapılandırılmamış. BROWSER_WORKER_URL ve BROWSER_WORKER_TOKEN env değerlerini tanımlayın.",
      );
    }
  }

  if (
    input.isCloud &&
    !input.browserWorkerConfigured &&
    input.localAgentConfigured &&
    input.localAgentEphemeral &&
    !input.localAgentHealthy
  ) {
    fatal = true;
  }

  return { warnings, fatal };
}

function defaultSnapshot(): ScrapeProviderSnapshot {
  const isCloud = isCloudRuntime();
  const browserWorkerConfigured = isBrowserWorkerConfigured();
  const localAgentConfigured = isLocalAgentConfigured();
  const localAgentEphemeral = isEphemeralTunnelEndpoint(resolveLocalAgentEndpoint());
  const priority = parseProviderPriority();
  const { warnings, fatal } = buildWarnings({
    isCloud,
    browserWorkerConfigured,
    browserWorkerHealthy: false,
    localAgentConfigured,
    localAgentHealthy: false,
    localAgentEphemeral,
  });

  const browserWorkerTimeoutMs =
    Number(process.env.BROWSER_WORKER_TIMEOUT_MS) || 45_000;
  const localGlobalTimeout =
    Number(process.env.LOCAL_SCRAPE_GLOBAL_TIMEOUT_MS) || 180_000;
  const localScenarioTimeout = Number(process.env.SCENARIO_TIMEOUT_MS) || 120_000;
  const localLaunchTimeout = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS) || 60_000;

  return {
    isCloudRuntime: isCloud,
    puppeteerAllowed: puppeteerAllowed(),
    browserWorkerConfigured,
    browserWorkerHealthy: false,
    localAgentConfigured,
    localAgentHealthy: false,
    localAgentEphemeral,
    selectedProviders: buildSelectedProviders({
      priority,
      isCloud,
      browserWorkerHealthy: false,
      browserWorkerConfigured,
      localAgentHealthy: false,
      localAgentConfigured,
      localAgentEphemeral,
    }),
    warnings,
    fatal,
    globalTimeoutMs: isCloud ? 55_000 : localGlobalTimeout,
    scenarioTimeoutMs: isCloud ? 0 : localScenarioTimeout,
    puppeteerLaunchTimeoutMs: isCloud ? 45_000 : localLaunchTimeout,
    apiTimeoutMs: isCloud ? 8_000 : 10_000,
    directHtmlTimeoutMs: isCloud ? 10_000 : 22_000,
    browserWorkerTimeoutMs,
    localAgentTimeoutMs: isCloud ? 3_000 : 8_000,
    localAgentHealthTimeoutMs: isCloud ? 2_000 : 8_000,
    imageFetcherTimeoutMs: isCloud ? 5_000 : 18_000,
    imageFallbackTimeoutMs: isCloud ? 3_000 : 12_000,
    scrapeJobMaxMs: isCloud ? 60_000 : 180_000,
    directHtmlRetries: isCloud ? 1 : 4,
  };
}

export async function refreshScrapeProviderSnapshot(): Promise<ScrapeProviderSnapshot> {
  const isCloud = isCloudRuntime();
  const browserWorkerConfigured = isBrowserWorkerConfigured();
  const localAgentConfigured = isLocalAgentConfigured();
  const localAgentEphemeral = isEphemeralTunnelEndpoint(resolveLocalAgentEndpoint());

  const [bwHealth, laHealth] = await Promise.all([
    browserWorkerConfigured
      ? getBrowserWorkerHealthStatus()
      : Promise.resolve(null),
    localAgentConfigured ? getLocalAgentHealthStatus() : Promise.resolve(null),
  ]);

  const browserWorkerHealthy = Boolean(bwHealth?.reachable);
  const localAgentHealthy = Boolean(laHealth?.reachable);
  const priority = parseProviderPriority();
  const { warnings, fatal } = buildWarnings({
    isCloud,
    browserWorkerConfigured,
    browserWorkerHealthy,
    localAgentConfigured,
    localAgentHealthy,
    localAgentEphemeral,
  });

  const browserWorkerTimeoutMs =
    Number(process.env.BROWSER_WORKER_TIMEOUT_MS) || 45_000;
  const localGlobalTimeout =
    Number(process.env.LOCAL_SCRAPE_GLOBAL_TIMEOUT_MS) || 180_000;
  const localScenarioTimeout = Number(process.env.SCENARIO_TIMEOUT_MS) || 120_000;
  const localLaunchTimeout = Number(process.env.PUPPETEER_LAUNCH_TIMEOUT_MS) || 60_000;

  const snapshot: ScrapeProviderSnapshot = {
    isCloudRuntime: isCloud,
    puppeteerAllowed: puppeteerAllowed(),
    browserWorkerConfigured,
    browserWorkerHealthy,
    localAgentConfigured,
    localAgentHealthy,
    localAgentEphemeral,
    selectedProviders: buildSelectedProviders({
      priority,
      isCloud,
      browserWorkerHealthy,
      browserWorkerConfigured,
      localAgentHealthy,
      localAgentConfigured,
      localAgentEphemeral,
    }),
    warnings,
    fatal,
    globalTimeoutMs: isCloud ? 55_000 : localGlobalTimeout,
    scenarioTimeoutMs: isCloud ? 0 : localScenarioTimeout,
    puppeteerLaunchTimeoutMs: isCloud ? 45_000 : localLaunchTimeout,
    apiTimeoutMs: isCloud ? 8_000 : 10_000,
    directHtmlTimeoutMs: isCloud ? 10_000 : 22_000,
    browserWorkerTimeoutMs,
    localAgentTimeoutMs: isCloud ? 3_000 : 8_000,
    localAgentHealthTimeoutMs: isCloud ? 2_000 : 8_000,
    imageFetcherTimeoutMs: isCloud ? 5_000 : 18_000,
    imageFallbackTimeoutMs: isCloud ? 3_000 : 12_000,
    scrapeJobMaxMs: isCloud ? 60_000 : 180_000,
    directHtmlRetries: isCloud ? 1 : 4,
  };

  cachedSnapshot = snapshot;
  lastRefreshAt = Date.now();
  return snapshot;
}

export function getScrapeProviderSnapshot(): ScrapeProviderSnapshot {
  if (cachedSnapshot && Date.now() - lastRefreshAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }
  return defaultSnapshot();
}

export async function initScrapeProviders(): Promise<ScrapeProviderSnapshot> {
  return refreshScrapeProviderSnapshot();
}

export async function buildScrapeCapabilitiesPayload() {
  const snap = await refreshScrapeProviderSnapshot();
  const { resolveChromiumPath } = await import("../puppeteer-config");
  const { ensureEnvLoaded } = await import("../env-bootstrap");
  const chromium = resolveChromiumPath();
  return {
    isCloudRuntime: snap.isCloudRuntime,
    puppeteerAllowed: snap.puppeteerAllowed,
    browserUiEnabled: snap.puppeteerAllowed,
    platform: process.platform,
    envLoaded: ensureEnvLoaded(),
    chromiumResolved: Boolean(chromium.path),
    chromiumExists: chromium.exists,
    chromiumSource: chromium.source,
    localPuppeteerReady:
      !snap.isCloudRuntime && snap.puppeteerAllowed && chromium.exists,
    browserWorkerConfigured: snap.browserWorkerConfigured,
    browserWorkerHealthy: snap.browserWorkerHealthy,
    localAgentConfigured: snap.localAgentConfigured,
    localAgentHealthy: snap.localAgentHealthy,
    localAgentEphemeral: snap.localAgentEphemeral,
    selectedProviders: snap.selectedProviders,
    warnings: snap.warnings,
    fatal: snap.fatal,
    globalTimeoutMs: snap.globalTimeoutMs,
    defaultScrapeMode: "auto-fast",
    pipelineEndpoint: "/api/trendyol-scrape",
  };
}

export function logScrapeProviderStartup(snapshot: ScrapeProviderSnapshot): void {
  console.info("🔧 Scrape provider durumu:", {
    isCloudRuntime: snapshot.isCloudRuntime,
    browserWorkerConfigured: snapshot.browserWorkerConfigured,
    browserWorkerHealthy: snapshot.browserWorkerHealthy,
    localAgentConfigured: snapshot.localAgentConfigured,
    localAgentHealthy: snapshot.localAgentHealthy,
    localAgentEphemeral: snapshot.localAgentEphemeral,
    selectedProviders: snapshot.selectedProviders,
    globalTimeoutMs: snapshot.globalTimeoutMs,
    fatal: snapshot.fatal,
    warnings: snapshot.warnings,
  });
}
