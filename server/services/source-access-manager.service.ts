import { db } from "../db";
import { scrapeGatewaySettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isCloudRuntime } from "@shared/deploy-runtime";
import {
  getEnabledInternalProviders,
  getInternalSourceAccessSecrets,
  hasAnyInternalProvider,
  pickPrimaryInternalProviderType,
  type InternalProviderType,
} from "../config/source-access.config";
import {
  tryGetScrapeGatewaySettingsRaw,
  recordGatewayTest,
  type ScrapeGatewaySettingsDto,
} from "./scrape-gateway-settings.service";
import { runScrapeGatewayWithSettings, type GatewayFetchResult } from "./scrape-gateway.service";
import {
  callLocalScrapeAgent,
  getLocalAgentHealthStatus,
  isLocalAgentConfigured,
  maskLocalAgentEndpoint,
} from "./local-agent-client.service";
import {
  getBrowserWorkerHealthStatus,
  isBrowserWorkerConfigured,
  scrapeTrendyolWithBrowserWorker,
} from "./browser-worker-client.service";

export type SourceAccessAttemptResult = GatewayFetchResult & {
  strategy: string;
  stageError?: string;
  finalSuccessReason?: string;
};

export type SourceAccessStatus = {
  directHtmlAvailable: boolean;
  internalGatewayAvailable: boolean;
  systemReady: boolean;
  localAgentConfigured: boolean;
  localAgentLastStatus: string | null;
  lastWorkingStrategy: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastTestStatus: string | null;
  maskedProviderStatus: Array<{
    type: string;
    enabled: boolean;
    configured: boolean;
  }>;
  secretsMasked: {
    proxyConfigured: boolean;
    scrapingApiConfigured: boolean;
    localAgentConfigured: boolean;
    localAgentEndpointHint: string | null;
  };
};

let cachedWorkingStrategy: string | null = null;
let lastSuccessAt: Date | null = null;
let lastErrorAt: Date | null = null;
let lastError: string | null = null;
let localAgentLastStatus: string | null = null;

function buildSettingsForProvider(
  base: ScrapeGatewaySettingsDto,
  providerType: InternalProviderType,
): ScrapeGatewaySettingsDto {
  const secrets = getInternalSourceAccessSecrets();
  return {
    ...base,
    gatewayEnabled: true,
    proxyFallbackEnabled: true,
    providerType,
    proxyUrlEncrypted:
      providerType === "generic_proxy" ? secrets.proxyUrl : base.proxyUrlEncrypted,
    providerEndpoint:
      providerType === "scraping_api" ? secrets.scrapingApiEndpoint : base.providerEndpoint,
    providerApiKeyEncrypted:
      providerType === "scraping_api" ? secrets.scrapingApiKey : base.providerApiKeyEncrypted,
    localAgentEndpoint:
      providerType === "local_agent" ? secrets.localAgentEndpoint : base.localAgentEndpoint,
    localAgentTokenEncrypted:
      providerType === "local_agent" ? secrets.localAgentToken : base.localAgentTokenEncrypted,
  };
}

async function runProviderAttempt(
  url: string,
  providerType: InternalProviderType,
  settings: ScrapeGatewaySettingsDto,
): Promise<SourceAccessAttemptResult> {
  if (providerType === "browser_worker") {
    const bw = await scrapeTrendyolWithBrowserWorker(url);
    return {
      html: bw.html,
      images: [],
      providerType: "browser_worker",
      htmlSuccess: Boolean(bw.success && bw.html && bw.html.length >= 500),
      imageSuccess: false,
      error: bw.error,
      reason: bw.stageError ?? bw.error,
      durationMs: bw.durationMs,
      strategy: "browser_worker",
      stageError: bw.stageError,
    };
  }

  if (providerType === "local_agent") {
    const agent = await callLocalScrapeAgent(url);
    localAgentLastStatus = agent.agentSuccess ? "success" : "failed";
    return {
      html: agent.html,
      images: agent.images,
      title: agent.title,
      price: agent.price,
      variants: agent.variants,
      providerType: "local_agent",
      htmlSuccess: agent.htmlSuccess,
      imageSuccess: agent.imageSuccess,
      error: agent.error,
      reason: agent.reason,
      durationMs: agent.durationMs,
      strategy: "local_agent",
      stageError: agent.stageError,
      finalSuccessReason: agent.finalSuccessReason,
    };
  }

  const result = await runScrapeGatewayWithSettings(url, settings);
  return {
    ...result,
    strategy: providerType,
    stageError: result.htmlSuccess || result.imageSuccess ? undefined : "source-access-provider-failed",
  };
}

/** Startup — env secret'larını internal DB kaydına yansıt (UI yok) */
export async function seedInternalSourceAccessFromEnv(): Promise<void> {
  const row = await tryGetScrapeGatewaySettingsRaw();
  if (!row) return;

  const secrets = getInternalSourceAccessSecrets();
  const primary = pickPrimaryInternalProviderType();

  await db
    .update(scrapeGatewaySettings)
    .set({
      gatewayEnabled: true,
      proxyFallbackEnabled: true,
      providerType: primary,
      proxyUrlEncrypted: secrets.proxyUrl ?? row.proxyUrlEncrypted,
      providerEndpoint: secrets.scrapingApiEndpoint ?? row.providerEndpoint,
      providerApiKeyEncrypted: secrets.scrapingApiKey ?? row.providerApiKeyEncrypted,
      localAgentEndpoint: secrets.localAgentEndpoint ?? row.localAgentEndpoint,
      localAgentTokenEncrypted: secrets.localAgentToken ?? row.localAgentTokenEncrypted,
      updatedAt: new Date(),
    })
    .where(eq(scrapeGatewaySettings.id, row.id));

  const providers = getEnabledInternalProviders().map((p) => p.type).join(", ") || "none";
  console.log(`ℹ️ Kaynak erişim internal seed: primary=${primary}, providers=${providers}`);

  if (isBrowserWorkerConfigured()) {
    const health = await getBrowserWorkerHealthStatus().catch(() => null);
    if (health?.reachable) {
      console.log(
        `ℹ️ Browser Worker: erişilebilir (${health.endpointHost ?? "host"}, ${health.latencyMs ?? "?"}ms, browserReady=${health.browserReady})`,
      );
    } else {
      console.warn(`⚠️ Browser Worker: erişilemiyor — ${health?.error ?? "deploy/env kontrol edin"}`);
    }
  }

  if (isLocalAgentConfigured()) {
    const health = await getLocalAgentHealthStatus().catch(() => null);
    const healthy = health?.reachable === true;
    localAgentLastStatus = healthy ? "healthy" : health?.errorCategory ?? "unreachable";
    if (healthy) {
      console.log(
        `ℹ️ Local Scrape Agent: erişilebilir (${health?.endpointHost ?? "host"}, ${health?.latencyMs ?? "?"}ms)`,
      );
    } else {
      console.warn(
        `⚠️ Local Scrape Agent: erişilemiyor — ${health?.error ?? "tunnel/agent çalışıyor mu?"}`,
      );
    }
  } else {
    const health = await getLocalAgentHealthStatus().catch(() => null);
    if (health && (!health.endpointConfigured || !health.tokenConfigured)) {
      console.warn(`⚠️ Local Scrape Agent yapılandırması eksik: ${health.error ?? "env kontrol edin"}`);
    }
  }
}

/**
 * Direct HTML başarısız olduğunda internal sağlayıcıları sırayla dener.
 */
export async function tryInternalSourceAccess(url: string): Promise<SourceAccessAttemptResult> {
  const start = Date.now();
  const base = await tryGetScrapeGatewaySettingsRaw();

  if (!hasAnyInternalProvider()) {
    lastErrorAt = new Date();
    lastError = "internal-provider-unavailable";
    return {
      html: null,
      images: [],
      providerType: "none",
      htmlSuccess: false,
      imageSuccess: false,
      strategy: "none",
      stageError: "source-access-internal-provider-unavailable",
      error: "Internal provider yok",
      reason: "source-access-internal-provider-unavailable",
      durationMs: Date.now() - start,
    };
  }

  const providers = getEnabledInternalProviders();
  const tryOrder =
    cachedWorkingStrategy &&
    providers.some((p) => p.type === cachedWorkingStrategy)
      ? [
          ...providers.filter((p) => p.type === cachedWorkingStrategy),
          ...providers.filter((p) => p.type !== cachedWorkingStrategy),
        ]
      : providers;

  const defaults: ScrapeGatewaySettingsDto =
    base ??
    ({
      id: 0,
      gatewayEnabled: true,
      proxyFallbackEnabled: true,
      providerType: "none",
      providerEndpoint: null,
      providerApiKeyEncrypted: null,
      proxyUrlEncrypted: null,
      timeoutMs: 20000,
      retryCount: 2,
      retryDelayMs: 1500,
      useProxyForHtml: true,
      useProxyForImages: true,
      useProxyForApi: false,
      lastTestAt: null,
      lastTestSuccess: null,
      lastTestMessage: null,
      lastTestError: null,
      lastWorkingProvider: null,
      lastTestUrl: null,
      lastTestHtmlSize: null,
      lastTestTitleFound: null,
      lastTestPriceFound: null,
      lastTestImagesFound: null,
      localAgentEndpoint: null,
      localAgentTokenEncrypted: null,
    } as ScrapeGatewaySettingsDto);

  let lastFailure: SourceAccessAttemptResult | null = null;

  for (const provider of tryOrder) {
    const settings = buildSettingsForProvider(defaults, provider.type);
    const result = await runProviderAttempt(url, provider.type, settings);

    if (result.htmlSuccess || result.imageSuccess) {
      cachedWorkingStrategy = provider.type;
      lastSuccessAt = new Date();
      lastError = null;
      await recordGatewayTest({
        success: true,
        message: `Internal ${provider.type} başarılı`,
        workingProvider: provider.type,
        url,
        htmlSize: result.html?.length,
        titleFound: Boolean(result.title),
        priceFound: Boolean(result.price && result.price > 0),
        imagesFound: result.images.length,
      }).catch(() => undefined);

      return result;
    }

    const stageError =
      provider.type === "local_agent"
        ? result.stageError ?? "local-agent-failed"
        : "source-access-provider-failed";

    lastFailure = {
      ...result,
      strategy: provider.type,
      stageError,
      reason: stageError,
    };
  }

  lastErrorAt = new Date();
  lastError = lastFailure?.error ?? "source-access-provider-failed";
  await recordGatewayTest({
    success: false,
    message: "Tüm internal sağlayıcılar başarısız",
    error: lastError,
    url,
  }).catch(() => undefined);

  return (
    lastFailure ?? {
      html: null,
      images: [],
      providerType: "none",
      htmlSuccess: false,
      imageSuccess: false,
      strategy: "none",
      stageError: "source-access-provider-failed",
      error: "source-access-provider-failed",
      reason: "source-access-provider-failed",
      durationMs: Date.now() - start,
    }
  );
}

export async function getSourceAccessStatus(): Promise<SourceAccessStatus> {
  const row = await tryGetScrapeGatewaySettingsRaw();
  const registry = getEnabledInternalProviders();
  const secrets = getInternalSourceAccessSecrets();

  return {
    directHtmlAvailable: !isCloudRuntime(),
    internalGatewayAvailable: hasAnyInternalProvider(),
    systemReady: Boolean(row) || hasAnyInternalProvider(),
    localAgentConfigured: isLocalAgentConfigured(),
    localAgentLastStatus,
    lastWorkingStrategy: cachedWorkingStrategy ?? row?.lastWorkingProvider ?? null,
    lastSuccessAt: (lastSuccessAt ?? row?.lastTestAt)?.toISOString?.() ?? null,
    lastErrorAt: lastErrorAt?.toISOString() ?? null,
    lastError: lastError ?? row?.lastTestError ?? null,
    lastTestStatus:
      row?.lastTestSuccess === true ? "success" : row?.lastTestSuccess === false ? "failed" : null,
    maskedProviderStatus: registry.map((p) => ({
      type: p.type,
      enabled: p.enabled,
      configured: true,
    })),
    secretsMasked: {
      proxyConfigured: Boolean(secrets.proxyUrl),
      scrapingApiConfigured: Boolean(secrets.scrapingApiEndpoint && secrets.scrapingApiKey),
      localAgentConfigured: isLocalAgentConfigured(),
      localAgentEndpointHint: maskLocalAgentEndpoint(secrets.localAgentEndpoint),
    },
  };
}

export async function runSourceAccessSelfTest(url: string) {
  const secrets = getInternalSourceAccessSecrets();
  const localConfigured = isLocalAgentConfigured();

  if (localConfigured) {
    const healthStart = Date.now();
    const agentHealthOk = await pingLocalAgentHealth();
    const agent = await callLocalScrapeAgent(url);

    return {
      success: agent.agentSuccess,
      provider: "local_agent",
      endpointConfigured: Boolean(secrets.localAgentEndpoint),
      tokenConfigured: Boolean(secrets.localAgentToken),
      agentHealthOk,
      titleFound: Boolean(agent.title),
      priceFound: Boolean(agent.price && agent.price > 0),
      imagesFound: agent.images.length,
      durationMs: agent.durationMs + (Date.now() - healthStart),
      stageError: agent.stageError,
      finalSuccessReason: agent.finalSuccessReason,
      error: agent.error,
    };
  }

  const result = await tryInternalSourceAccess(url);
  return {
    success: result.htmlSuccess || result.imageSuccess,
    provider: result.strategy,
    endpointConfigured: false,
    tokenConfigured: false,
    agentHealthOk: false,
    titleFound: Boolean(result.title),
    priceFound: Boolean(result.price && result.price > 0),
    imagesFound: result.images.length,
    durationMs: result.durationMs,
    stageError: result.stageError,
    error: result.error,
  };
}
