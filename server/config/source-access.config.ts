export type InternalProviderType = "generic_proxy" | "scraping_api" | "local_agent";

export type SourceAccessProviderConfig = {
  type: InternalProviderType;
  enabled: boolean;
  priority: number;
};

function envFlag(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/** Sunucu tarafı kaynak erişim sağlayıcıları — kullanıcı arayüzünden yönetilmez */
export function getSourceAccessProviderRegistry(): SourceAccessProviderConfig[] {
  const secrets = getInternalSourceAccessSecrets();
  return [
    {
      type: "local_agent",
      enabled: envFlag(secrets.localAgentEndpoint) && envFlag(secrets.localAgentToken),
      priority: 0,
    },
    {
      type: "generic_proxy",
      enabled: envFlag(secrets.proxyUrl ?? undefined),
      priority: 1,
    },
    {
      type: "scraping_api",
      enabled: envFlag(secrets.scrapingApiEndpoint) && envFlag(secrets.scrapingApiKey),
      priority: 2,
    },
  ];
}

export function getEnabledInternalProviders(): SourceAccessProviderConfig[] {
  return getSourceAccessProviderRegistry()
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);
}

export function hasAnyInternalProvider(): boolean {
  return getEnabledInternalProviders().length > 0;
}

export function getInternalSourceAccessSecrets() {
  return {
    proxyUrl: process.env.INTERNAL_PROXY_URL?.trim() || null,
    scrapingApiEndpoint: process.env.INTERNAL_SCRAPING_API_ENDPOINT?.trim() || null,
    scrapingApiKey: process.env.INTERNAL_SCRAPING_API_KEY?.trim() || null,
    localAgentEndpoint: process.env.INTERNAL_LOCAL_AGENT_ENDPOINT?.trim() || null,
    localAgentToken: process.env.INTERNAL_LOCAL_AGENT_TOKEN?.trim() || null,
  };
}

export function pickPrimaryInternalProviderType(): InternalProviderType | "none" {
  return getEnabledInternalProviders()[0]?.type ?? "none";
}
