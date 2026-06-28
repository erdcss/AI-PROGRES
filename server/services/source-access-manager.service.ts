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

export type SourceAccessAttemptResult = GatewayFetchResult & {
  strategy: string;
  stageError?: string;
};

export type SourceAccessStatus = {
  directHtmlAvailable: boolean;
  internalGatewayAvailable: boolean;
  systemReady: boolean;
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
};

let cachedWorkingStrategy: string | null = null;
let lastSuccessAt: Date | null = null;
let lastErrorAt: Date | null = null;
let lastError: string | null = null;

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

  console.log(
    `ℹ️ Kaynak erişim internal seed: primary=${primary}, providers=${getEnabledInternalProviders()
      .map((p) => p.type)
      .join(", ") || "none"}`,
  );
}

/**
 * Direct HTML başarısız olduğunda internal sağlayıcıları sırayla dener.
 * Kullanıcı müdahalesi gerekmez.
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
    const result = await runScrapeGatewayWithSettings(url, settings);

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

      return { ...result, strategy: provider.type };
    }

    lastFailure = {
      ...result,
      strategy: provider.type,
      stageError: "source-access-provider-failed",
      reason: "source-access-provider-failed",
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

  return {
    directHtmlAvailable: !isCloudRuntime(),
    internalGatewayAvailable: hasAnyInternalProvider(),
    systemReady: Boolean(row) || hasAnyInternalProvider(),
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
  };
}

export async function runSourceAccessSelfTest(url: string) {
  const result = await tryInternalSourceAccess(url);
  return {
    success: result.htmlSuccess || result.imageSuccess,
    strategy: result.strategy,
    stageError: result.stageError,
    htmlSuccess: result.htmlSuccess,
    imageSuccess: result.imageSuccess,
    durationMs: result.durationMs,
    error: result.error,
  };
}
