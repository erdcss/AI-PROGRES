import type { ScrapeGatewaySettingsDto } from "./scrape-gateway-settings.service";

export type GatewayConfigStatus = {
  gatewayEnabled: boolean;
  proxyFallbackEnabled: boolean;
  providerType: string;
  providerConfigured: boolean;
  providerEndpointConfigured: boolean;
  apiKeyConfigured: boolean;
  proxyUrlConfigured: boolean;
  localAgentEndpointConfigured: boolean;
  localAgentTokenConfigured: boolean;
  isReadyForCloudScrape: boolean;
  lastTestStatus: "success" | "failed" | "never";
  lastTestAt: Date | null;
  lastTestError: string | null;
  lastWorkingProvider: string | null;
  lastTestUrl: string | null;
  lastTestHtmlSize: number | null;
  lastTestTitleFound: boolean | null;
  lastTestPriceFound: boolean | null;
  lastTestImagesFound: number | null;
};

export function isProviderConfigured(settings: ScrapeGatewaySettingsDto): boolean {
  if (!settings.gatewayEnabled || !settings.proxyFallbackEnabled) return false;
  if (settings.providerType === "none") return false;

  if (settings.providerType === "generic_proxy") {
    return Boolean(settings.proxyUrlEncrypted?.trim());
  }
  if (settings.providerType === "scraping_api") {
    return Boolean(
      settings.providerEndpoint?.trim() && settings.providerApiKeyEncrypted?.trim(),
    );
  }
  if (settings.providerType === "local_agent") {
    return Boolean(
      settings.localAgentEndpoint?.trim() && settings.localAgentTokenEncrypted?.trim(),
    );
  }
  return false;
}

export function buildGatewayConfigStatus(
  settings: ScrapeGatewaySettingsDto,
): GatewayConfigStatus {
  const providerEndpointConfigured = Boolean(settings.providerEndpoint?.trim());
  const apiKeyConfigured = Boolean(settings.providerApiKeyEncrypted?.trim());
  const proxyUrlConfigured = Boolean(settings.proxyUrlEncrypted?.trim());
  const localAgentEndpointConfigured = Boolean(settings.localAgentEndpoint?.trim());
  const localAgentTokenConfigured = Boolean(settings.localAgentTokenEncrypted?.trim());
  const providerConfigured = isProviderConfigured(settings);

  let lastTestStatus: GatewayConfigStatus["lastTestStatus"] = "never";
  if (settings.lastTestAt) {
    lastTestStatus = settings.lastTestSuccess ? "success" : "failed";
  }

  return {
    gatewayEnabled: settings.gatewayEnabled,
    proxyFallbackEnabled: settings.proxyFallbackEnabled,
    providerType: settings.providerType,
    providerConfigured,
    providerEndpointConfigured,
    apiKeyConfigured,
    proxyUrlConfigured,
    localAgentEndpointConfigured,
    localAgentTokenConfigured,
    isReadyForCloudScrape:
      settings.gatewayEnabled && settings.proxyFallbackEnabled && providerConfigured,
    lastTestStatus,
    lastTestAt: settings.lastTestAt,
    lastTestError: settings.lastTestError ?? null,
    lastWorkingProvider: settings.lastWorkingProvider ?? null,
    lastTestUrl: settings.lastTestUrl ?? null,
    lastTestHtmlSize: settings.lastTestHtmlSize ?? null,
    lastTestTitleFound: settings.lastTestTitleFound ?? null,
    lastTestPriceFound: settings.lastTestPriceFound ?? null,
    lastTestImagesFound: settings.lastTestImagesFound ?? null,
  };
}

export const GATEWAY_NOT_CONFIGURED_MESSAGE =
  "Kaynak erişim sağlayıcısı ayarlanmamış. Railway IP Trendyol tarafından engelleniyorsa proxy veya scraping API girmeniz gerekir.";

export const GATEWAY_PROVIDER_FAILED_MESSAGE =
  "Kaynak erişim sağlayıcısı başarısız oldu. Proxy/API ayarlarını kontrol edip tekrar test edin.";
